# Análise das PIs Modelo

Fonte analisada:

- `/Users/leandrobosaipo/Downloads/PI-modelo/PI 89011 - SITE PERRENGUE MATO GROSSO  CUIABA -31-03-2026_175152_206-6583.pdf`
- `/Users/leandrobosaipo/Downloads/PI-modelo/SECOM - Programa Fila Zero Na Cirurgia - Site Perrengue MT - PI 14028 - Aceite.pdf`

## 1. O que as PIs confirmam

### PI 89011 — DMD

Agência:
- `DMD ASSOC. ASSESSORIA E PROPAGANDA LTDA`
- CNPJ: `03.175.635/0001-18`
- Telefone/WhatsApp: `65 3313-7400`
- Endereço: `Sen. Filinto Muller, 1875, Cuiabá/MT, CEP 78043-409`

Cliente:
- `Pref. Mun. de Primavera do Leste`

Veículo:
- `Site Perrengue Mato Grosso - Cuiabá`

Campos relevantes da PI:
- PI: `89011`
- Período da competência: `ABRIL/2026`
- Projeto: `PRI-0002/26`
- Plano: `PRI-0001/26`
- Planilha: `00109238`
- Produto: `INSTITUCIONAL`
- Campanha: `FTD`
- Peça: `C DISPLAY DE INTERNET`
- Formato: `BANNER INTERNO NOTICIAS - 728 X 90`
- Total de inserções: `12`
- Custo unitário: `887,75`
- Total bruto: `9.375,00`
- Comissão: `1.875,00`
- Líquido: `7.500,00`

Tabela de exibição confirmada visualmente:
- exibição diária contínua de `01/04/2026` até `12/04/2026`
- total visual: `12 inserções`

Regras operacionais confirmadas:
- exige tabela de preços carimbada e assinada
- exige nota fiscal com PI, campanha, valor negociado, desconto padrão, valor faturado, dados para pagamento e período de veiculação
- exige declaração de veiculação art. 299
- exige comprovante de veiculação carimbado e assinado
- para sites, exige `prints diários em JPG`
- informa cancelamento de processos não liquidados em `90 dias após o vencimento`

### PI 14028 — Renca + SECOM

Agência:
- `RENCA COMUNICACAO LTDA`
- CNPJ: `24.122.372/0001-59`
- Telefone: `(65) 9 9210-1306`
- Endereço: `Av. Senador Filinto Muller, 1181, Edificio Avenida Parque, Sala 401, Quilombo, Cuiabá/MT, CEP 78043-435`

Cliente:
- `SECOM`
- Razão social: `Secretaria de Estado de Comunicação de Mato Grosso`

Veículo:
- `Perrengue Mato Grosso`

Campos relevantes da PI:
- PI: `14028`
- Projeto: `#3275 . Programa Fila Zero na Cirurgia`
- Mês/Ano: `Abril/2026`
- Início/Término: `03/04/2026 até 18/04/2026`
- Praça: `Cuiabá`
- Código da peça: `36914`
- Peça: `Banner de site - Programa Fila Zero na Cirurgia`
- Condição de pagamento: `15 DFM`
- Faturamento: `Direto cliente`
- Email de faturamento: `faturamento@renca.com.br`
- Total da mídia: `16.192,56`
- Desconto: `1.192,56`
- Bonificação: `10.795,04`
- Valor negociado: `15.000,00`
- Desconto padrão de agência: `20,0000%`
- Valor faturado: `12.000,00`

Tabela de exibição confirmada visualmente:
- Linha 1: `MEGABANNER TOPO 825x120 (Diário)` de `03/04/2026` até `14/04/2026` = `12`
- Linha 2: `MEGABANNER TOPO 825x120 (Diário)` com coluna `B.` marcada = `15/04/2026` até `18/04/2026` = `4`
- Linha 3: `BONIFICAÇÃO DE VEICULAÇÃO NO INSTAGRAM (Diário)` = `15/04/2026` até `18/04/2026` = `4`
- Total da linha `Inserções por dia`: `20`
- Leitura operacional provável:
  - `12` inserções pagas no site
  - `4` inserções adicionais marcadas na coluna `B.`
  - `4` bonificações no Instagram

Regras operacionais confirmadas:
- documentos de faturamento devem ser enviados em `PDF`
- comprovantes e declarações devem estar `carimbados e assinados`
- documentação deve ser enviada à agência em `até 1 dia útil após o término da veiculação`
- o PI exige `aceite formal do veículo` por documento assinado ou e-mail detalhado
- a comprovação de veiculação deve ocorrer por registros fotográficos ou eletrônicos
- faturamento nesta PI está marcado como `direto cliente`

## 2. O que muda no produto

As PIs mostram que o sistema precisa ir além do cadastro simples de campanha e inserção.

### Mudanças obrigatórias

1. Cadastro de agência mais completo
- razão social
- CNPJ
- telefone
- WhatsApp
- e-mail principal
- e-mail de faturamento
- endereço
- cidade, UF, CEP
- prazo de pagamento
- prazo para envio de documentos
- desconto padrão de agência
- instruções de faturamento
- flags operacionais de exigência documental

2. Novos campos na PI/campanha
- projeto
- plano
- planilha
- produto
- praça
- condição de pagamento
- faturar direto cliente/agência

3. Novos campos por inserção/programação
- código da peça
- tipo de programação
- flag de bonificação
- linha de bonificação separada
- grade diária explícita de exibição
- total calculado por linha

4. Regras por agência e também por combinação agência + cliente
- DMD pede pacote documental mais rígido e explícito
- Renca adiciona aceite formal e prazo de docs em D+1
- Renca + SECOM traz faturamento direto cliente e bonificação destacada
- isso indica que, no futuro, o ideal é existir uma camada de `perfil comercial/operacional` por `agência + cliente`

## 3. O que foi alterado agora

Implementado no sistema:
- expansão da tabela `agencies`
- API de agência preparada para novos campos
- tela de configurações preparada para editar cadastro completo da agência
- DMD e Renca preenchidas com os dados confirmados nas PIs
- verificação de duplicidade antes de cadastrar as PIs reais no banco
- enriquecimento das campanhas históricas já existentes em vez de duplicar:
  - campanha `626` corresponde agora à PI `89011`
  - campanha `623` corresponde agora à PI `14028`
- a PI `14028` foi desdobrada operacionalmente em 3 inserções:
  - `03/04 a 14/04` `MEGABANNER TOPO`
  - `15/04 a 18/04` `MEGABANNER TOPO`
  - `15/04 a 18/04` `INSTAGRAM`
- a PI `89011` teve seu formato normalizado para `BANNER INTERNO NOTICIAS`

## 4. Pontos que ainda precisam de confirmação

1. Coluna `B.` da PI da Renca
- leitura provável: bonificação ou bloco bonificado adicional
- precisa validar com o cliente se isso sempre vira uma inserção separada ou uma propriedade da linha

2. Nota fiscal detalhada na Renca
- a PI traz instruções de faturamento e aceite formal
- não explicita no mesmo nível de detalhe da DMD a composição obrigatória da NF
- por segurança, isso deve ser confirmado

3. Regras por cliente
- a PI da SECOM mostra que parte da regra não é só da agência
- precisamos validar se `SECOM` sempre impõe `aceite formal`, `D+1 docs`, `direto cliente` e `bonificação` da mesma forma
