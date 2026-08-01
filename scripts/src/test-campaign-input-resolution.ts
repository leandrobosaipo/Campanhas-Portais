import assert from "node:assert/strict";
import test from "node:test";
import { resolveSiteFormat } from "../../artifacts/api-server/src/lib/adrotate-sites";
import {
  extractDrivePiCandidates,
  findDriveCampaignMedia,
  type DriveRawItem,
} from "../../artifacts/api-server/src/lib/drive-campaign-media";

function folder(id: string, path: string): DriveRawItem {
  return {
    id,
    name: path.split("/").at(-1) ?? path,
    mimeType: "application/vnd.google-apps.folder",
    path,
  };
}

function image(id: string, path: string): DriveRawItem {
  return {
    id,
    name: path.split("/").at(-1) ?? path,
    mimeType: "image/gif",
    path,
    size: "1024",
    md5Checksum: `md5-${id}`,
  };
}

test("portal-specific input aliases resolve without changing published capture aliases", () => {
  const resolution = resolveSiteFormat("PERRENGUE", "TOPO");
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.groupId, 1);
  assert.equal(resolution.canonicalFormat, "MEGABANNER TOPO");
  assert.equal(resolution.safeToApply, true);
  assert(resolution.candidates[0]?.aliases.includes("TOPO"));
});

test("lexical variants, dimensions and context are resolved independently", () => {
  assert.equal(resolveSiteFormat("OMT", "mega banner topo").groupId, 1);
  const dimension = resolveSiteFormat("PERRENGUE", "arte final 970 x 90");
  assert.equal(dimension.status, "resolved");
  assert.equal(dimension.method, "dimension");
  assert.equal(dimension.groupId, 9);
  const context = resolveSiteFormat("PERRENGUE", "posição comercial", { slotSelector: ".g.g-6" });
  assert.equal(context.status, "resolved");
  assert.equal(context.method, "context");
  assert.equal(context.groupId, 6);
});

test("unknown positions stay unresolved instead of choosing the first portal rule", () => {
  const resolution = resolveSiteFormat("PERRENGUE", "FORMATO NOVO SEM REGRA");
  assert.equal(resolution.status, "unresolved");
  assert.equal(resolution.groupId, null);
  assert.equal(resolution.safeToApply, false);
});

test("Drive accepts explicit and bare PI folder names", async () => {
  assert.deepEqual(extractDrivePiCandidates("PI-0017046 CLIENTE"), ["17046"]);
  assert.deepEqual(extractDrivePiCandidates("0017046"), ["17046"]);
  const items = [
    folder("portal", "/PERRENGUE"),
    folder("campaign", "/PERRENGUE/AGOSTO/0017046"),
    image("creative", "/PERRENGUE/AGOSTO/0017046/banner.gif"),
  ];
  const match = await findDriveCampaignMedia({
    siteSigla: "PERRENGUE",
    piCodigo: "PI 17046",
    campaignName: "CLIENTE",
    inventoryItems: items,
  });
  assert.equal(match.status, "matched");
  assert.equal(match.matchMethod, "folder_pi");
  assert.equal(match.safeToApply, true);
  assert.equal(match.mediaFiles[0]?.size, "1024");
});

test("nested folders under one PI collapse into a single campaign candidate", async () => {
  const items = [
    folder("portal", "/PERRENGUE"),
    folder("campaign", "/PERRENGUE/AGOSTO/PI 17046 CLIENTE"),
    folder("desktop", "/PERRENGUE/AGOSTO/PI 17046 CLIENTE/DESKTOP"),
    folder("mobile", "/PERRENGUE/AGOSTO/PI 17046 CLIENTE/MOBILE"),
    image("desktop-creative", "/PERRENGUE/AGOSTO/PI 17046 CLIENTE/DESKTOP/banner.gif"),
    image("mobile-creative", "/PERRENGUE/AGOSTO/PI 17046 CLIENTE/MOBILE/banner.gif"),
  ];
  const match = await findDriveCampaignMedia({
    siteSigla: "PERRENGUE",
    piCodigo: "PI 17046",
    campaignName: "CLIENTE",
    inventoryItems: items,
  });
  assert.equal(match.status, "matched");
  assert.equal(match.folderPath, "/PERRENGUE/AGOSTO/PI 17046 CLIENTE");
  assert.equal(match.candidates.length, 1);
  assert.equal(match.mediaFiles.length, 2);
  assert.equal(match.safeToApply, true);
});

test("PI found only in a file safely selects its parent campaign folder", async () => {
  const items = [
    folder("portal", "/PERRENGUE"),
    folder("campaign", "/PERRENGUE/AGOSTO/CLIENTE"),
    image("creative", "/PERRENGUE/AGOSTO/CLIENTE/PI-17046-banner.gif"),
  ];
  const match = await findDriveCampaignMedia({
    siteSigla: "PERRENGUE",
    piCodigo: "17046",
    campaignName: "CLIENTE",
    inventoryItems: items,
  });
  assert.equal(match.status, "matched");
  assert.equal(match.matchMethod, "file_pi");
  assert.equal(match.folderPath, "/PERRENGUE/AGOSTO/CLIENTE");
});

test("ties and campaign-name-only matches remain blocked with visible candidates", async () => {
  const tie = await findDriveCampaignMedia({
    siteSigla: "PERRENGUE",
    piCodigo: "17046",
    campaignName: "CLIENTE",
    inventoryItems: [
      folder("one", "/PERRENGUE/AGOSTO/PI 17046 CLIENTE"),
      image("one-media", "/PERRENGUE/AGOSTO/PI 17046 CLIENTE/banner.gif"),
      folder("two", "/PERRENGUE/OUTRA/PI 17046 CLIENTE"),
      image("two-media", "/PERRENGUE/OUTRA/PI 17046 CLIENTE/banner.gif"),
    ],
  });
  assert.equal(tie.status, "ambiguous");
  assert.equal(tie.folderPath, null);
  assert.equal(tie.mediaFiles.length, 0);
  assert.equal(tie.candidates.length, 2);
  assert.equal(tie.safeToApply, false);

  const fuzzy = await findDriveCampaignMedia({
    siteSigla: "PERRENGUE",
    piCodigo: "99999",
    campaignName: "CAMPANHA ENERGIA",
    inventoryItems: [
      folder("fuzzy", "/PERRENGUE/AGOSTO/CAMPANHA ENERGIA"),
      image("fuzzy-media", "/PERRENGUE/AGOSTO/CAMPANHA ENERGIA/banner.gif"),
    ],
  });
  assert.equal(fuzzy.status, "ambiguous");
  assert.equal(fuzzy.matchMethod, "campaign_tokens");
  assert.equal(fuzzy.safeToApply, false);
});

test("conflicting PI names block an otherwise exact folder match", async () => {
  const match = await findDriveCampaignMedia({
    siteSigla: "PERRENGUE",
    piCodigo: "17046",
    campaignName: "CLIENTE",
    inventoryItems: [
      folder("campaign", "/PERRENGUE/PI 17046 CLIENTE"),
      image("creative", "/PERRENGUE/PI 17046 CLIENTE/PI 17047 banner.gif"),
    ],
  });
  assert.equal(match.status, "ambiguous");
  assert.equal(match.sourceIdentity.piConflict, true);
  assert.equal(match.safeToApply, false);
});
