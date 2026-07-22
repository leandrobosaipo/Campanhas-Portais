import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findDriveCampaignMedia } from "../../artifacts/api-server/src/lib/drive-campaign-media";

async function withInventory(items: unknown[], run: () => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "adops-drive-source-test-"));
  const inventoryPath = join(directory, "drive-items.json");
  await writeFile(inventoryPath, JSON.stringify({ items }), "utf8");
  const previous = {
    mode: process.env.DRIVE_INTEGRATION_MODE,
    index: process.env.ADOPS_DRIVE_PI_INDEX_FILE,
  };
  process.env.DRIVE_INTEGRATION_MODE = "legacy";
  process.env.ADOPS_DRIVE_PI_INDEX_FILE = inventoryPath;
  try {
    await run();
  } finally {
    if (previous.mode == null) delete process.env.DRIVE_INTEGRATION_MODE;
    else process.env.DRIVE_INTEGRATION_MODE = previous.mode;
    if (previous.index == null) delete process.env.ADOPS_DRIVE_PI_INDEX_FILE;
    else process.env.ADOPS_DRIVE_PI_INDEX_FILE = previous.index;
    await rm(directory, { recursive: true, force: true });
  }
}

const folderMime = "application/vnd.google-apps.folder";

test("AFL reports folder PI 90708 versus PDF/request PI 90718 without mixing another campaign", async () => {
  await withInventory([
    { id: "afl-folder", name: "PI 90708 - VIRA SAUDE", mimeType: folderMime, path: "/AFL/JULHO/PI 90708 - VIRA SAUDE" },
    { id: "afl-gif", name: "728x90.gif", mimeType: "image/gif", path: "/AFL/JULHO/PI 90708 - VIRA SAUDE/728x90.gif" },
    { id: "afl-pdf", name: "PI 90718 - SITE A FOLHA LIVRE CUIABA.pdf", mimeType: "application/pdf", path: "/AFL/JULHO/PI 90708 - VIRA SAUDE/PI 90718 - SITE A FOLHA LIVRE CUIABA.pdf" },
    { id: "other-folder", name: "PI 99999 - VIRA SAUDE", mimeType: folderMime, path: "/AFL/JULHO/PI 99999 - VIRA SAUDE" },
    { id: "other-gif", name: "outra-campanha.gif", mimeType: "image/gif", path: "/AFL/JULHO/PI 99999 - VIRA SAUDE/outra-campanha.gif" },
  ], async () => {
    const result = await findDriveCampaignMedia({ siteSigla: "AFL", piCodigo: "PI 90718", campaignName: "VIRA SAUDE" });
    assert.equal(result.folderPath, "/AFL/JULHO/PI 90708 - VIRA SAUDE");
    assert.deepEqual(result.mediaFiles.map((file) => file.name), ["728x90.gif"]);
    assert.deepEqual(result.sourceIdentity.folderPiCandidates, ["90708"]);
    assert.deepEqual(result.sourceIdentity.pdfPiCandidates, ["90718"]);
    assert.equal(result.sourceIdentity.requestedPi, "90718");
    assert.equal(result.sourceIdentity.piConflict, true);
  });
});

test("PNMT keeps both creative versions visible as an ambiguity inside the exact PI folder", async () => {
  await withInventory([
    { id: "pnmt-folder", name: "PI 14670 - DENGUE", mimeType: folderMime, path: "/PNMT/JULHO/PI 14670 - DENGUE" },
    { id: "pnmt-a", name: "combate_a_dengue_2023_banner_site_sem_foto_825x120.gif", mimeType: "image/gif", path: "/PNMT/JULHO/PI 14670 - DENGUE/combate_a_dengue_2023_banner_site_sem_foto_825x120.gif" },
    { id: "pnmt-b", name: "combate_a_dengue_2023_banner_site_825x120.gif", mimeType: "image/gif", path: "/PNMT/JULHO/PI 14670 - DENGUE/combate_a_dengue_2023_banner_site_825x120.gif" },
  ], async () => {
    const result = await findDriveCampaignMedia({ siteSigla: "PNMT", piCodigo: "PI 14670", campaignName: "DENGUE" });
    assert.equal(result.folderPath, "/PNMT/JULHO/PI 14670 - DENGUE");
    assert.equal(result.mediaFiles.length, 2);
    assert.equal(result.sourceIdentity.exactPiFolder, true);
    assert.equal(result.sourceIdentity.piConflict, false);
  });
});
