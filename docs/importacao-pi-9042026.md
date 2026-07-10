# Importação e análise da pasta `pi-9042026`

## Pasta analisada
- `/Users/leandrobosaipo/Downloads/pi-9042026`

## Arquivos lidos
- `PI_15494_SITE_O_MATOGROSSENSE_-_CUIAB_.pdf`
- `PI_25205138_SITE_O_MATOGROSSENSE_CBA_ABR_VEICULO[2].pdf`
- `Renca - email.pdf`
- `dmd.pdf`
- `genius.pdf`
- `zf -email.pdf`

## Princípio adotado nesta rodada
- Prioridade para o que já está na planilha e no AdRotate.
- Atualização automática somente quando o dado novo era complementar e seguro.
- Quando o PDF/e-mail diverge da base histórica, o caso fica para validação manual.

## Ganhos de conhecimento reutilizados do projeto
- `DMD` tende a exigir pacote documental mais rígido.
- `Renca` tende a exigir aceite formal e prazo curto para docs.
- `Genius` tem regras documentais específicas e pode retificar dias após o início.
- `ZF` passou a exigir envio do faturamento somente após solicitação formal do setor de processos.
- Nem todo e-mail confirma a mesma regra da PI; em vários casos o e-mail complementa ou corrige a operação.

## O que já existia no AdOps
### PIs encontradas na base
- `PI 15494 - TCE` → campanhas `698` e `825`
- `PI 25205138- GOV` → campanha `830`
- `PI 13777 - GOV` → campanha `696`
- `PI 88981- GOV` → campanha `618`
- `PI 25204647` → campanha `667`
- `PI 25204651` → campanha `694`

## Sincronizações seguras aplicadas
### Agência Genius
- razão social preenchida
- CNPJ preenchido
- telefone preenchido
- e-mail principal preenchido
- e-mail de faturamento preenchido
- regras documentais reforçadas

### Agência ZF
- CNPJ preenchido
- telefone preenchido
- e-mail operacional preenchido
- e-mail de faturamento preenchido
- regra de envio somente após solicitação formal registrada
- regra de comprovantes diários para site registrada

### Campanhas enriquecidas
#### `830` — PI `25205138`
- projeto: `GOV-SEC-2026/226`
- produto: `ENFRENTAMENTO AO FEMINICIDIO E A VIOLENCIA DOMESTICA`
- praça: `CUIABA`
- faturamento tipo: `cliente`
- observação interna registrada com a divergência de período

#### `698` e `825` — PI `15494`
- projeto: `#2728 . Radar meio ambiente`
- produto: `Master (qualquer dimensao) - Banner site`
- praça: `CUIABA`
- condição de pagamento: `15 DFM`
- faturamento tipo: `cliente`
- observação interna registrada com a bonificação separada no documento

#### `667` e `694` — Genius / Balanço 2025
- produto enriquecido
- praça preenchida
- faturamento tipo preenchido
- observação interna registrada com a divergência entre thread/evolução do processo e a base histórica

## Divergências encontradas
### 1. PI `25205138` — campanha `830`
Documento indica:
- `08/04/2026 a 14/04/2026` = `7` dias
- `15/04/2026 a 17/04/2026` = `3` dias de reaplicação

Base atual do AdOps:
- inserção `1179`
- `09/04/2026 a 18/04/2026`

Status:
- não alterado automaticamente
- motivo: prioridade para planilha + AdRotate

### 2. PI `15494` — campanhas `698` e `825`
Documento indica:
- `18/03/2026 a 26/03/2026` = `9` dias pagos em `HOME 2`
- `27/03/2026 a 30/03/2026` = `4` dias de bonificação

Base atual do AdOps:
- inserções `969` e `1172`
- período contínuo `18/03/2026 a 30/03/2026`

Status:
- não alterado automaticamente
- motivo: prioridade para planilha + base já existente

### 3. Thread Genius — campanhas `667` e `694`
Thread indica:
- `PI 25204647` → `26/02 a 28/02`
- `PI 25204651` → início como `01/03 a 05/03`
- depois aparece retificação com dias `11/03 e 12/03`
- processo pede declaração com dias `1,2,3,4,5,11 e 12 de março`

Base atual do AdOps:
- campanha `694` com período contínuo `01/03/2026 a 12/03/2026`

Status:
- não alterado automaticamente
- motivo: divergência histórica forte e fora do mês corrente

## Regras extraídas por agência
### Genius
- processo por e-mail assinado digitalmente
- enviar para `processos@genius.com.br`
- exigir NF detalhada com PI, bruto, comissão, líquido e dados bancários
- contrato social atualizado
- tabela de preços carimbada
- analytics do mês anterior para site
- declaração art. 299
- declaração conforme LC `04/90`
- comprovante de veiculação
- para site, priorizar data da página do site
- não aceitar Word para comprovação

### ZF
- faturamento só após solicitação formal do setor de processos
- confirmação obrigatória em até 24h
- print deve sair direto do navegador
- print deve mostrar nome do site, URL completa e logo
- banner exige comprovantes diários com data do site
- declaração art. 299 detalhada
- retenção de IR `4,8%` quando aplicável

### DMD
- docs em até `1 dia útil` após o fim da veiculação
- NF contra o cliente pelo valor faturado/líquido
- certidões atualizadas
- declaração art. 299
- comprovante após o término com dias e horários
- para site: primeiro e último dia assinados e carimbados
- todos os dias contratados em JPG renomeados
- print precisa mostrar domínio, home page e datas legíveis
- banner animado precisa ter frames variados/intercalados na comprovação

### Renca
- aceite formal por e-mail/documento continua sendo importante
- thread mostra correção posterior do nome da campanha
- procedimentos de faturamento seguem relevantes mesmo quando a mídia já foi aceita

## Resultado desta rodada
- nenhuma campanha nova precisou ser criada
- várias campanhas já existiam na base
- dados seguros de agência e metadados de campanha foram enriquecidos
- divergências entre PDF/e-mail e base histórica foram preservadas para decisão manual
