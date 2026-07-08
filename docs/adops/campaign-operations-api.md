# API de Campanhas Ativas

Endpoint read-only para cruzar planilha do mês corrente, índice do Google Drive, cadastro AdOps e evidências.

## Endpoint

```bash
GET /api/campaign-operations/active
```

Parâmetros:

- `date=YYYY-MM-DD`: data de referência. Se omitido, usa a data atual em `America/Cuiaba`.
- `siteSigla=PERRENGUE|OMT|ROO|AFL|PNMT|PPMT`: filtro opcional por portal.
- `refreshDrive=true|false`: quando `true`, tenta consultar Google Drive ao vivo. Padrão: `false`.
- `includeEvidence=true|false`: quando `false`, não valida evidências por data. Padrão: `true`.

Exemplos:

```bash
curl -fsSL "https://adops-api.codigo5.com.br/api/campaign-operations/active?date=2026-07-08"
curl -fsSL "https://adops-api.codigo5.com.br/api/campaign-operations/active?date=2026-07-08&siteSigla=PERRENGUE"
curl -fsSL "https://adops-api.codigo5.com.br/api/campaign-operations/active?date=2026-07-08&refreshDrive=true"
```

## Regra de leitura da planilha

- A API lê somente a aba do mês corrente da data informada.
- Exemplo: `2026-07-08` usa `JULHO 2026`.
- Abas antigas sem ano, como `JULHO`, são ignoradas.
- Cada aba pode ter vários blocos de portal.
- Cada bloco começa no cabeçalho `PEÇA: (PI + CLIENTE)`.
- O nome do portal pode estar acima do cabeçalho, na mesma coluna ou deslocado.
- A linha entra no resultado quando o período contém a data consultada.

## Regra de Drive

Raiz canônica:

```text
18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6
```

Mapeamento:

- `AFL` -> `/AFL`
- `OMT` -> `/O MATOGROSSENSE`
- `ROO` -> `/ROO NOTICIAS`
- `PERRENGUE` -> `/PERRENGUE`
- `PNMT` -> `/PNMT`
- `PPMT` -> `/PMMT` ou `/PPMT`

O match da campanha usa:

1. número da PI no caminho da pasta ou arquivo;
2. número da PI no nome do PDF ou mídia;
3. tokens do nome da campanha dentro do portal.

Arquivos classificados:

- imagem: `gif`, `png`, `jpg`, `jpeg`, `webp`;
- vídeo: `mp4`, `mov`, `webm`;
- PDF;
- texto: `txt`, `docx`, Google Docs.

## Estados

- `ok`: campanha ativa está coerente.
- `needs_create_in_adops`: existe na planilha, mas não há inserção AdOps para PI + portal.
- `needs_media`: falta `mediaUrl` ou a mídia encontrada não bate com o formato.
- `needs_publication`: precisa estar publicada no site ou não há inserção para publicar.
- `needs_evidence`: falta print auditado para uma ou mais datas obrigatórias.
- `divergent_period`: período da planilha diverge do AdOps.
- `divergent_format`: formato da planilha diverge do AdOps.
- `drive_missing`: pasta/mídia não localizada no índice do Drive.
- `ambiguous_drive_match`: mais de uma pasta candidata no Drive.
- `blocked`: há problema objetivo que impede automação segura.

## Ações sugeridas

O endpoint não executa mutação. Ele retorna payloads prontos para endpoints existentes.

Exemplo:

```json
{
  "type": "print_backfill",
  "method": "POST",
  "endpoint": "/api/ops/jobs/print-backfill",
  "payload": {
    "piCodigo": "4500152231",
    "siteSigla": "PERRENGUE",
    "fromDate": "2026-07-01",
    "toDate": "2026-07-08"
  }
}
```

Use a ação sugerida somente depois de revisar `blockingIssues`.

## Caso de aceite: 08/07/2026

Resultado esperado para a planilha `JULHO 2026`:

- `PI 492306 - ENERGISA` em `PERRENGUE`: deve casar com AdOps.
- `PI 4500152231 - ÁGUAS CUIABÁ` em `PERRENGUE`: deve mostrar divergência de formato/período se o AdOps seguir em `HOME 1` até `17/07`.
- `PI 003121 - SANEAR` em `PERRENGUE`: deve aparecer como pendente de cadastro.
- `PI 003124 - SANEAR` em `ROO`: deve aparecer como pendente de cadastro.
- `PI 003123 - SANEAR` em `AFL`: deve aparecer como pendente de cadastro.

## Segurança

- A rota é read-only.
- Não cria campanha.
- Não publica AdRotate.
- Não gera print.
- Não expõe credenciais do Google Drive.
- Quando o Drive não está disponível, retorna `drive.status=unavailable` em vez de inventar mídia.
