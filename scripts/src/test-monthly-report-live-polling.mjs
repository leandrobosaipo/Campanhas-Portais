import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const sourcePath = new URL("./build-current-month-evidence-report.mjs", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const buildDir = await mkdtemp(path.join(tmpdir(), "monthly-report-live-polling-"));
const modulePath = path.join(path.dirname(sourcePath.pathname), `.test-live-render-${path.basename(buildDir)}.mjs`);
const importSafeSource = source.replace(
  /main\(\)\.catch\(\(error\) => \{[\s\S]*?\n\}\);\s*$/,
  "export { renderHtml };\n",
);
await writeFile(modulePath, importSafeSource, "utf8");
const { renderHtml } = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
after(async () => {
  await Promise.all([
    rm(modulePath, { force: true }),
    rm(buildDir, { recursive: true, force: true }),
  ]);
});

const insertion = {
  id: 2278,
  modalId: "ins-2278",
  campanhaName: "CAMPANHA TESTE",
  siteSigla: "PERRENGUE",
  clienteNome: "Cliente",
  agenciaNome: "Agência",
  piCodigo: "PI 123",
  localFormato: "HOME 1",
  localFormatoNormalizado: "HOME 1",
  mediaUrl: "https://cdn.example/media.gif",
  periodoInicio: "2026-08-01",
  periodoFim: "2026-08-31",
  requiredDays: ["2026-08-27"],
  evidenceDays: [{ date: "2026-08-27", status: "missing", url: "", downloadUrl: "" }],
  auditedDays: 0,
  missingDates: ["2026-08-27"],
  invalidDates: [],
  retroactiveMissingDates: [],
  state: "pending",
  statusDetail: "Print pendente.",
};

const portal = {
  key: "PERRENGUE",
  label: "Perrengue Mato Grosso",
  logo: "",
  homeUrl: "https://perrenguematogrosso.com",
  stats: { active: 1, scheduled: 0, ended: 0, ok: 0, pending: 1, invalid: 0, not_published: 0, blocked_upstream: 0, evidences: 0 },
  campaigns: [{ name: insertion.campanhaName, pi: insertion.piCodigo, cliente: insertion.clienteNome, agencia: insertion.agenciaNome, items: [insertion] }],
};

function html() {
  return renderHtml({
    insertions: [insertion],
    portals: [portal],
    audits: {},
    summary: { total: 1, active: 1, scheduled: 0, ended: 0, ok: 0, pending: 1, invalid: 0, notPublished: 0, blockedUpstream: 0, auditedDays: 0 },
    forecast: { starting: [], ending: [] },
    sources: { driveInventory: { snapshotStatus: "fresh", itemCount: 1 } },
    dailyPrintStatus: {
      nextRunAt: "2026-08-28T22:00:00.000Z",
      lastAttempt: { jobId: "daily-job-1", targetDate: "2026-08-27", status: "running", expected: 1, approved: 0, missing: 1, invalid: 0, failedInsertionIds: [] },
    },
  });
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this._textContent = "";
    this.innerHTML = "";
    this.openCount = 0;
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent || "").join("");
  }

  set textContent(value) {
    this._textContent = String(value ?? "");
    this.children = [];
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  prepend(child) {
    child.parentElement = this;
    this.children.unshift(child);
  }

  replaceChildren(...children) {
    this._textContent = "";
    this.children = [];
    this.append(...children);
  }

  replaceWith(replacement) {
    const index = this.parentElement?.children.indexOf(this) ?? -1;
    if (index >= 0) {
      replacement.parentElement = this.parentElement;
      this.parentElement.children.splice(index, 1, replacement);
    }
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ type, target: this });
  }

  click() {
    this.dispatch("click");
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  showModal() {
    this.openCount += 1;
  }

  close() {}
  focus() {}
}

