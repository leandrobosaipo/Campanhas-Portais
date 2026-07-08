import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";

type DeadlineMode = "calendar" | "business";

export type OperationalStageGuide = {
  key: string;
  label: string;
  deadlineLabel: string;
  action: string;
  critical: boolean;
  assumption?: boolean;
};

export type OperationalProfile = {
  id: string;
  label: string;
  matchLabel: string;
  summary: string;
  faturamentoPadrao?: "agencia" | "cliente" | "a_confirmar";
  docsOffsetDays: number;
  docsOffsetMode: DeadlineMode;
  envioOffsetDays: number;
  envioOffsetMode: DeadlineMode;
  cadastroRule: "received_or_start_d_plus_1";
  publicationRule: "by_start";
  printRule: "daily_within_period" | "within_period";
  requiresDailyPrint: boolean;
  requiresFormalAcceptance: boolean;
  requiresDetailedInvoice: boolean;
  requiresArt299: boolean;
  requiresSignedProof: boolean;
  requiresAnalytics: boolean;
  requiresUrlLogoAndDate: boolean;
  requiresAnimatedVariation: boolean;
  keepPiWindowsSeparated: boolean;
  checklist: string[];
  formHints: string[];
  dashboardHint: string;
};

export type OperationalTone = "neutral" | "urgent" | "documental" | "analytics" | "split";

export function getOperationalToneMeta(tone: OperationalTone) {
  switch (tone) {
    case "urgent":
      return {
        label: "Prazo operacional apertado",
        cardClass: "border-amber-500/30 bg-amber-500/10",
        badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-200",
      };
    case "documental":
      return {
        label: "Peso documental alto",
        cardClass: "border-blue-500/30 bg-blue-500/10",
        badgeClass: "border-blue-500/30 bg-blue-500/10 text-blue-200",
      };
    case "analytics":
      return {
        label: "Comprovação reforçada",
        cardClass: "border-sky-500/30 bg-sky-500/10",
        badgeClass: "border-sky-500/30 bg-sky-500/10 text-sky-200",
      };
    case "split":
      return {
        label: "PI pede desdobramento",
        cardClass: "border-fuchsia-500/30 bg-fuchsia-500/10",
        badgeClass: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200",
      };
    default:
      return {
        label: "Fluxo padrão monitorado",
        cardClass: "border-emerald-500/30 bg-emerald-500/10",
        badgeClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      };
  }
}

type ProfileContext = {
  agenciaNome?: string | null;
  clienteNome?: string | null;
  campaignName?: string | null;
  faturamentoTipo?: string | null;
  observacoes?: string | null;
};

const DEFAULT_PROFILE: OperationalProfile = {
  id: "default",
  label: "Padrão AdOps",
  matchLabel: "Regra geral",
  summary: "Fluxo operacional padrão para campanhas sem exigência especial confirmada em PI.",
  faturamentoPadrao: "a_confirmar",
  docsOffsetDays: 1,
  docsOffsetMode: "calendar",
  envioOffsetDays: 1,
  envioOffsetMode: "calendar",
  cadastroRule: "received_or_start_d_plus_1",
  publicationRule: "by_start",
  printRule: "daily_within_period",
  requiresDailyPrint: true,
  requiresFormalAcceptance: false,
  requiresDetailedInvoice: false,
  requiresArt299: false,
  requiresSignedProof: false,
  requiresAnalytics: false,
  requiresUrlLogoAndDate: false,
  requiresAnimatedVariation: false,
  keepPiWindowsSeparated: false,
  checklist: [
    "Publicar ou agendar corretamente antes do início do período.",
    "Gerar print de comprovação dentro do período.",
    "Enviar comprovação e docs em D+1 após o fim do período.",
  ],
  formHints: [
    "Se a PI trouxer mais de uma janela de período, valide se precisa quebrar em mais de uma inserção.",
    "Se o cliente ainda não confirmou faturamento, marque como A confirmar para não travar o cadastro.",
  ],
  dashboardHint: "Atenção principal: publicar no prazo, manter prints em dia e enviar para a agência em D+1.",
};

