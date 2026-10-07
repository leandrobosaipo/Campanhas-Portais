import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { applyPerrengueStaticRetroAd, evaluateAuditedRetroSlotReconstruction, buildStaticRetroSlotPlan } = require("./capture-insertion-proof.cjs");
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
const ppmtMapping = {
  groupId: 1,
  domain: "portalpantanalmt.com",
  page: "home",
  slotSelector: "div.hidden.lg\\:block .g.g-1",
  contextSelector: "div.hidden.lg\\:block .g.g-1",
  auditConfig: { allowAuditedReconstruction: true },
};
const perrMapping = {
  groupId: 9,
  domain: "perrenguematogrosso.com",
  page: "home",
  slotSelector: "#cod5-bottom-popup-ad .g.g-9",
  contextSelector: "#cod5-bottom-popup-ad",
  auditConfig: {},
};
const auditFixture = (mapping, { clockOnly = false } = {}) => ({
    insertionId: 1861,
    date: "2026-08-22",
    inPeriod: true,
  hasEvidenceForDate: true,
  hasValidUrl: true,
  isReachable: true,
  urlStatus: 200,
  arquivoUrl: "https://proof.example/old.png",
  status: clockOnly ? "invalid_audit" : "audited",
  checklistValidation: {
    approved: !clockOnly,
    preliminary: false,
    insertionId: 1861,
    date: "2026-08-22",
    blockingIssues: clockOnly ? [{ code: "metadata_desktop_time_mismatch" }] : [],
  },
  audit: {
    ok: !clockOnly,
    captureClass: "historical_recovery",
    targetDate: "2026-08-22",
    sourceJobId: "old-job-1",
    requestedCaptureAt: "2026-08-22T20:00:00-04:00",
    mediaProof: { ok: true, matchedMediaUrl: "https://media.example/ad.gif" },
    auditContext: {
      resolvedPage: "home",
      resolvedSlotSelector: mapping.slotSelector,
      resolvedContextSelector: mapping.contextSelector,
      resolvedGroupId: mapping === perrMapping ? 9 : 1,
    },
    finalPngSlotAudit: { ok: true },
    visualsOk: true,
    visualAudit: { identityFrameOk: true },
    slotVisibility: { fullyVisible: true, visibleRatio: 0.98 },
    pageMatches: true,
    retroContentProof: { status: "approved", futureCount: 0, manifestHash: "a".repeat(64) },
    issues: clockOnly ? [{ code: "desktop_time_mismatch" }] : [],
  },
});
const proofInputs = (mapping, status = auditFixture(mapping)) => ({
  insertion: { id: 1861, mediaUrl: "https://media.example/ad.gif", periodoInicio: "2026-08-01", periodoFim: "2026-08-31" },
  mapping,
  targetDate: "2026-08-22",
  captureAt: "2026-08-22T20:00:00-04:00",
  currentDate: "2026-10-07",
  candidateOnly: true,
  saveEvidence: false,
  captureClass: "historical_recovery",
  provenanceVersion: 4,
  status,
});
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

  const placeholder = "<div class='g g-1' style='width:815px;height:120px'><img src='https://placehold.co/815x120/png?text=ANUNCIE+AQUI' width='815' height='120'></div>";
  const placeholderAnchor = anchor.replace(/<!--.*?-->/, placeholder).replace('height:0', 'height:120px');
  const ppmtMapping = { ...mapping, groupId: 1, domain: 'portalpantanalmt.com' };
  await page.route('https://placehold.co/**', route => route.fulfill({ contentType: 'image/svg+xml', body: "<svg xmlns='http://www.w3.org/2000/svg' width='815' height='120'/>" }));
  await page.setContent(placeholderAnchor);
  assert.equal((await applyPerrengueStaticRetroAd(page, ppmtMapping, media, 'banner.svg', options)).applied, true);
  assert.equal(await page.locator('[data-adops-static-retro-ad="1"]').count(), 1);
  for (const html of [
    placeholderAnchor + placeholderAnchor,
    placeholderAnchor.replace(placeholder, placeholder + placeholder),
    placeholderAnchor.replace('display:block', 'display:none'),
    placeholderAnchor.replace('omt-header-top', 'unknown-header'),
    placeholderAnchor.replace(placeholder, '') + `<div class='hidden lg:block'>${placeholder}</div>`,
    placeholderAnchor.replace(placeholder, "<div class='g g-1' style='width:815px;height:120px'></div>"),
    placeholderAnchor.replace(placeholder, placeholder.replace('</div>', `<img src="${media}"></div>`)),
    placeholderAnchor.replace('<img ', `<img data-src="${media}" `),
    placeholderAnchor.replace('<img ', '<img srcset="https://example.com/other-campaign.png 2x" '),
    placeholderAnchor.replace('<img ', '<img data-lazy-srcset="https://example.com/other-campaign.png 2x" '),
    placeholderAnchor.replace('placehold.co/', 'placehold.co.example.com/'),
    placeholderAnchor.replace('https://placehold.co/815x120/png?text=ANUNCIE+AQUI', media),
  ]) {
    await page.setContent(html);
    assert.equal((await applyPerrengueStaticRetroAd(page, ppmtMapping, media, 'banner.svg', options)).applied, false);
    assert.equal(await page.locator('[data-adops-static-retro-ad="1"]').count(), 0);
  }

  for (const targetMapping of [perrMapping, ppmtMapping]) {
    const approved = evaluateAuditedRetroSlotReconstruction(proofInputs(targetMapping));
    assert.equal(approved.ok, true, targetMapping.domain + " approved fixture: " + (approved.reason || "unexpected rejection"));
    const clockOnly = evaluateAuditedRetroSlotReconstruction(proofInputs(targetMapping, auditFixture(targetMapping, { clockOnly: true })));
    assert.equal(clockOnly.ok, true, targetMapping.domain + " clock-only fixture: " + (clockOnly.reason || "unexpected rejection"));
  }
  for (const groupId of [1, 2, 11]) {
    const unrelatedPerrengueMapping = {
      ...perrMapping,
      groupId,
      slotSelector: ".g.g-" + groupId,
      contextSelector: ".g.g-" + groupId,
    };
    assert.equal(buildStaticRetroSlotPlan(unrelatedPerrengueMapping), null);
    assert.equal(evaluateAuditedRetroSlotReconstruction(proofInputs(unrelatedPerrengueMapping)).ok, false);
  }
  const validPer = proofInputs(perrMapping);
  const denied = [
    { ...validPer, candidateOnly: false },
    { ...validPer, saveEvidence: true },
    { ...validPer, captureClass: "scheduled" },
    { ...validPer, provenanceVersion: 3 },
    { ...validPer, currentDate: "2026-08-22" },
    { ...validPer, insertion: { ...validPer.insertion, periodoFim: "2026-10-31" } },
    { ...validPer, captureAt: "2026-09-01T20:00:00-04:00" },
    { ...validPer, status: { ...validPer.status, hasEvidenceForDate: false } },
    { ...validPer, status: null },
    { ...validPer, status: { ...validPer.status, hasValidUrl: false } },
    { ...validPer, status: { ...validPer.status, isReachable: false } },
    { ...validPer, status: { ...validPer.status, insertionId: 99 } },
    { ...validPer, status: { ...validPer.status, date: "2026-08-21" } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, sourceJobId: null } } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, requestedCaptureAt: "2026-08-22T21:00:00-04:00" } } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, auditContext: { ...validPer.status.audit.auditContext, resolvedGroupId: 8 } } } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, mediaProof: { ok: false, matchedMediaUrl: "https://media.example/ad.gif" } } } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, mediaProof: { ok: true, matchedMediaUrl: "https://media.example/other.gif" } } } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, finalPngSlotAudit: { ok: false } } } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, visualsOk: false } } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, visualAudit: { identityFrameOk: false } } } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, slotVisibility: { fullyVisible: true, visibleRatio: 0.94 } } } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, pageMatches: false } } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, retroContentProof: { status: "rejected", futureCount: 0 } } } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, retroContentProof: { status: "approved", futureCount: 0, manifestHash: "bad-hash" } } } },
    { ...validPer, status: { ...validPer.status, checklistValidation: { ...validPer.status.checklistValidation, preliminary: true } } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, issues: [{ detail: "unclassified" }] } } },
    { ...validPer, mapping: { ...ppmtMapping, auditConfig: {} } },
    { ...validPer, mapping: { ...perrMapping, slotSelector: ".g.g-8", contextSelector: ".g.g-8" } },
    { ...validPer, mapping: { ...perrMapping, groupId: 1, slotSelector: ".g.g-1", contextSelector: ".g.g-1" } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, issues: [{ code: "media_mismatch" }] }, checklistValidation: { ...validPer.status.checklistValidation, approved: false, blockingIssues: [{ code: "media_mismatch" }] } } },
    { ...validPer, status: { ...validPer.status, audit: { ...validPer.status.audit, issues: [{ code: "desktop_time_mismatch" }, { code: "page_date_mismatch" }] }, checklistValidation: { ...validPer.status.checklistValidation, approved: false, blockingIssues: [{ code: "metadata_desktop_time_mismatch" }] } } },
  ];
  for (const input of denied) assert.equal(evaluateAuditedRetroSlotReconstruction(input).ok, false);

  const auditedSlotOptions = {
    allowConfiguredSlotReconstruction: true,
    candidateOnly: true,
    reconstructionProvenanceVersion: 4,
    auditedCandidateReconstruction: { ok: true, profile: "ppmt-desktop-top-1" },
  };
  await page.setContent(anchor);
  const v4Applied = await applyPerrengueStaticRetroAd(page, ppmtMapping, media, "banner.svg", auditedSlotOptions);
  assert.equal(v4Applied.applied, true);
  assert.equal(await page.locator("div.hidden.lg\\:block #block-8 > .g.g-1[data-adops-reconstructed-slot='1']").count(), 1);

  const perrStrictOptions = { ...auditedSlotOptions, auditedCandidateReconstruction: { ok: true, profile: "perrengue-popup-9" } };
  await page.setContent("<main></main>");
  const popupApplied = await applyPerrengueStaticRetroAd(page, perrMapping, media, "banner.svg", perrStrictOptions);
  assert.equal(popupApplied.applied, true);
  assert.equal(await page.locator("#cod5-bottom-popup-ad > .cod5-bottom-popup-ad__inner > .g.g-9").count(), 1);
  assert.equal(await page.locator("#cod5-bottom-popup-ad > .cod5-bottom-popup-ad__inner > .g.g-9[data-adops-reconstructed-slot='9']").count(), 1);
  assert.equal(await page.locator("#cod5-bottom-popup-ad > .cod5-bottom-popup-ad__inner > .cod5-bottom-popup-ad__close[aria-label='Fechar publicidade']").count(), 1);
  assert.equal(await page.locator("#cod5-bottom-popup-ad").count(), 1);
  await page.setContent("<main><div id='cod5-bottom-popup-ad'></div></main>");
  assert.equal((await applyPerrengueStaticRetroAd(page, perrMapping, media, "banner.svg", perrStrictOptions)).applied, true);
  await page.setContent("<main><div id='cod5-bottom-popup-ad'><div class='g g-9'></div></div></main>");
  assert.equal((await applyPerrengueStaticRetroAd(page, perrMapping, media, "banner.svg", perrStrictOptions)).reason, "candidate_slot_must_be_missing");
  await page.setContent("<main><div id='cod5-bottom-popup-ad'></div><div id='cod5-bottom-popup-ad'></div></main>");
  assert.equal((await applyPerrengueStaticRetroAd(page, perrMapping, media, "banner.svg", perrStrictOptions)).reason, "slot_missing");
  await page.setContent("<main><div id='cod5-bottom-popup-ad'><div class='unrecognized'></div></div></main>");
  assert.equal((await applyPerrengueStaticRetroAd(page, perrMapping, media, "banner.svg", perrStrictOptions)).reason, "slot_missing");

  await page.setContent(anchor);
  assert.equal(await applyPerrengueStaticRetroAd(page, ppmtMapping, media, "banner.svg", { ...auditedSlotOptions, auditedCandidateReconstruction: { ok: false, profile: "ppmt-desktop-top-1" } }), false);
  await page.setContent(anchor.replace("display:block", "display:none"));
  assert.equal((await applyPerrengueStaticRetroAd(page, ppmtMapping, media, "banner.svg", auditedSlotOptions)).reason, "pnmt_desktop_anchor_missing_or_ambiguous");
  await page.setContent(anchor + anchor);
  assert.equal((await applyPerrengueStaticRetroAd(page, ppmtMapping, media, "banner.svg", auditedSlotOptions)).reason, "pnmt_desktop_anchor_missing_or_ambiguous");
  await page.setContent(anchor + "<div class='hidden lg:block'><div id='block-8' class='g g-1'></div></div>");
  assert.equal((await applyPerrengueStaticRetroAd(page, ppmtMapping, media, "banner.svg", auditedSlotOptions)).reason, "candidate_slot_must_be_missing");
} finally {
  await page.close();
  await browser.close();
}

console.log("ok: PNMT static reconstruction requires one visible desktop block-8 anchor");
