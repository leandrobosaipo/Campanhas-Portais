import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import test, { after } from "node:test";
import { createRequire } from "node:module";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const buildDir = await mkdtemp(path.join(tmpdir(), "drive-campaign-identity-"));
const outputPath = path.join(buildDir, "identity.cjs");
const build = spawnSync("pnpm", ["--filter", "@workspace/api-server", "exec", "esbuild", "src/lib/drive-campaign-media.ts", "--bundle", "--platform=node", "--format=cjs", `--outfile=${outputPath}`], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(build.status, 0, build.stderr || build.stdout);
process.env.DATABASE_URL ||= "postgresql://localhost/adops_drive_identity_test";
const source = createRequire(import.meta.url)(outputPath);
after(() => rm(buildDir, { recursive: true, force: true }));

test("reconhece PI quando o nome usa underscore depois dos dígitos", () => {
  assert.deepEqual(source.extractDrivePiCandidates("PI_17046_SITE_PERRENGUE.pdf"), ["17046"]);
  assert.deepEqual(source.extractDrivePiCandidates("PI:009750_ARTE.pdf"), ["9750"]);
});

test("não infere PI de números soltos ou nome de campanha", () => {
  assert.deepEqual(source.extractDrivePiCandidates("RADAR 17190 HOME 1.gif"), []);
  assert.deepEqual(source.extractDrivePiCandidates("campanha_2026.pdf"), []);
});
