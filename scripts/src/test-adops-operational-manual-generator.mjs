import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("gera portal não listado a partir dos seis Markdown canônicos", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "adops-manual-test-"));
  try {
    const result = spawnSync(process.execPath, ["./src/build-adops-operational-manual.mjs"], {
      cwd: new URL("../", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        ADOPS_MANUAL_OUTPUT_DIR: output,
        ADOPS_MANUAL_SKIP_PUBLISH: "1",
        ADOPS_MANUAL_GENERATED_AT: "2026-08-12T20:00:00.000Z",
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const [html, dataRaw, reportRaw] = await Promise.all([
      readFile(path.join(output, "index.html"), "utf8"),
      readFile(path.join(output, "data.json"), "utf8"),
      readFile(path.join(output, "report.json"), "utf8"),
    ]);
    const data = JSON.parse(dataRaw);
    const report = JSON.parse(reportRaw);
    assert.equal(data.documents.length, 6);
    assert.equal(report.visibility, "unlisted");
    assert.equal(report.publication.preset, "corporate-base");
    assert.match(html, /name="robots" content="noindex,nofollow"/);
    assert.match(html, /id="manual-search"/);
    for (const category of ["operacao", "campanhas", "evidencias", "api", "manutencao", "incidentes"]) {
      assert.match(html, new RegExp(`data-filter="${category}"`));
    }
    assert.match(html, /prefers-reduced-motion/);
    assert.match(html, /min-height:\s*44px/);
    assert.doesNotMatch(html, /Bearer\s+[A-Za-z0-9._-]{12,}/);
    for (const asset of ["logo.png", "favicon.png", "apple-touch-icon.png", "thumb.png"]) {
      assert.ok((await readFile(path.join(output, "assets", asset))).length > 100);
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
