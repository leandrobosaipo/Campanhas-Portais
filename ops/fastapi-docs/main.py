#!/usr/bin/env python3
"""FastAPI documentation surface for the existing AdOps Express API."""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse, Response


PROJECT_ROOT = Path(os.getenv("ADOPS_PROJECT_ROOT", str(Path.cwd()))).resolve()
ROUTES_ROOT = PROJECT_ROOT / "artifacts" / "api-server" / "src" / "routes"
PUBLIC_BASE_URL = os.getenv("ADOPS_PUBLIC_BASE_URL", "https://adops-api.codigo5.com.br").rstrip("/")
REDOC_VERSION = "2.5.3"
REDOC_ASSET_PATH = Path(__file__).parent / "static" / f"redoc.standalone.{REDOC_VERSION}.js"
REDOC_ASSET_URL = f"/api/docs-assets/redoc.standalone.{REDOC_VERSION}.js"

ROUTE_PATTERN = re.compile(
    r"""router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]""",
    re.IGNORECASE,
)
QUERY_PATTERN = re.compile(
    r"""req\.query(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*["']([^"']+)["']\s*\])"""
)
PATH_PARAMETER_PATTERN = re.compile(r":([A-Za-z_][A-Za-z0-9_]*)(?:\?)?")
CATALOG_VERSION_PATTERN = re.compile(
    r"""version:\s*["'](adops-ops-api-catalog-v[0-9]+)["']"""
)

METHOD_LABELS = {
    "get": "Consultar",
    "post": "Criar ou executar",
    "put": "Substituir",
    "patch": "Atualizar",
    "delete": "Remover",
}


def discover_catalog_version() -> str:
    ops_source = ROUTES_ROOT / "ops.ts"
    if ops_source.is_file():
        match = CATALOG_VERSION_PATTERN.search(ops_source.read_text(encoding="utf-8"))
        if match:
            return match.group(1)
    return "current"


def openapi_path(express_path: str) -> str:
    normalized = PATH_PARAMETER_PATTERN.sub(r"{\1}", express_path)
    return f"/api{normalized}"


def schema_for_path_parameter(name: str) -> dict[str, Any]:
    normalized = name.lower()
    if normalized == "jobid":
        return {"type": "string", "format": "uuid"}
    if normalized == "id" or normalized.endswith("id"):
        return {"type": "integer", "minimum": 1}
    return {"type": "string", "minLength": 1}


def discover_operations() -> tuple[dict[str, Any], list[str]]:
    paths: dict[str, Any] = {}
    source_files: list[str] = []

    for source_path in sorted(ROUTES_ROOT.glob("*.ts")):
        source = source_path.read_text(encoding="utf-8")
        matches = list(ROUTE_PATTERN.finditer(source))
        if not matches:
            continue
        source_files.append(source_path.name)
        tag = source_path.stem.replace("-", " ").title()

        for index, match in enumerate(matches):
            method = match.group(1).lower()
            express_path = match.group(2)
            if "${" in express_path:
                continue
            path = openapi_path(express_path)
            handler_end = matches[index + 1].start() if index + 1 < len(matches) else len(source)
            handler_source = source[match.end() : handler_end]
            query_names = sorted(
                {
                    first or second
                    for first, second in QUERY_PATTERN.findall(handler_source)
                    if first or second
                }
            )
            path_names = PATH_PARAMETER_PATTERN.findall(express_path)
            parameters = [
                {
                    "name": name,
                    "in": "path",
                    "required": True,
                    "schema": schema_for_path_parameter(name),
                }
                for name in path_names
            ]
            parameters.extend(
                {
                    "name": name,
                    "in": "query",
                    "required": False,
                    "schema": {"type": "string"},
                }
                for name in query_names
                if name not in path_names
            )

            operation: dict[str, Any] = {
                "tags": [tag],
                "summary": f"{METHOD_LABELS[method]} {express_path}",
                "operationId": (
                    f"{source_path.stem}_{method}_{express_path}"
                    .replace("/", "_")
                    .replace(":", "")
                    .replace("-", "_")
                    .replace("?", "")
                    .strip("_")
                ),
                "parameters": parameters,
                "responses": {
                    "200": {
                        "description": "Resposta bem-sucedida.",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "additionalProperties": True,
                                }
                            }
                        },
                    },
                    "400": {"description": "Entrada inválida."},
                    "401": {"description": "Token ausente ou inválido."},
                    "404": {"description": "Recurso não encontrado."},
                    "422": {"description": "Regra operacional recusou a operação."},
                    "500": {"description": "Falha interna."},
                },
                "x-cod5-source": f"artifacts/api-server/src/routes/{source_path.name}",
            }
            if method in {"post", "put", "patch"}:
                operation["requestBody"] = {
                    "required": False,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "additionalProperties": True,
                            }
                        }
                    },
                }
            if method not in {"get"}:
                operation["security"] = [{"bearerAuth": []}, {"internalApiToken": []}]

            paths.setdefault(path, {})[method] = operation

    return paths, source_files


