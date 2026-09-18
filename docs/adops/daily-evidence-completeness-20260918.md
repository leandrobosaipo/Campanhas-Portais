# Recuperação diária sem ocultar campanhas

## Falha reproduzida

O lote de 17/09 (`0e84d694-6c2a-43ce-b125-4314d6bda67a`) informou 8/8,
mas a seleção excluía as inserções 2938, 3029, 3032 e 3038 por
`duplicate_identity`, mesmo com alvo canônico e mídia pública confirmados.
A 3022 estava publicada, porém fora da planilha usada como inventário diário.

## Correção mínima

- Captura aceita apenas a seleção canônica identificada e observada quando o
  único bloqueio é duplicidade. Isso não autoriza nenhuma publicação.
- Auditoria das inserções já publicadas complementa a planilha, sem criar ou
  fundir cadastros. Inserções inativas, arquivadas, sem mídia ou fora do período
  não entram. A auditoria final usa IDs explícitos.
- Campanhas da planilha sem condição de captura aparecem em `blocked`, com
  motivo e contagem. O job falha explicitamente enquanto faltarem evidências;
  o payload de erro e `canonicalAudit` apresentam a mesma contagem.
- Não há chamada a Codex, OpenAI ou outro modelo nesse caminho.
- Perrengue: grupo 10 (topo lateral) recebe perfil de imagem GIF/PNG/JPEG
  380×120. O vídeo continua no grupo 6. Dimensões não substituem a validação
  da identidade, tipo e integridade do arquivo.

## Operação

1. Ler relatório mensal com todas as páginas e auditoria por data.
2. Conferir jobs existentes antes de criar recuperação.
3. Usar `POST /api/ops/jobs/print-backfill` com insertionId e intervalo exatos,
   replace=false e force=false. Acompanhar o job até estado terminal.
4. Conferir status audited, auditoria e URL. Gerar pacote apenas pelo endpoint
   assíncrono `/api/pi-site-exports/jobs`.
5. Prints aprovados não são sobrescritos. Reconstrução histórica mantém data
   real de captura; horário da matéria não precisa coincidir com a captura.

## Pendências externas observadas em 18/09

- PI 3217, planilha SETEMBRO 2026/G24: o usuário confirmou topo lateral.
  A prévia foi aceita, mas o job `e7ec8023-2537-4775-99f2-3c7e017b0902`
  falhou com `GOOGLE_SHEETS_CREDENTIALS_MISSING`, antes de gravar. Não repetir
  sem fornecer ao runner a credencial autorizada pelo contrato existente.
- O preflight `7880f0ab-9479-4d23-a02f-4499110e1371` reproduziu a falta de
  perfil de mídia de topo lateral. Após deploy, refazer o preflight; nunca usar
  o MP4 como banner nem inventar imagem ausente.
- A reclamação de horário precisa da identificação do arquivo exato. Não
  alterar data real para aparentar prova original histórica.

## Verificação e retorno

Testes: `test-daily-print-completeness.mjs` executa a seleção e o batch real,
com apenas as fronteiras de API isoladas; cobre inclusão, bloqueios,
preservação e contagens. `test-home1-media-profiles.mjs` cobre o perfil G10.
Deploy deve usar commit revisado da main, backup restaurado em base de teste,
41 regras de captura sem erro e validação da página real. Retorno é somente
da aplicação e seus volumes anteriores; não restaurar o banco às cegas.
