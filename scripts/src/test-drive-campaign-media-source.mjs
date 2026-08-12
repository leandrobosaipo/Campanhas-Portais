import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const buildDir = await mkdtemp(path.join(tmpdir(), "drive-media-source-"));
const outputPath = path.join(buildDir, "source.mjs");
const build = spawnSync("pnpm", ["--filter", "@workspace/api-server", "exec", "esbuild", "src/lib/drive-inventory-source.ts", "--bundle", "--platform=node", "--format=esm", `--outfile=${outputPath}`], { cwd: repoRoot, encoding: "utf8" });
assert.equal(build.status, 0, build.stderr || build.stdout);
const source = await import(pathToFileURL(outputPath));
after(() => rm(buildDir, { recursive: true, force: true }));

test("somente snapshot fresco vence cache legado", () => {
  assert.equal(source.selectDriveInventorySource({ snapshotItems: 451, snapshotFresh: true, refreshDrive: false, directCredentials: false }), "snapshot");
  assert.equal(source.selectDriveInventorySource({ snapshotItems: 451, snapshotFresh: false, refreshDrive: true, directCredentials: true }), "live");
  assert.equal(source.selectDriveInventorySource({ snapshotItems: 451, snapshotFresh: false, refreshDrive: false, directCredentials: false }), "cache");
  assert.equal(source.selectDriveInventorySource({ snapshotItems: 0, snapshotFresh: false, refreshDrive: true, directCredentials: true }), "live");
});

test("reconstroi caminho dos filhos pelo folderId quando a PI nao e numerica", () => {
  const items = source.hydrateDriveInventoryPaths([
    { id: "portal", name: "PERRENGUE", mimeType: "application/vnd.google-apps.folder", path: "/PERRENGUE" },
    { id: "month", name: "AGOSTO", mimeType: "application/vnd.google-apps.folder", parentFolderId: "portal" },
    { id: "campaign", name: "PI - TCE - RADAR", mimeType: "application/vnd.google-apps.folder", parentFolderId: "month", path: "/PI - TCE - RADAR" },
    { id: "gif", name: "670x90 tce.gif", mimeType: "image/gif", parentFolderId: "campaign", path: "/670x90 tce.gif" },
    { id: "doc", name: "Documento sem titulo", mimeType: "application/vnd.google-apps.document", parentFolderId: "campaign" },
  ]);
  assert.equal(items.find((item) => item.id === "gif").path, "/PERRENGUE/AGOSTO/PI - TCE - RADAR/670x90 tce.gif");
  assert.equal(items.find((item) => item.id === "doc").path, "/PERRENGUE/AGOSTO/PI - TCE - RADAR/Documento sem titulo");
});

test("prioriza a pasta da competencia da campanha sem inferir uma PI", () => {
  assert.equal(source.scoreDrivePeriodPath("/PERRENGUE/AGOSTO/PI - TCE - RADAR", "2026-08-12"), 200);
  assert.equal(source.scoreDrivePeriodPath("/PERRENGUE/JULHO/PI - TCE - RADAR", "2026-08-12"), 0);
  assert.equal(source.scoreDrivePeriodPath("/PERRENGUE/AGOSTO/PI - TCE - RADAR", null), 0);
});
