#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-${ADOPS_STACK_ENV_FILE:-}}"
PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL:-https://adops-api-public.leandro471.workers.dev/api}"
STAMP="$(date +%Y%m%d-%H%M%S)"
SQL_PATH="${TMPDIR:-/tmp}/adops-public-api-sync-${STAMP}.sql"

if [[ -z "$ENV_FILE" || ! -f "$ENV_FILE" ]]; then
  printf 'Usage: ADOPS_STACK_ENV_FILE=/secure/path/adops.env %s\n' "$0" >&2
  exit 1
fi

# shellcheck source=./lib-portainer.sh
source "$SCRIPT_DIR/lib-portainer.sh"
load_portainer_env
ENDPOINT_ID="$(portainer_endpoint_id)"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${ADOPS_POSTGRES_USER:?ADOPS_POSTGRES_USER is required}"
: "${ADOPS_POSTGRES_PASSWORD:?ADOPS_POSTGRES_PASSWORD is required}"
: "${ADOPS_POSTGRES_DB:?ADOPS_POSTGRES_DB is required}"

node - "$PUBLIC_API_BASE_URL" "$SQL_PATH" <<'NODE'
const fs = require("fs");
const [baseUrl, sqlPath] = process.argv.slice(2);

const columns = {
  clients: [
    ["id", "id"], ["nome", "nome"], ["razaoSocial", "razao_social"], ["cnpj", "cnpj"], ["telefone", "telefone"], ["whatsapp", "whatsapp"], ["email", "email"], ["emailFaturamento", "email_faturamento"], ["endereco", "endereco"], ["cidade", "cidade"], ["uf", "uf"], ["cep", "cep"], ["contatoResponsavel", "contato_responsavel"], ["cargoResponsavel", "cargo_responsavel"], ["prazoPagamento", "prazo_pagamento"], ["prazoEnvioDocs", "prazo_envio_docs"], ["faturamentoTipoPadrao", "faturamento_tipo_padrao"], ["instrucoesFaturamento", "instrucoes_faturamento"], ["observacoes", "observacoes"], ["exigeAceiteFormal", "exige_aceite_formal"], ["exigeNotaFiscalDetalhada", "exige_nota_fiscal_detalhada"], ["exigeDeclaracaoArt299", "exige_declaracao_art299"], ["exigeComprovanteAssinado", "exige_comprovante_assinado"], ["exigePrintDiario", "exige_print_diario"], ["ativo", "ativo"], ["createdAt", "created_at"],
  ],
  agencies: [
    ["id", "id"], ["nome", "nome"], ["razaoSocial", "razao_social"], ["cnpj", "cnpj"], ["telefone", "telefone"], ["whatsapp", "whatsapp"], ["email", "email"], ["emailFaturamento", "email_faturamento"], ["endereco", "endereco"], ["cidade", "cidade"], ["uf", "uf"], ["cep", "cep"], ["prazoPagamento", "prazo_pagamento"], ["prazoEnvioDocs", "prazo_envio_docs"], ["descontoPadraoPercentual", "desconto_padrao_percentual"], ["instrucoesFaturamento", "instrucoes_faturamento"], ["exigeAceiteFormal", "exige_aceite_formal"], ["exigeNotaFiscalDetalhada", "exige_nota_fiscal_detalhada"], ["exigeDeclaracaoArt299", "exige_declaracao_art299"], ["exigeComprovanteAssinado", "exige_comprovante_assinado"], ["exigePrintDiario", "exige_print_diario"], ["ativo", "ativo"], ["createdAt", "created_at"],
  ],
  sites: [
    ["id", "id"], ["nome", "nome"], ["sigla", "sigla"], ["dominio", "dominio"], ["siteUrl", "site_url"], ["artigoExemploUrl", "artigo_exemplo_url"], ["logoUrl", "logo_url"], ["serverLabel", "server_label"], ["sshHost", "ssh_host"], ["sshPort", "ssh_port"], ["sshUser", "ssh_user"], ["webrootPath", "webroot_path"], ["wpPath", "wp_path"], ["wpCliPath", "wp_cli_path"], ["phpBin", "php_bin"], ["tablePrefix", "table_prefix"], ["adrotateVersao", "adrotate_versao"], ["cloudflareZoneId", "cloudflare_zone_id"], ["cloudflareProjectName", "cloudflare_project_name"], ["pagesSubdomain", "pages_subdomain"], ["spacesBucket", "spaces_bucket"], ["spacesBasePath", "spaces_base_path"], ["maintenanceWorkspacePath", "maintenance_workspace_path"], ["deploymentNotes", "deployment_notes"], ["ativo", "ativo"], ["createdAt", "created_at"],
  ],
  campaigns: [
    ["id", "id"], ["nome", "nome"], ["clienteId", "cliente_id"], ["agenciaId", "agencia_id"], ["piCodigo", "pi_codigo"], ["projeto", "projeto"], ["plano", "plano"], ["planilhaRef", "planilha_ref"], ["produto", "produto"], ["praca", "praca"], ["condicaoPagamento", "condicao_pagamento"], ["faturamentoTipo", "faturamento_tipo"], ["valorLiquido", "valor_liquido"], ["competencia", "competencia"], ["origem", "origem"], ["observacoes", "observacoes"], ["createdAt", "created_at"], ["updatedAt", "updated_at"],
  ],
  insertions: [
    ["id", "id"], ["campanhaId", "campanha_id"], ["siteId", "site_id"], ["localFormato", "local_formato"], ["localFormatoNormalizado", "local_formato_normalizado"], ["periodoInicio", "periodo_inicio"], ["periodoFim", "periodo_fim"], ["periodoOriginal", "periodo_original"], ["statusLegado", "status_legado"], ["statusNormalizado", "status_normalizado"], ["bannerPublicadoNoSite", "banner_publicado_no_site"], ["printGerado", "print_gerado"], ["processoEnviadoAgencia", "processo_enviado_agencia"], ["docsEnviados", "docs_enviados"], ["dataEnvioAgencia", "data_envio_agencia"], ["mediaUrl", "media_url"], ["atrasado", "atrasado"], ["observacoes", "observacoes"], ["createdAt", "created_at"], ["updatedAt", "updated_at"],
  ],
  evidences: [
    ["id", "id"], ["insercaoId", "insercao_id"], ["tipo", "tipo"], ["arquivoUrl", "arquivo_url"], ["titulo", "titulo"], ["criadoEm", "criado_em"],
  ],
};

