import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

type SiteTarget = {
  sigla: string;
  domain: string;
  sshHost: string;
  sshPort: string;
  sshUser: string;
  webroot: string;
};

type RemotePluginState = {
  exists: boolean;
  version: string | null;
  md5: string | null;
  relativePath: string;
  error?: string;
};

type SiteAuditResult = {
  sigla: string;
  domain: string;
  adrotate: RemotePluginState;
  avifFallback: RemotePluginState;
  retroPreview: RemotePluginState;
};

const PROJECT_ROOT = "/Users/leandrobosaipo/Projetos/AdOps";
const REPORT_DATE = "2026-04-12";
const REPORT_PATH = path.join(PROJECT_ROOT, "docs", "auditoria-versionamento-wordpress-2026-04-12.md");

const SITES: SiteTarget[] = [
  {
    sigla: "PERRENGUE",
    domain: "perrenguematogrosso.com",
    sshHost: "186.209.113.107",
    sshPort: "1157",
    sshUser: "perrengu",
    webroot: "/home/perrengu/staging.perrenguematogrosso.com/public_html/web",
  },
  {
    sigla: "OMT",
    domain: "omatogrossense.com",
    sshHost: "66.253.112.200",
    sshPort: "215",
    sshUser: "facilnam",
    webroot: "/home/facilnam/public_html/omatogrossense.com/public_html/web",
  },
  {
    sigla: "AFL",
    domain: "afolhalivre.com",
    sshHost: "66.253.112.200",
    sshPort: "215",
    sshUser: "facilnam",
    webroot: "/home/facilnam/public_html/afolhalivre.com/public_html/web",
  },
  {
    sigla: "PNMT",
    domain: "portalnortemt.com",
    sshHost: "66.253.112.200",
    sshPort: "215",
    sshUser: "facilnam",
    webroot: "/home/facilnam/public_html/portalnortemt.com/public_html/web",
  },
  {
    sigla: "PPMT",
    domain: "portalpantanalmt.com",
    sshHost: "66.253.112.200",
    sshPort: "215",
    sshUser: "facilnam",
    webroot: "/home/facilnam/public_html/portalpantanalmt.com/public_html/web",
  },
  {
    sigla: "ROO",
    domain: "roonoticias.com",
    sshHost: "66.253.112.200",
    sshPort: "215",
    sshUser: "facilnam",
    webroot: "/home/facilnam/public_html/roonoticias.com/public_html/web",
  },
];

function ssh(site: SiteTarget, command: string) {
  return execFileSync(
    "ssh",
    ["-p", site.sshPort, `${site.sshUser}@${site.sshHost}`, command],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function inspectRemoteFile(site: SiteTarget, relativePath: string): RemotePluginState {
  const absolute = `${site.webroot}/${relativePath}`;
  const remoteCommand = `
set -e
file="${absolute}"
if [ ! -f "$file" ]; then
  printf '{"exists":false,"version":null,"md5":null,"relativePath":"%s"}' "${relativePath}"
  exit 0
fi
version=$(php -r '
$f = file_get_contents($argv[1]);
if ($f === false) { exit(2); }
if (preg_match("/^[ \\t\\/*#@]*Version:\\s*(.+)$/mi", $f, $m)) { echo trim($m[1]); }
' "$file" 2>/dev/null || true)
md5=$(md5sum "$file" | awk '{print $1}')
php -r '
$payload = [
  "exists" => true,
  "version" => strlen($argv[2]) ? $argv[2] : null,
  "md5" => strlen($argv[3]) ? $argv[3] : null,
  "relativePath" => $argv[1],
];
echo json_encode($payload, JSON_UNESCAPED_SLASHES);
' "${relativePath}" "$version" "$md5"
`.trim();

  try {
    const raw = ssh(site, remoteCommand).trim();
    return JSON.parse(raw) as RemotePluginState;
  } catch (error) {
    return {
      exists: false,
      version: null,
      md5: null,
      relativePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function statusLine(results: SiteAuditResult[], pick: (item: SiteAuditResult) => RemotePluginState) {
  const populated = results.map((item) => pick(item).md5).filter((value): value is string => Boolean(value));
  const unique = [...new Set(populated)];
  return unique.length <= 1 ? "igual" : "divergente";
}

function renderPluginSection(
  title: string,
  results: SiteAuditResult[],
  pick: (item: SiteAuditResult) => RemotePluginState,
) {
  const lines = [`## ${title}`, "", `Status: \`${statusLine(results, pick)}\``, ""];
  for (const item of results) {
    const state = pick(item);
    if (state.error) {
      lines.push(`- \`${item.sigla}\` / \`${item.domain}\`: erro na leitura (\`${state.error}\`)`);
      continue;
    }
    if (!state.exists) {
      lines.push(`- \`${item.sigla}\` / \`${item.domain}\`: arquivo ausente`);
      continue;
    }
    lines.push(`- \`${item.sigla}\` / \`${item.domain}\`: versão \`${state.version ?? "sem header"}\` · md5 \`${state.md5}\``);
  }
  lines.push("");
  return lines;
}

async function main() {
  const results: SiteAuditResult[] = SITES.map((site) => ({
    sigla: site.sigla,
    domain: site.domain,
    adrotate: inspectRemoteFile(site, "app/plugins/adrotate/adrotate.php"),
    avifFallback: inspectRemoteFile(site, "app/mu-plugins/cod5-avif-fallback.php"),
    retroPreview: inspectRemoteFile(site, "app/mu-plugins/cod5-adops-retro-preview.php"),
  }));

  const lines = [
    "# Auditoria de versionamento dos plugins gerenciados",
    "",
    `Data da auditoria: \`${REPORT_DATE}\``,
    "",
    "## Escopo",
    "",
    "- `AdRotate` customizado",
    "- `cod5-avif-fallback.php`",
    "- `cod5-adops-retro-preview.php`",
    "",
  ];

  lines.push(...renderPluginSection("AdRotate", results, (item) => item.adrotate));
  lines.push(...renderPluginSection("MU-plugin AVIF fallback", results, (item) => item.avifFallback));
  lines.push(...renderPluginSection("MU-plugin retro preview", results, (item) => item.retroPreview));

  lines.push("## Leitura operacional", "");
  lines.push("- Esta auditoria passa a ser a forma recomendada de verificar se os portais realmente estão no mesmo estado, em vez de confiar apenas na memória da última implantação.");
  lines.push("- O status `igual` exige mesmo hash entre todos os portais auditados para o arquivo correspondente.");
  lines.push("- O status `divergente` pode ser aceitável por curto período, mas deve ser tratado como rollout incompleto.");
  lines.push("");

  writeFileSync(REPORT_PATH, lines.join("\n"));
  console.log(JSON.stringify({ ok: true, reportPath: REPORT_PATH, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
