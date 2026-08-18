import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const {
  buildStaticRetroSlotPlan,
  normalizeRetroEditorialPosts,
  shouldAllowConfiguredRetroSlotReconstruction,
  applyPerrengueStaticRetroAd,
} = require("./capture-insertion-proof.cjs");

const config = JSON.parse(await readFile(new URL("../../config/adrotate-sites.json", import.meta.url), "utf8"));
const omt = config.OMT.formatMappings.find((item) => item.groupId === 1);
const afl = config.AFL.formatMappings.find((item) => item.groupId === 2);
const aflTop = config.AFL.formatMappings.find((item) => item.groupId === 1);
const pnmt = config.PNMT.formatMappings.find((item) => item.groupId === 2);
const pnmtTop = config.PNMT.formatMappings.find((item) => item.groupId === 1);
const pnmtHome2 = config.PNMT.formatMappings.find((item) => item.groupId === 3);

assert.deepEqual(buildStaticRetroSlotPlan({ ...omt, domain: config.OMT.domain }), {
  contextSelector: ".header-top-banner",
  groupClass: "g g-1",
  groupId: 1,
});
assert.deepEqual(buildStaticRetroSlotPlan({ ...afl, domain: config.AFL.domain }), {
  contextSelector: "#block-9",
  groupClass: "g g-2",
  groupId: 2,
});
assert.deepEqual(buildStaticRetroSlotPlan({ ...pnmt, domain: config.PNMT.domain }), {
  contextSelector: "#block-9",
  groupClass: "g g-2",
  groupId: 2,
});
assert.equal(buildStaticRetroSlotPlan({ ...aflTop, domain: config.AFL.domain }), null, "AFL grupo 1 exige o slot real; não cria contêiner sintético");
assert.equal(buildStaticRetroSlotPlan({ ...pnmtTop, domain: config.PNMT.domain }), null, "PNMT grupo 1 exige o slot real; não cria contêiner sintético");
assert.equal(buildStaticRetroSlotPlan({ ...pnmtHome2, domain: config.PNMT.domain }), null, "PNMT grupo 3 não está autorizado para reconstrução de slot");
assert.equal(buildStaticRetroSlotPlan({ domain: "example.com", page: "home", slotSelector: ".g.g-2", contextSelector: "main" }), null);
assert.equal(buildStaticRetroSlotPlan({ domain: config.AFL.domain, page: "article", slotSelector: ".g.g-2", contextSelector: "#block-9" }), null);
assert.equal(buildStaticRetroSlotPlan({ domain: config.AFL.domain, page: "home", slotSelector: ".g.g-3", contextSelector: ".g.g-3" }), null);
assert.equal(buildStaticRetroSlotPlan({ domain: config.OMT.domain, page: "home", slotSelector: ".homepage-banner-single .g.g-2", contextSelector: ".homepage-banner-single" }), null);

assert.equal(shouldAllowConfiguredRetroSlotReconstruction({ captureDate: "2026-08-15", periodStart: "2026-08-01", periodEnd: "2026-08-15", currentDate: "2026-08-17", explicitCaptureAt: true }), true);
assert.equal(shouldAllowConfiguredRetroSlotReconstruction({ captureDate: "2026-08-15", periodStart: "2026-08-01", periodEnd: "2026-08-15", currentDate: "2026-08-17", explicitCaptureAt: false }), false);
assert.equal(shouldAllowConfiguredRetroSlotReconstruction({ captureDate: "2026-08-17", periodStart: "2026-08-01", periodEnd: "2026-08-31", currentDate: "2026-08-17", explicitCaptureAt: true }), false);
assert.equal(shouldAllowConfiguredRetroSlotReconstruction({ captureDate: "2026-08-16", periodStart: "2026-08-01", periodEnd: "2026-08-15", currentDate: "2026-08-17", explicitCaptureAt: true }), false);
assert.equal(shouldAllowConfiguredRetroSlotReconstruction({ captureDate: "2026-07-31", periodStart: "2026-08-01", periodEnd: "2026-08-15", currentDate: "2026-08-17", explicitCaptureAt: true }), false);
assert.equal(shouldAllowConfiguredRetroSlotReconstruction({
  captureDate: "2026-08-14",
  periodStart: "2026-08-14",
  periodEnd: "2026-08-19",
  currentDate: "2026-08-17",
  explicitCaptureAt: true,
  reconstructionReason: "late_publication_recovery",
}), true, "recuperação tardia explícita pode reconstruir data passada de campanha ainda vigente");
assert.equal(shouldAllowConfiguredRetroSlotReconstruction({
  captureDate: "2026-08-14",
  periodStart: "2026-08-14",
  periodEnd: "2026-08-19",
  currentDate: "2026-08-17",
  explicitCaptureAt: true,
}), false, "captureAt sozinho não autoriza reconstrução de campanha vigente");