function lit(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json();
}

function insertSql(table, rows) {
  if (!rows.length) return "";
  const mapping = columns[table];
  const names = mapping.map(([, column]) => `"${column}"`).join(", ");
  const values = rows.map((row) => `(${mapping.map(([key]) => lit(row[key])).join(", ")})`).join(",\n");
  return `INSERT INTO "${table}" (${names}) VALUES\n${values};\n`;
}

(async () => {
  const datasets = {};
  for (const name of ["clients", "agencies", "sites", "campaigns", "insertions"]) {
    datasets[name] = await get(`/${name}`);
  }
  const evidences = [];
  let evidenceErrors = 0;
  for (const insertion of datasets.insertions) {
    try {
      const rows = await get(`/insertions/${insertion.id}/evidences`);
      for (const row of rows) evidences.push(row);
    } catch (error) {
      evidenceErrors += 1;
    }
  }
  datasets.evidences = evidences;

  let sql = "BEGIN;\n";
  sql += "TRUNCATE evidences, print_jobs, insertions, campaigns, clients, agencies, sites RESTART IDENTITY CASCADE;\n";
  for (const table of ["clients", "agencies", "sites", "campaigns", "insertions", "evidences"]) {
    sql += insertSql(table, datasets[table]);
  }
  for (const [table, rows] of Object.entries(datasets)) {
    if (rows.length) sql += `SELECT setval(pg_get_serial_sequence('${table}', 'id'), GREATEST((SELECT max(id) FROM ${table}), 1), true);\n`;
  }
  sql += "COMMIT;\n";
  fs.writeFileSync(sqlPath, sql);
  console.error(JSON.stringify({
    clients: datasets.clients.length,
    agencies: datasets.agencies.length,
    sites: datasets.sites.length,
    campaigns: datasets.campaigns.length,
    insertions: datasets.insertions.length,
    evidences: datasets.evidences.length,
    evidenceErrors,
  }));
})();
NODE

