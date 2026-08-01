import assert from "node:assert/strict";
import test from "node:test";
import { buildOpsApiCatalog, buildOpsOpenApiDocument } from "../../artifacts/api-server/src/routes/ops";

test("operational OpenAPI exposes campaign-operations-v2 on a valid path", () => {
  const catalog = buildOpsApiCatalog();
  const document = buildOpsOpenApiDocument() as any;
  assert.equal(catalog.version, "adops-ops-api-catalog-v3");
  assert.equal(document.openapi, "3.1.0");
  assert.equal(document.components.schemas.CampaignOperationsV2.properties.version.const, "campaign-operations-v2");
  assert(Object.keys(document.paths).every((path) => !path.includes("?")));
  const operation = document.paths["/api/campaign-operations/active"]?.get;
  assert(operation);
  const queryNames = operation.parameters.filter((item: any) => item.in === "query").map((item: any) => item.name);
  assert(queryNames.includes("date"));
  assert(queryNames.includes("siteSigla"));
  assert.equal(operation.responses["200"].content["application/json"].schema.$ref, "#/components/schemas/CampaignOperationsV2");
});
