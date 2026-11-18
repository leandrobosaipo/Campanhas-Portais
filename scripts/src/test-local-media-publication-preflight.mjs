import assert from "node:assert/strict";
import test from "node:test";

process.env.ADOPS_RUNNER_TEST_MODE = "1";
const { localImportAssetIdentity, assertLocalImportProfile } = await import("../../ops/cloudflare-remote-runner/src/runner.mjs");

const sha = "a".repeat(64);
const url = `https://cod5.nyc3.digitaloceanspaces.com/adops-media/local-imports/${sha}.gif`;

test("identifica somente a URL canônica de importação local", () => {
  assert.deepEqual(localImportAssetIdentity(url), { sha256: sha, extension: "gif" });
  assert.equal(localImportAssetIdentity(url + "?unsafe=1"), null);
  assert.equal(localImportAssetIdentity(url.replace("cod5.nyc3", "other.nyc3")), null);
});

test("perfil local exige grupo, formato, dimensão e conteúdo visual", () => {
  const identity = localImportAssetIdentity(url);
  const profile = { groupId: 11, formats: ["GIF"], width: 728, height: 90 };
  const metadata = { format: "GIF", width: 728, height: 90, nonUniform: true };
  assert.equal(assertLocalImportProfile(identity, metadata, profile, 11), true);
  assert.throws(() => assertLocalImportProfile(identity, metadata, profile, 14), /grupo/);
  assert.throws(() => assertLocalImportProfile(identity, { ...metadata, width: 300 }, profile, 11), /Largura/);
  assert.throws(() => assertLocalImportProfile(identity, { ...metadata, nonUniform: false }, profile, 11), /visual/);
});