container_name="adops-public-api-sync-${STAMP}"
body="$(mktemp)"
code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 30 \
  -X POST \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg name "$container_name" '{
    Image: "postgres:16-alpine",
    Cmd: ["sh", "-lc", "sleep 600"],
    HostConfig: { NetworkMode: "adops_internal" }
  }')" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/create?name=${container_name}" || true)"
if [[ ! "$code" =~ ^2 ]]; then
  printf 'Sync helper create failed HTTP=%s\n' "$code" >&2
  sed -n '1,80p' "$body" >&2
  rm -f "$body" "$SQL_PATH"
  exit 1
fi
container_id="$(jq -r '.Id' "$body")"
rm -f "$body"

cleanup() {
  curl -sS -X DELETE -H "X-API-Key: ${PORTAINER_API_KEY}" \
    "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}?force=true" >/dev/null || true
  rm -f "$SQL_PATH" "${SQL_PATH}.tar"
}
trap cleanup EXIT

curl -sS --max-time 30 -X POST -H "X-API-Key: ${PORTAINER_API_KEY}" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/start" >/dev/null
COPYFILE_DISABLE=1 tar --no-xattrs -C "$(dirname "$SQL_PATH")" -cf "${SQL_PATH}.tar" "$(basename "$SQL_PATH")"
code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 180 \
  -X PUT \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/x-tar" \
  -H "Expect:" \
  --data-binary "@${SQL_PATH}.tar" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/archive?path=/tmp" || true)"
if [[ ! "$code" =~ ^2 ]]; then
  printf 'SQL upload failed HTTP=%s\n' "$code" >&2
  sed -n '1,80p' "$body" >&2
  rm -f "$body"
  exit 1
fi
rm -f "$body"

TARGET_DATABASE_URL="postgresql://${ADOPS_POSTGRES_USER}:${ADOPS_POSTGRES_PASSWORD}@adops-postgres:5432/${ADOPS_POSTGRES_DB}"
exec_payload="$(jq -n --arg db "$TARGET_DATABASE_URL" --arg sql "/tmp/$(basename "$SQL_PATH")" '{
  AttachStdout: true,
  AttachStderr: true,
  Tty: false,
  Cmd: ["sh", "-lc", "psql -v ON_ERROR_STOP=1 \"$TARGET_DATABASE_URL\" -f \"$SQL_FILE\""],
  Env: [("TARGET_DATABASE_URL=" + $db), ("SQL_FILE=" + $sql)]
}')"
exec_id="$(curl -sS --max-time 30 -X POST \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$exec_payload" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/containers/${container_id}/exec" | jq -r '.Id')"
curl -sS --max-time 300 -X POST \
  -H "X-API-Key: ${PORTAINER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"Detach": false, "Tty": false}' \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/start" | strings
exit_code="$(curl -sS --max-time 30 -H "X-API-Key: ${PORTAINER_API_KEY}" \
  "${PORTAINER_API}/endpoints/${ENDPOINT_ID}/docker/exec/${exec_id}/json" | jq -r '.ExitCode')"
if [[ "$exit_code" != "0" ]]; then
  printf 'Public API data sync failed with exit code %s\n' "$exit_code" >&2
  exit 1
fi

printf 'Public API data sync finished.\n'
