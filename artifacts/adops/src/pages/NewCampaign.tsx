import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  getGetCampaignQueryKey,
  getListCampaignsQueryKey,
  useCreateCampaign,
  useCreateInsertion,
  useGetCampaign,
  useListAgencies,
  useListCampaigns,
  useListClients,
  useListSites,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/adops/Layout";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Info,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  COMPETENCIAS,
  DEFAULT_COMPETENCIA,
  FORMATO_OPTIONS,
  STATUS_CREATE_OPTIONS,
  STATUS_META,
  getCompetenciaForDate,
  getMediaKind,
} from "@/lib/adops-config";
import { getOperationalProfileSummary, resolveOperationalProfile } from "@/lib/adops-requirements";
import { cn } from "@/lib/utils";
import { useApiMode } from "@/lib/use-api-mode";

type EntryMode = "nova" | "duplicar" | "preset" | "rascunho";
type WizardStep = 0 | 1 | 2 | 3;

interface InsertionRow {
  key: number;
  siteId: string;
  localFormato: string;
  periodoInicio: string;
  periodoFim: string;
  statusNormalizado: string;
  mediaUrl: string;
  observacoes: string;
}

interface DraftPayload {
  id: string;
  nome: string;
  mode: EntryMode;
  savedAt: string;
  payload: CampaignFormState;
}

interface CampaignFormState {
  nome: string;
  clienteId: string;
  agenciaId: string;
  piCodigo: string;
  projeto: string;
  plano: string;
  planilhaRef: string;
  produto: string;
  praca: string;
  condicaoPagamento: string;
  faturamentoTipo: string;
  valorLiquido: string;
  competencia: string;
  observacoes: string;
  rows: InsertionRow[];
}

interface Preset {
  id: string;
  label: string;
  description: string;
  campaign: Partial<CampaignFormState>;
  rows: Array<Partial<InsertionRow>>;
}

let rowKey = 1000;

const DRAFTS_KEY = "adops:new-campaign-drafts:v2";
const PRESETS_KEY = "adops:new-campaign-presets:v1";

const BUILT_IN_PRESETS: Preset[] = [
  {
    id: "gov-3-sites-mega",
    label: "GOV 3 sites + Mega Topo",
    description: "Estrutura frequente para campanhas institucionais com uma inserção por portal.",
    campaign: { nome: "Campanha Institucional", competencia: DEFAULT_COMPETENCIA },
    rows: [
      { localFormato: "MEGABANNER TOPO", statusNormalizado: "aguardando_publicacao" },
      { localFormato: "MEGABANNER TOPO", statusNormalizado: "aguardando_publicacao" },
      { localFormato: "MEGABANNER TOPO", statusNormalizado: "aguardando_publicacao" },
    ],
  },
  {
    id: "banner-instagram",
    label: "Banner + Instagram",
    description: "Modelo útil quando a mesma PI pede banner e reforço em Instagram.",
    campaign: { nome: "Banner + Instagram", competencia: DEFAULT_COMPETENCIA },
    rows: [
      { localFormato: "MEGABANNER TOPO", statusNormalizado: "aguardando_publicacao" },
      { localFormato: "INSTAGRAM", statusNormalizado: "aguardando_publicacao" },
    ],
  },
  {
    id: "interior-ftd",
    label: "FTD interior",
    description: "Pacote simples para repetir cliente, agência e apenas ajustar período do mês.",
    campaign: { nome: "FTD Interior", competencia: DEFAULT_COMPETENCIA },
    rows: [
      { localFormato: "HOME 1", statusNormalizado: "aguardando_publicacao" },
      { localFormato: "HOME 2", statusNormalizado: "aguardando_publicacao" },
    ],
  },
];

const STEP_META = [
  { id: 0 as WizardStep, label: "Modo", hint: "Como esta PI vai nascer" },
  { id: 1 as WizardStep, label: "Cabeçalho", hint: "Dados principais da PI" },
  { id: 2 as WizardStep, label: "Inserções", hint: "Pacote operacional" },
  { id: 3 as WizardStep, label: "Revisão", hint: "Checagem final" },
];

const modeCards: Array<{ id: EntryMode; title: string; description: string; helper: string }> = [
  {
    id: "nova",
    title: "Nova PI do zero",
    description: "Começa limpa, com ajuda de preenchimento e grade pronta para múltiplas inserções.",
    helper: "Ideal quando o cliente mandou uma PI nova ou quando a estrutura mudou bastante.",
  },
  {
    id: "duplicar",
    title: "Duplicar PI anterior",
    description: "Puxa uma campanha existente e reaproveita cliente, agência e estrutura de inserções.",
    helper: "Melhor caminho quando a PI repete todo mês e você só quer ajustar período, mídia e observações.",
  },
  {
    id: "preset",
    title: "Usar preset",
    description: "Aplica um modelo recorrente de sites e formatos com um clique.",
    helper: "Bom para começar rápido quando ainda não existe uma PI anterior no histórico.",
  },
  {
    id: "rascunho",
    title: "Continuar rascunho",
    description: "Retoma o ponto de onde parou sem precisar reconstruir a grade.",
    helper: "Ótimo quando a demanda chegou incompleta e você quer esperar confirmação sem perder trabalho.",
  },
];

function createRow(seed?: Partial<InsertionRow>): InsertionRow {
  return {
    key: rowKey++,
    siteId: seed?.siteId ?? "",
    localFormato: seed?.localFormato ?? "",
    periodoInicio: seed?.periodoInicio ?? "",
    periodoFim: seed?.periodoFim ?? "",
    statusNormalizado: seed?.statusNormalizado ?? "aguardando_publicacao",
    mediaUrl: seed?.mediaUrl ?? "",
    observacoes: seed?.observacoes ?? "",
  };
}

function buildInitialState(): CampaignFormState {
  return {
    nome: "",
    clienteId: "",
    agenciaId: "",
    piCodigo: "",
    projeto: "",
    plano: "",
    planilhaRef: "",
    produto: "",
    praca: "",
    condicaoPagamento: "",
    faturamentoTipo: "",
    valorLiquido: "",
    competencia: DEFAULT_COMPETENCIA,
    observacoes: "",
    rows: [createRow()],
  };
}

function parseStoredDrafts(): DraftPayload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DraftPayload[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseStoredPresets(): Preset[] {
  if (typeof window === "undefined") return BUILT_IN_PRESETS;
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    if (!raw) return BUILT_IN_PRESETS;
    const parsed = JSON.parse(raw) as Preset[];
    return [...BUILT_IN_PRESETS, ...(Array.isArray(parsed) ? parsed : [])];
  } catch {
    return BUILT_IN_PRESETS;
  }
}

function normalizeMoneyInput(value: string) {
  return value.replace(/[^\d.,]/g, "").replace(",", ".");
}

function formatMoney(value: string) {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(asNumber);
}

