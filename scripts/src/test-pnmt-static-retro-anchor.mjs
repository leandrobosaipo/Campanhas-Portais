import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { applyPerrengueStaticRetroAd } = require("./capture-insertion-proof.cjs");
const browser = await chromium.launch({ headless: true });
const mapping = {
  domain: "portalnortemt.com",
  page: "home",
  slotSelector: "div.hidden.lg\\:block .g.g-1",
  contextSelector: "div.hidden.lg\\:block .g.g-1",
  auditConfig: { allowAuditedReconstruction: true },
};
const options = {
  allowConfiguredSlotReconstruction: true,
  reconstructionReason: "late_publication_recovery",
  reconstructionProvenanceVersion: 2,
};
const media = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='825' height='120'/>";
const anchor = "<div class='omt-header-top' style='height:128px;width:1216px'><div class='hidden lg:block flex-1 min-w-0' style='display:block;width:944px;height:0'><div class='flex justify-center'><div id='block-8'><!-- Erro, o Anúncio não está disponível neste momento devido às restrições de agendamento/geolocalização! --></div></div></div></div>";
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
try {
  await page.setContent("<main></main>");
  assert.equal((await applyPerrengueStaticRetroAd(page, mapping, media, "banner.svg", options)).reason, "pnmt_desktop_anchor_missing_or_ambiguous");

  await page.setContent(`${anchor}${anchor}`);
  assert.equal((await applyPerrengueStaticRetroAd(page, mapping, media, "banner.svg", options)).reason, "pnmt_desktop_anchor_missing_or_ambiguous");

  await page.setContent(anchor.replace("display:block", "display:none"));
  assert.equal((await applyPerrengueStaticRetroAd(page, mapping, media, "banner.svg", options)).reason, "pnmt_desktop_anchor_missing_or_ambiguous");

  await page.setContent(anchor);
  const applied = await applyPerrengueStaticRetroAd(page, mapping, media, "banner.svg", options);
  assert.equal(applied.applied, true);
  assert.equal(await page.locator("div.hidden.lg\\:block #block-8 > .g.g-1[data-adops-reconstructed-slot='1']").count(), 1);

  await page.setContent(anchor.replace("omt-header-top", "unrecognized-header"));
  assert.equal((await applyPerrengueStaticRetroAd(page, mapping, media, "banner.svg", options)).applied, false);
  await page.setContent(anchor.replace("Erro, o Anúncio", "Outro conteúdo"));
  assert.equal((await applyPerrengueStaticRetroAd(page, mapping, media, "banner.svg", options)).applied, false);

  await page.setContent(anchor);
  assert.equal(await applyPerrengueStaticRetroAd(page, mapping, media, "banner.svg", { ...options, reconstructionProvenanceVersion: 1 }), false);

  await page.setContent(`${anchor}<div class='hidden lg:block'><div class='g g-1'></div></div>`);
  assert.equal((await applyPerrengueStaticRetroAd(page, mapping, media, "banner.svg", options)).reason, "slot_conflict");
} finally {
  await page.close();
  await browser.close();
}

console.log("ok: PNMT static reconstruction requires one visible desktop block-8 anchor");
