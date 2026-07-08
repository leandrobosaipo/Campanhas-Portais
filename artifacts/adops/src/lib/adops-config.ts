const MONTH_NAMES = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];

function buildCompetencias(startYear: number, startMonthIndex: number, monthsForward: number) {
  const values: string[] = [];
  const cursor = new Date(startYear, startMonthIndex, 1);
  for (let step = 0; step < monthsForward; step += 1) {
    values.push(`${MONTH_NAMES[cursor.getMonth()]}/${cursor.getFullYear()}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return values;
}

export const COMPETENCIAS = buildCompetencias(2025, 6, 30);

export function getCompetenciaForDate(date = new Date()): string {
  return `${MONTH_NAMES[date.getMonth()]}/${date.getFullYear()}`;
}

export const DEFAULT_COMPETENCIA = COMPETENCIAS.includes(getCompetenciaForDate())
  ? getCompetenciaForDate()
  : COMPETENCIAS.at(-1) ?? "";

export function resetToCurrentCompetencia() {
  return DEFAULT_COMPETENCIA;
}

export const STATUS_META: Record<string, {
  label: string;
  badgeClass: string;
  dotClass: string;
  boxClass: string;
  checkOnClass: string;
  checkOffClass: string;
}> = {
  rascunho: {
    label: "Rascunho",
    badgeClass: "bg-slate-700/60 text-slate-300 border-slate-600/40",
    dotClass: "bg-slate-500",
    boxClass: "border-slate-600/40 bg-slate-700/15",
    checkOnClass: "bg-slate-600/40 text-slate-100 border-slate-500/40",
    checkOffClass: "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:border-slate-500/50 hover:text-slate-400",
  },
  aguardando_publicacao: {
    label: "Ag. Publicação",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    dotClass: "bg-amber-400",
    boxClass: "border-amber-500/30 bg-amber-500/8",
    checkOnClass: "bg-amber-500/15 text-amber-200 border-amber-500/30",
    checkOffClass: "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:border-amber-500/30 hover:text-amber-300",
  },
  publicado_no_site: {
    label: "Publicado",
    badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    dotClass: "bg-blue-400",
    boxClass: "border-blue-500/30 bg-blue-500/8",
    checkOnClass: "bg-blue-500/15 text-blue-200 border-blue-500/30",
    checkOffClass: "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:border-blue-500/30 hover:text-blue-300",
  },
  aguardando_print: {
    label: "Ag. evidência",
    badgeClass: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    dotClass: "bg-orange-400",
    boxClass: "border-orange-500/30 bg-orange-500/8",
    checkOnClass: "bg-orange-500/15 text-orange-200 border-orange-500/30",
    checkOffClass: "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:border-orange-500/30 hover:text-orange-300",
  },
  print_gerado: {
    label: "Evidência gerada",
    badgeClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    dotClass: "bg-cyan-400",
    boxClass: "border-cyan-500/30 bg-cyan-500/8",
    checkOnClass: "bg-cyan-500/15 text-cyan-200 border-cyan-500/30",
    checkOffClass: "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:border-cyan-500/30 hover:text-cyan-300",
  },
  enviado_para_agencia: {
    label: "Enviado",
    badgeClass: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    dotClass: "bg-violet-400",
    boxClass: "border-violet-500/30 bg-violet-500/8",
    checkOnClass: "bg-violet-500/15 text-violet-200 border-violet-500/30",
    checkOffClass: "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:border-violet-500/30 hover:text-violet-300",
  },
  docs_enviados: {
    label: "Docs Enviados",
    badgeClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    dotClass: "bg-indigo-400",
    boxClass: "border-indigo-500/30 bg-indigo-500/8",
    checkOnClass: "bg-indigo-500/15 text-indigo-200 border-indigo-500/30",
    checkOffClass: "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:border-indigo-500/30 hover:text-indigo-300",
  },
  concluido: {
    label: "Concluído",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    dotClass: "bg-emerald-400",
    boxClass: "border-emerald-500/30 bg-emerald-500/8",
    checkOnClass: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
    checkOffClass: "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:border-emerald-500/30 hover:text-emerald-300",
  },
  atrasado: {
    label: "Atrasado",
    badgeClass: "bg-red-500/20 text-red-300 border-red-500/40",
    dotClass: "bg-red-400 animate-pulse",
    boxClass: "border-red-500/40 bg-red-500/10",
    checkOnClass: "bg-red-500/20 text-red-200 border-red-500/40",
    checkOffClass: "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:border-red-500/30 hover:text-red-300",
  },
  bloqueado: {
    label: "Bloqueado",
    badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    dotClass: "bg-rose-400",
    boxClass: "border-rose-500/30 bg-rose-500/8",
    checkOnClass: "bg-rose-500/15 text-rose-200 border-rose-500/30",
    checkOffClass: "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:border-rose-500/30 hover:text-rose-300",
  },
  cancelado: {
    label: "Cancelado",
    badgeClass: "bg-slate-600/40 text-slate-500 border-slate-600/30 line-through",
    dotClass: "bg-slate-600",
    boxClass: "border-slate-600/40 bg-slate-700/10",
    checkOnClass: "bg-slate-600/40 text-slate-200 border-slate-500/40",
    checkOffClass: "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:border-slate-500/50 hover:text-slate-400",
  },
};

export const EVIDENCE_STATUS_META: Record<"pendente" | "atrasado" | "concluido", {
  label: string;
  badgeStatus: string;
  boxClass: string;
}> = {
  pendente: {
    label: "No prazo",
    badgeStatus: "rascunho",
    boxClass: "border-slate-600/40 bg-slate-700/15",
  },
  atrasado: {
    label: "Atrasado",
    badgeStatus: "atrasado",
    boxClass: "border-red-500/40 bg-red-500/10",
  },
  concluido: {
    label: "Concluído",
    badgeStatus: "concluido",
    boxClass: "border-emerald-500/30 bg-emerald-500/8",
  },
};

export const SITE_LOGOS: Record<string, string> = {
  PERRENGUE: "/site-logos/perrengue.png",
  OMT: "/site-logos/omt.webp",
  ROO: "/site-logos/roo.png",
  PPMT: "/site-logos/ppmt.png",
  PNMT: "/site-logos/pnmt.png",
  AFL: "/site-logos/afl.png",
};

export const ADROTATE_SITE_OPTIONS = [
  { sigla: "PERRENGUE", label: "Perrengue", domain: "perrenguematogrosso.com" },
  { sigla: "OMT", label: "O Matogrossense", domain: "omatogrossense.com" },
  { sigla: "AFL", label: "A Folha Livre", domain: "afolhalivre.com" },
  { sigla: "PNMT", label: "Portal Norte MT", domain: "portalnortemt.com" },
  { sigla: "PPMT", label: "Portal Pantanal MT", domain: "portalpantanalmt.com" },
  { sigla: "ROO", label: "Roo Noticias", domain: "roonoticias.com" },
] as const;

export const INSERTION_MEDIA_OVERRIDES: Record<number, string> = {
  651: "https://perrenguematogrosso.com/app/uploads/2026/03/825x120-pref-3.gif",
};

export type MediaKind = "image" | "gif" | "video" | "link" | "none";

export const MEDIA_KIND_META: Record<Exclude<MediaKind, "none">, {
  label: string;
  badgeClass: string;
}> = {
  image: {
    label: "Imagem",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  gif: {
    label: "GIF",
    badgeClass: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  },
  video: {
    label: "Vídeo",
    badgeClass: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  },
  link: {
    label: "Link",
    badgeClass: "bg-slate-600/30 text-slate-200 border-slate-500/30",
  },
};

export function getMediaKind(url: string | null | undefined): MediaKind {
  if (!url) return "none";
  if (/\.gif(\?.*)?$/i.test(url)) return "gif";
  if (/\.(png|jpe?g|webp|svg)(\?.*)?$/i.test(url)) return "image";
  if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url)) return "video";
  return "link";
}

export type PrintCoverageState = "future" | "attention" | "on_track" | "late";

export const PRINT_COVERAGE_META: Record<PrintCoverageState, {
  label: string;
  badgeClass: string;
}> = {
  future: {
    label: "Não iniciou",
    badgeClass: "bg-slate-600/30 text-slate-200 border-slate-500/30",
  },
  attention: {
    label: "Dentro do período",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  on_track: {
    label: "Em dia",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  late: {
    label: "Evidência faltando",
    badgeClass: "bg-red-500/20 text-red-300 border-red-500/40",
  },
};

export type CaptureProofState = "idle" | "missing_media" | "running" | "success" | "audited" | "error";

export const CAPTURE_PROOF_META: Record<CaptureProofState, {
  label: string;
  badgeClass: string;
}> = {
  idle: {
    label: "Pronto para gerar",
    badgeClass: "bg-slate-600/30 text-slate-200 border-slate-500/30",
  },
  missing_media: {
    label: "Adicionar mídia",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  running: {
    label: "Gerando evidência",
    badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  success: {
    label: "Evidência salva",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  audited: {
    label: "Evidência aprovada",
    badgeClass: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  },
  error: {
    label: "Falha na evidência",
    badgeClass: "bg-red-500/20 text-red-300 border-red-500/40",
  },
};

export const STATUS_LABELS = Object.fromEntries(
  Object.entries(STATUS_META).map(([key, meta]) => [key, meta.label]),
);

export const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  ...Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label })),
];

export const STATUS_CREATE_OPTIONS = STATUS_OPTIONS.filter(
  (status) => !["", "atrasado"].includes(status.value),
);

export const FORMATO_OPTIONS = [
  "MEGABANNER TOPO",
  "MEGABANNER HOME 1",
  "MEGABANNER HOME 2",
  "HOME 1",
  "HOME 2",
  "HOME 3",
  "VIDEO",
  "INSTAGRAM",
  "INTERNO DE NOTICIAS",
  "PRIMEIRA DOBRA",
  "SEGUNDA DOBRA",
  "TOPO LATERAL",
  "BANNER INTERNO NOTICIAS",
  "TOP BANNER",
];

export const OPERATIONS_LEGEND = [
  { key: "banner", label: "Publicado no site ou mídia agendada corretamente" },
  { key: "print", label: "Evidência obrigatória registrada no período" },
  { key: "envio", label: "Enviado à agência até D+1 do fim do período" },
  { key: "docs", label: "Docs enviados até D+1 do fim do período" },
];

export const INSERTION_PROGRESS_STEPS = [
  { key: "bannerPublicadoNoSite", label: "Publicado", status: "publicado_no_site" },
  { key: "printGerado", label: "Evidência", status: "print_gerado" },
  { key: "processoEnviadoAgencia", label: "Agência", status: "enviado_para_agencia" },
  { key: "docsEnviados", label: "Docs", status: "docs_enviados" },
] as const;
