# Auditoria de versionamento dos plugins gerenciados

Data da auditoria: `2026-04-12`

## Escopo

- `AdRotate` customizado
- `cod5-avif-fallback.php`
- `cod5-adops-retro-preview.php`

## AdRotate

Status: `igual`

- `PERRENGUE` / `perrenguematogrosso.com`: versão `5.17.2-c5.8` · md5 `de33005b77388a69f1af659b27a14c3b`
- `OMT` / `omatogrossense.com`: versão `5.17.2-c5.8` · md5 `de33005b77388a69f1af659b27a14c3b`
- `AFL` / `afolhalivre.com`: versão `5.17.2-c5.8` · md5 `de33005b77388a69f1af659b27a14c3b`
- `PNMT` / `portalnortemt.com`: versão `5.17.2-c5.8` · md5 `de33005b77388a69f1af659b27a14c3b`
- `PPMT` / `portalpantanalmt.com`: versão `5.17.2-c5.8` · md5 `de33005b77388a69f1af659b27a14c3b`
- `ROO` / `roonoticias.com`: versão `5.17.2-c5.8` · md5 `de33005b77388a69f1af659b27a14c3b`

## MU-plugin AVIF fallback

Status: `divergente`

- `PERRENGUE` / `perrenguematogrosso.com`: versão `1.0.0` · md5 `97d32f382c118b54a056b7ebaf96919b`
- `OMT` / `omatogrossense.com`: versão `1.0.0` · md5 `42d001ba031715b9a29d022ededa3cea`
- `AFL` / `afolhalivre.com`: versão `1.0.0` · md5 `f7d74694e5151deafbe82efc4a0fb0a2`
- `PNMT` / `portalnortemt.com`: versão `1.0.0` · md5 `f7d74694e5151deafbe82efc4a0fb0a2`
- `PPMT` / `portalpantanalmt.com`: versão `1.0.0` · md5 `f7d74694e5151deafbe82efc4a0fb0a2`
- `ROO` / `roonoticias.com`: versão `1.0.0` · md5 `bbb3f330e01850396dae1a8ba9f84406`

## MU-plugin retro preview

Status: `igual`

- `PERRENGUE` / `perrenguematogrosso.com`: versão `1.0.1` · md5 `02213dcbbf5b8dfb6ae1e65ee9b44dee`
- `OMT` / `omatogrossense.com`: versão `1.0.1` · md5 `02213dcbbf5b8dfb6ae1e65ee9b44dee`
- `AFL` / `afolhalivre.com`: versão `1.0.1` · md5 `02213dcbbf5b8dfb6ae1e65ee9b44dee`
- `PNMT` / `portalnortemt.com`: versão `1.0.1` · md5 `02213dcbbf5b8dfb6ae1e65ee9b44dee`
- `PPMT` / `portalpantanalmt.com`: versão `1.0.1` · md5 `02213dcbbf5b8dfb6ae1e65ee9b44dee`
- `ROO` / `roonoticias.com`: versão `1.0.1` · md5 `02213dcbbf5b8dfb6ae1e65ee9b44dee`

## Leitura operacional

- Esta auditoria passa a ser a forma recomendada de verificar se os portais realmente estão no mesmo estado, em vez de confiar apenas na memória da última implantação.
- O status `igual` exige mesmo hash entre todos os portais auditados para o arquivo correspondente.
- O status `divergente` pode ser aceitável por curto período, mas deve ser tratado como rollout incompleto.
