import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  buildDeliveryPackageName,
  buildDeliveryPrintFileName,
  EvidenceExportInputError,
  groupByDeliveryPosition,
  parseEvidenceExportOptions,
  prepareEvidenceImage,
  resolveDeliveryPosition,
} from "../../artifacts/api-server/src/lib/evidence-export";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pythonExecutable =
  process.env.ADOPS_EVIDENCE_EXPORT_PYTHON?.trim() || "python3";

const insertion = {
  siteSigla: "PERRENGUE",
  piCodigo: "PI 003121 - SANEAR",
  clienteNome: "SANEAR",
  campanhaName: "RESOLVE",
  localFormatoNormalizado: "VIDEO",
  periodoInicio: "2026-07-07",
  periodoFim: "2026-07-19",
};

async function createPng(filePath: string, width: number, height: number) {
  await execFileAsync(
    pythonExecutable,
    [
      "-c",
      String.raw`from PIL import Image
import sys
w, h = int(sys.argv[2]), int(sys.argv[3])
image = Image.new("RGB", (w, h))
pixels = image.load()
for y in range(h):
    color = ((y * 7) % 256, (y * 13) % 256, (y * 17) % 256)
    for x in range(w):
        pixels[x, y] = ((color[0] + x) % 256, color[1], color[2])
image.save(sys.argv[1], "PNG")`,
      filePath,
      String(width),
      String(height),
    ],
    { timeout: 120_000 },
  );
}

test("parâmetros e nomes de entrega preservam compatibilidade e posição", () => {
  assert.deepEqual(parseEvidenceExportOptions({}), {
    mode: "full",
    variant: "original",
  });
  assert.deepEqual(
    parseEvidenceExportOptions({ mode: "prints-only", variant: "web" }),
    { mode: "prints-only", variant: "web" },
  );
  assert.throws(
    () => parseEvidenceExportOptions({ mode: "full", variant: "web" }),
    EvidenceExportInputError,
  );

  const packageName = buildDeliveryPackageName(insertion, [
    "2026-07-07",
    "2026-07-15",
  ]);
  assert.equal(
    packageName,
    "PERRENGUE-PI-003121-SANEAR-VIDEO-2026-07-07-A-2026-07-15",
  );
  assert.equal(
    buildDeliveryPrintFileName(insertion, "2026-07-07"),
    "PERRENGUE-PI-003121-VIDEO-2026-07-07.png",
  );
  assert.doesNotMatch(packageName, /retroativ|evidenc/i);
  assert.equal(resolveDeliveryPosition({ localFormatoNormalizado: "Home 2" }), "HOME-2");
  assert.deepEqual(
    groupByDeliveryPosition(
      [
        { id: 1, position: "Topo" },
        { id: 2, position: "Home 2" },
        { id: 3, position: "TOPO" },
      ],
      (item) => item.position,
    ).map((group) => ({ position: group.position, ids: group.items.map((item) => item.id) })),
    [
      { position: "TOPO", ids: [1, 3] },
      { position: "HOME-2", ids: [2] },
    ],
  );
});

test("JPEG web reduz largura sem ampliar imagens menores e o ZIP contém somente prints", async () => {
  const root = await mkdtemp(join(tmpdir(), "adops-evidence-web-export-test-"));
  try {
    const packageName = buildDeliveryPackageName(insertion, [
      "2026-07-07",
      "2026-07-08",
    ]);
    const packageDir = join(root, packageName);
    await mkdir(packageDir, { recursive: true });

    const largeSourcePath = join(root, "large-source.png");
    const smallSourcePath = join(root, "small-source.png");
    await createPng(largeSourcePath, 3320, 2654);
    await createPng(smallSourcePath, 800, 600);

    const large = await prepareEvidenceImage({
      source: await readFile(largeSourcePath),
      outputPath: join(
        packageDir,
        buildDeliveryPrintFileName(insertion, "2026-07-07", undefined, ".jpg"),
      ),
      variant: "web",
    });
    const small = await prepareEvidenceImage({
      source: await readFile(smallSourcePath),
      outputPath: join(
        packageDir,
        buildDeliveryPrintFileName(insertion, "2026-07-08", undefined, ".jpg"),
      ),
      variant: "web",
    });

    assert.equal(large.sourceWidth, 3320);
    assert.equal(large.width, 1920);
    assert.equal(large.height, 1535);
    assert.equal(small.sourceWidth, 800);
    assert.equal(small.width, 800);
    assert.equal(small.height, 600);

    const zipPath = join(root, `${packageName}.zip`);
    await execFileAsync("zip", ["-rq", zipPath, packageName], { cwd: root });
    const listing = await execFileAsync("unzip", ["-Z1", zipPath]);
    const files = listing.stdout
      .trim()
      .split("\n")
      .filter((entry) => !entry.endsWith("/"));
    assert.equal(files.length, 2);
    assert.ok(files.every((entry) => entry.endsWith(".jpg")));
    assert.ok(files.every((entry) => entry.includes("-VIDEO-")));
    assert.ok(
      files.every((entry) => !/\.json$|\.txt$|\.csv$|\.pdf$/i.test(entry)),
    );
    assert.ok(files.every((entry) => !/retroativ|evidenc/i.test(entry)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("origem inválida falha explicitamente sem criar arquivo", async () => {
  const root = await mkdtemp(join(tmpdir(), "adops-evidence-invalid-test-"));
  const outputPath = join(root, "invalid.jpg");
  try {
    await assert.rejects(
      prepareEvidenceImage({
        source: Buffer.from("not-a-png"),
        outputPath,
        variant: "web",
      }),
      (error: unknown) =>
        error instanceof EvidenceExportInputError && error.statusCode === 422,
    );
    await assert.rejects(readFile(outputPath));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("contrato da API e Telegram mantém um PDF por posição", async () => {
  const [routeSource, runnerSource, agentSource] = await Promise.all([
    readFile(join(repositoryRoot, "artifacts/api-server/src/routes/insertions.ts"), "utf8"),
    readFile(join(repositoryRoot, "ops/cloudflare-remote-runner/src/runner.mjs"), "utf8"),
    readFile(join(repositoryRoot, "AGENTS.md"), "utf8"),
  ]);
  assert(routeSource.includes("groupByDeliveryPosition(pdfPages"));
  assert(routeSource.includes('x-adops-export-pdfs'));
  assert(runnerSource.includes('mode: "pdf", position'));
  assert(runnerSource.includes("pdfArtifacts.length > 9"));
  assert(runnerSource.includes("artifacts: {"));
  assert(runnerSource.includes("pdfs: pdfArtifactResults"));
  assert(agentSource.includes("Nunca juntar TOPO, HOME 1, HOME 2, LATERAL ou VIDEO no mesmo PDF"));
});
