# Piloto GitLab Free do AdOps

## Objetivo

Validar o GitLab.com Free sem migrar a fonte canônica, sem alterar o `origin`
local e sem conceder ao piloto permissão de mutação em produção.

Durante todo o piloto:

- GitHub `leandrobosaipo/Campanhas-Portais` continua canônico;
- GitLab recebe apenas uma importação temporária;
- o job `preflight_production` é manual e read-only;
- nenhum deploy, upload ou atualização de stack parte do GitLab;
- cobrança, trial ou funcionalidade que exija upgrade reprova o piloto.

## Pré-requisitos da conta

Confirmar na interface e na API do GitLab, registrando evidência no relatório:

1. namespace privado no plano `Free`;
2. trial desativado;
3. assinatura e forma de pagamento ausentes;
4. runners hospedados disponíveis;
5. limite de usuários, compute e armazenamento exibido para a conta real.

Não armazenar token GitLab no repositório. Usar variável protegida e mascarada
somente quando a conta estiver disponível.

## Projeto temporário

Nome: `codigo5-adops/Campanhas-Portais-pilot`.

Importar pelo importador oficial do GitHub. Não adicionar remote GitLab no
checkout operacional. Não copiar secrets de deploy para o projeto piloto.

Configurar `main`:

- push direto: ninguém;
- force push e exclusão: desabilitados;
- merge: Maintainer;
- pipeline verde e discussões resolvidas;
- squash obrigatório.

O GitLab Free não deve ser apresentado como tendo aprovação obrigatória. O gate
deste piloto é merge request, pipeline verde e push direto bloqueado.

## Matriz de execução

Executar ao longo de 14 dias:

| Caso | Quantidade mínima | Aceite |
|---|---:|---|
| Pipeline completo | 20 | gates executados |
| Falha sintética | 5 | merge bloqueado |
| Correção da falha | 5 | estágio repetido e verde |
| Preflight produção | 3 | `mutated=false` |
| Passagens consecutivas | 2 | pipeline completo verde |

Falhas sintéticas permitidas: erro de tipo em branch descartável, arquivo de
teste contendo secret sintético reconhecido pelo Gitleaks, quebra de teste e
tentativa de sobrescrever tag protegida. Nunca usar segredo real.

## Métricas e gates

Registrar diariamente em `reports/git-platform-pilot-2026/data.json`:

- minutos consumidos e projeção mensal;
- duração p50 e p95;
- espera p50 e p95 do runner;
- falhas de infraestrutura;
- armazenamento;
- usuários ativos;
- solicitações de upgrade.

Aceitar apenas com projeção de até 300 minutos/mês, menos de 7 GiB, no máximo
5 usuários e nenhuma funcionalidade do piloto solicitando upgrade.

## Preflight read-only

O job manual executa:

```bash
bash ops/portainer/adops-stack/scripts/preflight-production.sh
```

Ele consulta Portainer, containers, volume do PostgreSQL, health público,
release e snapshot do Drive. A resposta precisa conter `ok=true` e
`mutated=false`. O script não cria backup, não envia arquivo e não atualiza o
stack.

## Encerramento

Se algum gate falhar, excluir o piloto e manter GitHub intacto. Forgejo só pode
ser avaliado em plano separado. Se todos passarem, uma decisão humana autoriza
ou rejeita uma importação final nova; o piloto nunca se transforma diretamente
no repositório canônico.
