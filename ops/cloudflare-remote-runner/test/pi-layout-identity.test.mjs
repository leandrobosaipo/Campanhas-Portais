import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.ADOPS_RUNNER_TEST_MODE = "1";
const { parseDrivePiPdfFields } = await import("../src/runner.mjs");

function bbox(days = [13, 14, 15]) {
  const word = (text, x, y) => `<word xMin="${x}" yMin="${y}" xMax="${x + 5}" yMax="${y + 5}">${text}</word>`;
  return [
    ...Array.from({ length: 30 }, (_, index) => word(String(index + 1), (index + 1) * 10, 10)),
    word("MEGA", 1, 40), word("BANNER", 10, 40), word("TOPO", 25, 40),
    ...days.map((day) => word("1", day * 10, 40)),
  ].join("\n");
}

function fixture(pi, vehicle) {
  const plain = [
    "PEDIDO DE", "INSERÇÃO", "PERÍODO", "MATERIAL", `0${pi}`, "PI", "PERÍODO Setembro/2026",
    "VEÍCULO", "SANEAR RONDONÓPOLIS", "MEGA BANNER TOPO - 825 X 120",
  ].join("\n");
  const layout = [
    "CLIENTE SANEAR RONDONÓPOLIS VEÍCULO " + vehicle + " PERÍODO Setembro/2026",
    "PEDIDO DE                                      PI", `INSERÇÃO     0${pi}`,
    "CLIENTE SANEAR RONDONÓPOLIS VEÍCULO " + vehicle + " PERÍODO Setembro/2026",
    "01/09 - 30/09",
  ].join("\n");
  return { plain, layout, bbox: bbox() };
}

async function parseFixture(t, item) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "adops-pdf-"));
  const pdf = path.join(dir, "source.pdf");
  const tool = path.join(dir, "pdftotext");
  await writeFile(pdf, "%PDF-fixture");
  const quote = (value) => `'${value.replaceAll("'", "'\\\"'\\\"'")}'`;
  await writeFile(tool, `#!/bin/sh\ncase "$1" in -layout) printf %s ${quote(item.layout)} ;; -bbox) printf %s ${quote(item.bbox)} ;; *) printf %s ${quote(item.plain)} ;; esac\n`);
  await chmod(tool, 0o755);
  const originalPath = process.env.PATH;
  const originalFetch = globalThis.fetch;
  process.env.PATH = `${dir}:${originalPath}`;
  globalThis.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    const payload = pathname.endsWith("/clients") ? [{ id: 229, nome: "SANEAR RONDONOPOLIS" }]
      : pathname.endsWith("/agencies") ? [{ id: 79, nome: "IMAGINE" }]
        : pathname.endsWith("/sites") ? [{ id: 32, sigla: "ROO", nome: "ROO Noticias" }, { id: 34, sigla: "AFL", nome: "A Folha Livre" }]
          : [];
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    return await parseDrivePiPdfFields({ filePath: pdf });
  } finally {
    process.env.PATH = originalPath;
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
}

for (const [name, pi, vehicle, siteId] of [
  ["PI 3218 ROO", "03218", "SIITE ROO NOTICIAS", 32],
  ["PI 3219 AFL", "03219", "SITE FOLHA LIIVRE ROOD", 34],
]) {
  test(`${name}: full parser accepts layout PI identity, vehicle and September period`, async (t) => {
    const parsed = await parseFixture(t, fixture(pi, vehicle));
    assert.equal(parsed.piCodigo, `PI ${Number(pi)}`);
    assert.deepEqual(parsed.explicitPiCandidates, [String(Number(pi))]);
    assert.equal(parsed.competencia?.toUpperCase(), "SETEMBRO/2026");
    assert.equal(parsed.insertions.length, 1);
    assert.equal(parsed.insertions[0].siteId, siteId);
    assert.equal(parsed.insertions[0].localFormatoNormalizado, "MEGABANNER TOPO");
    assert.equal(parsed.insertions[0].periodoInicio, "2026-09-13");
    assert.equal(parsed.insertions[0].periodoFim, "2026-09-15");
  });
}