const AGENCY_PROFILES: OperationalProfile[] = [
  {
    ...DEFAULT_PROFILE,
    id: "dmd",
    label: "DMD",
    matchLabel: "Agência DMD",
    summary: "DMD exige rotina documental rígida e comprovantes diários nomeados por data.",
    faturamentoPadrao: "cliente",
    docsOffsetDays: 1,
    docsOffsetMode: "business",
    requiresDetailedInvoice: true,
    requiresArt299: true,
    requiresSignedProof: true,
    requiresDailyPrint: true,
    requiresAnimatedVariation: true,
    checklist: [
      "Faturar contra o cliente pelo valor líquido e discriminar PI na NF.",
      "Enviar comprovantes diários em JPG com domínio e home visíveis.",
      "Assinar/carimbar primeiro e último comprovante quando aplicável.",
      "Anexar art. 299, certidões e demais documentos exigidos pela agência.",
    ],
    formHints: [
      "Se a campanha usar GIF, a comprovação deve mostrar variação do criativo.",
      "O nome dos prints por data ajuda a documentação final e evita retrabalho.",
    ],
    dashboardHint: "DMD pede atenção forte em documentação e na rotina diária de prints.",
  },
  {
    ...DEFAULT_PROFILE,
    id: "zf",
    label: "ZF",
    matchLabel: "Agência ZF",
    summary: "ZF exige print direto do navegador com logo, URL e rotina diária clara para banner.",
    faturamentoPadrao: "a_confirmar",
    docsOffsetDays: 1,
    docsOffsetMode: "business",
    requiresDetailedInvoice: true,
    requiresArt299: true,
    requiresSignedProof: true,
    requiresDailyPrint: true,
    requiresUrlLogoAndDate: true,
    checklist: [
      "Print direto do navegador, sem recorte solto, com URL e identificação do site.",
      "Comprovantes diários para banner.",
      "Faturar somente após solicitação formal do setor de processos.",
      "Anexar art. 299 e observar retenção de IR quando aplicável.",
    ],
    formHints: [
      "Se for banner, trate print diário como obrigatório.",
      "Não conclua docs antes de chegar a liberação formal do processo.",
    ],
    dashboardHint: "ZF costuma travar no envio documental e no padrão visual do comprovante.",
  },
  {
    ...DEFAULT_PROFILE,
    id: "genius",
    label: "Genius",
    matchLabel: "Agência Genius",
    summary: "Genius combina processo assinado, comprovante de veiculação e apoio de Analytics.",
    faturamentoPadrao: "cliente",
    docsOffsetDays: 1,
    docsOffsetMode: "business",
    requiresDetailedInvoice: true,
    requiresArt299: true,
    requiresSignedProof: true,
    requiresAnalytics: true,
    requiresUrlLogoAndDate: true,
    checklist: [
      "Enviar processo assinado digitalmente para processos@genius.com.br.",
      "Anexar Google Analytics quando a PI pedir comprovação de veiculação.",
      "Não usar Word como comprovante final.",
      "Manter nome da campanha e PI iguais ao documento recebido.",
    ],
    formHints: [
      "Se a PI trouxer retificação por e-mail, registre a observação para preservar histórico.",
      "Se houver dias quebrados, não una automaticamente sem validação.",
    ],
    dashboardHint: "Genius pede atenção extra em histórico de retificações e material documental.",
  },
  {
    ...DEFAULT_PROFILE,
    id: "renca",
    label: "Renca",
    matchLabel: "Agência Renca",
    summary: "Renca costuma exigir aceite formal e envio de documentos em janela curta.",
    faturamentoPadrao: "agencia",
    docsOffsetDays: 1,
    docsOffsetMode: "business",
    requiresFormalAcceptance: true,
    requiresSignedProof: true,
    keepPiWindowsSeparated: true,
    checklist: [
      "Validar aceite formal quando a PI ou o e-mail trouxer essa exigência.",
      "Enviar documentação em até 1 dia útil após o fim do período.",
      "Separar janelas de período quando a PI destacar linhas distintas.",
    ],
    formHints: [
      "Se a PI mostrar linha paga e linha bonificada, trate como possibilidade de duas inserções.",
      "Use observações para registrar correções posteriores do nome da campanha.",
    ],
    dashboardHint: "Renca costuma variar por cliente, então o aceite formal e o prazo de docs merecem destaque.",
  },
  {
    ...DEFAULT_PROFILE,
    id: "renca-secom",
    label: "Renca + SECOM",
    matchLabel: "Agência Renca / cliente SECOM",
    summary: "Perfil mais específico já confirmado: faturamento direto cliente, docs em D+1 útil e janelas separadas.",
    faturamentoPadrao: "cliente",
    docsOffsetDays: 1,
    docsOffsetMode: "business",
    envioOffsetDays: 1,
    envioOffsetMode: "business",
    requiresFormalAcceptance: true,
    requiresSignedProof: true,
    requiresDailyPrint: true,
    keepPiWindowsSeparated: true,
    checklist: [
      "Faturar direto cliente quando a PI confirmar essa condição.",
      "Tratar bonificação e reaplicação como linhas separadas quando vierem destacadas.",
      "Enviar docs em D+1 útil e manter aceite formal anexado.",
    ],
    formHints: [
      "Se a PI trouxer reaplicação ou bonificação, preserve a janela separada em vez de unir tudo.",
      "Quando houver dúvida entre planilha e PI, manter prioridade da planilha/site e registrar a divergência.",
    ],
    dashboardHint: "Renca + SECOM costuma exigir desdobramento de períodos e revisão fina da PI.",
  },
];

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function addBusinessDays(date: Date, amount: number) {
  if (amount <= 0) return date;
  const next = new Date(date);
  let remaining = amount;
  while (remaining > 0) {
    next.setDate(next.getDate() + 1);
    const day = next.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return next;
}

function formatDeadline(date: Date | null) {
  if (!date) return "Validar com cliente";
  return format(date, "dd/MM/yyyy", { locale: ptBR });
}

function computeDeadline(base: Date | null, offset: number, mode: DeadlineMode) {
  if (!base) return null;
  if (mode === "business") return addBusinessDays(base, offset);
  return addDays(base, offset);
}

export function resolveOperationalProfile(context: ProfileContext): OperationalProfile {
  const agency = normalize(context.agenciaNome);
  const client = normalize(context.clienteNome);
  const campaign = normalize(context.campaignName);
  const notes = normalize(context.observacoes);

  if (agency.includes("renca") && (client.includes("secom") || campaign.includes("secom") || notes.includes("secom"))) {
    return AGENCY_PROFILES.find((profile) => profile.id === "renca-secom") ?? DEFAULT_PROFILE;
  }
  if (agency.includes("dmd")) return AGENCY_PROFILES.find((profile) => profile.id === "dmd") ?? DEFAULT_PROFILE;
  if (agency.includes("zf")) return AGENCY_PROFILES.find((profile) => profile.id === "zf") ?? DEFAULT_PROFILE;
  if (agency.includes("genius")) return AGENCY_PROFILES.find((profile) => profile.id === "genius") ?? DEFAULT_PROFILE;
  if (agency.includes("renca")) return AGENCY_PROFILES.find((profile) => profile.id === "renca") ?? DEFAULT_PROFILE;
  return DEFAULT_PROFILE;
}

export function getOperationalProfileBadges(profile: OperationalProfile) {
  const badges = [
    profile.requiresDailyPrint ? "Print diário" : "Print no período",
    profile.requiresFormalAcceptance ? "Aceite formal" : null,
    profile.requiresDetailedInvoice ? "NF detalhada" : null,
    profile.requiresArt299 ? "Art. 299" : null,
    profile.requiresSignedProof ? "Comprovante assinado" : null,
    profile.requiresAnalytics ? "Analytics" : null,
    profile.keepPiWindowsSeparated ? "Preservar janelas da PI" : null,
  ];
  return badges.filter(Boolean) as string[];
}

export function getOperationalStageGuides(
  insertion: {
    periodoInicio?: string | null;
    periodoFim?: string | null;
    clienteNome?: string | null;
    agenciaNome?: string | null;
    campanhaName?: string | null;
    observacoes?: string | null;
    receivedAt?: string | null;
    recebidoEm?: string | null;
  },
  profile = resolveOperationalProfile(insertion),
): OperationalStageGuide[] {
  const start = insertion.periodoInicio ? new Date(`${insertion.periodoInicio}T00:00:00`) : null;
  const end = insertion.periodoFim ? new Date(`${insertion.periodoFim}T00:00:00`) : null;
  const receivedRaw = insertion.recebidoEm ?? insertion.receivedAt ?? null;
  const receivedAt = receivedRaw ? new Date(`${receivedRaw}T00:00:00`) : null;
  const cadastroBase = receivedAt && !Number.isNaN(receivedAt.getTime()) ? receivedAt : start;
  const cadastroDeadline = cadastroBase ? addDays(cadastroBase, 1) : null;
  const printDeadline = profile.printRule === "daily_within_period" ? end : end;
  const envioDeadline = computeDeadline(end, profile.envioOffsetDays, profile.envioOffsetMode);
  const docsDeadline = computeDeadline(end, profile.docsOffsetDays, profile.docsOffsetMode);

  return [
    {
      key: "rascunho",
      label: "Cadastro interno",
      deadlineLabel: formatDeadline(cadastroDeadline),
      action: receivedAt
        ? "Lançar a inserção até D+1 do recebimento da demanda para não contaminar o cronograma operacional."
        : "Lançar a inserção até D+1 do início do período. Quando o sistema passar a receber a data de recebimento, ela vira a referência principal.",
      critical: true,
      assumption: !receivedAt,
    },
    {
      key: "aguardando_publicacao",
      label: "Publicação no site",
      deadlineLabel: formatDeadline(start),
      action: "Cadastrar e publicar a mídia no portal, ou deixar tudo corretamente agendado na posição certa antes do início da veiculação.",
      critical: true,
    },
    {
      key: "print_gerado",
      label: profile.requiresDailyPrint ? "Prints de comprovação" : "Comprovação da veiculação",
      deadlineLabel: formatDeadline(printDeadline),
      action: profile.requiresDailyPrint
        ? "Registrar os prints dentro do período, acompanhando os dias já vencidos. Se faltar dia passado, essa etapa já sai do trilho."
        : "Garantir a comprovação da veiculação dentro do período da inserção.",
      critical: true,
    },
    {
      key: "enviado_para_agencia",
      label: "Envio para agência",
      deadlineLabel: formatDeadline(envioDeadline),
      action: profile.requiresUrlLogoAndDate
        ? "Enviar a comprovação com visual completo do navegador, identificando site, URL e data, logo que o material estiver válido."
        : "Enviar a comprovação para a agência/cliente assim que os prints válidos estiverem fechados.",
      critical: true,
      assumption: false,
    },
    {
      key: "docs_enviados",
      label: "Documentos finais",
      deadlineLabel: formatDeadline(docsDeadline),
      action: profile.requiresDetailedInvoice
        ? "Marcar quando NF detalhada, checklist e documentos exigidos pela agência tiverem sido enviados."
        : "Marcar quando a documentação complementar tiver sido enviada.",
      critical: profile.requiresDetailedInvoice || profile.requiresFormalAcceptance,
      assumption: false,
    },
  ];
}

export function getOperationalProfileSummary(profile: OperationalProfile) {
  const tone: OperationalTone = profile.keepPiWindowsSeparated
    ? "split"
    : profile.requiresAnalytics
      ? "analytics"
      : profile.requiresDetailedInvoice || profile.requiresSignedProof || profile.requiresFormalAcceptance
        ? "documental"
        : profile.requiresDailyPrint
          ? "urgent"
          : "neutral";

  const prazoPrincipal = profile.requiresDailyPrint
    ? "Publicação e prints dentro do período"
    : "Publicação dentro do período e comprovação até o fim";
  const riscoPrincipal = profile.keepPiWindowsSeparated
    ? "Não unir linhas que a PI separou por período, bonificação ou reaplicação."
    : profile.requiresAnalytics
      ? "Não fechar a campanha sem garantir comprovante + Analytics quando a PI exigir."
      : profile.requiresDetailedInvoice || profile.requiresSignedProof
        ? "O gargalo principal é documental: comprovante final, NF e anexos da agência."
        : "O maior risco é perder o prazo operacional entre publicação, print e envio.";
  const prazoOperacional = profile.requiresDetailedInvoice || profile.requiresFormalAcceptance
    ? `Envio em ${`D+${profile.envioOffsetDays}${profile.envioOffsetMode === "business" ? " útil" : ""}`} e docs em ${`D+${profile.docsOffsetDays}${profile.docsOffsetMode === "business" ? " útil" : ""}`}.`
    : `Fluxo curto: enviar comprovação em ${`D+${profile.envioOffsetDays}${profile.envioOffsetMode === "business" ? " útil" : ""}`} e fechar docs em ${`D+${profile.docsOffsetDays}${profile.docsOffsetMode === "business" ? " útil" : ""}`}.`;

  return {
    title: profile.label,
    summary: profile.summary,
    checklist: profile.checklist,
    formHints: profile.formHints,
    badges: getOperationalProfileBadges(profile),
    docsLabel: `Docs em D+${profile.docsOffsetDays}${profile.docsOffsetMode === "business" ? " útil" : ""}`,
    envioLabel: `Envio em D+${profile.envioOffsetDays}${profile.envioOffsetMode === "business" ? " útil" : ""}`,
    tone,
    prazoPrincipal,
    riscoPrincipal,
    prazoOperacional,
    recommendationTitle: profile.keepPiWindowsSeparated
      ? "A PI pede leitura linha a linha"
      : profile.requiresAnalytics
        ? "A PI pede comprovação reforçada"
        : profile.requiresDetailedInvoice || profile.requiresFormalAcceptance
          ? "A PI pede disciplina documental"
          : "A PI pede execução operacional enxuta",
    recommendedNextStep: profile.requiresDailyPrint
      ? "Publicar no prazo, manter prints em dia e só então avançar para envio e docs."
      : "Garantir a publicação certa primeiro e não deixar a comprovação para o fim do período.",
  };
}
