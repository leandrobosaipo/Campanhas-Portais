import assert from "node:assert/strict";
import test from "node:test";
import { mediaNamesCompatible, normalizeMediaFileKey } from "../../artifacts/api-server/src/lib/media-consistency";

test("normalizes copy suffixes and dimensions without hiding creative qualifiers", () => {
  assert.equal(
    normalizeMediaFileKey("_combate_a_dengue_2023_banner_site_825x120 (1).gif"),
    "combate a dengue 2023 banner site",
  );
  assert.equal(
    mediaNamesCompatible(
      "https://cdn.example/combate_a_dengue_2023_banner_site_825x120.gif",
      "_combate_a_dengue_2023_banner_site_825x120 (1).gif",
    ),
    true,
  );
  assert.equal(
    mediaNamesCompatible(
      "combate_a_dengue_2023_banner_site_825x120.gif",
      "combate_a_dengue_2023_banner_site_sem_foto_825x120.gif",
    ),
    false,
  );
});
