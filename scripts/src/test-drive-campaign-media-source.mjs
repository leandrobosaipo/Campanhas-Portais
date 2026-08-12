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