const posts = normalizeRetroEditorialPosts([
  { id: 3, slug: "nova", title: "Nova", url: "https://omatogrossense.com/nova/", image: "https://cdn/nova.jpg", date: "2026-08-16T00:01:00", modified: "2026-08-16T00:02:00" },
  { id: 2, slug: "alvo-2", title: "Alvo 2", url: "https://omatogrossense.com/alvo-2/", image: "https://cdn/alvo-2.jpg", date: "2026-08-15T21:00:00", modified: "2026-08-15T21:01:00" },
  { id: 1, slug: "alvo-1", title: "Alvo 1", url: "https://omatogrossense.com/alvo-1/", image: "https://cdn/alvo-1.jpg", date: "2026-08-15T20:00:00", modified: "2026-08-15T20:01:00" },
  { id: 4, slug: "editado-depois", title: "Editado", url: "https://omatogrossense.com/editado/", image: "https://cdn/editado.jpg", date: "2026-08-15T19:00:00", modified: "2026-08-16T09:00:00" },
  { id: 5, slug: "sem-modified", title: "Sem modified", url: "https://omatogrossense.com/sem-modified/", image: "https://cdn/sem.jpg", date: "2026-08-15T18:00:00" },
], "2026-08-15T21:12");

assert.deepEqual(posts.map((item) => item.slug), ["alvo-2", "alvo-1"]);
assert.ok(posts.every((item) => item.date <= "2026-08-15T21:12:59"));

{
  const previous = process.env.ADOPS_CAPTURE_ALLOW_STATIC_RETRO_AD_INJECTION;
  process.env.ADOPS_CAPTURE_ALLOW_STATIC_RETRO_AD_INJECTION = "1";
  let evaluateCalls = 0;
  const result = await applyPerrengueStaticRetroAd({
    async evaluate() {
      evaluateCalls += 1;
      return { applied: true };
    },
  }, { domain: "omatogrossense.com", page: "home", slotSelector: ".g.g-1", contextSelector: ".header-top-banner" }, "https://cdn/banner.gif", "banner.gif", {
    allowConfiguredSlotReconstruction: false,
  });
  assert.equal(result, false);
  assert.equal(evaluateCalls, 0, "captura normal não pode injetar mídia nem em slot existente");
  const perrengueResult = await applyPerrengueStaticRetroAd({
    async evaluate() {
      evaluateCalls += 1;
      return { applied: true };
    },
  }, { domain: "perrenguematogrosso.com", page: "home", slotSelector: ".g.g-2", contextSelector: ".g.g-2" }, "https://cdn/banner.mp4", "banner.mp4", {
    allowConfiguredSlotReconstruction: false,
  });
  assert.equal(perrengueResult, false);
  assert.equal(evaluateCalls, 0, "captura diária do Perrengue também não pode injetar mídia sintética");
  if (previous == null) delete process.env.ADOPS_CAPTURE_ALLOW_STATIC_RETRO_AD_INJECTION;
  else process.env.ADOPS_CAPTURE_ALLOW_STATIC_RETRO_AD_INJECTION = previous;
}

{
  const previous = process.env.ADOPS_CAPTURE_ALLOW_STATIC_RETRO_AD_INJECTION;
  process.env.ADOPS_CAPTURE_ALLOW_STATIC_RETRO_AD_INJECTION = "1";
  let evaluateCalls = 0;
  await applyPerrengueStaticRetroAd({
    async evaluate() {
      evaluateCalls += 1;
      return { applied: true };
    },
  }, { ...aflTop, domain: config.AFL.domain }, "https://cdn/banner.gif", "banner.gif", {
    allowConfiguredSlotReconstruction: true,
    reconstructionReason: "late_publication_recovery",
  });
  assert.equal(evaluateCalls, 1, "recuperação explícita da AFL usa somente o slot real existente");
  if (previous == null) delete process.env.ADOPS_CAPTURE_ALLOW_STATIC_RETRO_AD_INJECTION;
  else process.env.ADOPS_CAPTURE_ALLOW_STATIC_RETRO_AD_INJECTION = previous;
}

console.log("ok: cross-portal retro reconstruction contract");
