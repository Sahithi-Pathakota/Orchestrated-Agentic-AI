import { GoogleGenAI } from "@google/genai";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import * as z from "zod";
import { prisma } from "../db.js";

const WorkflowState = new StateSchema({
  workflowId: z.string(),
  requirements: z.string(),
  analysis: z.string().optional(),
  design: z.string().optional(),
  code: z.string().optional(),
  tests: z.string().optional(),
  review: z.string().optional(),
  documentation: z.string().optional(),
});

export const stageDefinitions = [
  {
    key: "analysis",
    title: "Requirements Analyst",
    task: "Turn the request into a concise problem statement, user stories, assumptions, missing questions, and measurable acceptance criteria. Do not invent requirements; label assumptions.",
    previous: [],
  },
  {
    key: "design",
    title: "System Designer",
    task: "Propose a simple architecture based on the requirements analysis. Include components, data flow, API boundaries, and a Mermaid flowchart. Keep it implementable by a student team.",
    previous: ["analysis"],
  },
  {
    key: "code",
    title: "Code Generator",
    task: "Create a small implementation plan and representative starter code for the design. Name every file and language. Keep the code focused and include only a small vertical slice; never claim it was executed.",
    previous: ["analysis", "design"],
  },
  {
    key: "tests",
    title: "Test Planner",
    task: "Create a practical test plan for the proposed code: unit cases, API or integration cases, expected results, and a short manual check. Do not claim tests were run.",
    previous: ["analysis", "design", "code"],
  },
  {
    key: "review",
    title: "Code Reviewer",
    task: "Review the generated implementation against the requirements and design. Identify correctness, security, privacy, and maintainability concerns, then give prioritized fixes. Treat the code as unexecuted draft material.",
    previous: ["analysis", "design", "code", "tests"],
  },
  {
    key: "documentation",
    title: "Documentation Writer",
    task: "Write a concise README draft with the project purpose, setup assumptions, run steps, API or usage notes, and limitations. Clearly mark anything that still needs a human decision.",
    previous: ["analysis", "design", "code", "tests", "review"],
  },
];

function createModelClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return apiKey ? new GoogleGenAI({ apiKey }) : null;
}

function mockOutput(stage, state) {
  const prefix = `DEMO MODE — template output for: ${state.requirements.slice(0, 220)}${state.requirements.length > 220 ? "…" : ""}`;
  const examples = {
    analysis: `${prefix}\n\n- Clarify the target users and the main problem.\n- Convert each requested capability into a user story.\n- List assumptions separately from confirmed requirements.\n- Define acceptance criteria that can be checked manually.`,
    design: `${prefix}\n\n- Browser UI collects requirements and shows each workflow stage.\n- Express API validates input and starts one LangGraph run.\n- LangGraph state carries the original request and prior stage outputs.\n- Mermaid: User → React UI → Express API → Requirements → Design → Code → Tests → Review → Documentation.`,
    code: `${prefix}\n\nSuggested vertical slice:\n1. POST /api/workflows accepts { requirements }.\n2. Validate input length on the server.\n3. Run a shared-state workflow and return stage results.\n4. Render generated code as review-only text; do not execute it automatically.`,
    tests: `${prefix}\n\n- Unit: reject blank requirements and requests over the input limit.\n- API: valid request returns all six named stages.\n- API: missing Gemini credentials returns a clearly labeled demo result.\n- Manual: confirm prior-stage context appears in downstream outputs.\n- Manual: confirm the UI never says generated code was run.`,
    review: `${prefix}\n\n- P1: Generated code must remain untrusted and must not run on the API host.\n- P1: Add authentication and per-project authorization before deployment.\n- P2: Persist runs so outputs can be reviewed after refresh.\n- P2: Ask for human approval before any repository write.`,
    documentation: `${prefix}\n\nREADME outline: purpose; requirements; installation; environment variables; run API and UI; workflow stages; demo mode; limitations; next steps.\n\nHuman decisions needed: target users, deployment environment, database retention, and whether generated code may be exported.`,
  };
  return examples[stage.key];
}

async function generateStage(stage, state) {
  const client = createModelClient();
  if (!client) return mockOutput(stage, state);

  const context = stage.previous
    .map((key) => `\n--- ${key.toUpperCase()} OUTPUT ---\n${state[key] || "(not available)"}`)
    .join("\n");
  const prompt = [
    "You are one specialist in a coordinated student software-engineering workflow.",
    "Use only the user request and prior stage outputs below. Keep your result structured and practical.",
    "Generated code is a draft: do not claim it was saved, executed, tested, or deployed.",
    `\nUSER REQUIREMENTS:\n${state.requirements}`,
    context,
    `\nYOUR ROLE (${stage.title}):\n${stage.task}`,
  ].join("\n");

  const response = await client.interactions.create({
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    input: prompt,
    store: false,
  });
  const text = response.output_text?.trim();
  if (!text) throw new Error(`${stage.title} returned an empty response.`);
  return text;
}

async function runStage(stage, state) {
  const stageWhere = { workflowId_key: { workflowId: state.workflowId, key: stage.key } };
  await prisma.workflowStage.update({
    where: stageWhere,
    data: { status: "running", startedAt: new Date(), error: null },
  });
  try {
    const output = await generateStage(stage, state);
    await prisma.workflowStage.update({
      where: stageWhere,
      data: { status: "completed", output, completedAt: new Date() },
    });
    return output;
  } catch (error) {
    await prisma.workflowStage.update({
      where: stageWhere,
      data: { status: "failed", error: error.message, completedAt: new Date() },
    });
    throw error;
  }
}

let workflow = new StateGraph(WorkflowState);
for (const stage of stageDefinitions) {
  workflow = workflow.addNode(`agent_${stage.key}`, async (state) => ({
    [stage.key]: await runStage(stage, state),
  }));
}
workflow = workflow
  .addEdge(START, "agent_analysis")
  .addEdge("agent_analysis", "agent_design")
  .addEdge("agent_design", "agent_code")
  .addEdge("agent_code", "agent_tests")
  .addEdge("agent_tests", "agent_review")
  .addEdge("agent_review", "agent_documentation")
  .addEdge("agent_documentation", END);

const app = workflow.compile();

export async function runSoftwareWorkflow(workflowId, requirements) {
  const result = await app.invoke({ workflowId, requirements });
  return {
    mode: process.env.GEMINI_API_KEY?.trim() ? "gemini" : "demo",
    stages: stageDefinitions.map(({ key, title }, index) => ({
      key,
      title,
      order: index,
      output: result[key],
    })),
  };
}

