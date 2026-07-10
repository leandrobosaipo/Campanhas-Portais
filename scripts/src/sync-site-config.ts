import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, sitesTable } from '@workspace/db';

const MAINTENANCE_ROOT = '/Users/leandrobosaipo/.openclaw/workspace-codigo5-manutencao/maintenance-facilnamao';
const PERR_ROOT = '/Users/leandrobosaipo/.openclaw/workspace/wordpress_perrengue';

type SiteConfig = {
  dominio: string;
  siteUrl: string;
  artigoExemploUrl?: string | null;
  logoUrl?: string | null;
  serverLabel?: string | null;
  sshHost?: string | null;
  sshPort?: string | null;
  sshUser?: string | null;
  webrootPath?: string | null;
  wpPath?: string | null;
  wpCliPath?: string | null;
  phpBin?: string | null;
  tablePrefix?: string | null;
  adrotateVersao?: string | null;
  cloudflareZoneId?: string | null;
  cloudflareProjectName?: string | null;
  pagesSubdomain?: string | null;
  spacesBucket?: string | null;
  spacesBasePath?: string | null;
  maintenanceWorkspacePath?: string | null;
  deploymentNotes?: string | null;
};

function parseEnvFile(filePath: string) {
  const text = fs.readFileSync(filePath, 'utf8');
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    result[key] = rawValue.replace(/^"|"$/g, '');
  }
  return result;
}

function guessMaintenanceConfig(sigla: string, domain: string): SiteConfig {
  return {
    dominio: domain,
    siteUrl: `https://${domain}`,
    artigoExemploUrl: null,
    logoUrl: `/site-logos/${sigla.toLowerCase()}.${sigla === 'OMT' ? 'webp' : 'png'}`,
    serverLabel: 'facilnam@66.253.112.200:215',
    sshHost: '66.253.112.200',
    sshPort: '215',
    sshUser: 'facilnam',
    webrootPath: `/home/facilnam/public_html/${domain}/public_html`,
    wpPath: `/home/facilnam/public_html/${domain}/public_html/web/wp`,
    wpCliPath: '/home/facilnam/wp-cli.phar',
    maintenanceWorkspacePath: path.join(MAINTENANCE_ROOT, `sites/${domain}`),
    deploymentNotes: [
      'Infra compartilhada Facil na Mão.',
      'Config de site gerada por fallback embutido porque o arquivo site.env local não existe neste host.',
      `Workspace de manutenção de referência: ${path.join(MAINTENANCE_ROOT, `sites/${domain}`)}`,
    ].join('\n'),
    ...defaultOperational,
  };
}

const defaultOperational = {
  phpBin: 'php',
  tablePrefix: 'wp_',
  adrotateVersao: '5.17.2-c5.8',
  spacesBucket: 'cod5',
  spacesBasePath: 'adops-prints',
  cloudflareProjectName: 'adops-codigo5',
  pagesSubdomain: 'adops.codigo5.com.br',
};

const maintenanceSiteFiles = [
  ['AFL', path.join(MAINTENANCE_ROOT, 'sites/afolhalivre.com/site.env')],
  ['OMT', path.join(MAINTENANCE_ROOT, 'sites/omatogrossense.com/site.env')],
  ['PNMT', path.join(MAINTENANCE_ROOT, 'sites/portalnortemt.com/site.env')],
  ['PPMT', path.join(MAINTENANCE_ROOT, 'sites/portalpantanalmt.com/site.env')],
  ['ROO', path.join(MAINTENANCE_ROOT, 'sites/roonoticias.com/site.env')],
] as const;

const maintenanceConfigs: Record<string, SiteConfig> = Object.fromEntries(
  maintenanceSiteFiles.map(([sigla, filePath]) => {
    const fallbackDomains: Record<string, string> = {
      AFL: 'afolhalivre.com',
      OMT: 'omatogrossense.com',
      PNMT: 'portalnortemt.com',
      PPMT: 'portalpantanalmt.com',
      ROO: 'roonoticias.com',
    };
    if (!fs.existsSync(filePath)) {
      return [sigla, guessMaintenanceConfig(sigla, fallbackDomains[sigla] ?? `${sigla.toLowerCase()}.codigo5.com.br`)];
    }
    const env = parseEnvFile(filePath);
    const domain = env.DOMAIN;
    return [sigla, {
      dominio: domain,
      siteUrl: env.SITE_URL,
      artigoExemploUrl: null,
      logoUrl: `/site-logos/${sigla.toLowerCase()}.${sigla === 'OMT' ? 'webp' : 'png'}`,
      serverLabel: 'facilnam@66.253.112.200:215',
      sshHost: '66.253.112.200',
      sshPort: '215',
      sshUser: 'facilnam',
      webrootPath: env.WEBROOT,
      wpPath: env.WP_PATH,
      wpCliPath: env.WP_CLI,
      maintenanceWorkspacePath: path.join(MAINTENANCE_ROOT, `sites/${domain}`),
      deploymentNotes: [
        'Infra compartilhada Facil na Mão.',
        'Pós-deploy padrão: wp cache flush, limpeza do Redis/Object Cache e purge do Cloudflare quando houver mudança visual.',
        `Workspace de manutenção: ${path.join(MAINTENANCE_ROOT, `sites/${domain}`)}`,
      ].join('\n'),
      ...defaultOperational,
    } satisfies SiteConfig];
  }),
);

const perrengueConfig: SiteConfig = {
  dominio: 'perrenguematogrosso.com',
  siteUrl: 'https://perrenguematogrosso.com',
  artigoExemploUrl: 'https://perrenguematogrosso.com/festa-celebracao-307-anos-cuiaba-parque-das-aguas-video/',
  logoUrl: '/site-logos/perrengue.png',
  serverLabel: 'perrengu@186.209.113.107:1157',
  sshHost: '186.209.113.107',
  sshPort: '1157',
  sshUser: 'perrengu',
  webrootPath: '/home/perrengu/public_html',
  wpPath: '/home/perrengu/public_html/web/wp',
  wpCliPath: '~/wp-cli.phar',
  cloudflareZoneId: '9f8bbbc169388c206da1ccade1e993fa',
  maintenanceWorkspacePath: PERR_ROOT,
  deploymentNotes: [
    'Produção: /home/perrengu/public_html | Staging: /home/perrengu/staging.perrenguematogrosso.com/public_html/web',
    'Tema live: /home/perrengu/public_html/app/themes/tailpress-perrengue',
    'Plugin AdRotate live: /home/perrengu/public_html/app/plugins/adrotate',
    'Pós-deploy obrigatório: wp cache flush, wp rocket clean, purge Cloudflare e validação do endpoint ?cod5cache=1.',
    `Workspace de manutenção: ${PERR_ROOT}`,
  ].join('\n'),
  ...defaultOperational,
};

const configBySigla: Record<string, SiteConfig> = {
  ...maintenanceConfigs,
  PERRENGUE: perrengueConfig,
};

async function main() {
  const sites = await db.select().from(sitesTable);
  const updates: Array<{ sigla: string; id: number }> = [];

  for (const site of sites) {
    const config = configBySigla[site.sigla];
    if (!config) continue;
    await db.update(sitesTable).set(config).where(eq(sitesTable.id, site.id));
    updates.push({ sigla: site.sigla, id: site.id });
  }

  console.log(JSON.stringify({ updated: updates.length, sites: updates }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
