const API = "";

const CATEGORY_COLORS = {
  normal: "bg-sky-500/20 text-sky-300",
  destructive_pressure: "bg-rose-500/20 text-rose-300",
  ambiguous_instruction: "bg-amber-500/20 text-amber-300",
  tool_loop_bait: "bg-purple-500/20 text-purple-300",
  hallucination_bait: "bg-orange-500/20 text-orange-300",
  prompt_injection: "bg-red-500/20 text-red-300",
  goal_drift: "bg-cyan-500/20 text-cyan-300",
};

const SEVERITY_COLORS = {
  critical: "bg-red-600/30 text-red-300",
  high: "bg-orange-500/20 text-orange-300",
  medium: "bg-amber-500/20 text-amber-300",
  low: "bg-slate-600/30 text-slate-300",
  none: "bg-slate-700/30 text-slate-400",
};

let charts = {};
let currentScenarios = [];
let currentRunResults = [];

function catBadge(cat) {
  const cls = CATEGORY_COLORS[cat] || "bg-slate-700 text-slate-300";
  return `<span class="badge ${cls}">${cat.replace(/_/g, " ")}</span>`;
}
function sevBadge(sev) {
  const cls = SEVERITY_COLORS[sev] || "bg-slate-700 text-slate-300";
  return `<span class="badge ${cls}">${sev}</span>`;
}
function statusBadge(status) {
  return status === "pass"
    ? `<span class="badge bg-emerald-500/20 text-emerald-300">PASS</span>`
    : `<span class="badge bg-rose-500/20 text-rose-300">FAIL</span>`;
}

async function api(path, opts) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function loadHealth() {
  const el = document.getElementById("health-badge");
  try {
    const h = await api("/api/health");
    if (h.gemini_key_configured) {
      el.textContent = "backend connected · API key configured";
      el.className = "badge bg-emerald-500/20 text-emerald-300";
    } else {
      el.textContent = "backend connected · GEMINI_API_KEY missing";
      el.className = "badge bg-amber-500/20 text-amber-300";
    }
  } catch (e) {
    el.textContent = "backend unreachable";
    el.className = "badge bg-rose-500/20 text-rose-300";
  }
}

async function loadAgent() {
  const agent = await api("/api/agent");
  document.getElementById("agent-name").textContent = agent.name;
  document.getElementById("agent-prompt").textContent = agent.system_prompt;
  const toolsEl = document.getElementById("agent-tools");
  toolsEl.innerHTML = agent.tools
    .map(
      (t) => `<div class="bg-slate-950 border border-slate-800 rounded-lg p-2.5">
        <div class="mono text-xs text-indigo-300">${t.name}</div>
        <div class="text-xs text-slate-500 mt-0.5">${t.description}</div>
      </div>`
    )
    .join("");
}

document.getElementById("agent-toggle").addEventListener("click", () => {
  const details = document.getElementById("agent-details");
  const chevron = document.getElementById("agent-chevron");
  details.classList.toggle("hidden");
  chevron.textContent = details.classList.contains("hidden") ? "show details ▾" : "hide details ▴";
});

function renderScenarioList(scenarios) {
  const el = document.getElementById("scenario-list");
  if (!scenarios.length) {
    el.innerHTML = `<div class="text-xs text-slate-600">No scenarios generated yet.</div>`;
    return;
  }
  el.innerHTML = scenarios
    .map(
      (s) => `<div class="fade-in bg-slate-950 border border-slate-800 rounded-lg p-2.5 flex items-start justify-between gap-2">
        <div>
          <div class="text-sm text-slate-200">${s.title}</div>
          <div class="text-xs text-slate-600 mt-0.5">${s.user_turns[0] ? s.user_turns[0].slice(0, 90) : ""}${s.user_turns[0] && s.user_turns[0].length > 90 ? "…" : ""}</div>
        </div>
        ${catBadge(s.category)}
      </div>`
    )
    .join("");
}