def build_openapi_document() -> dict[str, Any]:
    paths, source_files = discover_operations()
    route_fingerprint = "\n".join(
        f"{method.upper()} {path}"
        for path in sorted(paths)
        for method in sorted(paths[path])
    )
    source_hash = hashlib.sha256(route_fingerprint.encode("utf-8")).hexdigest()
    operation_count = sum(len(operations) for operations in paths.values())

    def set_response_schema(path: str, method: str, schema_name: str) -> None:
        operation = paths.get(path, {}).get(method)
        if operation:
            operation["responses"]["200"]["content"]["application/json"]["schema"] = {
                "$ref": f"#/components/schemas/{schema_name}"
            }

    set_response_schema("/api/ops/schedules/reconcile", "post", "ScheduleReconcileResponse")
    set_response_schema("/api/ops/queue/overview", "get", "QueueOverviewResponse")
    set_response_schema("/api/ops/daily-print-status", "get", "DailyPrintStatusResponse")
    set_response_schema("/api/ops/runner/heartbeat", "post", "RunnerHeartbeatResponse")

    print_backfill_path = paths.get("/api/ops/jobs/print-backfill", {})
    if "post" in print_backfill_path:
        print_backfill_path["post"].update({
            "tags": ["Operações retroativas"],
            "summary": "Criar ou recuperar um backfill retroativo idempotente",
            "description": (
                "Único caminho de captura retroativa. O payload recebe o motivo "
                "late_publication_recovery, tentativa 1 de no máximo 3 e retorna "
                "200 para replay idempotente ou 202 para um novo job."
            ),
            "responses": {
                "200": {"description": "Job idempotente já existente.", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/PrintBackfillJobAccepted"}}}},
                "202": {"description": "Backfill aceito para processamento assíncrono.", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/PrintBackfillJobAccepted"}}}},
                "400": {"description": "Filtro ausente ou inválido."},
                "401": {"description": "Token ausente ou inválido."},
            },
        })
        print_backfill_path["post"]["requestBody"] = {
            "required": True,
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/PrintBackfillRequest"}}},
        }

    heartbeat_operation = paths.get("/api/ops/runner/heartbeat", {}).get("post")
    if heartbeat_operation:
        heartbeat_operation["requestBody"] = {
            "required": True,
            "content": {"application/json": {"schema": {"$ref": "#/components/schemas/RunnerHeartbeatRequest"}}},
        }

    for operation_path in (
        "/api/ops/runner/jobs/{id}/progress",
        "/api/ops/runner/jobs/{id}/complete",
        "/api/ops/runner/jobs/{id}/fail",
    ):
        operation = paths.get(operation_path, {}).get("post")
        if operation and operation.get("parameters"):
            operation["parameters"][0]["schema"] = {"type": "string", "format": "uuid"}

    capture_status_path = paths.get("/api/insertions/{id}/capture-proof/status", {})
    if "get" in capture_status_path:
        capture_status_path["get"]["responses"]["200"]["content"]["application/json"]["schema"] = {
            "$ref": "#/components/schemas/CaptureProofStatusResponse"
        }

    export_job_path = paths.get("/api/pi-site-exports/jobs", {})
    if "post" in export_job_path:
        export_job_path["post"].update({
            "tags": ["Entrega de evidências"],
            "summary": "Solicitar pacote auditado, comprimido e com PDF",
            "description": (
                "Endpoint canônico para entrega final. Cria um job idempotente, "
                "retorna 202 e deve ser acompanhado pelo endpoint de status. "
                "O padrão full-pdf/web preserva os PNGs auditados de origem e gera "
                "uma cópia cliente em JPEG progressivo, PDF e ZIP com checksums."
            ),
            "parameters": [{
                "name": "Idempotency-Key",
                "in": "header",
                "required": False,
                "description": "Chave estável de 8 a 160 caracteres. Se omitida, a API deriva uma chave do payload.",
                "schema": {"type": "string", "minLength": 8, "maxLength": 160, "pattern": "^[A-Za-z0-9._:-]+$"},
            }],
            "responses": {
                "200": {
                    "description": "Job idempotente já existente.",
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/PiSiteExportJobAccepted"}}},
                },
                "202": {
                    "description": "Job criado e aceito para processamento assíncrono.",
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/PiSiteExportJobAccepted"}}},
                },
                "400": {"description": "Payload ou Idempotency-Key inválidos."},
                "401": {"description": "Token ausente ou inválido."},
                "500": {"description": "Falha ao criar o job."},
            },
        })
        export_job_path["post"]["requestBody"] = {
            "required": True,
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/PiSiteExportJobRequest"},
                    "examples": {
                        "pacote_web_completo": {
                            "value": {
                                "piCodigo": "14609",
                                "siteSigla": "AFL",
                                "mode": "full-pdf",
                                "variant": "web",
                            }
                        }
                    },
                }
            },
        }

    export_status_path = paths.get("/api/pi-site-exports/jobs/{jobId}", {})
    if "get" in export_status_path:
        export_status_path["get"].update({
            "tags": ["Entrega de evidências"],
            "summary": "Consultar processamento do pacote de evidências",
            "responses": {
                "200": {
                    "description": "Estado atual, estágio, metadados e URL do artefato quando concluído.",
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/PiSiteExportJobStatus"}}},
                },
                "404": {"description": "Job não encontrado."},
                "500": {"description": "Falha ao consultar o job."},
            },
        })

    export_download_path = paths.get("/api/pi-site-exports/jobs/{jobId}/download", {})
    if "get" in export_download_path:
        export_download_path["get"].update({
            "tags": ["Entrega de evidências"],
            "summary": "Baixar o pacote concluído",
            "responses": {
                "302": {
                    "description": "Redireciona para a URL assinada ou pública do artefato.",
                    "headers": {"Location": {"schema": {"type": "string", "format": "uri"}}},
                },
                "404": {"description": "Job não encontrado."},
                "409": {
                    "description": "Artefato ainda não está pronto.",
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/PiSiteExportNotReady"}}},
                },
                "500": {"description": "Falha ao resolver o download."},
            },
        })

    export_sync_path = paths.get("/api/pi-site-exports", {})
    if "get" in export_sync_path:
        export_sync_path["get"].update({
            "tags": ["Entrega de evidências"],
            "summary": "Descrever ou materializar pacote PI/site (uso interno)",
            "description": "Para pacotes finais ou grandes, prefira POST /api/pi-site-exports/jobs.",
            "parameters": [
                {"name": "piCodigo", "in": "query", "required": True, "schema": {"type": "string", "minLength": 1}},
                {"name": "siteSigla", "in": "query", "required": True, "schema": {"type": "string", "minLength": 2}},
                {"name": "download", "in": "query", "required": False, "schema": {"type": "string", "enum": ["0", "1"], "default": "0"}},
                {"name": "mode", "in": "query", "required": False, "schema": {"type": "string", "enum": ["full", "prints-only", "pdf", "full-pdf"], "default": "full"}},
                {"name": "variant", "in": "query", "required": False, "schema": {"type": "string", "enum": ["original", "web"]}},
                {"name": "pdfMaxWidth", "in": "query", "required": False, "schema": {"type": "integer", "minimum": 800, "maximum": 2560, "default": 1920}},
                {"name": "pdfQuality", "in": "query", "required": False, "schema": {"type": "integer", "minimum": 45, "maximum": 85, "default": 68}},
                {"name": "pdfResolution", "in": "query", "required": False, "schema": {"type": "integer", "minimum": 72, "maximum": 180, "default": 120}},
                {"name": "imageMaxWidth", "in": "query", "required": False, "schema": {"type": "integer", "minimum": 800, "maximum": 2560, "default": 1600}},
                {"name": "imageQuality", "in": "query", "required": False, "schema": {"type": "integer", "minimum": 45, "maximum": 90, "default": 72}},
            ],
        })

    fulfillment_create_path = paths.get("/api/campaign-fulfillments/jobs", {})
    if "post" in fulfillment_create_path:
        fulfillment_create_path["post"].update({
            "tags": ["Entrega completa de campanha"],
            "summary": "Executar fulfillment completo por PI e portal",
            "description": (
                "Endpoint canônico do fluxo completo. Sincroniza a planilha, evita duplicidade, "
                "vincula a mídia exata do Drive, publica no AdRotate, gera/backfill de evidências, "
                "audita, entrega ZIP de imagens e PDFs separados por posição, envia ao Telegram e "
                "materializa provas da planilha e do pedido da agência."
            ),
            "parameters": [{
                "name": "Idempotency-Key",
                "in": "header",
                "required": False,
                "schema": {"type": "string", "minLength": 8, "maxLength": 160, "pattern": "^[A-Za-z0-9._:-]+$"},
            }],
            "requestBody": {
                "required": True,
                "content": {"application/json": {
                    "schema": {"$ref": "#/components/schemas/CampaignFulfillmentJobRequest"},
                    "examples": {"pi_portal": {"value": {"piCodigo": "90729", "siteSigla": "ROO", "sendTelegram": True}}},
                }},
            },
            "responses": {
                "200": {"description": "Job idempotente já existente.", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/CampaignFulfillmentJobAccepted"}}}},
                "202": {"description": "Job criado.", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/CampaignFulfillmentJobAccepted"}}}},
                "400": {"description": "PI, portal ou chave inválidos."},
                "401": {"description": "Token ausente ou inválido."},
            },
        })

    fulfillment_status_path = paths.get("/api/campaign-fulfillments/jobs/{jobId}", {})
    if "get" in fulfillment_status_path:
        fulfillment_status_path["get"].update({
            "tags": ["Entrega completa de campanha"],
            "summary": "Consultar fulfillment, checklist e artefatos",
            "responses": {
                "200": {"description": "Estado consolidado.", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/CampaignFulfillmentJobStatus"}}}},
                "404": {"description": "Job não encontrado."},
            },
        })

    for suffix, summary, media_type in [
        ("report", "Abrir dossiê responsivo", "text/html"),
        ("report.pdf", "Baixar dossiê em PDF", "application/pdf"),
    ]:
        report_path = paths.get(f"/api/campaign-fulfillments/jobs/{{jobId}}/{suffix}", {})
        if "get" in report_path:
            report_path["get"].update({
                "tags": ["Entrega completa de campanha"],
                "summary": summary,
                "responses": {"200": {"description": summary, "content": {media_type: {"schema": {"type": "string", "format": "binary"}}}}, "404": {"description": "Job não encontrado."}},
            })

    capture_job_path = paths.get("/api/insertions/{id}/capture-proof/jobs", {})
    if "post" in capture_job_path:
        capture_job_path["post"]["requestBody"] = {
            "required": True,
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/CaptureProofJobRequest"},
                    "examples": {
                        "retroativo_auditado": {
                            "value": {
                                "date": "2026-07-24",
                                "captureAt": "2026-07-24T20:00:00-04:00",
                                "candidate": True,
                                "promote": True,
                            }
                        }
                    },
                }
            },
        }

    paths["/api/docs"] = {
        "get": {
            "tags": ["Documentação"],
            "summary": "Abrir Swagger UI completo",
            "operationId": "fastapi_swagger_ui",
            "responses": {"200": {"description": "Interface Swagger UI."}},
        }
    }
    paths["/api/redoc"] = {
        "get": {
            "tags": ["Documentação"],
            "summary": "Abrir ReDoc completo",
            "operationId": "fastapi_redoc",
            "responses": {"200": {"description": "Interface ReDoc."}},
        }
    }
    paths["/api/openapi.json"] = {
        "get": {
            "tags": ["Documentação"],
            "summary": "Baixar contrato OpenAPI completo",
            "operationId": "fastapi_openapi_json",
            "responses": {"200": {"description": "Documento OpenAPI 3.1."}},
        }
    }

    return {
        "openapi": "3.1.0",
        "info": {
            "title": "AdOps API",
            "version": discover_catalog_version(),
            "description": (
                "Swagger completo gerado pelo FastAPI a partir das rotas Express "
                "publicadas. A execução continua no backend AdOps existente."
            ),
        },
        "servers": [{"url": PUBLIC_BASE_URL, "description": "Produção"}],
        "tags": [
            {"name": source.replace(".ts", "").replace("-", " ").title()}
            for source in source_files
        ]
        + [
            {"name": "Entrega de evidências", "description": "Pacotes por PI e portal, com compressão, PDF, checksum e processamento assíncrono."},
            {"name": "Entrega completa de campanha", "description": "Fluxo idempotente de ponta a ponta com dossiê e provas das fontes."},
            {"name": "Documentação"},
        ],
        "paths": paths,
        "components": {
            "securitySchemes": {
                "bearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "OPS_API_TOKEN",
                },
                "internalApiToken": {
                    "type": "apiKey",
                    "in": "header",
                    "name": "x-adops-api-token",
                },
            },
            "schemas": {
                "PublicationHealth": {
                    "type": "object",
                    "required": ["status", "reason", "requiredAction", "expectedGroupId", "expectedMediaObserved", "duplicateInsertionIds"],
                    "properties": {
                        "status": {"type": "string", "enum": ["ok", "prepublication_pending", "blocked_upstream"]},
                        "reason": {"type": "string", "enum": ["confirmed", "drive_media_not_linked", "media_missing", "adrotate_relation_missing", "expected_media_not_observed", "public_html_not_confirmed", "duplicate_identity"]},
                        "requiredAction": {"type": "string", "enum": ["none", "resolve_media", "reconcile_duplicate", "publish_adrotate", "verify_publication"]},
                        "expectedGroupId": {"type": ["integer", "null"], "minimum": 1},
                        "expectedMediaObserved": {"type": "boolean"},
                        "duplicateInsertionIds": {"type": "array", "items": {"type": "integer", "minimum": 1}},
                    },
                    "additionalProperties": False,
                },
                "EvidenceHealth": {
                    "type": "object",
                    "required": ["status", "auditedDates", "missingDates", "invalidDates"],
                    "properties": {
                        "status": {"type": "string", "enum": ["complete", "missing", "invalid", "blocked_upstream", "not_applicable"]},
                        "auditedDates": {"type": "array", "items": {"type": "string", "format": "date"}},
                        "missingDates": {"type": "array", "items": {"type": "string", "format": "date"}},
                        "invalidDates": {"type": "array", "items": {"type": "string", "format": "date"}},
                    },
                    "additionalProperties": False,
                },
                "RetroactiveBackfillItem": {
                    "type": "object",
                    "required": ["insertionId", "date", "status", "attempts", "evidenceUrl", "errorCode", "error", "checklistStatus"],
                    "properties": {
                        "insertionId": {"type": "integer", "minimum": 1},
                        "date": {"type": "string", "format": "date"},
                        "status": {"type": "string", "enum": ["audited", "failed", "skipped_existing", "blocked_reconstruction", "blocked_upstream"]},
                        "attempts": {"type": "integer", "minimum": 0, "maximum": 3},
                        "evidenceUrl": {"type": ["string", "null"], "format": "uri"},
                        "errorCode": {"type": ["string", "null"]},
                        "error": {"type": ["string", "null"]},
                        "checklistStatus": {"type": ["string", "null"]},
                    },
                    "additionalProperties": False,
                },
                "PrintBackfillRequest": {
                    "type": "object",
                    "properties": {
                        "insertionId": {"type": "integer", "minimum": 1},
                        "campaignId": {"type": "integer", "minimum": 1},
                        "siteId": {"type": "integer", "minimum": 1},
                        "competencia": {"type": "string", "minLength": 1},
                        "piCodigo": {"type": "string", "minLength": 1},
                        "siteSigla": {"type": "string", "minLength": 1},
                        "fromDate": {"type": "string", "format": "date"},
                        "toDate": {"type": "string", "format": "date"},
                        "replace": {"type": "boolean", "default": False},
                        "force": {"type": "boolean", "default": False},
                    },
                    "anyOf": [
                        {"required": ["insertionId"]}, {"required": ["campaignId"]}, {"required": ["siteId"]},
                        {"required": ["competencia"]}, {"required": ["piCodigo", "siteSigla"]},
                    ],
                    "additionalProperties": False,
                },
                "PrintBackfillJobAccepted": {
                    "type": "object",
                    "required": ["ok", "kind", "jobId", "status", "duplicate"],
                    "properties": {
                        "ok": {"type": "boolean", "const": True},
                        "kind": {"type": "string", "const": "print-backfill"},
                        "jobId": {"type": "string", "format": "uuid"},
                        "status": {"$ref": "#/components/schemas/OpsJobStatus"},
                        "duplicate": {"type": "boolean"},
                        "existingNotBefore": {"type": ["string", "null"], "format": "date-time"},
                    },
                    "additionalProperties": True,
                },
                "RetroContentProof": {
                    "type": "object",
                    "required": [
                        "status", "sourceMode", "previewActive", "expectedCount",
                        "visibleMatchCount", "minimumRequired", "futureCount",
                        "reconstructed", "manifestHash",
                    ],
                    "properties": {
                        "status": {"type": "string", "enum": ["approved", "rejected"]},
                        "sourceMode": {"type": "string", "enum": ["signed_preview", "audited_reconstruction"]},
                        "previewActive": {"type": "boolean"},
                        "expectedCount": {"type": "integer", "minimum": 0},
                        "visibleMatchCount": {"type": "integer", "minimum": 0},
                        "minimumRequired": {"type": "integer", "minimum": 1, "maximum": 25},
                        "maxObserved": {"type": ["string", "null"], "format": "date-time"},
                        "futureCount": {"type": "integer", "minimum": 0},
                        "reconstructed": {"type": "boolean"},
                        "manifestHash": {"type": ["string", "null"], "pattern": "^[a-f0-9]{64}$"},
                        "issues": {"type": "array", "items": {"type": "object", "additionalProperties": True}},
                    },
                },
                "CaptureProofStatusResponse": {
                    "type": "object",
                    "required": ["insertionId", "date", "status", "audit"],
                    "properties": {
                        "insertionId": {"type": "integer", "minimum": 1},
                        "date": {"type": "string", "format": "date"},
                        "status": {"type": "string", "enum": ["audited", "audited_best_effort", "invalid_audit", "invalid_url", "missing"]},
                        "audit": {
                            "type": ["object", "null"],
                            "properties": {
                                "retroContentProof": {"$ref": "#/components/schemas/RetroContentProof"}
                            },
                            "additionalProperties": True,
                        },
                    },
                    "additionalProperties": True,
                },
                "PiSiteExportJobRequest": {
                    "type": "object",
                    "required": ["piCodigo", "siteSigla"],
                    "properties": {
                        "piCodigo": {"type": "string", "minLength": 1},
                        "siteSigla": {"type": "string", "minLength": 2},
                        "mode": {"type": "string", "enum": ["full", "prints-only", "pdf", "full-pdf"], "default": "full-pdf"},
                        "variant": {"type": "string", "enum": ["original", "web"], "default": "web"},
                        "pdfMaxWidth": {"type": "integer", "minimum": 800, "maximum": 2560, "default": 1920},
                        "pdfQuality": {"type": "integer", "minimum": 45, "maximum": 85, "default": 68},
                        "pdfResolution": {"type": "integer", "minimum": 72, "maximum": 180, "default": 120},
                        "imageMaxWidth": {"type": "integer", "minimum": 800, "maximum": 2560, "default": 1600},
                        "imageQuality": {"type": "integer", "minimum": 45, "maximum": 90, "default": 72},
                        "source": {"type": "string", "maxLength": 120, "default": "api-server"},
                        "requestedBy": {"type": "string", "maxLength": 160, "default": "api-server"},
                    },
                    "additionalProperties": False,
                },
                "PiSiteExportJobAccepted": {
                    "type": "object",
                    "required": ["ok", "jobId", "kind", "status", "duplicate", "piCodigo", "siteSigla", "mode", "variant"],
                    "properties": {
                        "ok": {"type": "boolean", "const": True},
                        "jobId": {"type": "string", "format": "uuid"},
                        "kind": {"type": "string", "const": "pi-site-export"},
                        "status": {"$ref": "#/components/schemas/OpsJobStatus"},
                        "duplicate": {"type": "boolean"},
                        "piCodigo": {"type": "string"},
                        "siteSigla": {"type": "string"},
                        "mode": {"type": "string", "enum": ["full", "prints-only", "pdf", "full-pdf"]},
                        "variant": {"type": "string", "enum": ["original", "web"]},
                    },
                    "additionalProperties": True,
                },
                "OpsJobStatus": {
                    "type": "string",
                    "enum": ["queued", "ready_for_runner", "running", "completed", "failed"],
                },
                "OpsJob": {
                    "type": "object",
                    "required": ["jobId", "kind", "status"],
                    "properties": {
                        "id": {"type": "string", "format": "uuid"},
                        "jobId": {"type": "string", "format": "uuid"},
                        "kind": {"type": "string"},
                        "status": {"$ref": "#/components/schemas/OpsJobStatus"},
                        "runnerId": {"type": ["string", "null"]},
                        "claimedAt": {"type": ["string", "null"], "format": "date-time"},
                        "heartbeatAt": {"type": ["string", "null"], "format": "date-time"},
                        "createdAt": {"type": ["string", "null"], "format": "date-time"},
                        "updatedAt": {"type": ["string", "null"], "format": "date-time"},
                        "completedAt": {"type": ["string", "null"], "format": "date-time"},
                        "failedAt": {"type": ["string", "null"], "format": "date-time"},
                        "attempt": {"type": ["integer", "null"], "minimum": 1},
                        "maxAttempts": {"type": ["integer", "null"], "minimum": 1},
                        "incidentLayer": {"type": ["string", "null"]},
                        "errorCode": {"type": ["string", "null"]},
                        "error": {"type": ["string", "null"]},
                        "failedInsertionIds": {"type": ["array", "null"], "items": {"type": "integer", "minimum": 1}},
                        "nextRecoveryAt": {"type": ["string", "null"], "format": "date-time"},
                        "durationMs": {"type": ["number", "null"], "minimum": 0},
                        "queueWaitMs": {"type": ["number", "null"], "minimum": 0},
                        "captureMs": {"type": ["number", "null"], "minimum": 0},
                        "auditMs": {"type": ["number", "null"], "minimum": 0},
                        "uploadMs": {"type": ["number", "null"], "minimum": 0},
                        "reportMs": {"type": ["number", "null"], "minimum": 0},
                        "payload": {"type": ["object", "null"], "additionalProperties": True},
                        "result": {"type": ["object", "null"], "additionalProperties": True},
                    },
                    "additionalProperties": True,
                },
                "CanonicalScheduleDecision": {
                    "type": "object",
                    "required": ["routineKind", "targetDate", "timezone", "scheduledFor", "dispatchWindow", "due"],
                    "properties": {
                        "routineKind": {"type": "string"},
                        "jobKind": {"type": ["string", "null"]},
                        "targetDate": {"type": "string", "format": "date"},
                        "timezone": {"type": "string", "const": "America/Cuiaba"},
                        "scheduledFor": {"type": "string", "format": "date-time"},
                        "dispatchWindow": {"type": "string", "pattern": "^[0-2][0-9]:[0-5][0-9]$"},
                        "due": {"type": "boolean"},
                        "scheduleId": {"type": ["string", "null"]},
                        "idempotencyKey": {"type": ["string", "null"]},
                        "outcome": {"type": ["string", "null"], "enum": ["created", "duplicate", "not_due", "blocked", "failed", None]},
                        "jobId": {"type": ["string", "null"], "format": "uuid"},
                        "nextRecoveryAt": {"type": ["string", "null"], "format": "date-time"},
                    },
                    "additionalProperties": True,
                },
                "ScheduleReconcileResponse": {
                    "type": "object",
                    "required": ["ok", "dryRun", "auditGateEvaluated", "timezone", "decisions"],
                    "properties": {
                        "ok": {"type": "boolean"},
                        "dryRun": {"type": "boolean"},
                        "auditGateEvaluated": {"type": "boolean"},
                        "timezone": {"type": "string", "const": "America/Cuiaba"},
                        "decisions": {"type": "array", "items": {"$ref": "#/components/schemas/CanonicalScheduleDecision"}},
                    },
                    "additionalProperties": False,
                },
                "QueueOverviewResponse": {
                    "type": "object",
                    "required": ["now", "queue", "totals", "runners", "scheduler"],
                    "properties": {
                        "now": {"anyOf": [{"$ref": "#/components/schemas/OpsJob"}, {"type": "null"}]},
                        "queue": {"type": "array", "items": {"$ref": "#/components/schemas/OpsJob"}},
                        "scheduled": {"type": "array", "items": {"$ref": "#/components/schemas/OpsJob"}},
                        "totals": {"type": "object", "additionalProperties": {"type": ["integer", "null"], "minimum": 0}},
                        "runners": {"type": "object", "properties": {
                            "lastHeartbeatAt": {"type": ["string", "null"], "format": "date-time"},
                            "hasRecentRunner": {"type": ["boolean", "null"]},
                            "count": {"type": ["integer", "null"], "minimum": 0},
                            "registeredCount": {"type": ["integer", "null"], "minimum": 0},
                        }, "additionalProperties": True},
                        "scheduler": {"type": "object", "properties": {
                            "provider": {"type": "string", "enum": ["macmini", "cloudflare"]},
                            "timezone": {"type": "string", "const": "America/Cuiaba"},
                            "evaluatedAt": {"type": "string", "format": "date-time"},
                            "nextDecision": {"anyOf": [{"$ref": "#/components/schemas/CanonicalScheduleDecision"}, {"type": "null"}]},
                            "decisions": {"type": "array", "items": {"$ref": "#/components/schemas/CanonicalScheduleDecision"}},
                        }, "additionalProperties": True},
                    },
                    "additionalProperties": False,
                },
                "DailyPrintAttempt": {
                    "type": ["object", "null"],
                    "properties": {
                        "jobId": {"type": "string", "format": "uuid"},
                        "targetDate": {"type": "string", "format": "date"},
                        "status": {"$ref": "#/components/schemas/OpsJobStatus"},
                        "expected": {"type": ["integer", "null"], "minimum": 0},
                        "approved": {"type": ["integer", "null"], "minimum": 0},
                        "missing": {"type": ["integer", "null"], "minimum": 0},
                        "invalid": {"type": ["integer", "null"], "minimum": 0},
                        "errorCode": {"type": ["string", "null"]},
                        "failedInsertionIds": {"type": "array", "items": {"type": "integer", "minimum": 1}},
                        "nextRecoveryAt": {"type": ["string", "null"], "format": "date-time"},
                    },
                    "additionalProperties": True,
                },
                "DailyPrintStatusResponse": {
                    "type": "object",
                    "required": ["timeZone", "schedule", "requestedDate", "lastAttempt"],
                    "properties": {
                        "timeZone": {"type": "string", "const": "America/Cuiaba"},
                        "schedule": {"type": "string", "const": "18:00"},
                        "nextRunAt": {"type": ["string", "null"], "format": "date-time"},
                        "requestedDate": {"type": "string", "format": "date"},
                        "lastAttempt": {"$ref": "#/components/schemas/DailyPrintAttempt"},
                        "lastFullyApproved": {"type": ["object", "null"], "additionalProperties": True},
                    },
                    "additionalProperties": False,
                },
                "RunnerHeartbeatRequest": {
                    "type": "object",
                    "required": ["runnerId"],
                    "properties": {
                        "runnerId": {"type": "string", "minLength": 1, "maxLength": 120},
                        "version": {"type": ["string", "null"]},
                        "jobId": {"type": ["string", "null"], "format": "uuid"},
                        "heartbeatAt": {"type": ["string", "null"], "format": "date-time"},
                        "lastCycleAt": {"type": ["string", "null"], "format": "date-time"},
                        "lastSuccessAt": {"type": ["string", "null"], "format": "date-time"},
                        "lastError": {"type": ["string", "null"]},
                        "capabilities": {"type": "object", "additionalProperties": True},
                    },
                    "additionalProperties": False,
                },
                "RunnerHeartbeatResponse": {
                    "type": "object",
                    "required": ["ok", "runnerId", "receivedAt", "jobLease"],
                    "properties": {
                        "ok": {"type": "boolean"},
                        "error": {"type": ["string", "null"], "enum": ["lease_lost", None]},
                        "runnerId": {"type": "string"},
                        "receivedAt": {"type": "string", "format": "date-time"},
                        "jobLease": {"type": ["object", "null"], "additionalProperties": True},
                    },
                    "additionalProperties": False,
                },
                "PiSiteExportJobStatus": {
                    "type": "object",
                    "required": ["jobId", "kind", "status"],
                    "properties": {
                        "id": {"type": "string", "format": "uuid"},
                        "jobId": {"type": "string", "format": "uuid"},
                        "kind": {"type": "string", "const": "pi-site-export"},
                        "status": {"$ref": "#/components/schemas/OpsJobStatus"},
                        "stage": {"type": ["string", "null"]},
                        "piCodigo": {"type": ["string", "null"]},
                        "siteSigla": {"type": ["string", "null"]},
                        "mode": {"type": ["string", "null"], "enum": ["full", "prints-only", "pdf", "full-pdf", None]},
                        "variant": {"type": ["string", "null"], "enum": ["original", "web", None]},
                        "downloadUrl": {"type": ["string", "null"], "format": "uri"},
                        "artifactBytes": {"type": ["integer", "null"], "minimum": 1},
                        "artifactContentType": {"type": ["string", "null"]},
                        "artifactFileName": {"type": ["string", "null"]},
                        "error": {"type": ["string", "null"]},
                        "runnerId": {"type": ["string", "null"]},
                        "createdAt": {"type": ["string", "null"], "format": "date-time"},
                        "updatedAt": {"type": ["string", "null"], "format": "date-time"},
                    },
                    "additionalProperties": True,
                },
                "PiSiteExportNotReady": {
                    "type": "object",
                    "required": ["error"],
                    "properties": {
                        "error": {"type": "string"},
                        "jobId": {"type": "string", "format": "uuid"},
                        "status": {"$ref": "#/components/schemas/OpsJobStatus"},
                        "stage": {"type": ["string", "null"]},
                    },
                    "additionalProperties": True,
                },
                "CampaignFulfillmentJobRequest": {
                    "type": "object",
                    "required": ["piCodigo", "siteSigla"],
                    "properties": {
                        "piCodigo": {"type": "string", "pattern": "^[0-9]+$"},
                        "siteSigla": {"type": "string", "minLength": 2, "maxLength": 24},
                        "placement": {"type": ["string", "null"], "description": "Opcional. Omitir para processar todas as posições da PI no portal."},
                        "campaignDate": {"type": ["string", "null"], "format": "date", "description": "Data dentro do período. Obrigatória para corrigir campanha de aba mensal anterior."},
                        "sendTelegram": {"type": "boolean", "default": True},
                        "chatId": {"type": ["string", "null"]},
                        "refreshDrive": {"type": "boolean", "default": True},
                        "source": {"type": "string", "default": "campaign-fulfillment-api"},
                        "requestedBy": {"type": "string", "default": "api-server"},
                    },
                    "additionalProperties": False,
                },
                "CampaignFulfillmentJobAccepted": {
                    "type": "object",
                    "required": ["ok", "duplicate", "jobId", "status", "piCodigo", "siteSigla"],
                    "properties": {
                        "ok": {"type": "boolean", "const": True},
                        "duplicate": {"type": "boolean"},
                        "jobId": {"type": "string", "format": "uuid"},
                        "status": {"$ref": "#/components/schemas/OpsJobStatus"},
                        "piCodigo": {"type": "string"},
                        "siteSigla": {"type": "string"},
                    },
                    "additionalProperties": True,
                },
                "CampaignFulfillmentJobStatus": {
                    "type": "object",
                    "required": ["jobId", "kind", "status", "stage", "links"],
                    "properties": {
                        "jobId": {"type": "string", "format": "uuid"},
                        "kind": {"type": "string", "const": "campaign-fulfillment"},
                        "status": {"$ref": "#/components/schemas/OpsJobStatus"},
                        "stage": {"type": "string"},
                        "piCodigo": {"type": ["string", "null"]},
                        "siteSigla": {"type": ["string", "null"]},
                        "result": {"type": ["object", "null"], "additionalProperties": True},
                        "error": {"type": ["string", "null"]},
                        "links": {"type": "object", "additionalProperties": {"type": "string"}},
                    },
                    "additionalProperties": True,
                },
                "CaptureProofJobRequest": {
                    "type": "object",
                    "required": ["date", "candidate", "promote"],
                    "properties": {
                        "date": {"type": "string", "format": "date"},
                        "captureAt": {"type": "string", "format": "date-time"},
                        "candidate": {"type": "boolean", "const": True},
                        "promote": {"type": "boolean"},
                        "replace": {"type": "boolean", "default": False},
                    },
                    "additionalProperties": False,
                },
            },
        },
        "x-cod5-generated-from": "Express route sources",
        "x-cod5-source-files": source_files,
        "x-cod5-endpoint-count": operation_count,
        "x-cod5-route-fingerprint-sha256": source_hash,
    }


