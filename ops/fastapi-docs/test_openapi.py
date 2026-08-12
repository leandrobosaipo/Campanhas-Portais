#!/usr/bin/env python3

from main import REDOC_ASSET_PATH, REDOC_ASSET_URL, build_openapi_document, redoc, redoc_asset


document = build_openapi_document()
assert document["openapi"] == "3.1.0"
assert document["info"]["version"] == "adops-ops-api-catalog-v2"
assert document["x-cod5-endpoint-count"] >= 100
assert "/api/healthz" in document["paths"]
assert "/api/pi-site-exports" in document["paths"]
assert "/api/ops/jobs/pi-site-export" in document["paths"]
assert "/api/docs" in document["paths"]
assert document["paths"]["/api/pi-site-exports/jobs"]["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PiSiteExportJobRequest"
assert document["paths"]["/api/pi-site-exports/jobs"]["post"]["responses"]["202"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/PiSiteExportJobAccepted"
assert document["paths"]["/api/pi-site-exports/jobs/{jobId}"]["get"]["parameters"][0]["schema"]["format"] == "uuid"
assert "302" in document["paths"]["/api/pi-site-exports/jobs/{jobId}/download"]["get"]["responses"]
assert document["components"]["schemas"]["PiSiteExportJobRequest"]["properties"]["mode"]["default"] == "full-pdf"
assert document["components"]["schemas"]["PiSiteExportJobRequest"]["properties"]["imageQuality"]["maximum"] == 90
assert document["paths"]["/api/insertions/{id}/capture-proof/jobs"]["post"]["requestBody"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/CaptureProofJobRequest"
assert document["paths"]["/api/insertions/{id}/capture-proof/status"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == "#/components/schemas/CaptureProofStatusResponse"
assert "RetroContentProof" in document["components"]["schemas"]
assert document["components"]["schemas"]["CaptureProofJobRequest"]["required"] == ["date", "candidate", "promote"]
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
