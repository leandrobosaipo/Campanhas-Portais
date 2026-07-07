# Modelo Futuro: Perfil Operacional por Agência + Cliente

## Por que esse modelo é necessário

As PIs reais mostraram que as regras não são sempre globais por agência.

Exemplos observados:

- `DMD` exige pacote documental mais rígido e `prints diários`
- `Renca` exige `aceite formal` e prazo de docs em `D+1`
- `Renca + SECOM` ainda adiciona `faturamento direto cliente` e evidências específicas

Por isso, o cadastro de agência sozinho não resolve todo o problema.

## Proposta de modelagem

Tabela futura sugerida: `agency_client_profiles`

Campos base:

- `id`
- `agency_id`
- `client_id`
- `nome_exibicao`
- `ativo`
- `prioridade`
- `observacoes`

Regras operacionais:

- `exige_aceite_formal`
- `exige_nota_fiscal_detalhada`
- `exige_declaracao_art299`
- `exige_comprovante_assinado`
- `exige_print_diario`
- `prazo_envio_docs_tipo`
- `prazo_envio_docs_dias`
- `prazo_envio_docs_util`
- `faturamento_tipo`
- `desconto_padrao_percentual`
- `usa_bonificacao`
- `bonificacao_em_linha_separada`
- `codigo_peca_obrigatorio`
- `produto_obrigatorio`
- `praca_obrigatoria`

Regras para importação e parser:

- `alias_agencia`
- `alias_cliente`
- `termos_aceitos_para_produto`
- `termos_aceitos_para_formato`
- `instrucoes_parser`

## Hierarquia sugerida

1. Regra específica `agência + cliente`
2. Regra padrão da agência
3. Regra global do sistema

## Comportamentos na UI

Quando o operador selecionar `agência` e `cliente`, o sistema deve:

- preencher automaticamente `faturamento`
- sugerir `condição de pagamento`
- avisar quais documentos serão cobrados
- dizer se `print diário` é obrigatório
- avisar se a linha de bonificação deve ser separada
- destacar campos obrigatórios extras da PI

## Exemplo com base nas PIs atuais

### DMD + Prefeitura de Primavera do Leste

- `print diário`: sim
- `aceite formal`: não confirmado
- `nf detalhada`: sim
- `declaração art. 299`: sim
- `comprovante assinado`: sim

### Renca + SECOM

- `faturamento`: direto cliente
- `aceite formal`: sim
- `prazo docs`: D+1 útil
- `comprovante assinado`: sim
- `bonificação`: sim, com linha separada provável

## Etapas recomendadas

### Fase 1

- manter regra no cadastro da agência
- documentar exceções por cliente

### Fase 2

- criar tabela `agency_client_profiles`
- incluir gestão administrativa
- usar perfil para autopreenchimento do wizard

### Fase 3

- usar perfil também na automação de leitura de PI
