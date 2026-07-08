import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const files = {
  captureAudit: "artifacts/api-server/src/lib/capture-audit.ts",
  insertionsRoute: "artifacts/api-server/src/routes/insertions.ts",
  publicWorker: "ops/cloudflare-public-api/src/index.ts",
  runner: "ops/cloudflare-remote-runner/src/runner.mjs",
  prd: "docs/prd-capture-time-window-v1.md",
  spec: "docs/spec-capture-time-window-v1.md",
  harness: "docs/harness-capture-time-window-v1.md",
  runbook: "docs/runbook-capture-time-window-v1.md",
};

const loaded = Object.fromEntries(await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await readFile(resolve(repoRoot, path), "utf8")]),
));

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function buildRetroCaptureAt(dateKey, insertionId) {
  const seed = `${dateKey}:${insertionId}`;
  let hash = 0;
  const start = 18 * 60;
  const end = 22 * 60;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % (end - start);
  }
  const totalMinutes = start + hash;
  const hour = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minute = String(totalMinutes % 60).padStart(2, "0");
  return `${dateKey}T${hour}:${minute}`;
}

const samples = [];
for (const date of ["2026-05-09", "2026-05-10", "2026-05-11", "2026-05-12"]) {
  for (const insertionId of [1201, 1253, 1256, 1266, 1274, 1400]) {
    const captureAt = buildRetroCaptureAt(date, insertionId);
    const [, time] = captureAt.split("T");
    const [hour, minute] = time.split(":").map(Number);
    const total = hour * 60 + minute;
    samples.push(captureAt);
    assert(total >= 18 * 60 && total < 22 * 60, `captureAt fora da janela: ${captureAt}`);
  }
}

assert(new Set(samples.map((item) => item.slice(11, 16))).size > 8, "amostras não variaram horário suficiente");
assert(loaded.captureAudit.includes("RETRO_CAPTURE_WINDOW_START = \"18:00\""), "capture-audit não declara início da janela");
assert(loaded.captureAudit.includes("RETRO_CAPTURE_WINDOW_END = \"22:00\""), "capture-audit não declara fim da janela");
assert(!loaded.captureAudit.includes("% 180"), "capture-audit ainda permite janela antiga de 180 minutos");
assert(loaded.insertionsRoute.includes("capture_at_outside_allowed_window"), "API privada não bloqueia captureAt fora da janela");
assert(loaded.publicWorker.includes("DAILY_PRINT_CAPTURE_WINDOW"), "Worker público não declara janela diária");
assert(!loaded.publicWorker.includes("DAILY_PRINT_CAPTURE_TIME"), "Worker público ainda tem horário diário fixo");
assert(!loaded.publicWorker.includes("T18:00"), "Worker público ainda contém captureAt fixo 18:00");
assert(!loaded.runner.includes("T10:30:00-04:00"), "runner ainda regenera fora da janela 18-22h");

for (const key of ["prd", "spec", "harness", "runbook"]) {
  assert(loaded[key].includes("18:00") && loaded[key].includes("22:00"), `${files[key]} não documenta a janela 18:00-22:00`);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures, samples }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  samples: samples.slice(0, 12),
  uniqueTimes: new Set(samples.map((item) => item.slice(11, 16))).size,
  window: "18:00 <= captureAt < 22:00 America/Cuiaba",
}, null, 2));
