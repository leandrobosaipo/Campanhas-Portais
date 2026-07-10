# AVIF Fallback Multisite

## Objetivo
Evitar falhas de thumb no site, no WhatsApp e em capturas automáticas quando jornalistas sobem imagens `.avif`.

## O que foi implantado
Foi criado o MU-plugin `cod5-avif-fallback.php`, publicado em todos os portais:
- Perrengue Mato Grosso
- O Mato Grossense
- A Folha Livre
- Portal Norte MT
- Portal Pantanal MT
- R00 Notícias

## O que o plugin faz
1. Detecta uploads de imagens raster suportadas pelo WordPress para destaque, com foco em `avif`, `jpeg`, `png` e `webp`.
2. Gera fallback `webp` e `jpg` para `AVIF`.
3. Gera uma versão `webp` da imagem destacada e dos tamanhos intermediários.
4. Cria ou reaproveita um attachment companheiro em `image/webp` para a imagem destacada.
5. Troca o `_thumbnail_id` do post para o attachment `webp`, para que SEO/social/thumbs passem a usar o destaque convertido.
6. Guarda mapas de conversão em:
   - `_cod5_avif_fallback_map`
   - `_cod5_webp_conversion_map`
   - `_cod5_webp_attachment_id`
   - `_cod5_webp_source_attachment_id`
7. Expõe comando WP-CLI para auditar/reparar posts já publicados.
8. Adiciona um box no editor do post para:
   - simular destaque em WEBP
   - converter e trocar destaque
   - simular AVIF do conteúdo
   - corrigir AVIF do conteúdo
9. Mostra na box do editor o log com as URLs WEBP geradas para o destaque.
10. Troca URLs AVIF por fallback em filtros do WordPress onde isso for possível.

## O que foi validado
### Servidores
Todos os servidores consultados possuem suporte nativo para conversão:
- `Imagick`: sim
- `GD`: sim
- `AVIF`: sim
- `WEBP`: sim
- `JPEG`: sim

### Perrengue
Attachment testado:
- `333156`
- arquivo original: `whatsapp-image-2026-04-10-at-16.29.06.avif`
- post: `333155`

Fatos confirmados:
- o plugin gerou `webp` e `jpg` para o original e derivados
- o post passou a usar como destaque o attachment `333320` com mime `image/webp`
- a rotina resolve corretamente o attachment-fonte `333156` para montar o log da box do editor
- o CDN respondeu `200` para os fallbacks gerados
- exemplo confirmado:
  - `https://cdn.perrenguematogrosso.com/app/uploads/2026/04/whatsapp-image-2026-04-10-at-16.29.06.webp`
  - `https://cdn.perrenguematogrosso.com/app/uploads/2026/04/whatsapp-image-2026-04-10-at-16.29.06-300x280.webp`

## Como testar no editor do post
Abrir a edição de uma matéria e localizar o box lateral:
- `COD5 AVIF Fallback`

Ações disponíveis:
- `Simular destaque em WEBP`
- `Converter e trocar destaque`
- `Simular AVIF do conteúdo`
- `Corrigir AVIF do conteúdo`

O bloco do destaque mostra:
- attachment atual do destaque
- attachment-fonte, quando o destaque atual já é o companheiro `webp`
- attachment `webp` vinculado
- log com as URLs geradas por tamanho

O fluxo esperado:
1. `Simular destaque em WEBP`:
   - não troca nada no post
   - só mostra o log das URLs que já existem ou seriam usadas
2. `Converter e trocar destaque`:
   - gera o arquivo `webp` se ainda faltar
   - cria/reaproveita o attachment companheiro
   - troca o `_thumbnail_id` do post para o attachment `webp`
   - mantém rastreabilidade entre attachment-fonte e attachment convertido
3. `Simular AVIF do conteúdo`:
   - audita imagens AVIF inseridas no conteúdo
4. `Corrigir AVIF do conteúdo`:
   - gera os fallbacks AVIF pendentes

## Como testar por WP-CLI
### Doctor
```bash
wp cod5 avif doctor
```

### Auditar um post
```bash
wp cod5 avif audit_post <post_id>
```

### Corrigir um post
```bash
wp cod5 avif repair_post <post_id>
```

## Onde o arquivo-fonte fica guardado
### Multisite Fácil na Mão
- `/Users/leandrobosaipo/.openclaw/workspace-codigo5-manutencao/maintenance-facilnamao/mu-plugins/cod5-avif-fallback.php`

### Perrengue
- `/Users/leandrobosaipo/.openclaw/workspace/wordpress_perrengue/mu-plugins/cod5-avif-fallback.php`

## Pré-requisitos para continuar funcionando
- `Imagick` ou `GD` com suporte a AVIF e WEBP/JPEG
- MU-plugins ativos no portal
- uploads permanecendo acessíveis ao WordPress
- em portais com CDN/storage remoto, o attachment precisa continuar expondo URL pública válida

## Atenções para futuras atualizações
1. Não remover o MU-plugin em updates de tema/plugin.
2. Se mudar a camada de storage/CDN, revalidar a montagem da URL pública do fallback.
3. Se mudar o plugin SEO/social, revalidar o HTML final e os metadados de compartilhamento.
4. Se houver cache forte (WP Rocket/Cloudflare), limpar cache ao validar mudança em produção.

## Limitação atual conhecida
O fallback binário já está sendo gerado corretamente e resolve a compatibilidade do arquivo.
Ainda existe uma segunda camada de revisão para alguns portais que usam otimizações extras de imagem/SEO no HTML final. Isso não impede a geração do fallback nem a troca do destaque, mas pode exigir ajuste adicional na saída final do tema/plugin se algum parser externo continuar preferindo HTML cacheado.

- Correção crítica em 2026-04-11: o primeiro patch do fallback AVIF entrou em recursão ao usar `wp_get_original_image_url()`/`wp_get_attachment_url()` dentro do próprio filtro de URL do attachment. Isso podia quebrar home e telas do admin, inclusive a lista de posts. A solução final passou a derivar a URL pública pelo `guid` do attachment ou pelo `_wp_attached_file`, sem chamar APIs filtradas.
- Ajuste em 2026-04-11: os botões do box `COD5 AVIF Fallback` no editor passaram a usar feedback por query string no redirect, e não mais transient. Isso evita a sensação de “só atualizou a página” em cenários com cache/admin redirects.
- Ajuste em 2026-04-11: a box do editor passou a resolver corretamente o attachment-fonte quando o destaque atual já é `image/webp`, para continuar exibindo o log das URLs geradas.
- Ajuste em 2026-04-11: o fluxo de destaque foi ampliado para aceitar imagens raster suportadas pelo WordPress e sincronizar o `_thumbnail_id` para um attachment `webp`, sem mexer nas rotinas editoriais do conteúdo.
- Ajuste em 2026-04-11: em portais com storage/CDN externo, como o Perrengue, a URL pública do attachment não pode confiar no `guid`. A resolução correta agora consulta primeiro a URL pública real do attachment com o filtro local temporariamente desligado e só depois cai para `guid`/`baseurl`.
- Ajuste em 2026-04-11: attachments companheiros `image/webp` agora herdam a URL pública correta do attachment-fonte, o que corrige admin box, SEO e compartilhamento.
