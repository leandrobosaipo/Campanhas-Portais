#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planCampaignCommercialFill } from "../../artifacts/api-server/src/lib/campaign-commercial-fill.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const route = await readFile(path.join(root, "artifacts/api-server/src/routes/campaigns.ts"), "utf8");
const openapi = await readFile(path.join(root, "lib/api-spec/openapi.yaml"), "utf8");

const current = {
  piCodigo: null,
  clienteId: null,
  agenciaId: 76,
  competencia: "10/2026",
  valorLiquido: null,
  planilhaRef: "",
};
const fill = planCampaignCommercialFill(current, {
  piCodigo: "PI-91703",
  clienteId: 146,
  agenciaId: 76,
  competencia: "10/2026",
  valorLiquido: 7200,
  planilhaRef: "drive-file-123",
});
assert.deepEqual(fill.conflicts, []);
assert.deepEqual(fill.changedFields, ["piCodigo", "clienteId", "valorLiquido", "planilhaRef"]);
assert.equal(fill.proposed.agenciaId, 76, "same non-empty value is unchanged and not rewritten");

const divergent = planCampaignCommercialFill({ ...current, piCodigo: "PI-OLD", clienteId: 157 }, {
  piCodigo: "PI-91703",
  clienteId: 146,
});
assert.deepEqual(divergent.conflicts.map((item) => item.field), ["piCodigo", "clienteId"]);
assert.equal(divergent.proposed.piCodigo, "PI-OLD", "divergent non-empty value must be preserved");
assert.deepEqual(divergent.changedFields, []);

const emptyRequest = planCampaignCommercialFill(current, { piCodigo: "  ", clienteId: null });
assert.deepEqual(emptyRequest.conflicts.map((item) => item.code), ["empty_value_rejected", "empty_value_rejected"]);
assert.match(route, /mode !== "fill_missing_only"/);
assert.match(route, /dryRun/);
assert.match(route, /expectedUpdatedAt/);
assert.match(route, /FOR UPDATE/);
assert.match(route, /campaign-commercial-fill/);
assert.match(route, /commercial_fill_conflict/);
assert.match(openapi, /CampaignCommercialFillRequest:/);
assert.match(openapi, /CampaignCommercialFillResponse:/);
assert.match(openapi, /^  \/sync\/planilha\/preview:\n    get:/m);
assert.match(openapi, /name: scope\n          in: query\n          required: true[\s\S]*?const: commercial/);
assert.match(openapi, /name: asOf\n          in: query[\s\S]*?format: date/);
assert.match(openapi, /CommercialPlanilhaPreviewUnavailable:/);
assert.match(openapi, /"503":\n          description: Spreadsheet or inventory source unavailable/);
assert.match(openapi, /enum: \[preflight, apply, commercial_preflight, commercial_apply\]/);
assert.match(openapi, /ADOPS_COMMERCIAL_RECONCILE_APPLY_ENABLED=true; that flag is OFF by default/);

console.log("ok: commercial fill preserves non-empty fields, checks references/CAS, and preview/reconcile contracts are documented");