function behaviorSource() {
  const output = html();
  const inline = [...output.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .find((body) => body.includes("const liveApiBase"));
  assert.ok(inline, "JavaScript inline vivo deve existir");
  const liveStart = inline.indexOf("const liveApiBase");
  const modalStart = inline.indexOf("const modal = document.getElementById('modal')");
  const modalEnd = inline.indexOf("const mediaModal = document.getElementById('mediaModal')");
  assert.ok(liveStart >= 0 && modalStart > liveStart && modalEnd > modalStart, "blocos vivo e modal devem ser extraíveis");
  return `${inline.slice(liveStart, modalStart)}\n${inline.slice(modalStart, modalEnd)}`;
}

function response(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

function daily(status = "running", nextRecoveryAt = null) {
  return {
    nextRunAt: "2026-08-28T22:00:00.000Z",
    lastAttempt: {
      jobId: "daily-job-1",
      targetDate: "2026-08-27",
      status,
      nextRecoveryAt,
      summary: "Resumo seguro da rotina.",
    },
  };
}

function progress(status = "running", liveProgress = {}) {
  return {
    jobId: "daily-job-1",
    kind: "print-batch",
    status,
    percentTotal: status === "completed" ? 100 : 40,
    itemsDone: 1,
    itemsTotal: 5,
    error: "ERRO BRUTO NÃO DEVE APARECER",
    liveProgress: {
      completedInsertionIds: [],
      runningInsertionId: null,
      pendingInsertionIds: [],
      failedInsertionIds: [],
      blockedInsertionIds: [],
      ...liveProgress,
    },
  };
}

const finalProof = {
  status: "audited",
  hasValidUrl: true,
  isReachable: true,
  arquivoUrl: "https://cdn.example/live-2278.png",
  checklistValidation: {
    approved: true,
    preliminary: false,
    evidenceStatus: "approved",
    blockingIssues: [],
  },
};

function snapshotItem(id, overrides = {}) {
  return {
    ...insertion,
    id,
    modalId: `ins-${id}`,
    campanhaName: `CAMPANHA ${id}`,
    piCodigo: `PI ${id}`,
    siteSigla: `PORTAL${id}`,
    statusDetail: `Causa segura ${id}`,
    ...overrides,
  };
}

async function flushMicrotasks(turns = 12) {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

async function createBehaviorHarness({ hidden = false, items = [snapshotItem(2278)], fetchImpl } = {}) {
  const elements = new Map();
  const element = (id, tag = "div") => {
    if (!elements.has(id)) elements.set(id, new FakeElement(tag));
    return elements.get(id);
  };
  const progressBar = element("livePrintProgressBar");
  const progressFill = new FakeElement("i");
  progressBar.querySelector = (selector) => selector === "i" ? progressFill : null;
  const thumbs = new FakeElement("div");
  const initialCell = new FakeElement("button");
  initialCell.dataset.liveInsertionId = "2278";
  initialCell.dataset.liveDate = "2026-08-27";
  initialCell.dataset.modalId = "ins-2278";
  initialCell.dataset.date = "2026-08-27";
  thumbs.append(initialCell);
  thumbs.querySelector = (selector) => selector.includes('data-live-insertion-id="2278"')
    ? thumbs.children.find((child) => child.dataset.liveInsertionId === "2278" && child.dataset.liveDate === "2026-08-27") || null
    : null;
  const container = new FakeElement("article");
  container.querySelector = (selector) => selector === ".thumbs" ? thumbs : null;
  const documentListeners = new Map();
  const document = {
    hidden,
    getElementById: (id) => element(id, id === "modal" ? "dialog" : "div"),
    createElement: (tag) => new FakeElement(tag),
    querySelector: (selector) => selector === '[data-live-insertion-container="2278"]' ? container : null,
    querySelectorAll: (selector) => selector === ".thumb, .day-card, .thumb-empty" ? [initialCell] : [],
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
    dispatch(type) {
      for (const listener of documentListeners.get(type) || []) listener({ type, target: document });
    },
  };
  const timers = new Map();
  const clearedTimers = [];
  let timerId = 0;
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return (fetchImpl || (() => response({})))(String(url), init, calls.length);
  };
  const windowListeners = new Map();
  const window = {
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
  };
  const data = Object.fromEntries(items.map((item) => [item.modalId, item]));
  const context = {
    AbortController,
    Date,
    Map,
    Math,
    Promise,
    Set,
    String,
    URL,
    data,
    document,
    encodeURIComponent,
    fetch,
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      clearedTimers.push(id);
      timers.delete(id);
    },
    window,
  };
  vm.runInNewContext(behaviorSource(), context, { filename: "monthly-report-live-inline.js" });
  await flushMicrotasks();
  return { calls, clearedTimers, container, context, document, element, elements, initialCell, progressFill, thumbs, timers };
}

test("relatório renderizado expõe progresso vivo acessível e preserva o snapshot", () => {
  const output = html();
  assert.match(output, /id="livePrintProgress"/);
  assert.match(output, /id="livePrintProgressBar"[^>]+role="progressbar"[^>]+aria-valuemin="0"[^>]+aria-valuemax="100"[^>]+aria-valuenow="0"/);
  assert.match(output, /id="livePrintSummary"[^>]+aria-live="polite"/);
  assert.match(output, /id="livePrintItems"/);
  assert.match(output, /id="livePrintUpdatedAt"/);
  assert.match(output, /id="livePrintProgressBar"[^>]+aria-labelledby="livePrintTitle"[^>]+aria-describedby="livePrintSummary"/);
  assert.match(output, /data-live-insertion-id="2278" data-live-date="2026-08-27"/);
  assert.match(output, />Print pendente</);
  assert.match(output, /\.live-audited\s*\{[^}]*position:\s*relative[^}]*overflow:\s*visible/s);
  assert.match(output, /\.live-audited \.live-badge\s*\{[^}]*position:\s*absolute/s);
});