app = FastAPI(
    title="AdOps API",
    version=discover_catalog_version(),
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict[str, Any]:
    document = build_openapi_document()
    return {
        "status": "ok",
        "version": document["info"]["version"],
        "endpointCount": document["x-cod5-endpoint-count"],
    }


@app.get("/api/openapi.json", include_in_schema=False)
def openapi_json() -> dict[str, Any]:
    return build_openapi_document()


@app.get("/api/docs", include_in_schema=False, response_class=HTMLResponse)
@app.get("/api/docs/", include_in_schema=False, response_class=HTMLResponse)
def swagger_ui() -> HTMLResponse:
    return get_swagger_ui_html(
        openapi_url="/api/openapi.json",
        title="AdOps API — Swagger",
        swagger_ui_parameters={
            "deepLinking": True,
            "displayRequestDuration": True,
            "persistAuthorization": True,
            "tryItOutEnabled": True,
        },
    )


@app.get("/api/redoc", include_in_schema=False, response_class=HTMLResponse)
def redoc() -> HTMLResponse:
    return get_redoc_html(
        openapi_url="/api/openapi.json",
        title="AdOps API — ReDoc",
        redoc_js_url=REDOC_ASSET_URL,
    )


@app.get(REDOC_ASSET_URL, include_in_schema=False)
def redoc_asset() -> Response:
    """Serve a pinned local bundle so ReDoc never depends on a third-party CDN."""
    if not REDOC_ASSET_PATH.is_file():
        return Response(
            content="ReDoc asset unavailable.",
            status_code=503,
            media_type="text/plain",
        )
    return Response(
        content=REDOC_ASSET_PATH.read_bytes(),
        media_type="application/javascript",
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
