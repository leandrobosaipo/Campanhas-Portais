# Publicação — HANSENIASE / ALMT — 2026-04-10

## Resumo operacional
- Campanha AdOps: `840 | HANSENIASE | PI 15727- ALMT | ABRIL/2026`
- Inserções:
  - `1192` — `MEGABANNER TOPO` — `10/04/2026 a 30/04/2026`
  - `1193` — `VIDEO` — `10/04/2026 a 22/04/2026`
- Regra aplicada: seguir WhatsApp para o vídeo (`10/04 a 22/04`), mesmo com divergência da planilha (`10/04 a 30/04`).

## Mídias
- GIF confirmado como já publicado e idêntico ao arquivo recebido no WhatsApp:
  - `https://perrenguematogrosso.com/app/uploads/2026/04/825x120-1-almt-1.gif`
- VT baixado do Google Drive e comprimido localmente com `ffmpeg`:
  - origem: `ALMT-HANSENIASE-original.mp4` (~25 MB)
  - web: `ALMT-HANSENIASE-web.mp4` (~8.6 MB, H.264/AAC, 1280x720, faststart)
- VT publicado no bucket/CDN do Perrengue com `public-read` e `Content-Type: video/mp4`:
  - `https://cdn.perrenguematogrosso.com/app/uploads/2026/04/almt-hanseniase-web.mp4`

## AdRotate
- Banner topo já existia como anúncio `120` no grupo `1`.
- O anúncio `120` foi sincronizado com o AdOps:
  - `adops_insertion_id = 1192`
  - `adops_campaign_id = 840`
  - `adops_pi_code = PI 15727- ALMT`
  - `adops_external_key = [REDACTED; configure ADOPS_EXTERNAL_KEY in the secure runtime]`
  - `adops_media_basename = 825x120-1-almt-1.gif`
- O vídeo foi criado como anúncio novo `122` no grupo `6`.
- Schedule do vídeo criado em `122`:
  - início: `2026-04-10 00:10 UTC`
  - fim: `2026-04-22 23:59 UTC`

## Evidências / prints
- Banner topo:
  - evidência `128`
  - URL: `https://cod5.nyc3.digitaloceanspaces.com/adops-prints/ABRIL-2026/840/1192/PERRENGUE_HANSENIASE_HANSENIASE_PI15727_2026-04-10_MEGA_TOPO.png?v=1775851991396`
- Vídeo:
  - evidência `127`
  - URL: `https://cod5.nyc3.digitaloceanspaces.com/adops-prints/ABRIL-2026/840/1193/PERRENGUE_HANSENIASE_HANSENIASE_PI15727_2026-04-10_VIDEO.png?v=1775880046878`

## Ganhos de conhecimento
1. No Perrengue, vídeo publicitário deve usar o domínio CDN (`cdn.perrenguematogrosso.com`), não o domínio principal do site.
2. Para vídeos no Spaces, é obrigatório subir com:
   - `--acl public-read`
   - `--content-type video/mp4`
   - `--cache-control max-age=31536000`
3. O plugin AdRotate aplica `stripslashes()` na saída do `bannercode`.
   - Se o HTML for salvo com sequências literais `\n`, a saída pública vira `n` no markup (`<videon ...>`).
   - Para anúncios HTML personalizados, gravar o `bannercode` sem `\n` literais.
4. O cache de página do WP Rocket pode preservar versões quebradas do anúncio mesmo após:
   - `wp cache flush`
   - purge de URL na Cloudflare
5. Quando isso acontecer no Perrengue, pode ser necessário:
   - limpar o diretório `app/cache/wp-rocket/perrenguematogrosso.com/*`
   - depois fazer purge na Cloudflare
6. A divergência planilha x WhatsApp deve ficar registrada no relatório da publicação quando a decisão operacional seguir o WhatsApp.
7. Para `VIDEO`, a prova não deve mostrar apenas o player carregado.
   - O padrão operacional passou a exigir frame visível, tempo/progresso aparente e controles do player como se o cursor estivesse sobre o anúncio.
   - O gerador agora faz hover, tenta playback em mute e injeta uma camada visual temporária baseada no progresso real do vídeo.
8. Revalidação final do vídeo concluída em `2026-04-10 18:41`.
   - auditoria API: `audited`
   - player visível com `00:03 / 01:00`
   - barra de progresso aparente no print final

## Arquivos locais usados nesta operação
- GIF recebido:
  - `/Users/leandrobosaipo/Downloads/825x120 (1) almt.gif`
- Vídeos locais:
  - `/Users/leandrobosaipo/Projetos/AdOps/tmp/almt-hanseniase/ALMT-HANSENIASE-original.mp4`
  - `/Users/leandrobosaipo/Projetos/AdOps/tmp/almt-hanseniase/ALMT-HANSENIASE-web.mp4`
- Provas locais:
  - `/Users/leandrobosaipo/Projetos/AdOps/tmp/generated-prints/2026-04-10/1192/2026-04-10-proof.png`
  - `/Users/leandrobosaipo/Projetos/AdOps/tmp/generated-prints/2026-04-10/1193/2026-04-10-proof.png`
