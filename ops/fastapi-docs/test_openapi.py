#!/usr/bin/env python3

from main import REDOC_ASSET_PATH, REDOC_ASSET_URL, build_openapi_document, redoc, redoc_asset


document = build_openapi_document()
assert document["openapi"] == "3.1.0"
assert document["info"]["version"] == "adops-ops-api-catalog-v4"
assert document["x-cod5-endpoint-count"] >= 100
assert "/api/healthz" in document["paths"]
assert "/api/pi-site-exports" in document["paths"]
assert "/api/ops/jobs/pi-site-export" in document["paths"]
assert "/api/docs" in document["paths"]
assert document["paths"]["/api/pi-site-exports/jobs"]["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PiSiteExportJobRequest"
assert document["paths"]["/api/pi-site-exports/jobs"]["post"]["responses"]["202"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PiSiteExportJobAccepted"
assert document["paths"]["/api/pi-site-exports/jobs/{jobId}"]["get"]["parameters"][0]["schema"]["format"] == "uuid"
assert "302" in document["paths"]["/api/pi-site-exports/jobs/{jobId}/download"]["get"]["responses"]
campaign_filters = document["paths"]["/api/campaigns"]["get"]["parameters"]
assert [(p["name"], p["in"], p["required"], p["schema"]["type"]) for p in campaign_filters] == [
    ("competencia", "query", False, ["string", "null"]),
    ("clienteId", "query", False, ["integer", "null"]),
    ("agenciaId", "query", False, ["integer", "null"]),
]
insertion_filters = document["paths"]["/api/insertions"]["get"]["parameters"]
assert [(p["name"], p["in"], p["required"], p["schema"]["type"]) for p in insertion_filters] == [
    ("competencia", "query", False, ["string", "null"]),
    ("siteId", "query", False, ["integer", "null"]),
    ("clienteId", "query", False, ["integer", "null"]),
    ("agenciaId", "query", False, ["integer", "null"]),
    ("campanhaId", "query", False, ["integer", "null"]),
    ("status", "query", False, ["string", "null"]),
    ("atrasado", "query", False, ["boolean", "null"]),
]
assert document["components"]["schemas"]["PiSiteExportJobRequest"]["properties"]["mode"]["default"] == "full-pdf"
assert document["components"]["schemas"]["PiSiteExportJobRequest"]["properties"]["imageQuality"]["maximum"] == 90
assert document["paths"]["/api/insertions/{id}/capture-proof/jobs"]["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/CaptureProofJobRequest"
assert document["paths"]["/api/insertions/{id}/capture-proof/status"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/CaptureProofStatusResponse"
assert "RetroContentProof" in document["components"]["schemas"]
capture_job = document["components"]["schemas"]["CaptureProofJobRequest"]
assert "required" not in capture_job
assert capture_job["properties"]["captureAt"]["description"].find("America/Cuiaba") >= 0
assert capture_job["properties"]["reconstructionReason"]["enum"] == ["late_publication_recovery"]
assert document["paths"]["/api/insertions/{id}/capture-proof/jobs"]["post"]["responses"]["202"]
assert document["paths"]["/api/insertions/capture-proof/audit"]["get"]["responses"]["200"]
assert document["components"]["schemas"]["HistoricalEvidenceInventoryResponse"]["properties"]["items"]["type"] == "array"
capture_job_post = document["paths"]["/api/insertions/{id}/capture-proof/jobs"]["post"]
assert {"200", "202", "409"}.issubset(capture_job_post["responses"])
assert any(parameter["in"] == "path" and parameter["name"] == "id" and parameter["required"] for parameter in capture_job_post["parameters"])
assert any(parameter["in"] == "header" and parameter["name"] == "Idempotency-Key" for parameter in capture_job_post["parameters"])
assert document["paths"]["/api/internal/insertions/{id}/capture-proof/candidates"]["post"]["responses"]["201"]
assert document["paths"]["/api/internal/insertions/{id}/capture-proof/candidates"]["post"]["responses"]["200"]
assert document["paths"]["/api/internal/capture-proof-candidates/{candidateId}/audit"]["post"]["responses"]["409"]
assert document["paths"]["/api/internal/capture-proof-candidates/{candidateId}/promote"]["post"]["responses"]["200"]
assert document["paths"]["/api/internal/capture-proof-candidates/{candidateId}/promote"]["post"]["parameters"][0]["schema"]["format"] == "uuid"
monthly_day = document["components"]["schemas"]["MonthlyEvidenceDay"]
assert monthly_day["properties"]["requestedCaptureAt"]["type"] == ["string", "null"]
assert monthly_day["properties"]["capturedAt"]["type"] == ["string", "null"]
inventory_operation = document["paths"]["/api/insertions/capture-proof/audit"]["get"]
assert "Sem scope" in inventory_operation["description"]
inventory_one_of = inventory_operation["responses"]["200"]["content"]["application/json"]["schema"]["oneOf"]
assert {schema["$ref"] for schema in inventory_one_of} == {
    "#/components/schemas/LegacyCaptureProofAuditResponse",
    "#/components/schemas/HistoricalEvidenceInventoryResponse",
}
assert document["components"]["schemas"]["HistoricalEvidenceInventoryResponse"]["properties"]["items"]["items"]["properties"]["url"]["type"] == ["string", "null"]
assert document["components"]["schemas"]["LegacyCaptureProofAuditResponse"]["required"] == ["date", "totalEligible", "items"]
assert document["paths"]["/api/ops/schedules/reconcile"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/ScheduleReconcileResponse"
assert document["paths"]["/api/ops/queue/overview"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/QueueOverviewResponse"
assert document["paths"]["/api/ops/daily-print-status"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/DailyPrintStatusResponse"
assert document["paths"]["/api/ops/runner/heartbeat"]["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/RunnerHeartbeatRequest"
assert document["paths"]["/api/ops/runner/jobs/{id}/progress"]["post"]["parameters"][0]["schema"]["format"] == "uuid"
ops_job_properties = document["components"]["schemas"]["OpsJob"]["properties"]
for required_property in ["heartbeatAt", "runnerId", "incidentLayer", "errorCode", "failedInsertionIds", "nextRecoveryAt", "queueWaitMs", "captureMs", "auditMs", "uploadMs", "reportMs"]:
    assert required_property in ops_job_properties
schemas = document["components"]["schemas"]
assert "PublicationHealth" in schemas
assert "EvidenceHealth" in schemas
assert "RetroactiveBackfillItem" in schemas
assert schemas["RetroactiveBackfillItem"]["properties"]["status"]["enum"] == [
    "audited", "failed", "skipped_existing", "blocked_reconstruction", "blocked_upstream"
]
assert document["paths"]["/api/ops/jobs/print-backfill"]["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PrintBackfillRequest"
assert document["paths"]["/api/ops/jobs/print-backfill"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PrintBackfillJobAccepted"
assert list(schemas["PrintBackfillJobAccepted"]["properties"]) == ["ok", "kind", "jobId", "status", "duplicate", "existingNotBefore"]
assert schemas["PrintBackfillJobAccepted"]["properties"]["existingNotBefore"] == {"type": ["string", "null"], "format": "date-time"}
assert len(document["x-cod5-route-fingerprint-sha256"]) == 64

redoc_html = redoc().body.decode("utf-8")
assert REDOC_ASSET_URL in redoc_html
assert "cdn.jsdelivr.net" not in redoc_html
assert REDOC_ASSET_PATH.is_file()
redoc_asset_response = redoc_asset()
assert redoc_asset_response.status_code == 200
assert redoc_asset_response.media_type == "application/javascript"
assert len(redoc_asset_response.body) > 1_000_000

print(
    {
        "ok": True,
        "version": document["info"]["version"],
        "endpointCount": document["x-cod5-endpoint-count"],
        "pathCount": len(document["paths"]),
    }
)
