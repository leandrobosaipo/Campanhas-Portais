# Exportação de prints para entrega

## Objetivo

Gerar uma cópia leve dos prints auditados para envio, sem alterar o PNG canônico, o `arquivoUrl` ou o resultado da auditoria.

O pacote operacional completo continua sendo o padrão. A exportação leve precisa ser solicitada explicitamente com:

```text
mode=prints-only&variant=web
```

## Endpoints

Por inserção:

```bash
curl -fL \
  'https://adops-api-public.leandro471.workers.dev/api/insertions/1666/evidences/export.zip?mode=prints-only&variant=web' \
  -o prints.zip
```

Por PI e portal:

```bash
curl -fL \
  'https://adops-api-public.leandro471.workers.dev/api/pi-site-exports?piCodigo=003121&siteSigla=PERRENGUE&download=1&mode=prints-only&variant=web' \
  -o prints.zip
```

## Contrato

- `mode=full` e `variant=original` preservam o pacote anterior.
- `mode=prints-only` entrega somente arquivos `.png` dentro das pastas de posição.
- `variant=web` limita a largura a `1920px`, sem ampliar imagens menores, e salva PNG com otimização e compressão máxima sem perda.
- Falha em qualquer imagem retorna `HTTP 422`; a API não entrega pacote parcial.
- Os nomes não usam `retroativo`, `retroativos` ou `evidencias`.
- A posição aparece no nome da pasta e de cada arquivo.
- Duplicidade de data recebe o sufixo determinístico `EV-{evidenceId}`.

Exemplo:

```text
PERRENGUE-PI-003121-SANEAR-VIDEO-2026-07-07-A-2026-07-15/
  PERRENGUE-PI-003121-VIDEO-2026-07-07.png
  PERRENGUE-PI-003121-VIDEO-2026-07-08.png
```

## Métricas

A resposta expõe as métricas nos headers `X-AdOps-Export-*`:

- imagens solicitadas, geradas e com falha;
- bytes originais e finais;
- percentual de economia;
- variante e modo usados.

Essas métricas não criam JSON, TXT ou manifesto dentro da pasta entregue.

## Dependência de runtime

O container da API precisa de `python3` e Pillow (`python3-pil`). A imagem e o Compose de produção já instalam essa dependência. Se ela não estiver disponível, a exportação falha sem alterar a evidência original.

Em desenvolvimento, `ADOPS_EVIDENCE_EXPORT_PYTHON` pode apontar para outro executável Python que tenha Pillow. Em produção, o padrão continua sendo `python3`.
