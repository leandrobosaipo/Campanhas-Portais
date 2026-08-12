import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const compose = await readFile(path.join(repoRoot, "ops/portainer/adops-stack/docker-compose.volume.yml"), "utf8");
const runner = await readFile(path.join(repoRoot, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8");
const generalKinds = compose.match(/adops-runner:\n[\s\S]*?OPS_JOB_KINDS:\s*([^\n]+)/)?.[1] ?? "";
const singleKinds = compose.match(/adops-runner-print-single:\n[\s\S]*?OPS_JOB_KINDS:\s*([^\n]+)/)?.[1] ?? "";

assert(!generalKinds.split(",").map((item) => item.trim()).includes("print-single"));
assert.deepEqual(singleKinds.split(",").map((item) => item.trim()), ["print-single", "pi-site-export"]);
assert(
  runner.includes("descriptor?.exportableInsertionIds"),
  "pi-site-export deve excluir inserções sem artefatos auditados antes de gerar o ZIP",
);

console.log(JSON.stringify({ ok: true, generalRunnerOwnsPrintSingle: false, dedicatedRunnerOwnsPrintSingle: true, dedicatedRunnerProvidesExportFailover: true }));
