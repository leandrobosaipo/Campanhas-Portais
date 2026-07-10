# SPEC - Importacao de PI v1

## Entrada

- PDFs de PI.
- Texto de WhatsApp.
- Linhas da planilha.
- Midias locais ou URLs ja publicadas.
- Eventos do Google Drive via `POST /api/ops/drive-pi-events`.

## Prioridade de conflito

1. PDF/e-mail da PI.
2. Planilha.
3. WhatsApp.

## Campos obrigatorios

- `piCodigo`
- `cliente`
- `agencia`
- `campanhaNome`
- `siteSigla`
- `localFormato`
- `inicio`
- `fim`
- `formatoMidia`

## Validacoes

- PI duplicada por cliente/agencia/campanha/periodo.
- Insercao duplicada por site/grupo/periodo.
- Midia compativel com formato.
- Cliente/agencia com CNPJ divergente.
- Periodo retroativo exige captura e auditoria.

## Mutacoes permitidas

- Criar campanha quando nao existir.
- Criar insercao quando nao existir.
- Atualizar cliente/agencia quando a PI trouxer dado mais confiavel.
- Vincular midia quando houver correspondencia por nome/hash/dimensao.

## Mutacoes bloqueadas

- Apagar duplicidade sem aprovacao.
- Trocar midia de video por GIF de banner.
- Sobrescrever evidencia valida com captura falha.
- Criar campanha/insercao a partir do Drive sem campos resolvidos e `ADOPS_DRIVE_PI_ALLOW_MUTATION=true`.

## Monitoramento Google Drive

- Pasta raiz: `18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6`.
- Frequencia v1 em producao: runner VPS a cada 5 minutos.
- Apps Script existe como prototipo/fallback leve, mas nao e o caminho produtivo atual.
- Idempotencia: `eventId = drive:<fileId>:<modifiedTime>`.
- Evento novo cria job `drive-pi-ingest`.
- Evento repetido retorna como duplicado e nao cria novo job.
- Status sem dados suficientes deve ser `needs_review`.

## Credenciais e caminhos de acesso ao Drive

- `Google Drive` do Codex/conector: usado para auditoria assistida nesta maquina. Ele provou que a pasta raiz e suas subpastas estao acessiveis, mas nao roda dentro do runner VPS.
- Runner/monitor em servidor: caminho produtivo. Preferir conta de servico com permissao de leitura na pasta raiz.
- Credenciais recomendadas: `GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE` ou `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`.
- Credenciais OAuth de usuario: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` e `GOOGLE_DRIVE_REFRESH_TOKEN` ficam como fallback, pois podem exigir reautenticacao.
- Apps Script: caminho antigo/prototipo. Foi mantido no repositorio, mas ja teve bloqueio de autorizacao OAuth pela conta Google.
- Se o conector Codex listar a pasta e o runner falhar, a conclusao correta e: Drive acessivel para o operador, credencial OAuth do runner vencida/invalida.
- Compartilhar a pasta apenas com o e-mail humano do operador permite auditoria e OAuth de usuario, mas nao autoriza uma conta de servico. Para o monitor sem expirar, compartilhar a pasta tambem com o `client_email` da conta de servico.
