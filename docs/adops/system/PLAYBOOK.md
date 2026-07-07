# PLAYBOOK - Cenários AdOps

## Subir stack pela primeira vez

1. Criar env privado a partir de `.env.example`.
2. Buildar imagens via Portainer.
3. Subir stack.
4. Migrar banco.
5. Testar API, painel e runner.

## Trocar imagem

1. Buildar nova tag.
2. Atualizar `ADOPS_IMAGE_TAG`.
3. Rodar deploy.
4. Conferir logs e health.

## Falha em evidências

1. Rodar `audit:capture-rules-integrity`.
2. Conferir `capture_proof_logs`.
3. Testar uma inserção controlada.
4. Não mexer em AdRotate sem prova de divergência.

## Telegram

1. Worker antigo permanece ativo.
2. Criar adaptador Node.
3. Testar webhook em ambiente isolado.
4. Trocar webhook só com `message_id` validado.