function toFormState(source?: Partial<CampaignFormState>): CampaignFormState {
  const next = buildInitialState();
  return {
    ...next,
    ...source,
    rows: source?.rows?.length ? source.rows.map((row) => createRow(row)) : [createRow()],
  };
}

function formatDateLabel(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "short",
  }).format(date);
}

function daysInclusive(start?: string, end?: string) {
  if (!start || !end) return 0;
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return 0;
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
}

function inferCompetenciaFromDates(rows: InsertionRow[]) {
  const firstDate = rows.find((row) => row.periodoInicio)?.periodoInicio;
  if (!firstDate) return DEFAULT_COMPETENCIA;
  return getCompetenciaForDate(new Date(`${firstDate}T12:00:00`));
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cloneCampaignToForm(campaign: any): CampaignFormState {
  return toFormState({
    nome: campaign?.nome ?? "",
    clienteId: campaign?.clienteId ? String(campaign.clienteId) : "",
    agenciaId: campaign?.agenciaId ? String(campaign.agenciaId) : "",
    piCodigo: campaign?.piCodigo ?? "",
    projeto: campaign?.projeto ?? "",
    plano: campaign?.plano ?? "",
    planilhaRef: campaign?.planilhaRef ?? "",
    produto: campaign?.produto ?? "",
    praca: campaign?.praca ?? "",
    condicaoPagamento: campaign?.condicaoPagamento ?? "",
    faturamentoTipo: campaign?.faturamentoTipo ?? "",
    valorLiquido: campaign?.valorLiquido != null ? String(campaign.valorLiquido) : "",
    competencia: campaign?.competencia ?? inferCompetenciaFromDates(campaign?.insertions ?? []),
    observacoes: campaign?.observacoes ?? "",
    rows: (campaign?.insertions ?? []).map((row: any) => ({
      siteId: row.siteId ? String(row.siteId) : "",
      localFormato: row.localFormato ?? "",
      periodoInicio: row.periodoInicio ?? "",
      periodoFim: row.periodoFim ?? "",
      statusNormalizado: row.statusNormalizado ?? "aguardando_publicacao",
      mediaUrl: row.mediaUrl ?? "",
      observacoes: row.observacoes ?? "",
    })),
  });
}

function FieldLabel({ label, required, tip }: { label: string; required?: boolean; tip?: string }) {
  return (
    <label className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      <span>{label}</span>
      {required && <span className="text-destructive">*</span>}
      {tip ? <Info className="h-3 w-3 text-muted-foreground/70" title={tip} /> : null}
    </label>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement> & { label: string; tip?: string; required?: boolean }) {
  const { label, tip, required, className, ...rest } = props;
  return (
    <div>
      <FieldLabel label={label} tip={tip} required={required} />
      <input
        {...rest}
        required={required}
        className={cn(
          "w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary",
          className,
        )}
      />
    </div>
  );
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; tip?: string }) {
  const { label, tip, className, ...rest } = props;
  return (
    <div>
      <FieldLabel label={label} tip={tip} />
      <textarea
        {...rest}
        className={cn(
          "w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary",
          className,
        )}
      />
    </div>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  children,
  tip,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  tip?: string;
  required?: boolean;
}) {
  return (
    <div>
      <FieldLabel label={label} tip={tip} required={required} />
      <select
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
      >
        {children}
      </select>
    </div>
  );
}

function HelpBox({ title, children, tone = "default" }: { title: string; children: ReactNode; tone?: "default" | "warning" | "success" }) {
  const toneClass = tone === "warning"
    ? "border-amber-500/30 bg-amber-500/10"
    : tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10"
      : "border-border bg-card/70";
  return (
    <div className={cn("rounded-xl border p-4", toneClass)}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        {title}
      </div>
      <div className="space-y-2 text-xs leading-5 text-muted-foreground">{children}</div>
    </div>
  );
}

export function NewCampaign() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isReadonlyPublic, readonlyMessage, canRunProtectedMutations, protectedMutationMessage } = useApiMode();
  const protectedActionMessage = protectedMutationMessage ?? readonlyMessage ?? "Acao operacional protegida.";

  const { data: clients } = useListClients();
  const { data: agencies } = useListAgencies();
  const { data: sites } = useListSites();
  const { data: campaigns } = useListCampaigns();

  const createCampaign = useCreateCampaign();
  const createInsertion = useCreateInsertion();

  const [step, setStep] = useState<WizardStep>(0);
  const [mode, setMode] = useState<EntryMode>("nova");
  const [state, setState] = useState<CampaignFormState>(() => buildInitialState());
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [draggedKey, setDraggedKey] = useState<number | null>(null);
  const [sourceCampaignId, setSourceCampaignId] = useState<string>("");
  const [selectedDraftId, setSelectedDraftId] = useState<string>("");
  const [selectedPresetId, setSelectedPresetId] = useState<string>(BUILT_IN_PRESETS[0]?.id ?? "");
  const [drafts, setDrafts] = useState<DraftPayload[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [bulkPeriodoInicio, setBulkPeriodoInicio] = useState("");
  const [bulkPeriodoFim, setBulkPeriodoFim] = useState("");
  const [bulkFormato, setBulkFormato] = useState("");
  const [bulkStatus, setBulkStatus] = useState("aguardando_publicacao");

  const sourceCampaign = useGetCampaign(Number(sourceCampaignId), {
    query: { enabled: Boolean(sourceCampaignId) },
  });

  useEffect(() => {
    setDrafts(parseStoredDrafts());
    setPresets(parseStoredPresets());
  }, []);

  useEffect(() => {
    if (!sourceCampaign.data || mode !== "duplicar") return;
    setState(cloneCampaignToForm(sourceCampaign.data));
  }, [sourceCampaign.data, mode]);

  const currentPreset = presets.find((preset) => preset.id === selectedPresetId);
  const currentDraft = drafts.find((draft) => draft.id === selectedDraftId);

  const rows = state.rows;
  const totalPrints = rows.reduce((acc, row) => acc + daysInclusive(row.periodoInicio, row.periodoFim), 0);
  const totalSites = new Set(rows.map((row) => row.siteId).filter(Boolean)).size;
  const totalMidias = rows.filter((row) => row.mediaUrl).length;
  const totalValor = state.valorLiquido ? formatMoney(state.valorLiquido) : "R$ 0,00";
  const periodConflicts = rows.filter((row) => row.periodoInicio && row.periodoFim && row.periodoFim < row.periodoInicio);
  const missingRows = rows.filter((row) => !row.siteId || !row.localFormato || !row.periodoInicio || !row.periodoFim);

  const duplicateHints = useMemo(() => {
    const groups = [
      ...(clients ?? []).map((item) => ({ type: "cliente", id: item.id, nome: item.nome })),
      ...(agencies ?? []).map((item) => ({ type: "agência", id: item.id, nome: item.nome })),
    ];

    const collisions: Array<{ type: string; a: string; b: string }> = [];
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        if (groups[i]?.type !== groups[j]?.type) continue;
        const a = groups[i]?.nome ?? "";
        const b = groups[j]?.nome ?? "";
        if (a === b) continue;
        if (normalizeName(a) === normalizeName(b)) {
          collisions.push({ type: groups[i]!.type, a, b });
        }
      }
    }
    return collisions.slice(0, 6);
  }, [agencies, clients]);

  const selectedClient = clients?.find((client) => String(client.id) === state.clienteId) ?? null;
  const selectedAgency = agencies?.find((agency) => String(agency.id) === state.agenciaId) ?? null;
  const operationalProfile = useMemo(() => resolveOperationalProfile({
    agenciaNome: selectedAgency?.nome ?? null,
    clienteNome: selectedClient?.nome ?? null,
    campaignName: state.nome,
    faturamentoTipo: state.faturamentoTipo,
    observacoes: state.observacoes,
  }), [selectedAgency?.nome, selectedClient?.nome, state.nome, state.faturamentoTipo, state.observacoes]);
  const operationalSummary = useMemo(() => getOperationalProfileSummary(operationalProfile), [operationalProfile]);

  useEffect(() => {
    if (!operationalProfile.faturamentoPadrao || state.faturamentoTipo) return;
    setState((prev) => ({ ...prev, faturamentoTipo: operationalProfile.faturamentoPadrao ?? prev.faturamentoTipo }));
  }, [operationalProfile.faturamentoPadrao, state.faturamentoTipo]);

  function updateState<K extends keyof CampaignFormState>(field: K, value: CampaignFormState[K]) {
    setState((prev) => ({ ...prev, [field]: value }));
  }

  function updateRow(key: number, field: keyof InsertionRow, value: string) {
    setState((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    }));
  }

  function addRow(seed?: Partial<InsertionRow>) {
    setState((prev) => ({ ...prev, rows: [...prev.rows, createRow(seed)] }));
  }

  function duplicateRow(key: number) {
    const row = rows.find((item) => item.key === key);
    if (!row) return;
    addRow({ ...row });
  }

  function removeRow(key: number) {
    setState((prev) => ({
      ...prev,
      rows: prev.rows.length === 1 ? [createRow()] : prev.rows.filter((row) => row.key !== key),
    }));
    setSelectedRows((prev) => prev.filter((item) => item !== key));
  }

  function moveRow(key: number, direction: -1 | 1) {
    setState((prev) => {
      const index = prev.rows.findIndex((row) => row.key === key);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.rows.length) return prev;
      const nextRows = [...prev.rows];
      const [row] = nextRows.splice(index, 1);
      nextRows.splice(nextIndex, 0, row!);
      return { ...prev, rows: nextRows };
    });
  }

  function reorderRows(fromKey: number, toKey: number) {
    if (fromKey === toKey) return;
    setState((prev) => {
      const fromIndex = prev.rows.findIndex((row) => row.key === fromKey);
      const toIndex = prev.rows.findIndex((row) => row.key === toKey);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const nextRows = [...prev.rows];
      const [row] = nextRows.splice(fromIndex, 1);
      nextRows.splice(toIndex, 0, row!);
      return { ...prev, rows: nextRows };
    });
  }

  function toggleRow(key: number) {
    setSelectedRows((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  }

  function applyBulk(field: keyof InsertionRow, value: string) {
    if (!selectedRows.length) {
      toast({ title: "Selecione ao menos uma inserção", description: "As ações em lote funcionam sobre as linhas marcadas." });
      return;
    }
    setState((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (selectedRows.includes(row.key) ? { ...row, [field]: value } : row)),
    }));
  }

  function duplicateSelected() {
    if (!selectedRows.length) return;
    const clones = rows.filter((row) => selectedRows.includes(row.key)).map((row) => createRow(row));
    setState((prev) => ({ ...prev, rows: [...prev.rows, ...clones] }));
  }

  function removeSelected() {
    if (!selectedRows.length) return;
    setState((prev) => {
      const nextRows = prev.rows.filter((row) => !selectedRows.includes(row.key));
      return { ...prev, rows: nextRows.length ? nextRows : [createRow()] };
    });
    setSelectedRows([]);
  }

  function saveDraft() {
    const nextDraft: DraftPayload = {
      id: `${Date.now()}`,
      nome: state.nome || state.piCodigo || "Rascunho sem nome",
      mode,
      savedAt: new Date().toISOString(),
      payload: state,
    };
    const nextDrafts = [nextDraft, ...drafts].slice(0, 12);
    setDrafts(nextDrafts);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(nextDrafts));
    }
    toast({ title: "Rascunho salvo", description: "Você pode continuar depois sem perder as linhas da PI." });
  }

  function savePresetFromCurrent() {
    const label = presetName.trim() || state.nome.trim() || state.piCodigo.trim();
    if (!label) {
      toast({ title: "Nomeie o preset", description: "Dê um nome curto para facilitar o reuso da estrutura." });
      return;
    }
    const customPresets = presets.filter((preset) => !BUILT_IN_PRESETS.some((built) => built.id === preset.id));
    const nextPreset: Preset = {
      id: `custom-${Date.now()}`,
      label,
      description: presetDescription.trim() || "Preset criado a partir do formulário atual.",
      campaign: {
        nome: state.nome,
        clienteId: state.clienteId,
        agenciaId: state.agenciaId,
        projeto: state.projeto,
        plano: state.plano,
        planilhaRef: state.planilhaRef,
        produto: state.produto,
        praca: state.praca,
        condicaoPagamento: state.condicaoPagamento,
        faturamentoTipo: state.faturamentoTipo,
        competencia: state.competencia,
      },
      rows: state.rows.map((row) => ({
        siteId: row.siteId,
        localFormato: row.localFormato,
        statusNormalizado: row.statusNormalizado,
      })),
    };
    const nextCustomPresets = [nextPreset, ...customPresets].slice(0, 20);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PRESETS_KEY, JSON.stringify(nextCustomPresets));
    }
    const merged = [...BUILT_IN_PRESETS, ...nextCustomPresets];
    setPresets(merged);
    setSelectedPresetId(nextPreset.id);
    setPresetName("");
    setPresetDescription("");
    toast({ title: "Preset salvo", description: "Agora você pode iniciar novas PIs com essa estrutura." });
  }

  function applySelectedPreset() {
    if (!currentPreset) return;
    setState((prev) =>
      toFormState({
        ...prev,
        ...currentPreset.campaign,
        rows: currentPreset.rows.map((row) => ({
          siteId: row.siteId ?? "",
          localFormato: row.localFormato ?? "",
          periodoInicio: row.periodoInicio ?? "",
          periodoFim: row.periodoFim ?? "",
          statusNormalizado: row.statusNormalizado ?? "aguardando_publicacao",
          mediaUrl: row.mediaUrl ?? "",
          observacoes: row.observacoes ?? "",
        })),
      }),
    );
    toast({ title: "Preset aplicado", description: "Ajuste datas, mídia e detalhes finos antes de salvar." });
  }

  function applySelectedDraft() {
    if (!currentDraft) return;
    setState(toFormState(currentDraft.payload));
    toast({ title: "Rascunho carregado", description: "Você pode seguir do ponto em que parou." });
  }

  function validateStep(targetStep = step) {
    if (targetStep >= 1 && !state.competencia) {
      toast({ title: "Competência obrigatória", description: "Escolha a competência antes de avançar." });
      return false;
    }
    if (targetStep >= 2 && !state.nome.trim()) {
      toast({ title: "Nome da campanha obrigatório", description: "O cabeçalho precisa de um nome claro para a PI." });
      return false;
    }
    if (targetStep >= 3 && missingRows.length) {
      toast({ title: "Complete as inserções", description: "Preencha site, formato e período de todas as linhas antes de revisar." });
      return false;
    }
    return true;
  }

  function nextStep() {
    const next = Math.min(3, step + 1) as WizardStep;
    if (!validateStep(next)) return;
    setStep(next);
  }

  function previousStep() {
    setStep((prev) => Math.max(0, prev - 1) as WizardStep);
  }

  async function handleSubmit(asDraftStatus: boolean) {
    if (!canRunProtectedMutations) {
      toast({
        title: "Ação operacional protegida",
        description: protectedActionMessage,
      });
      return;
    }
    if (!validateStep(3)) return;

    const campaign = await new Promise<{ id: number }>((resolve, reject) => {
      createCampaign.mutate(
        {
          data: {
            nome: state.nome.trim(),
            clienteId: state.clienteId ? Number(state.clienteId) : null,
            agenciaId: state.agenciaId ? Number(state.agenciaId) : null,
            piCodigo: state.piCodigo.trim() || null,
            projeto: state.projeto.trim() || null,
            plano: state.plano.trim() || null,
            planilhaRef: state.planilhaRef.trim() || null,
            produto: state.produto.trim() || null,
            praca: state.praca.trim() || null,
            condicaoPagamento: state.condicaoPagamento.trim() || null,
            faturamentoTipo: state.faturamentoTipo.trim() || null,
            valorLiquido: state.valorLiquido ? Number(normalizeMoneyInput(state.valorLiquido)) : null,
            competencia: state.competencia || null,
            observacoes: state.observacoes.trim() || null,
            origem: mode === "duplicar" ? "duplicada" : mode,
          },
        },
        { onSuccess: resolve, onError: reject },
      );
    });

    for (const row of state.rows) {
      await new Promise<void>((resolve, reject) => {
        createInsertion.mutate(
          {
            data: {
              campanhaId: campaign.id,
              siteId: row.siteId ? Number(row.siteId) : null,
              localFormato: row.localFormato || null,
              localFormatoNormalizado: row.localFormato || null,
              periodoInicio: row.periodoInicio || null,
              periodoFim: row.periodoFim || null,
              statusNormalizado: asDraftStatus ? "rascunho" : row.statusNormalizado,
              observacoes: row.observacoes || null,
              mediaUrl: row.mediaUrl || null,
              bannerPublicadoNoSite: false,
              printGerado: false,
              processoEnviadoAgencia: false,
              docsEnviados: false,
            },
          },
          { onSuccess: () => resolve(), onError: reject },
        );
      });
    }

    if (typeof window !== "undefined") {
      const nextDrafts = drafts.filter((draft) => draft.id !== selectedDraftId);
      window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(nextDrafts));
      setDrafts(nextDrafts);
    }

    await Promise.all([
      qc.invalidateQueries({ queryKey: getListCampaignsQueryKey() }),
      qc.invalidateQueries({ queryKey: getGetCampaignQueryKey(campaign.id) }),
    ]);

    toast({
      title: asDraftStatus ? "Campanha criada como rascunho" : "Campanha criada com sucesso",
      description: asDraftStatus
        ? "As inserções já estão no sistema e podem ser revisadas depois."
        : "A PI foi criada com todas as inserções e já pode seguir para a operação.",
    });
    navigate(`/campanhas/${campaign.id}`);
  }

  const summaryBySite = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const label = sites?.find((site) => String(site.id) === row.siteId)?.sigla || "Sem site";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return Array.from(counts.entries());
  }, [rows, sites]);

  const summaryByFormato = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const label = row.localFormato || "Sem formato";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return Array.from(counts.entries());
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="Nova Campanha"
        subtitle="Wizard operacional por PI, com duplicação, presets, revisão inteligente e ajuda para iniciantes."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/campanhas")}
              className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </button>
            <button
              type="button"
              onClick={saveDraft}
              disabled={isReadonlyPublic}
              title={isReadonlyPublic ? readonlyMessage : undefined}
              className="flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              Salvar rascunho local
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={!canRunProtectedMutations}
              title={!canRunProtectedMutations ? protectedActionMessage : undefined}
              className="flex items-center gap-1.5 rounded border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              Criar como rascunho
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={!canRunProtectedMutations}
              title={!canRunProtectedMutations ? protectedActionMessage : undefined}
              className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Criar campanha
            </button>
          </div>
        }
      />

      <div className="mx-auto max-w-7xl space-y-6 p-6">
        {isReadonlyPublic ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
            <div className="font-semibold text-amber-50">🔒 Cadastro bloqueado no ambiente público</div>
            <div className="mt-1">{readonlyMessage}</div>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-6">
            <div className="grid gap-3 rounded-2xl border border-border bg-card/70 p-4 md:grid-cols-4">
              {STEP_META.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id > step && !validateStep(item.id)) return;
                    setStep(item.id);
                  }}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left transition",
                    step === item.id
                      ? "border-primary bg-primary/10"
                      : item.id < step
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : "border-border bg-background/40 hover:border-primary/30",
                  )}
                >
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Etapa {item.id + 1}
                  </div>
                  <div className="text-sm font-semibold text-foreground">{item.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.hint}</div>
                </button>
              ))}
            </div>

            {step === 0 ? (
              <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Como esta PI vai começar?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Escolha o modo que mais economiza cliques. A ideia aqui é evitar retrabalho quando a PI repete estrutura todo mês.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {modeCards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setMode(card.id)}
                      className={cn(
                        "rounded-2xl border p-4 text-left transition",
                        mode === card.id
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background/40 hover:border-primary/30",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-semibold text-foreground">{card.title}</div>
                        {mode === card.id ? <Check className="h-4 w-4 text-primary" /> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{card.description}</p>
                      <p className="mt-3 text-xs text-muted-foreground/80">{card.helper}</p>
                    </button>
                  ))}
                </div>

                {mode === "duplicar" ? (
                  <div className="grid gap-4 rounded-2xl border border-border bg-background/40 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div>
                      <SelectInput
                        label="Escolha a campanha anterior"
                        value={sourceCampaignId}
                        onChange={setSourceCampaignId}
                        tip="A grade será preenchida com base na campanha existente. Depois você só ajusta datas, mídia e observações."
                        required
                      >
                        <option value="">Selecione uma campanha</option>
                        {campaigns?.map((campaign) => (
                          <option key={campaign.id} value={String(campaign.id)}>
                            {campaign.nome} {campaign.competencia ? `• ${campaign.competencia}` : ""}
                          </option>
                        ))}
                      </SelectInput>
                      {sourceCampaign.data ? (
                        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-muted-foreground">
                          <div className="font-semibold text-foreground">Prévia da duplicação</div>
                          <div className="mt-1">Cliente: {sourceCampaign.data.clienteNome || "Não informado"}</div>
                          <div>Agência: {sourceCampaign.data.agenciaNome || "Não informada"}</div>
                          <div>{sourceCampaign.data.totalInsercoes} inserções serão reaproveitadas.</div>
                        </div>
                      ) : null}
                    </div>
                    <HelpBox title="Quando usar duplicação" tone="success">
                      <p>Use quando a PI repete todo mês. O sistema reaproveita cliente, agência, sites e formatos.</p>
                      <p>Depois, confira apenas período, mídia e se algum site entrou ou saiu neste mês.</p>
                    </HelpBox>
                  </div>
                ) : null}

                {mode === "preset" ? (
                  <div className="grid gap-4 rounded-2xl border border-border bg-background/40 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-3">
                      <SelectInput
                        label="Preset"
                        value={selectedPresetId}
                        onChange={setSelectedPresetId}
                        tip="Presets reduzem preenchimento repetitivo para pacotes recorrentes."
                      >
                        {presets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </SelectInput>
                      {currentPreset ? (
                        <div className="rounded-xl border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                          <div className="font-semibold text-foreground">{currentPreset.label}</div>
                          <p className="mt-1">{currentPreset.description}</p>
                          <p className="mt-2">{currentPreset.rows.length} inserções pré-montadas.</p>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={applySelectedPreset}
                        className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        Aplicar preset
                      </button>
                    </div>
                    <HelpBox title="Presets aceleram a operação">
                      <p>Um preset pode carregar cliente, agência, sites e formatos. A equipe só preenche período, mídia e observações específicas.</p>
                      <p>Mais abaixo você também pode salvar o formulário atual como novo preset, sem depender de código.</p>
                    </HelpBox>
                  </div>
                ) : null}

                {mode === "rascunho" ? (
                  <div className="grid gap-4 rounded-2xl border border-border bg-background/40 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="space-y-3">
                      <SelectInput
                        label="Rascunho salvo"
                        value={selectedDraftId}
                        onChange={setSelectedDraftId}
                        tip="Rascunhos ficam no navegador e ajudam durante implantação e depuração."
                      >
                        <option value="">Selecione um rascunho</option>
                        {drafts.map((draft) => (
                          <option key={draft.id} value={draft.id}>
                            {draft.nome} • {new Date(draft.savedAt).toLocaleString("pt-BR")}
                          </option>
                        ))}
                      </SelectInput>
                      <button
                        type="button"
                        onClick={applySelectedDraft}
                        disabled={!currentDraft}
                        className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Continuar rascunho
                      </button>
                    </div>
                    <HelpBox title="Bom para demandas incompletas">
                      <p>Use quando a agência mandou parte da PI e você precisa esperar período, mídia ou aprovação final.</p>
                      <p>O rascunho local evita repetir lançamento enquanto o fluxo ainda está sendo validado com o cliente.</p>
                    </HelpBox>
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="mb-4">
                    <h2 className="text-base font-semibold text-foreground">Cabeçalho da PI</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      A ordem aqui segue o raciocínio natural da operação: competência, dono da verba, código da PI e só depois o pacote de inserções.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <SelectInput
                      label="Competência"
                      value={state.competencia}
                      onChange={(value) => updateState("competencia", value)}
                      tip="Por padrão usamos a competência corrente, porque esse é o recorte mais consultado na operação."
                      required
                    >
                      <option value="">Selecione</option>
                      {COMPETENCIAS.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </SelectInput>
                    <SelectInput
                      label="Cliente"
                      value={state.clienteId}
                      onChange={(value) => updateState("clienteId", value)}
                      tip="Escolha da tabela mestre. Se não achar, cadastre depois em Configurações para evitar grafias soltas."
                    >
                      <option value="">Selecione</option>
                      {clients?.map((client) => (
                        <option key={client.id} value={String(client.id)}>{client.nome}</option>
                      ))}
                    </SelectInput>
                    <SelectInput
                      label="Agência"
                      value={state.agenciaId}
                      onChange={(value) => updateState("agenciaId", value)}
                      tip="Agências são recorrentes. O ideal é sempre usar o cadastro existente para manter histórico limpo."
                    >
                      <option value="">Selecione</option>
                      {agencies?.map((agency) => (
                        <option key={agency.id} value={String(agency.id)}>{agency.nome}</option>
                      ))}
                    </SelectInput>
                    <TextInput
                      label="Código PI"
                      value={state.piCodigo}
                      onChange={(event) => updateState("piCodigo", event.target.value)}
                      placeholder="Ex.: PI-3021/26"
                      tip="Se repetir uma PI recorrente, depois podemos usar esse dado para sugerir estrutura do mês anterior."
                    />
                    <TextInput
                      label="Projeto"
                      value={state.projeto}
                      onChange={(event) => updateState("projeto", event.target.value)}
                      placeholder="Ex.: Programa Fila Zero na Cirurgia"
                      tip="Algumas PIs trazem o projeto explicitamente. Isso ajuda a diferenciar campanhas parecidas dentro do mesmo cliente."
                    />
                    <TextInput
                      label="Plano"
                      value={state.plano}
                      onChange={(event) => updateState("plano", event.target.value)}
                      placeholder="Ex.: 14676"
                      tip="Campo útil para rastrear o número do plano quando a agência usa esse identificador."
                    />
                    <TextInput
                      label="Planilha / referência"
                      value={state.planilhaRef}
                      onChange={(event) => updateState("planilhaRef", event.target.value)}
                      placeholder="Ex.: 66465"
                      tip="Algumas PIs carregam uma referência de planilha ou pedido. Guarde aqui para facilitar auditoria."
                    />
                    <div className="md:col-span-2">
                      <TextInput
                        label="Nome da campanha"
                        value={state.nome}
                        onChange={(event) => updateState("nome", event.target.value)}
                        placeholder="Ex.: DENGUE - PREF CBA"
                        required
                        tip="Use o nome de negócio que a equipe reconhece rápido. Isso ajuda filtros, revisão e conferência de prints."
                      />
                    </div>
                    <TextInput
                      label="Valor líquido total"
                      value={state.valorLiquido}
                      onChange={(event) => updateState("valorLiquido", normalizeMoneyInput(event.target.value))}
                      placeholder="45000.00"
                      tip="Valor da PI inteira. Mesmo quando a inserção é dividida em vários sites, mantenha o total aqui para referência gerencial."
                    />
                    <TextInput
                      label="Produto"
                      value={state.produto}
                      onChange={(event) => updateState("produto", event.target.value)}
                      placeholder="Ex.: Site / Banner interno notícias"
                      tip="Use quando a PI explicitar o produto comercial contratado."
                    />
                    <TextInput
                      label="Praça"
                      value={state.praca}
                      onChange={(event) => updateState("praca", event.target.value)}
                      placeholder="Ex.: Cuiabá"
                      tip="Praça comercial ajuda quando a mesma agência compra para regiões diferentes."
                    />
                    <TextInput
                      label="Condição de pagamento"
                      value={state.condicaoPagamento}
                      onChange={(event) => updateState("condicaoPagamento", event.target.value)}
                      placeholder="Ex.: 15 DFM"
                      tip="Se vier na PI, vale preencher para a equipe financeira não precisar voltar ao PDF."
                    />
                    <SelectInput
                      label="Faturamento"
                      value={state.faturamentoTipo}
                      onChange={(value) => updateState("faturamentoTipo", value)}
                      tip="As PIs mostraram que essa regra muda por agência e, às vezes, por cliente."
                    >
                      <option value="">Selecione</option>
                      <option value="agencia">Faturar para agência</option>
                      <option value="cliente">Faturar direto para cliente</option>
                      <option value="a_confirmar">A confirmar</option>
                    </SelectInput>
                    <div className="md:col-span-2">
                      <TextArea
                        label="Observações gerais"
                        value={state.observacoes}
                        onChange={(event) => updateState("observacoes", event.target.value)}
                        rows={4}
                        placeholder="Ex.: campanha recorrente, criativos chegam por Drive, aprovar com cliente antes do envio final."
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <HelpBox title={`Perfil operacional: ${operationalSummary.title}`} tone="success">
                    <p>{operationalSummary.summary}</p>
                    <p><strong>Leitura principal da PI:</strong> {operationalSummary.prazoPrincipal}</p>
                    <p><strong>Envio:</strong> {operationalSummary.envioLabel}</p>
                    <p><strong>Docs:</strong> {operationalSummary.docsLabel}</p>
                    <p><strong>Risco principal:</strong> {operationalSummary.riscoPrincipal}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {operationalSummary.badges.map((badge) => (
                        <span key={badge} className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {badge}
                        </span>
                      ))}
                    </div>
                  </HelpBox>
                  <HelpBox title="Como um estagiário deve pensar esta etapa" tone="success">
                    <p>Primeiro identifique o dono da demanda: cliente, agência e competência. Isso evita cadastrar a campanha no mês errado.</p>
                    <p>O código da PI é a âncora de rastreio. Se você não tiver certeza dele, pode deixar para complementar depois, mas o nome da campanha deve ser claro.</p>
                    <p><strong>Próximo passo recomendado:</strong> {operationalSummary.recommendedNextStep}</p>
                  </HelpBox>
                  <HelpBox title="Exemplo prático">
                    <p><strong>Competência:</strong> ABRIL/2026</p>
                    <p><strong>Cliente:</strong> Governo do Estado</p>
                    <p><strong>Agência:</strong> Renca</p>
                    <p><strong>Faturamento:</strong> Direto cliente</p>
                    <p><strong>Campanha:</strong> HOSPITAL CENTRAL</p>
                  </HelpBox>
                  {duplicateHints.length ? (
                    <HelpBox title="Possíveis grafias para revisar" tone="warning">
                      {duplicateHints.map((hint, index) => (
                        <p key={`${hint.a}-${hint.b}-${index}`}>`{hint.type}`: "{hint.a}" e "{hint.b}" parecem ser o mesmo cadastro.</p>
                      ))}
                      <p>Isso não trava o cadastro, mas vale corrigir em Configurações para limpar o histórico.</p>
                    </HelpBox>
                  ) : null}
                  <HelpBox title="Regras já aprendidas desta combinação">
                    {operationalSummary.formHints.map((item) => <p key={item}>• {item}</p>)}
                  </HelpBox>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Inserções da PI</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Esta grade foi pensada para repetir estrutura, ajustar datas rápido e evitar recadastrar o mesmo padrão várias vezes.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => addRow()}
                        className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Nova linha
                      </button>
                      <button
                        type="button"
                        onClick={duplicateSelected}
                        className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Duplicar seleção
                      </button>
                      <button
                        type="button"
                        onClick={removeSelected}
                        className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 text-xs font-medium text-destructive hover:border-destructive/40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover seleção
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 rounded-2xl border border-border bg-background/40 p-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <TextInput
                          label="Período em lote: início"
                          type="date"
                          value={bulkPeriodoInicio}
                          onChange={(event) => setBulkPeriodoInicio(event.target.value)}
                        />
                        <TextInput
                          label="Período em lote: fim"
                          type="date"
                          value={bulkPeriodoFim}
                          onChange={(event) => setBulkPeriodoFim(event.target.value)}
                        />
                        <SelectInput label="Formato em lote" value={bulkFormato} onChange={setBulkFormato}>
                          <option value="">Selecione</option>
                          {FORMATO_OPTIONS.map((item) => (
                            <option key={item} value={item}>{item}</option>
                          ))}
                        </SelectInput>
                        <SelectInput label="Status inicial em lote" value={bulkStatus} onChange={setBulkStatus}>
                          {STATUS_CREATE_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                          ))}
                        </SelectInput>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => bulkPeriodoInicio && applyBulk("periodoInicio", bulkPeriodoInicio)} className="rounded border border-border px-3 py-1.5 text-xs text-foreground">Aplicar início</button>
                        <button type="button" onClick={() => bulkPeriodoFim && applyBulk("periodoFim", bulkPeriodoFim)} className="rounded border border-border px-3 py-1.5 text-xs text-foreground">Aplicar fim</button>
                        <button type="button" onClick={() => bulkFormato && applyBulk("localFormato", bulkFormato)} className="rounded border border-border px-3 py-1.5 text-xs text-foreground">Aplicar formato</button>
                        <button type="button" onClick={() => applyBulk("statusNormalizado", bulkStatus)} className="rounded border border-border px-3 py-1.5 text-xs text-foreground">Aplicar status</button>
                      </div>
                    </div>
                    <HelpBox title="Ações em lote economizam tempo">
                      <p>Marque várias linhas para aplicar o mesmo período ou formato quando a agência manda uma PI com muitos sites.</p>
                      <p>Se a campanha já tem mídia definida, você também pode colar a URL direto em cada linha e revisar tudo no passo seguinte.</p>
                      {operationalProfile.keepPiWindowsSeparated ? (
                        <p><strong>Importante:</strong> para este perfil, janelas separadas da PI não devem ser unidas por facilidade.</p>
                      ) : null}
                      <p><strong>Prazo principal desta PI:</strong> {operationalSummary.prazoPrincipal}</p>
                    </HelpBox>
                  </div>

                  <div className="mt-5 space-y-3">
                    {rows.map((row, index) => {
                      const mediaKind = getMediaKind(row.mediaUrl);
                      return (
                        <div
                          key={row.key}
                          draggable
                          onDragStart={() => setDraggedKey(row.key)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (draggedKey != null) reorderRows(draggedKey, row.key);
                            setDraggedKey(null);
                          }}
                          className={cn(
                            "rounded-2xl border p-4 transition",
                            selectedRows.includes(row.key) ? "border-primary bg-primary/5" : "border-border bg-background/50",
                          )}
                        >
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => toggleRow(row.key)} className={cn("rounded-full border px-2 py-1 text-[11px] font-semibold", selectedRows.includes(row.key) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{selectedRows.includes(row.key) ? "Selecionada" : "Selecionar"}</button>
                            <span className="rounded bg-muted px-2 py-1 text-[11px] font-mono text-muted-foreground">#{index + 1}</span>
                            <span className={cn("rounded-full border px-2 py-1 text-[11px] font-medium", STATUS_META[row.statusNormalizado]?.badgeClass || STATUS_META.rascunho.badgeClass)}>{STATUS_META[row.statusNormalizado]?.label || row.statusNormalizado}</span>
                            <span className={cn("rounded-full border px-2 py-1 text-[11px] font-medium", mediaKind !== "none" ? "border-sky-500/30 bg-sky-500/10 text-sky-300" : "border-border bg-card text-muted-foreground")}>{mediaKind === "none" ? "Sem mídia" : `Mídia: ${mediaKind.toUpperCase()}`}</span>
                            <div className="ml-auto flex items-center gap-1">
                              <button type="button" onClick={() => moveRow(row.key, -1)} className="rounded border border-border p-1 text-muted-foreground hover:text-foreground"><ChevronUp className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => moveRow(row.key, 1)} className="rounded border border-border p-1 text-muted-foreground hover:text-foreground"><ChevronDown className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => duplicateRow(row.key)} className="rounded border border-border p-1 text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => removeRow(row.key)} className="rounded border border-border p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                              <span className="rounded border border-border p-1 text-muted-foreground" title="Arraste para reordenar"><GripVertical className="h-3.5 w-3.5" /></span>
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <SelectInput label="Site" value={row.siteId} onChange={(value) => updateRow(row.key, "siteId", value)} required tip="O site define onde o banner será cadastrado e onde o print será cobrado.">
                              <option value="">Selecione</option>
                              {sites?.map((site) => (
                                <option key={site.id} value={String(site.id)}>{site.sigla} • {site.nome}</option>
                              ))}
                            </SelectInput>
                            <SelectInput label="Formato / local" value={row.localFormato} onChange={(value) => updateRow(row.key, "localFormato", value)} required tip="O formato impacta o tipo de mídia e a expectativa operacional de prova.">
                              <option value="">Selecione</option>
                              {FORMATO_OPTIONS.map((item) => (
                                <option key={item} value={item}>{item}</option>
                              ))}
                            </SelectInput>
                            <SelectInput label="Status inicial" value={row.statusNormalizado} onChange={(value) => updateRow(row.key, "statusNormalizado", value)} tip="Na maior parte dos casos a inserção nasce em Aguardando publicação.">
                              {STATUS_CREATE_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                              ))}
                            </SelectInput>
                            <TextInput label="Início" type="date" value={row.periodoInicio} onChange={(event) => updateRow(row.key, "periodoInicio", event.target.value)} required tip="O início define quando a cobrança operacional começa e quantos prints já são esperados." />
                            <TextInput label="Fim" type="date" value={row.periodoFim} onChange={(event) => updateRow(row.key, "periodoFim", event.target.value)} required tip="O fim define o volume total de prints previstos e também o prazo D+1 de envio para agência." />
                            <TextInput label="URL da mídia" value={row.mediaUrl} onChange={(event) => updateRow(row.key, "mediaUrl", event.target.value)} placeholder="https://..." tip="Aceita imagem, GIF ou vídeo. Essa URL será mostrada no detalhe para facilitar conferência e print." />
                            <div className="md:col-span-2 xl:col-span-3">
                              <TextArea label="Observações da inserção" value={row.observacoes} onChange={(event) => updateRow(row.key, "observacoes", event.target.value)} rows={2} placeholder="Ex.: agendar para topo, criativo alterna no meio do período, campanha depende de aprovação do cliente." />
                            </div>
                          </div>

                          <div className="mt-3 rounded-xl border border-border bg-card/60 p-3 text-xs text-muted-foreground">
                            <div>Período: <span className="text-foreground">{formatDateLabel(row.periodoInicio)}</span> até <span className="text-foreground">{formatDateLabel(row.periodoFim)}</span></div>
                            <div>Prints esperados: <span className="text-foreground">{daysInclusive(row.periodoInicio, row.periodoFim)}</span></div>
                            <div>O que muda se você alterar o formato: <span className="text-foreground">a equipe pode mudar posição, mídia e padrão de comprovação.</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Revisão inteligente</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Antes de criar, confira os pontos que mais costumam gerar retrabalho na planilha atual.</p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-border bg-background/50 p-4">
                      <div className="text-xs uppercase tracking-widest text-muted-foreground">Inserções</div>
                      <div className="mt-2 text-2xl font-bold text-foreground">{rows.length}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-background/50 p-4">
                      <div className="text-xs uppercase tracking-widest text-muted-foreground">Sites únicos</div>
                      <div className="mt-2 text-2xl font-bold text-foreground">{totalSites}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-background/50 p-4">
                      <div className="text-xs uppercase tracking-widest text-muted-foreground">Prints previstos</div>
                      <div className="mt-2 text-2xl font-bold text-foreground">{totalPrints}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-background/50 p-4">
                      <div className="text-xs uppercase tracking-widest text-muted-foreground">Mídias já anexadas</div>
                      <div className="mt-2 text-2xl font-bold text-foreground">{totalMidias}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="text-sm font-semibold text-foreground">Resumo da PI</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm text-muted-foreground">
                      <div><span className="text-foreground">Campanha:</span> {state.nome || "Não informada"}</div>
                      <div><span className="text-foreground">Competência:</span> {state.competencia || "Não informada"}</div>
                      <div><span className="text-foreground">Cliente:</span> {clients?.find((client) => String(client.id) === state.clienteId)?.nome || "Não informado"}</div>
                      <div><span className="text-foreground">Agência:</span> {agencies?.find((agency) => String(agency.id) === state.agenciaId)?.nome || "Não informada"}</div>
                      <div><span className="text-foreground">PI:</span> {state.piCodigo || "Não informada"}</div>
                      <div><span className="text-foreground">Projeto:</span> {state.projeto || "Não informado"}</div>
                      <div><span className="text-foreground">Plano:</span> {state.plano || "Não informado"}</div>
                      <div><span className="text-foreground">Planilha:</span> {state.planilhaRef || "Não informada"}</div>
                      <div><span className="text-foreground">Produto:</span> {state.produto || "Não informado"}</div>
                      <div><span className="text-foreground">Praça:</span> {state.praca || "Não informada"}</div>
                      <div><span className="text-foreground">Faturamento:</span> {state.faturamentoTipo || "Não informado"}</div>
                      <div><span className="text-foreground">Valor:</span> {totalValor}</div>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <HelpBox title="Distribuição por site">
                      {summaryBySite.map(([label, count]) => <p key={label}>{label}: {count}</p>)}
                    </HelpBox>
                    <HelpBox title="Distribuição por formato">
                      {summaryByFormato.map(([label, count]) => <p key={label}>{label}: {count}</p>)}
                    </HelpBox>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <HelpBox title="Checklist antes de salvar" tone={missingRows.length || periodConflicts.length ? "warning" : "success"}>
                      <p>{missingRows.length ? `${missingRows.length} inserção(ões) com campos obrigatórios faltando.` : "Todos os campos obrigatórios das inserções estão preenchidos."}</p>
                      <p>{periodConflicts.length ? `${periodConflicts.length} inserção(ões) com fim anterior ao início.` : "Nenhum conflito de período identificado."}</p>
                      <p>{totalMidias < rows.length ? "Ainda existem inserções sem mídia cadastrada. Isso não bloqueia, mas reduz a conferência visual." : "Todas as inserções já possuem mídia de referência."}</p>
                    </HelpBox>
                    <HelpBox title="O que acontece depois do salvar">
                      <p>A campanha nasce no fluxo operacional com status inicial por inserção.</p>
                      <p>Na página de inserção, a equipe vai publicar, gerar prints diários, enviar para a agência e concluir documentação.</p>
                    </HelpBox>
                  </div>

                  <div className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="mb-3 text-sm font-semibold text-foreground">Salvar estrutura como preset</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <TextInput label="Nome do preset" value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Ex.: GOV 3 portais" />
                      <TextInput label="Descrição curta" value={presetDescription} onChange={(event) => setPresetDescription(event.target.value)} placeholder="Ex.: pacote recorrente com banner topo" />
                    </div>
                    <button type="button" onClick={savePresetFromCurrent} disabled={isReadonlyPublic} title={isReadonlyPublic ? readonlyMessage : undefined} className="mt-3 inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60">
                      <Wand2 className="h-3.5 w-3.5" />
                      Salvar como preset
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <HelpBox title="Checklist operacional desta PI" tone="success">
                    {operationalSummary.checklist.map((item) => <p key={item}>• {item}</p>)}
                  </HelpBox>
                  <HelpBox title="Como um estagiário deve validar esta etapa" tone="success">
                    <p>Confira se a PI está na competência certa, se cliente e agência vieram do cadastro correto e se cada linha tem site, formato e período.</p>
                    <p>Se a agência mandou três sites, o sistema também precisa ter três linhas. Esta revisão existe justamente para não depender de memória.</p>
                    <p><strong>Regra de prazo:</strong> {operationalSummary.prazoOperacional}</p>
                  </HelpBox>
                  <HelpBox title="Exemplos para confirmar com o cliente" tone="warning">
                    <p>Se uma PI trouxer banner e Instagram juntos, confirme se ambos geram a mesma rotina de print.</p>
                    <p>Se o período não for contínuo, confirme se vamos precisar quebrar em mais de uma inserção em vez de uma linha única.</p>
                    <p><strong>Risco principal:</strong> {operationalSummary.riscoPrincipal}</p>
                  </HelpBox>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="text-sm text-muted-foreground">
                {step === 0 ? "Escolha o modo que reduz mais cliques para esta PI." : step === 1 ? "Preencha o cabeçalho uma vez. O restante será distribuído para as inserções." : step === 2 ? "Monte a grade, use seleção múltipla e revise datas com calma." : "Se a revisão estiver limpa, a campanha já pode entrar no fluxo operacional."}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={previousStep} disabled={step === 0} className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 text-xs font-medium text-foreground disabled:opacity-50">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar
                </button>
                {step < 3 ? (
                  <button type="button" onClick={nextStep} className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
                    Avançar
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                    <button type="button" onClick={() => handleSubmit(false)} disabled={!canRunProtectedMutations} title={!canRunProtectedMutations ? protectedActionMessage : undefined} className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">
                    Criar campanha
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <HelpBox title="Resumo em tempo real" tone="success">
              <p><strong>Competência:</strong> {state.competencia || "Não definida"}</p>
              <p><strong>PI:</strong> {state.piCodigo || "Sem código"}</p>
              <p><strong>Projeto:</strong> {state.projeto || "Não informado"}</p>
              <p><strong>Faturamento:</strong> {state.faturamentoTipo || "Não informado"}</p>
              <p><strong>Inserções:</strong> {rows.length}</p>
              <p><strong>Prints previstos:</strong> {totalPrints}</p>
              <p><strong>Valor:</strong> {totalValor}</p>
            </HelpBox>
            <HelpBox title={`Perfil ativo: ${operationalSummary.title}`}>
              <p>{operationalSummary.summary}</p>
              <p><strong>Leitura principal:</strong> {operationalSummary.prazoPrincipal}</p>
              <p><strong>Envio:</strong> {operationalSummary.envioLabel}</p>
              <p><strong>Docs:</strong> {operationalSummary.docsLabel}</p>
              {operationalSummary.badges.map((badge) => <p key={badge}>• {badge}</p>)}
            </HelpBox>
            <HelpBox title="Regras operacionais lembradas na tela">
              <p>PI recorrente merece duplicação ou preset para evitar redigitar cabeçalho e linhas.</p>
              <p>Se o período mudar, o total de prints previstos muda automaticamente.</p>
              <p>Se a mídia já estiver disponível, salvar a URL agora ajuda a conferência de cadastro e print depois.</p>
            </HelpBox>
            <HelpBox title="Dicas rápidas">
              <p>Clique em “Selecionar” para aplicar ações em lote.</p>
              <p>Use as setas ou arraste a linha quando a ordem da PI precisar acompanhar o material do cliente.</p>
              <p>Salvar rascunho local é útil durante implantação, quando ainda estamos depurando regras com o cliente.</p>
            </HelpBox>
          </aside>
        </div>
      </div>
    </div>
  );
}
