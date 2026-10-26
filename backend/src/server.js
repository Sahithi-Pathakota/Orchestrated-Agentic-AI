import "dotenv/config";
import cors from "cors";
import express from "express";
import { prisma } from "./db.js";
import { runSoftwareWorkflow, stageDefinitions } from "./agents/workflow.js";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.WEB_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "20kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", database: "connected", service: "software-agent-platform-api" });
});

app.get("/api/workflows", async (_request, response) => {
  try {
    const workflows = await prisma.workflowRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { stages: { orderBy: { stageOrder: "asc" } } },
    });
    return response.json({ workflows });
  } catch (error) {
    console.error("Could not list workflow runs:", error.message);
    return response.status(503).json({ error: "Workflow history is unavailable. Check the database connection." });
  }
});

app.get("/api/workflows/:workflowId", async (request, response) => {
  try {
    const workflow = await prisma.workflowRun.findUnique({
      where: { id: request.params.workflowId },
      include: { stages: { orderBy: { stageOrder: "asc" } } },
    });
    if (!workflow) return response.status(404).json({ error: "Workflow run not found." });
    return response.json({ workflow });
  } catch (error) {
    console.error("Could not load workflow run:", error.message);
    return response.status(503).json({ error: "Workflow run is unavailable." });
  }
});

async function executeWorkflow(workflowId, requirements) {
  try {
    const result = await runSoftwareWorkflow(workflowId, requirements);
    await prisma.workflowRun.update({
      where: { id: workflowId },
      data: { mode: result.mode, status: "completed" },
    });
  } catch (error) {
    console.error(`Workflow ${workflowId} failed:`, error.message);
    await prisma.workflowRun.update({
      where: { id: workflowId },
      data: { status: "failed" },
    }).catch((updateError) => console.error("Could not save failure status:", updateError.message));
  }
}

app.post("/api/workflows", async (request, response) => {
  const requirements = request.body?.requirements;
  if (typeof requirements !== "string" || requirements.trim().length < 20) {
    return response.status(400).json({ error: "Describe the software project in at least 20 characters." });
  }
  if (requirements.length > 5000) {
    return response.status(413).json({ error: "Keep the project description under 5,000 characters." });
  }

  try {
    const cleanRequirements = requirements.trim();
    const workflow = await prisma.workflowRun.create({
      data: {
        requirements: cleanRequirements,
        mode: process.env.GEMINI_API_KEY?.trim() ? "gemini" : "demo",
        status: "running",
        stages: {
          create: stageDefinitions.map((stage, stageOrder) => ({
            key: stage.key,
            title: stage.title,
            stageOrder,
            status: "pending",
          })),
        },
      },
      include: { stages: { orderBy: { stageOrder: "asc" } } },
    });
    void executeWorkflow(workflow.id, cleanRequirements);
    return response.status(202).json({ workflow });
  } catch (error) {
    console.error("Could not start workflow:", error.message);
    return response.status(503).json({ error: "Could not start the workflow. Check the database connection." });
  }
});

async function start() {
  try {
    await prisma.$connect();
    const interrupted = await prisma.workflowRun.findMany({
      where: { status: "running" },
      select: { id: true },
    });
    if (interrupted.length) {
      const ids = interrupted.map(({ id }) => id);
      await prisma.workflowStage.updateMany({
        where: { workflowId: { in: ids }, status: "running" },
        data: { status: "failed", error: "Backend restarted during this stage." },
      });
      await prisma.workflowRun.updateMany({
        where: { id: { in: ids }, status: "running" },
        data: { status: "failed" },
      });
    }
    app.listen(port, "127.0.0.1", () => {
      console.log(`Software Agent Platform API listening on http://127.0.0.1:${port}`);
    });
  } catch (error) {
    console.error("API could not connect to PostgreSQL:", error.message);
    process.exitCode = 1;
  }
}

void start();
