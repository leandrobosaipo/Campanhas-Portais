#!/usr/bin/env node
import assert from "node:assert/strict";
import { findProvisionalIdentityMatches, provisionalIdentity } from "../../artifacts/api-server/src/lib/campaign-bundle-identity.ts";

const base = {
  source: "whatsapp-pmt",
  siteId: 33,
  periodoInicio: "2026-10-09",
  periodoFim: "2026-10-23",
  localFormatoNormalizado: "INTERN0 DE NOTICIAS 728x90",
  mediaUrl: "https://assets.example/sha256-piece.gif",
};
const exact = provisionalIdentity(base);
assert.ok(exact, "complete operational identity produces a dedupe key");
const sameTitleClientNullDifferentPeriod = provisionalIdentity({
  ...base,
  nome: "PREF PVA - OUTUBRO",
  clienteId: null,
  periodoInicio: "2026-10-13",
  periodoFim: "2026-10-28",
});
assert.notEqual(sameTitleClientNullDifferentPeriod, exact,
  "same title/client-null does not collide when period differs");
assert.equal(provisionalIdentity({ ...base, source: "whatsapp-pmt" }), exact);
assert.equal(provisionalIdentity({ ...base, mediaUrl: undefined }), null, "piece is required for safe provisional identity");
assert.deepEqual(findProvisionalIdentityMatches([], "whatsapp-pmt"), { kind: "none", campaignIds: [] });
assert.deepEqual(findProvisionalIdentityMatches([{ id: 41, origem: "whatsapp-pmt" }], "whatsapp-pmt"), { kind: "exists", campaignIds: [41] });
assert.deepEqual(findProvisionalIdentityMatches([{ id: 41, origem: "monitor" }], "whatsapp-pmt"), { kind: "source_review", campaignIds: [41] });
assert.deepEqual(findProvisionalIdentityMatches([{ id: 41, origem: "whatsapp-pmt" }, { id: 41, origem: "whatsapp-pmt" }, { id: 52, origem: "monitor" }], "whatsapp-pmt"), { kind: "ambiguous", campaignIds: [41, 52] });

console.log("ok: provisional identity uses origin/site/period/position/piece and surfaces ambiguity");
