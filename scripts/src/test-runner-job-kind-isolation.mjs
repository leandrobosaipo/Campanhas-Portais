import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const compose = await readFile(path.join(repoRoot, "ops/portainer/adops-stack/docker-compose.volume.yml"), "utf8");
const runner = await readFile(path.join(repoRoot, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8");
const insertionsRoute = await readFile(path.join(repoRoot, "artifacts/api-server/src/routes/insertions.ts"), "utf8");
const generalKinds = compose.match(/adops-runner:\n[\s\S]*?OPS_JOB_KINDS:\s*([^\n]+)/)?.[1] ?? "";
const singleKinds = compose.match(/adops-runner-print-single:\n[\s\S]*?OPS_JOB_KINDS:\s*([^\n]+)/)?.[1] ?? "";

assert(!generalKinds.split(",").map((item) => item.trim()).includes("print-single"));
assert(generalKinds.split(",").map((item) => item.trim()).includes("campaign-evidence-export"));
assert.deepEqual(singleKinds.split(",").map((item) => item.trim()), ["print-single", "pi-site-export", "campaign-evidence-export"]);
const dedicatedRunnerBlock = compose.match(/adops-runner-print-single:\n[\s\S]*?(?=\n  adops-web:)/)?.[0] ?? "";
for (const variable of ["DO_SPACES_ACCESS_KEY_ID", "DO_SPACES_SECRET_ACCESS_KEY", "ADOPS_EXPORT_BUCKET", "ADOPS_EXPORT_BASE_PATH"]) {
  assert(dedicatedRunnerBlock.includes(variable), `runner dedicado sem ${variable}`);
}
assert(
  runner.includes("descriptor?.exportableInsertionIds"),
  "pi-site-export deve excluir inserções sem artefatos auditados antes de gerar o ZIP",
);
assert(
  runner.includes('mode === "full"') && runner.includes("descriptor?.evidenceInsertionIds"),
  "prints-only e PDF devem usar somente inserções que possuem evidências",
);
assert(
  runner.includes('if (mode !== "prints-only") {') && runner.includes('stage: "garantindo documentos operacionais"'),
  "prints-only não deve esperar documentos ou Analytics opcionais",
);
assert(
  runner.includes('await runPnpm(["--filter", "@workspace/scripts", "run", "sync:planilha"]')
    && runner.includes('await runPnpm(["--dir", "scripts", "run", "audit:capture-rules-integrity"]'),
  "job mensal deve usar o corepack disponível no runtime para executar pnpm",
);
assert(
  insertionsRoute.includes('exportOptions.mode === "full" ? descriptor.exportableInsertionIds : descriptor.evidenceInsertionIds'),
  "endpoint de download deve manter o mesmo recorte de evidências do runner",
);

console.log(JSON.stringify({ ok: true, generalRunnerOwnsPrintSingle: false, dedicatedRunnerOwnsPrintSingle: true, dedicatedRunnerProvidesExportFailover: true, dedicatedRunnerPreventsMonthlyReportExportDeadlock: true }));