test("cliente vivo usa somente GET, todos os contratos e polling finito", () => {
  const output = html();
  assert.match(output, /\/api\/ops\/daily-print-status/);
  assert.match(output, /\/api\/ops\/queue\/overview/);
  assert.match(output, /\/api\/ops\/jobs\/.*\/progress/);
  assert.match(output, /\/api\/insertions\/.*\/capture-proof\/status/);
  assert.doesNotMatch(output, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/i);
  assert.match(output, /15_000|15000/);
  assert.match(output, /30_000|30000/);
  assert.match(output, /60_000|60000/);
  assert.match(output, /120_000|120000/);
  assert.match(output, /document\.hidden/);
  assert.match(output, /document\.addEventListener\(['"]visibilitychange['"]/);
  assert.match(output, /liveRequest\.abort\(\)/);
  assert.match(output, /Dados vivos indisponíveis/);
});

test("retoma imediatamente ao voltar visível e cancela o timer oculto", async () => {
  const harness = await createBehaviorHarness({
    hidden: true,
    fetchImpl: (url) => {
      if (url.includes("daily-print-status")) return response(daily("running"));
      if (url.includes("queue/overview")) return response({ now: { jobId: "daily-job-1", kind: "print-batch", status: "running" }, queue: [] });
      if (url.includes("/progress")) return response(progress("running"));
      return response(finalProof);
    },
  });
  assert.equal([...harness.timers.values()][0]?.delay, 60_000);
  const callsBeforeVisible = harness.calls.length;
  const hiddenTimerId = [...harness.timers.keys()][0];
  harness.document.hidden = false;
  harness.document.dispatch("visibilitychange");
  assert.ok(harness.clearedTimers.includes(hiddenTimerId), "timer oculto deve ser cancelado");
  assert.ok(harness.calls.length > callsBeforeVisible, "retomada visível deve iniciar fetch sem aguardar timer");
});

test("estado terminal sem recuperação não deixa timeout armado", async () => {
  const harness = await createBehaviorHarness({
    fetchImpl: (url) => {
      if (url.includes("daily-print-status")) return response(daily("completed"));
      if (url.includes("queue/overview")) return response({ now: null, queue: [] });
      if (url.includes("/progress")) return response(progress("completed"));
      return response(finalProof);
    },
  });
  assert.equal(harness.timers.size, 0);
});

test("refresh sobreposto aborta as leituras anteriores", async () => {
  let releaseFirst;
  const firstResponse = new Promise((resolve) => { releaseFirst = resolve; });
  const harness = await createBehaviorHarness({
    fetchImpl: (url, init, callNumber) => {
      if (callNumber <= 2) return firstResponse;
      if (url.includes("daily-print-status")) return response(daily("completed"));
      if (url.includes("queue/overview")) return response({ now: null, queue: [] });
      return response(progress("completed"));
    },
  });
  harness.element("livePrintRetry").click();
  assert.equal(harness.calls[0].init.signal.aborted, true);
  assert.equal(harness.calls[1].init.signal.aborted, true);
  releaseFirst(response(daily("running")));
  await flushMicrotasks();
});

test("promoção viva preserva a rota do modal e o download HTTPS", async () => {
  const harness = await createBehaviorHarness({
    items: [snapshotItem(2278, {
      evidenceDays: [{ date: "2026-08-27", status: "audited", url: "https://cdn.example/static-2278.png", downloadUrl: "https://cdn.example/static-2278.jpg" }],
      auditedDays: 1,
      missingDates: [],
    })],
    fetchImpl: (url) => {
      if (url.includes("daily-print-status")) return response(daily("running"));
      if (url.includes("queue/overview")) return response({ now: { jobId: "daily-job-1", kind: "print-batch", status: "running" }, queue: [] });
      if (url.includes("/progress")) return response(progress("running", { completedInsertionIds: [2278] }));
      return response(finalProof);
    },
  });
  const liveCell = harness.thumbs.children[0];
  assert.equal(liveCell.dataset.modalId, "ins-2278");
  assert.equal(liveCell.dataset.date, "2026-08-27");
  liveCell.click();
  assert.equal(harness.element("modal").openCount, 1);
  assert.match(harness.element("modalTitle").textContent, /#2278 · CAMPANHA 2278/);
  assert.match(harness.element("modalLinks").innerHTML, /https:\/\/cdn\.example\/live-2278\.png/);
  assert.match(harness.element("modalMeta").innerHTML, /1 de 1 prints aprovados/);
});

test("modal vivo corrige somente os detalhes temporários do dia promovido", async () => {
  const harness = await createBehaviorHarness({
    items: [snapshotItem(2278, {
      requiredDays: [],
      evidenceDays: [],
      auditedDays: 0,
      missingDates: ["2026-08-27"],
      statusDetail: "Print pendente no snapshot.",
    })],
    fetchImpl: (url) => {
      if (url.includes("daily-print-status")) return response(daily("running"));
      if (url.includes("queue/overview")) return response({ now: { jobId: "daily-job-1", kind: "print-batch", status: "running" }, queue: [] });
      if (url.includes("/progress")) return response(progress("running", { completedInsertionIds: [2278] }));
      return response(finalProof);
    },
  });
  harness.thumbs.children[0].click();
  const details = harness.element("modalMeta").innerHTML;
  assert.match(details, /1 de 1 prints aprovados/);
  assert.match(details, /Atualização ao vivo aprovada pelo checklist final/);
  assert.match(details, /<dt>Pendentes<\/dt><dd>-<\/dd>/);
});

test("cinco estados exibem contexto completo sem erro bruto", async () => {
  const ids = [2278, 2279, 2280, 2281, 2282];
  const items = ids.map((id) => snapshotItem(id));
  const harness = await createBehaviorHarness({
    items,
    fetchImpl: (url) => {
      if (url.includes("daily-print-status")) return response(daily("running"));
      if (url.includes("queue/overview")) return response({ now: { jobId: "daily-job-1", kind: "print-batch", status: "running" }, queue: [] });
      if (url.includes("/progress")) return response(progress("running", {
        completedInsertionIds: [2278],
        runningInsertionId: 2279,
        pendingInsertionIds: [2280],
        failedInsertionIds: [2281],
        blockedInsertionIds: [2282],
      }));
      return response({ status: "missing" });
    },
  });
  const rendered = harness.element("livePrintItems").textContent;
  for (const id of ids) {
    assert.match(rendered, new RegExp(`CAMPANHA ${id}.*PI ${id}.*PORTAL${id}.*Inserção #${id}.*27/08/2026.*Causa segura ${id}`, "s"));
  }
  assert.doesNotMatch(rendered, /ERRO BRUTO NÃO DEVE APARECER/);
});
