import { useEffect, useState } from "react";

const API = "http://localhost:4000/api";
const example = "Build a campus event management web app where students can browse events, register, and receive reminders. Organizers should create events and see attendee lists. Include an admin view for moderation.";

function App() {
  const [requirements, setRequirements] = useState("");
  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadHistory() {
    try {
      const response = await fetch(`${API}/workflows`);
      if (!response.ok) return;
      const data = await response.json();
      setHistory(data.workflows);
    } catch {
      // The form displays the useful error if the API is unavailable.
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (!activeWorkflow?.id || ["completed", "failed"].includes(activeWorkflow.status)) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`${API}/workflows/${activeWorkflow.id}`);
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (cancelled) return;
        setActiveWorkflow(data.workflow);
        setHistory((items) => [data.workflow, ...items.filter((item) => item.id !== data.workflow.id)]);
      } catch {
        // A later poll can recover from a temporary local connection error.
      }
    };
    const timer = window.setInterval(poll, 1200);
    void poll();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeWorkflow?.id, activeWorkflow?.status]);

  async function startWorkflow(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setActiveWorkflow(null);
    try {
      const response = await fetch(`${API}/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirements }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The workflow failed.");
      setActiveWorkflow(data.workflow);
      setHistory((items) => [data.workflow, ...items.filter((item) => item.id !== data.workflow.id)]);
    } catch (err) {
      setError(err.message || "Could not reach the backend. Start the API and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <header className="header">
        <div className="brand"><div className="brand-icon">OA</div><div><span className="eyebrow">SOFTWARE ENGINEERING WORKFLOW</span><h1>Orchestrated Agentic AI</h1></div></div>
        <span className="local-tag"><i /> Local prototype</span>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">FROM IDEA TO REVIEWABLE PLAN</p>
          <h2>One project brief.<br /><em>Six specialist stages.</em></h2>
          <p className="subhead">A shared workflow carries context from requirements through design, code, testing, review, and documentation.</p>
        </div>
        <div className="flow-preview" aria-label="Workflow stages">
          {[
            ["01", "Requirements"], ["02", "System design"], ["03", "Code draft"],
            ["04", "Test plan"], ["05", "Code review"], ["06", "Documentation"],
          ].map(([number, label], index) => <div className="flow-step" key={number}><span>{number}</span><b>{label}</b>{index < 5 && <i className="flow-arrow">→</i>}</div>)}
        </div>
      </section>

      <section className="workspace">
        <form className="brief-card" onSubmit={startWorkflow}>
          <div className="section-heading"><div><span className="eyebrow">START A WORKFLOW</span><h3>Describe your software project</h3></div><span className="counter">{requirements.length}/5000</span></div>
          <label className="sr-only" htmlFor="brief">Project requirements</label>
          <textarea id="brief" value={requirements} onChange={(event) => setRequirements(event.target.value)} maxLength={5000} minLength={20} required placeholder="What are you building? Who is it for? What should it do?" />
          <div className="form-footer"><button type="button" className="example" onClick={() => setRequirements(example)}>Use sample brief</button><button className="run-button" disabled={busy || requirements.trim().length < 20}>{busy ? <><span className="spinner" /> Coordinating agents…</> : "Run workflow  ↗"}</button></div>
          {error && <p className="error" role="alert">{error}</p>}
          <p className="privacy-note">Your brief is sent to the backend. Live AI output requires a Gemini API key; without one, the app uses demo templates.</p>
        </form>

        <aside className="info-card"><span className="eyebrow">SHARED PROJECT MEMORY</span><h3>Each agent builds on earlier work.</h3><p>The workflow passes the same brief and prior outputs forward, so later stages can review decisions made earlier.</p><div className="memory-visual"><div className="memory-dot">↗</div><div><b>One evolving project context</b><small>Requirements + stage outputs</small></div></div><div className="info-foot"><span className="shield">◇</span> Generated code is shown as a draft and is never executed by this prototype.</div></aside>
      </section>

      {busy && <div className="progress"><div className="progress-bar" /><p>Running six connected stages. Live runs may take a little time.</p></div>}

      {history.length > 0 && <section className="history">
        <div className="results-heading"><div><span className="eyebrow">SAVED IN POSTGRESQL</span><h3>Recent workflows</h3></div><button type="button" className="history-refresh" onClick={loadHistory}>Refresh</button></div>
        <div className="history-list">{history.slice(0, 10).map((item) => <button type="button" className={`history-item ${activeWorkflow?.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => setActiveWorkflow(item)}><span className={`history-status ${item.status}`} /><span className="history-text"><b>{item.requirements.slice(0, 76)}{item.requirements.length > 76 ? "…" : ""}</b><small>{new Date(item.createdAt).toLocaleString()}</small></span><span className="history-label">{item.status}</span></button>)}</div>
      </section>}

      {activeWorkflow && <section className="results">
        <div className="results-heading"><div><span className="eyebrow">WORKFLOW OUTPUT</span><h3>Project artifacts</h3></div><span className={`mode ${activeWorkflow.mode}`}>{activeWorkflow.mode === "gemini" ? "Gemini connected" : "Demo mode"}</span></div>
        <div className="workflow-status">Run status: <strong>{activeWorkflow.status}</strong> · Created {new Date(activeWorkflow.createdAt).toLocaleString()}</div>
        {activeWorkflow.stages.map((stage, index) => <article className="result-card" key={stage.key}>
          <div className="result-title"><span className="stage-number">{String(index + 1).padStart(2, "0")}</span><h4>{stage.title}</h4><span className={`complete ${stage.status}`}>{stage.status}</span></div>
          {stage.output ? <pre>{stage.output}</pre> : stage.error ? <pre className="stage-error">{stage.error}</pre> : <div className="pending-output">{stage.status === "running" ? "Agent is working on this stage…" : "Waiting for earlier stages"}</div>}
        </article>)}
        <p className="review-note">Review every output before using it. The code and tests are proposals; this prototype saves artifacts but does not write code files or run generated code.</p>
      </section>}

      <footer>Student project prototype · Local use only · Do not enter API keys or confidential source code in the project brief</footer>
    </main>
  );
}

export default App;
