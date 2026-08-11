# Campanhas ativas — correções operacionais de 2026-08-11

## Escopo

Revisão das campanhas ativas usando a mesma hierarquia aplicada à PI 90892:

```text
PDF da PI -> pasta de mídia -> link auxiliar -> planilha -> AdOps -> AdRotate -> HTML/preview -> evidência
```

Registros existentes foram corrigidos em vez de duplicados.

## Publicações corrigidas

| PI | Inserção | Portal/grupo | Anúncio | Período | Destino |
| --- | ---: | --- | ---: | --- | --- |
| 009746 | 1856 | Perrengue G02 | 178 | 04–15/08 | não fornecido; publicado sem hyperlink |
| 17111 | 1857 | Perrengue G07 | 179 | 04–22/08 | `https://www.camaracuiaba.mt.gov.br/` |
| 17048 | 1831 | PPMT G02 | 27 | 01–13/08 | `https://www.bombeiros.mt.gov.br/` |
| 17048 | 1862 | PPMT G01 | 26 | 14–18/08 | `https://www.bombeiros.mt.gov.br/` |

A inserção 1862 permanece agendada. A ausência no HTML público antes de 14/08 é o comportamento correto.

A inserção acidental 1863 foi removida somente depois de o anúncio 26 ter sido recuperado para a inserção canônica 1862. O snapshot local e o backup do banco preservam rollback.

## Reconciliador e preflight

- Correspondência por `siteSigla + groupId`, sem depender do texto completo da posição.
- `LATERAL 02 — SIDEBAR — 300x250` e `LATERAL 02` resolvem para G07.
- `TOPO LATERAL` continua exclusivo do G10.
- `HOME 1` resolve para G02 e aceita somente 670x90 ou 728x90 nos portais autorizados.
- Inserções canceladas não geram sugestão de duplicação.
- Chaves externas canônicas podem ser recuperadas sem criar novo anúncio.
- O dashboard consome o snapshot atual do Drive persistido no banco.

## Planilha no Drive

- arquivo: `Relação de campanhas .xlsm`;
- ID preservado: `1FDNefBX-bENUqj4GVVWDAKoHI0YONVcu`;
- revisão anterior mantida indefinidamente;
- revisão nova: `0B-HSjT0FZ9rHZkVROEJ4YXdWQ0k3SzZtV1d4UC84bkRJZVcwPQ`;
- tamanho e SHA-256 relidos do Drive: `311046` bytes, `bc684e0c5d3584539296c9953813a986ccfe878384864b3268fc30dc21508c12`;
- `AGOSTO 2026!G25`: `LATERAL 02 — SIDEBAR — 300x250`;
- status atualizados somente após publicação confirmada: H24, H25, H59 e H60;
- 76 membros OOXML preservados; o arquivo de origem e a revisão nova não possuem `vbaProject.bin`.

A alteração foi reaplicada sobre a revisão mais recente e enviada como nova versão do mesmo arquivo. Não houve criação de planilha paralela nem troca de nome.

## Dashboard confirmado

Em 11/08/2026, após a nova revisão do Drive:

- `activeInSheet=16`;
- `matchedInAdOps=16`;
- `needsCreateInAdOps=0`;
- `needsPublication=0`;
- inventário do Drive: 444 itens.

## Captura e auditoria

A validação viva da inserção 1831 expôs três falhas de infraestrutura, corrigidas sem afrouxar a prova visual:

1. captura viva agora usa a rota pública; override de origem fica restrito à reconstrução retroativa;
2. URLs de mídia iniciadas por `//` são normalizadas para HTTPS antes do processamento do GIF;
3. o checklist valida o estilo do PNG entregue, não o estilo solicitado antes da conversão para `viewport_only`.

O G02 da PPMT usa limiar de semelhança 0,26 para o mesmo frame GIF redimensionado pelo navegador. A prova foi inspecionada visualmente e mantém domínio, data/hora, barra de rolagem, slot correto e mídia correta.

Provas vivas confirmadas em 11/08:

- 1856: auditada, HTTP 200;
- 1857: auditada, HTTP 200;
- 1831: auditada, HTTP 200.

Os retroativos foram enfileirados por inserção em lotes pequenos. Datas passadas somente podem ser aprovadas como `audited_reconstruction` com preview assinado e prova editorial suficiente. Ausência de prova deve continuar bloqueada.

Checkpoint após o primeiro lote:

- as 2 evidências antes inválidas foram regeneradas e aprovadas;
- lote da inserção 1841 concluído: 10/10 datas validadas, zero erro;
- painel: 67 auditadas, 79 ausentes e zero inválida;
- 12 lotes continuam assíncronos, um em execução e onze aguardando o runner;
- `hasDivergence=0` no reconciliador ativo.

## Releases e rollback

- release operacional atual: `933c986`;
- backup anterior: `adops-before-933c986-20260811T145656Z.sql.gz`;
- branch: `codex/active-campaign-fixes-20260811`.

Backups anteriores da sequência foram mantidos no volume PostgreSQL. A revisão anterior da planilha também permanece recuperável no Drive.