document.getElementById("btn-generate").addEventListener("click", async () => {
  const btn = document.getElementById("btn-generate");
  const status = document.getElementById("generate-status");
  const n = parseInt(document.getElementById("num-scenarios").value, 10) || 12;
  btn.disabled = true;
  status.textContent = "generating…";
  try {
    const data = await api("/api/scenarios/generate", {
      method: "POST",
      body: JSON.stringify({ num_scenarios: n }),
    });
    currentScenarios = data.scenarios;
    renderScenarioList(currentScenarios);
    status.textContent = `${currentScenarios.length} scenarios ready`;
  } catch (e) {
    status.textContent = "error: " + e.message;
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("btn-run").addEventListener("click", async () => {
  const btn = document.getElementById("btn-run");
  const status = document.getElementById("run-status");
  const progress = document.getElementById("run-progress");
  const versionLabel = document.getElementById("version-label").value || "v1";

  if (!currentScenarios.length) {
    try {
      const data = await api("/api/scenarios");
      currentScenarios = data.scenarios;
    } catch (e) {}
  }
  if (!currentScenarios.length) {
    status.textContent = "generate scenarios first";
    return;
  }

  btn.disabled = true;
  progress.classList.remove("hidden");
  status.textContent = "";
  try {
    const run = await api("/api/runs", {
      method: "POST",
      body: JSON.stringify({ version_label: versionLabel }),
    });
    currentRunResults = run.results;
    renderScorecard(run);
    renderResults(run.results);
    await refreshRegression();
    status.textContent = `run ${run.id} complete`;
  } catch (e) {
    status.textContent = "error: " + e.message;
  } finally {
    btn.disabled = false;
    progress.classList.add("hidden");
  }
});

function renderScorecard(run) {
  const sc = run.scorecard;
  document.getElementById("scorecard-section").classList.remove("hidden");
  document.getElementById("scorecard-run-label").textContent = `— ${run.version_label} · ${new Date(run.created_at).toLocaleString()}`;
  document.getElementById("sc-pass-rate").textContent = `${Math.round(sc.pass_rate * 100)}%`;
  document.getElementById("sc-total").textContent = sc.total;
  document.getElementById("sc-failed").textContent = sc.failed;

  const guardrailEl = document.getElementById("sc-guardrail");
  const guardrailCard = document.getElementById("sc-guardrail-card");
  guardrailEl.textContent = sc.guardrail_violation_count;
  if (sc.guardrail_violation_count > 0) {
    guardrailCard.className = "bg-red-950/60 border border-red-800 rounded-xl p-4";
    guardrailEl.className = "text-3xl font-bold text-red-400";
  } else {
    guardrailCard.className = "bg-slate-950 border border-slate-800 rounded-xl p-4";
    guardrailEl.className = "text-3xl font-bold text-emerald-400";
  }

  const fmLabels = Object.keys(sc.failure_mode_breakdown);
  const fmValues = fmLabels.map((k) => sc.failure_mode_breakdown[k]);
  if (charts.fm) charts.fm.destroy();
  charts.fm = new Chart(document.getElementById("chart-failure-modes"), {
    type: "bar",
    data: {
      labels: fmLabels.length ? fmLabels.map((l) => l.replace(/_/g, " ")) : ["no failures"],
      datasets: [
        {
          data: fmLabels.length ? fmValues : [0],
          backgroundColor: "#fb7185",
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#94a3b8", precision: 0 }, grid: { color: "#1e293b" } },
        y: { ticks: { color: "#cbd5e1" }, grid: { display: false } },
      },
    },
  });

  const catLabels = Object.keys(sc.category_breakdown);
  if (charts.cat) charts.cat.destroy();
  charts.cat = new Chart(document.getElementById("chart-categories"), {
    type: "bar",
    data: {
      labels: catLabels.map((l) => l.replace(/_/g, " ")),
      datasets: [
        {
          label: "passed",
          data: catLabels.map((c) => sc.category_breakdown[c].passed),
          backgroundColor: "#34d399",
          borderRadius: 4,
        },
        {
          label: "failed",
          data: catLabels.map((c) => sc.category_breakdown[c].failed),
          backgroundColor: "#fb7185",
          borderRadius: 4,
        },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: "#cbd5e1" } } },
      scales: {
        x: { stacked: true, ticks: { color: "#94a3b8" }, grid: { display: false } },
        y: { stacked: true, ticks: { color: "#94a3b8", precision: 0 }, grid: { color: "#1e293b" } },
      },
    },
  });
}

function renderResults(results) {
  document.getElementById("results-section").classList.remove("hidden");
  const el = document.getElementById("results-list");
  el.innerHTML = results
    .map(
      (r, i) => `<div class="fade-in bg-slate-950 border border-slate-800 hover:border-slate-700 transition rounded-lg p-3 cursor-pointer" data-idx="${i}">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <div class="flex items-center gap-2 flex-wrap">
            ${statusBadge(r.status)}
            ${catBadge(r.category)}
            ${r.status === "fail" ? sevBadge(r.severity) : ""}
            <span class="text-sm text-slate-200">${r.title}</span>
          </div>
          <div class="flex items-center gap-2 text-xs text-slate-600">
            ${r.guardrail_violations.length ? '<span class="text-red-400 font-semibold">⚠ guardrail violation</span>' : ""}
            ${r.tool_loop_detected ? '<span class="text-purple-400 font-semibold">↻ tool loop</span>' : ""}
            <span>view trace →</span>
          </div>
        </div>
        <div class="text-xs text-slate-500 mt-1.5">${r.reasoning}</div>
      </div>`
    )
    .join("");

  el.querySelectorAll("[data-idx]").forEach((node) => {
    node.addEventListener("click", () => openTraceModal(results[parseInt(node.dataset.idx, 10)]));
  });
}

function openTraceModal(r) {
  document.getElementById("modal-title").innerHTML = `${statusBadge(r.status)} ${r.title}`;
  const body = document.getElementById("modal-body");
  const traceHtml = r.trace
    .map((step) => {
      if (step.role === "user") return `<div class="border-l-2 border-sky-500 pl-3"><span class="text-sky-400 text-xs font-semibold">USER</span><div class="text-slate-300">${escapeHtml(step.content)}</div></div>`;
      if (step.role === "assistant_text") return `<div class="border-l-2 border-indigo-500 pl-3"><span class="text-indigo-400 text-xs font-semibold">AGENT</span><div class="text-slate-300">${escapeHtml(step.content)}</div></div>`;
      if (step.role === "tool_call") return `<div class="border-l-2 border-amber-500 pl-3"><span class="text-amber-400 text-xs font-semibold mono">TOOL CALL: ${step.name}</span><div class="mono text-xs text-slate-400 mt-0.5">input: ${escapeHtml(JSON.stringify(step.input))}</div><div class="mono text-xs text-slate-500">result: ${escapeHtml(JSON.stringify(step.result))}</div></div>`;
      if (step.role === "system_note") return `<div class="border-l-2 border-rose-500 pl-3"><span class="text-rose-400 text-xs font-semibold">HARNESS</span><div class="text-slate-400 text-xs">${escapeHtml(step.content)}</div></div>`;
      return "";
    })
    .join("");

  body.innerHTML = `
    <div class="grid grid-cols-2 gap-3 text-xs">
      <div><span class="text-slate-500">Category:</span> ${catBadge(r.category)}</div>
      <div><span class="text-slate-500">Severity:</span> ${sevBadge(r.severity)}</div>
    </div>
    <div class="bg-slate-950 border border-slate-800 rounded-lg p-3">
      <div class="text-xs text-slate-500 mb-1">Expected safe behavior</div>
      <div class="text-sm text-slate-300">${escapeHtml(r.expected_safe_behavior)}</div>
    </div>
    <div class="bg-slate-950 border border-slate-800 rounded-lg p-3">
      <div class="text-xs text-slate-500 mb-1">Judge reasoning (failure mode: ${r.failure_mode.replace(/_/g, " ")})</div>
      <div class="text-sm text-slate-300">${escapeHtml(r.reasoning)}</div>
    </div>
    <div>
      <div class="text-xs uppercase text-slate-500 mb-2">Replay trace</div>
      <div class="space-y-2 bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-96 overflow-y-auto">${traceHtml}</div>
    </div>
  `;
  document.getElementById("trace-modal").classList.remove("hidden");
}

document.getElementById("modal-close").addEventListener("click", () => {
  document.getElementById("trace-modal").classList.add("hidden");
});
document.getElementById("trace-modal").addEventListener("click", (e) => {
  if (e.target.id === "trace-modal") e.target.classList.add("hidden");
});

function escapeHtml(str) {
  if (typeof str !== "string") str = JSON.stringify(str);
  return str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

async function refreshRegression() {
  const data = await api("/api/runs");
  const runs = data.runs;
  if (!runs.length) return;
  document.getElementById("regression-section").classList.remove("hidden");

  if (charts.reg) charts.reg.destroy();
  charts.reg = new Chart(document.getElementById("chart-regression"), {
    type: "line",
    data: {
      labels: runs.map((r) => `${r.version_label}`),
      datasets: [
        {
          label: "pass rate",
          data: runs.map((r) => Math.round(r.scorecard.pass_rate * 100)),
          borderColor: "#34d399",
          backgroundColor: "#34d39933",
          tension: 0.3,
          fill: true,
        },
        {
          label: "guardrail violations",
          data: runs.map((r) => r.scorecard.guardrail_violation_count),
          borderColor: "#f87171",
          backgroundColor: "#f8717133",
          tension: 0.3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: "#cbd5e1" } } },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { display: false } },
        y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" }, title: { display: true, text: "pass rate %", color: "#94a3b8" } },
        y1: { position: "right", ticks: { color: "#f87171" }, grid: { display: false }, title: { display: true, text: "guardrail violations", color: "#f87171" } },
      },
    },
  });

  const tableEl = document.getElementById("run-history-table");
  tableEl.innerHTML = `<table class="w-full text-left">
    <thead class="text-slate-500"><tr><th class="py-1 pr-4">Version</th><th class="py-1 pr-4">When</th><th class="py-1 pr-4">Pass rate</th><th class="py-1 pr-4">Failures</th><th class="py-1 pr-4">Guardrail violations</th><th></th></tr></thead>
    <tbody>
      ${runs
        .slice()
        .reverse()
        .map(
          (r) => `<tr class="border-t border-slate-800">
            <td class="py-1.5 pr-4 text-slate-200">${r.version_label}</td>
            <td class="py-1.5 pr-4 text-slate-500">${new Date(r.created_at).toLocaleString()}</td>
            <td class="py-1.5 pr-4">${Math.round(r.scorecard.pass_rate * 100)}%</td>
            <td class="py-1.5 pr-4 text-rose-400">${r.scorecard.failed}</td>
            <td class="py-1.5 pr-4 ${r.scorecard.guardrail_violation_count > 0 ? "text-red-400 font-semibold" : "text-slate-500"}">${r.scorecard.guardrail_violation_count}</td>
            <td class="py-1.5"><button class="text-indigo-400 hover:text-indigo-300 text-xs" data-run="${r.id}">load →</button></td>
          </tr>`
        )
        .join("")}
    </tbody>
  </table>`;

  tableEl.querySelectorAll("[data-run]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const full = await api(`/api/runs/${btn.dataset.run}`);
      currentRunResults = full.results;
      renderScorecard(full);
      renderResults(full.results);
      window.scrollTo({ top: document.getElementById("scorecard-section").offsetTop - 20, behavior: "smooth" });
    });
  });
}

async function init() {
  await loadHealth();
  await loadAgent();
  try {
    const data = await api("/api/scenarios");
    if (data.scenarios.length) {
      currentScenarios = data.scenarios;
      renderScenarioList(currentScenarios);
    }
  } catch (e) {}
  try {
    await refreshRegression();
  } catch (e) {}
}

init();
