import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useMemo, useState } from "react";
import {
  getListAgenciesQueryKey,
  getListCampaignsQueryKey,
  getListClientsQueryKey,
  getListInsertionsQueryKey,
  getListSitesQueryKey,
  useCreateAgency,
  useCreateClient,
  useCreateSite,
  useListAgencies,
  useListCampaigns,
  useListClients,
  useListInsertions,
  useListSites,
  useUpdateAgency,
  useUpdateCampaign,
  useUpdateClient,
  useUpdateInsertion,
  useUpdateSite,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/adops/Layout";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useApiMode } from "@/lib/use-api-mode";
import { ArrowRightLeft, Check, Pencil, Plus, Save, Search, Sparkles } from "lucide-react";

type TabKey = "agencies" | "clients" | "sites";

type AgencyDraft = {
  nome: string;
  razaoSocial: string;
  cnpj: string;
  telefone: string;
  whatsapp: string;
  email: string;
  emailFaturamento: string;
  endereco: string;
  cidade: string;
  uf: string;
  cep: string;
  prazoPagamento: string;
  prazoEnvioDocs: string;
  descontoPadraoPercentual: string;
  instrucoesFaturamento: string;
  exigeAceiteFormal: boolean;
  exigeNotaFiscalDetalhada: boolean;
  exigeDeclaracaoArt299: boolean;
  exigeComprovanteAssinado: boolean;
  exigePrintDiario: boolean;
};

type ClientDraft = {
  nome: string;
  razaoSocial: string;
  cnpj: string;
  telefone: string;
  whatsapp: string;
  email: string;
  emailFaturamento: string;
  endereco: string;
  cidade: string;
  uf: string;
  cep: string;
  contatoResponsavel: string;
  cargoResponsavel: string;
  prazoPagamento: string;
  prazoEnvioDocs: string;
  faturamentoTipoPadrao: string;
  instrucoesFaturamento: string;
  observacoes: string;
  exigeAceiteFormal: boolean;
  exigeNotaFiscalDetalhada: boolean;
  exigeDeclaracaoArt299: boolean;
  exigeComprovanteAssinado: boolean;
  exigePrintDiario: boolean;
};

type SiteDraft = {
  nome: string;
  sigla: string;
  dominio: string;
  siteUrl: string;
  artigoExemploUrl: string;
  logoUrl: string;
  serverLabel: string;
  sshHost: string;
  sshPort: string;
  sshUser: string;
  webrootPath: string;
  wpPath: string;
  wpCliPath: string;
  phpBin: string;
  tablePrefix: string;
  adrotateVersao: string;
  cloudflareZoneId: string;
  cloudflareProjectName: string;
  pagesSubdomain: string;
  spacesBucket: string;
  spacesBasePath: string;
  maintenanceWorkspacePath: string;
  deploymentNotes: string;
};

function buildAgencyDraft(agency?: any): AgencyDraft {
  return {
    nome: agency?.nome ?? "",
    razaoSocial: agency?.razaoSocial ?? "",
    cnpj: agency?.cnpj ?? "",
    telefone: agency?.telefone ?? "",
    whatsapp: agency?.whatsapp ?? "",
    email: agency?.email ?? "",
    emailFaturamento: agency?.emailFaturamento ?? "",
    endereco: agency?.endereco ?? "",
    cidade: agency?.cidade ?? "",
    uf: agency?.uf ?? "",
    cep: agency?.cep ?? "",
    prazoPagamento: agency?.prazoPagamento ?? "",
    prazoEnvioDocs: agency?.prazoEnvioDocs ?? "",
    descontoPadraoPercentual: agency?.descontoPadraoPercentual ?? "",
    instrucoesFaturamento: agency?.instrucoesFaturamento ?? "",
    exigeAceiteFormal: Boolean(agency?.exigeAceiteFormal),
    exigeNotaFiscalDetalhada: Boolean(agency?.exigeNotaFiscalDetalhada),
    exigeDeclaracaoArt299: Boolean(agency?.exigeDeclaracaoArt299),
    exigeComprovanteAssinado: Boolean(agency?.exigeComprovanteAssinado),
    exigePrintDiario: Boolean(agency?.exigePrintDiario),
  };
}

function buildClientDraft(client?: any): ClientDraft {
  return {
    nome: client?.nome ?? "",
    razaoSocial: client?.razaoSocial ?? "",
    cnpj: client?.cnpj ?? "",
    telefone: client?.telefone ?? "",
    whatsapp: client?.whatsapp ?? "",
    email: client?.email ?? "",
    emailFaturamento: client?.emailFaturamento ?? "",
    endereco: client?.endereco ?? "",
    cidade: client?.cidade ?? "",
    uf: client?.uf ?? "",
    cep: client?.cep ?? "",
    contatoResponsavel: client?.contatoResponsavel ?? "",
    cargoResponsavel: client?.cargoResponsavel ?? "",
    prazoPagamento: client?.prazoPagamento ?? "",
    prazoEnvioDocs: client?.prazoEnvioDocs ?? "",
    faturamentoTipoPadrao: client?.faturamentoTipoPadrao ?? "",
    instrucoesFaturamento: client?.instrucoesFaturamento ?? "",
    observacoes: client?.observacoes ?? "",
    exigeAceiteFormal: Boolean(client?.exigeAceiteFormal),
    exigeNotaFiscalDetalhada: Boolean(client?.exigeNotaFiscalDetalhada),
    exigeDeclaracaoArt299: Boolean(client?.exigeDeclaracaoArt299),
    exigeComprovanteAssinado: Boolean(client?.exigeComprovanteAssinado),
    exigePrintDiario: Boolean(client?.exigePrintDiario),
  };
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      aria-label={props["aria-label"] ?? (typeof props.placeholder === "string" ? props.placeholder : undefined)}
      className={cn(
        "w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary",
        props.className,
      )}
    />
  );
}

function TextareaInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      aria-label={props["aria-label"] ?? (typeof props.placeholder === "string" ? props.placeholder : undefined)}
      className={cn(
        "min-h-[92px] w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary",
        props.className,
      )}
    />
  );
}

function buildSiteDraft(site?: any): SiteDraft {
  return {
    nome: site?.nome ?? "",
    sigla: site?.sigla ?? "",
    dominio: site?.dominio ?? "",
    siteUrl: site?.siteUrl ?? "",
    artigoExemploUrl: site?.artigoExemploUrl ?? "",
    logoUrl: site?.logoUrl ?? "",
    serverLabel: site?.serverLabel ?? "",
    sshHost: site?.sshHost ?? "",
    sshPort: site?.sshPort ?? "",
    sshUser: site?.sshUser ?? "",
    webrootPath: site?.webrootPath ?? "",
    wpPath: site?.wpPath ?? "",
    wpCliPath: site?.wpCliPath ?? "",
    phpBin: site?.phpBin ?? "",
    tablePrefix: site?.tablePrefix ?? "",
    adrotateVersao: site?.adrotateVersao ?? "",
    cloudflareZoneId: site?.cloudflareZoneId ?? "",
    cloudflareProjectName: site?.cloudflareProjectName ?? "",
    pagesSubdomain: site?.pagesSubdomain ?? "",
    spacesBucket: site?.spacesBucket ?? "",
    spacesBasePath: site?.spacesBasePath ?? "",
    maintenanceWorkspacePath: site?.maintenanceWorkspacePath ?? "",
    deploymentNotes: site?.deploymentNotes ?? "",
  };
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        {title}
      </div>
      {children}
    </div>
  );
}

function FieldBlock({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <div className="text-xs font-medium text-foreground">{label}</div>
      {children}
      {hint ? <div className="text-[11px] leading-relaxed text-muted-foreground">{hint}</div> : null}
    </label>
  );
}

function SectionLegend({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <div className="text-xs font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</div>
    </div>
  );
}

export function Settings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isReadonlyPublic, readonlyMessage, canRunProtectedMutations, protectedMutationMessage } = useApiMode();
  const protectedSettingsMessage = protectedMutationMessage ?? readonlyMessage ?? "Acao operacional protegida.";

  const [tab, setTab] = useState<TabKey>("agencies");
  const [search, setSearch] = useState("");
  const [newAgencyName, setNewAgencyName] = useState("");
  const [newClientDraft, setNewClientDraft] = useState<ClientDraft>(() => buildClientDraft());
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteSigla, setNewSiteSigla] = useState("");
  const [newSiteDomain, setNewSiteDomain] = useState("");
  const [editingKey, setEditingKey] = useState<string>("");
  const [agencyDraft, setAgencyDraft] = useState<AgencyDraft>(() => buildAgencyDraft());
  const [clientDraft, setClientDraft] = useState<ClientDraft>(() => buildClientDraft());
  const [siteDraft, setSiteDraft] = useState<SiteDraft>(() => buildSiteDraft());
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [isMerging, setIsMerging] = useState(false);

  const { data: agencies } = useListAgencies();
  const { data: clients } = useListClients();
  const { data: sites } = useListSites();
  const { data: campaigns } = useListCampaigns();
  const { data: insertions } = useListInsertions();

  const createAgency = useCreateAgency();
  const createClient = useCreateClient();
  const createSite = useCreateSite();
  const updateAgency = useUpdateAgency();
  const updateClient = useUpdateClient();
  const updateSite = useUpdateSite();
  const updateCampaign = useUpdateCampaign();
  const updateInsertion = useUpdateInsertion();

  const agencyCounts = useMemo(() => {
    const counts = new Map<number, number>();
    (campaigns ?? []).forEach((campaign) => {
      if (campaign.agenciaId) counts.set(campaign.agenciaId, (counts.get(campaign.agenciaId) ?? 0) + 1);
    });
    return counts;
  }, [campaigns]);

  const clientCounts = useMemo(() => {
    const counts = new Map<number, number>();
    (campaigns ?? []).forEach((campaign) => {
      if (campaign.clienteId) counts.set(campaign.clienteId, (counts.get(campaign.clienteId) ?? 0) + 1);
    });
    return counts;
  }, [campaigns]);

  const siteCounts = useMemo(() => {
    const counts = new Map<number, number>();
    (insertions ?? []).forEach((insertion) => {
      if (insertion.siteId) counts.set(insertion.siteId, (counts.get(insertion.siteId) ?? 0) + 1);
    });
    return counts;
  }, [insertions]);

  const duplicateSuggestions = useMemo(() => {
    const source = tab === "agencies" ? agencies ?? [] : tab === "clients" ? clients ?? [] : sites ?? [];
    const collisions: Array<{ a: string; b: string }> = [];
    for (let i = 0; i < source.length; i += 1) {
      for (let j = i + 1; j < source.length; j += 1) {
        const a = source[i];
        const b = source[j];
        const left = `${"sigla" in a ? `${a.sigla} ` : ""}${a.nome}`.trim();
        const right = `${"sigla" in b ? `${b.sigla} ` : ""}${b.nome}`.trim();
        if (left === right) continue;
        if (normalizeName(left) === normalizeName(right)) collisions.push({ a: left, b: right });
      }
    }
    return collisions.slice(0, 8);
  }, [agencies, clients, sites, tab]);

  const filteredAgencies = (agencies ?? []).filter((item) => !search || item.nome.toLowerCase().includes(search.toLowerCase()));
  const filteredClients = (clients ?? []).filter((item) => !search || item.nome.toLowerCase().includes(search.toLowerCase()));
  const filteredSites = (sites ?? []).filter((item) => {
    const haystack = `${item.sigla} ${item.nome}`.toLowerCase();
    return !search || haystack.includes(search.toLowerCase());
  });

  function mergePreferredText(targetValue: unknown, sourceValue: unknown) {
    const target = typeof targetValue === "string" ? targetValue.trim() : "";
    if (target) return targetValue;
    const source = typeof sourceValue === "string" ? sourceValue.trim() : "";
    return source ? sourceValue : null;
  }

  function clientCompleteness(client: any) {
    const checklist = [
      client.razaoSocial,
      client.cnpj,
      client.emailFaturamento ?? client.email,
      client.contatoResponsavel,
      client.prazoEnvioDocs,
      client.faturamentoTipoPadrao,
    ];
    const filled = checklist.filter((item) => typeof item === "string" && item.trim()).length;
    return Math.round((filled / checklist.length) * 100);
  }

  async function refreshAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getListAgenciesQueryKey() }),
      qc.invalidateQueries({ queryKey: getListClientsQueryKey() }),
      qc.invalidateQueries({ queryKey: getListSitesQueryKey() }),
      qc.invalidateQueries({ queryKey: getListCampaignsQueryKey() }),
      qc.invalidateQueries({ queryKey: getListInsertionsQueryKey() }),
    ]);
  }

  async function handleCreateAgency() {
    if (!canRunProtectedMutations) {
      toast({ title: "Ação operacional protegida", description: protectedSettingsMessage });
      return;
    }
    if (!newAgencyName.trim()) return;
    await new Promise<void>((resolve, reject) => {
      createAgency.mutate({ data: { nome: newAgencyName.trim(), ativo: true } }, { onSuccess: () => resolve(), onError: reject });
    });
    setNewAgencyName("");
    await refreshAll();
    toast({ title: "Agência criada", description: "A tabela mestre já está pronta para uso no formulário." });
  }

  async function handleCreateClient() {
    if (!canRunProtectedMutations) {
      toast({ title: "Ação operacional protegida", description: protectedSettingsMessage });
      return;
    }
    if (!newClientDraft.nome.trim()) return;
    await new Promise<void>((resolve, reject) => {
      createClient.mutate({
        data: {
          nome: newClientDraft.nome.trim(),
          razaoSocial: newClientDraft.razaoSocial.trim() || null,
          cnpj: newClientDraft.cnpj.trim() || null,
          telefone: newClientDraft.telefone.trim() || null,
          whatsapp: newClientDraft.whatsapp.trim() || null,
          email: newClientDraft.email.trim() || null,
          emailFaturamento: newClientDraft.emailFaturamento.trim() || null,
          endereco: newClientDraft.endereco.trim() || null,
          cidade: newClientDraft.cidade.trim() || null,
          uf: newClientDraft.uf.trim().toUpperCase() || null,
          cep: newClientDraft.cep.trim() || null,
          contatoResponsavel: newClientDraft.contatoResponsavel.trim() || null,
          cargoResponsavel: newClientDraft.cargoResponsavel.trim() || null,
          prazoPagamento: newClientDraft.prazoPagamento.trim() || null,
          prazoEnvioDocs: newClientDraft.prazoEnvioDocs.trim() || null,
          faturamentoTipoPadrao: newClientDraft.faturamentoTipoPadrao.trim() || null,
          instrucoesFaturamento: newClientDraft.instrucoesFaturamento.trim() || null,
          observacoes: newClientDraft.observacoes.trim() || null,
          exigeAceiteFormal: newClientDraft.exigeAceiteFormal,
          exigeNotaFiscalDetalhada: newClientDraft.exigeNotaFiscalDetalhada,
          exigeDeclaracaoArt299: newClientDraft.exigeDeclaracaoArt299,
          exigeComprovanteAssinado: newClientDraft.exigeComprovanteAssinado,
          exigePrintDiario: newClientDraft.exigePrintDiario,
          ativo: true,
        },
      }, { onSuccess: () => resolve(), onError: reject });
    });
    setNewClientDraft(buildClientDraft());
    await refreshAll();
    toast({ title: "Cliente criado", description: "A ficha mestre do cliente já fica pronta para importação, documentos e campanhas novas." });
  }

  async function handleCreateSite() {
    if (!canRunProtectedMutations) {
      toast({ title: "Ação operacional protegida", description: protectedSettingsMessage });
      return;
    }
    if (!newSiteName.trim() || !newSiteSigla.trim()) return;
    await new Promise<void>((resolve, reject) => {
      createSite.mutate({
        data: {
          nome: newSiteName.trim(),
          sigla: newSiteSigla.trim().toUpperCase(),
          dominio: newSiteDomain.trim() || null,
          siteUrl: newSiteDomain.trim() ? `https://${newSiteDomain.trim()}` : null,
          ativo: true,
        },
      }, { onSuccess: () => resolve(), onError: reject });
    });
    setNewSiteName("");
    setNewSiteSigla("");
    setNewSiteDomain("");
    await refreshAll();
    toast({ title: "Site criado", description: "O novo portal já entra na lista de inserções e no dashboard." });
  }

  async function handleSaveAgency(id: number, ativo: boolean) {
    if (!canRunProtectedMutations) {
      toast({ title: "Ação operacional protegida", description: protectedSettingsMessage });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      updateAgency.mutate({
        id,
        data: {
          nome: agencyDraft.nome.trim(),
          razaoSocial: agencyDraft.razaoSocial.trim() || null,
          cnpj: agencyDraft.cnpj.trim() || null,
          telefone: agencyDraft.telefone.trim() || null,
          whatsapp: agencyDraft.whatsapp.trim() || null,
          email: agencyDraft.email.trim() || null,
          emailFaturamento: agencyDraft.emailFaturamento.trim() || null,
          endereco: agencyDraft.endereco.trim() || null,
          cidade: agencyDraft.cidade.trim() || null,
          uf: agencyDraft.uf.trim() || null,
          cep: agencyDraft.cep.trim() || null,
          prazoPagamento: agencyDraft.prazoPagamento.trim() || null,
          prazoEnvioDocs: agencyDraft.prazoEnvioDocs.trim() || null,
          descontoPadraoPercentual: agencyDraft.descontoPadraoPercentual.trim() || null,
          instrucoesFaturamento: agencyDraft.instrucoesFaturamento.trim() || null,
          exigeAceiteFormal: agencyDraft.exigeAceiteFormal,
          exigeNotaFiscalDetalhada: agencyDraft.exigeNotaFiscalDetalhada,
          exigeDeclaracaoArt299: agencyDraft.exigeDeclaracaoArt299,
          exigeComprovanteAssinado: agencyDraft.exigeComprovanteAssinado,
          exigePrintDiario: agencyDraft.exigePrintDiario,
          ativo,
        },
      }, { onSuccess: () => resolve(), onError: reject });
    });
    setEditingKey("");
    setAgencyDraft(buildAgencyDraft());
    await refreshAll();
    toast({ title: "Agência atualizada", description: "A grafia nova já vale no sistema inteiro." });
  }

  async function handleSaveClient(id: number, ativo: boolean) {
    if (!canRunProtectedMutations) {
      toast({ title: "Ação operacional protegida", description: protectedSettingsMessage });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      updateClient.mutate({
        id,
        data: {
          nome: clientDraft.nome.trim(),
          razaoSocial: clientDraft.razaoSocial.trim() || null,
          cnpj: clientDraft.cnpj.trim() || null,
          telefone: clientDraft.telefone.trim() || null,
          whatsapp: clientDraft.whatsapp.trim() || null,
          email: clientDraft.email.trim() || null,
          emailFaturamento: clientDraft.emailFaturamento.trim() || null,
          endereco: clientDraft.endereco.trim() || null,
          cidade: clientDraft.cidade.trim() || null,
          uf: clientDraft.uf.trim().toUpperCase() || null,
          cep: clientDraft.cep.trim() || null,
          contatoResponsavel: clientDraft.contatoResponsavel.trim() || null,
          cargoResponsavel: clientDraft.cargoResponsavel.trim() || null,
          prazoPagamento: clientDraft.prazoPagamento.trim() || null,
          prazoEnvioDocs: clientDraft.prazoEnvioDocs.trim() || null,
          faturamentoTipoPadrao: clientDraft.faturamentoTipoPadrao.trim() || null,
          instrucoesFaturamento: clientDraft.instrucoesFaturamento.trim() || null,
          observacoes: clientDraft.observacoes.trim() || null,
          exigeAceiteFormal: clientDraft.exigeAceiteFormal,
          exigeNotaFiscalDetalhada: clientDraft.exigeNotaFiscalDetalhada,
          exigeDeclaracaoArt299: clientDraft.exigeDeclaracaoArt299,
          exigeComprovanteAssinado: clientDraft.exigeComprovanteAssinado,
          exigePrintDiario: clientDraft.exigePrintDiario,
          ativo,
        },
      }, { onSuccess: () => resolve(), onError: reject });
    });
    setEditingKey("");
    setClientDraft(buildClientDraft());
    await refreshAll();
    toast({ title: "Cliente atualizado", description: "A ficha do cliente já fica disponível para importações futuras e para completar a base existente." });
  }

  async function handleSaveSite(id: number, ativo: boolean) {
    if (!canRunProtectedMutations) {
      toast({ title: "Ação operacional protegida", description: protectedSettingsMessage });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      updateSite.mutate({
        id,
        data: {
          nome: siteDraft.nome.trim(),
          sigla: siteDraft.sigla.trim().toUpperCase(),
          dominio: siteDraft.dominio.trim() || null,
          siteUrl: siteDraft.siteUrl.trim() || null,
          artigoExemploUrl: siteDraft.artigoExemploUrl.trim() || null,
          logoUrl: siteDraft.logoUrl.trim() || null,
          serverLabel: siteDraft.serverLabel.trim() || null,
          sshHost: siteDraft.sshHost.trim() || null,
          sshPort: siteDraft.sshPort.trim() || null,
          sshUser: siteDraft.sshUser.trim() || null,
          webrootPath: siteDraft.webrootPath.trim() || null,
          wpPath: siteDraft.wpPath.trim() || null,
          wpCliPath: siteDraft.wpCliPath.trim() || null,
          phpBin: siteDraft.phpBin.trim() || null,
          tablePrefix: siteDraft.tablePrefix.trim() || null,
          adrotateVersao: siteDraft.adrotateVersao.trim() || null,
          cloudflareZoneId: siteDraft.cloudflareZoneId.trim() || null,
          cloudflareProjectName: siteDraft.cloudflareProjectName.trim() || null,
          pagesSubdomain: siteDraft.pagesSubdomain.trim() || null,
          spacesBucket: siteDraft.spacesBucket.trim() || null,
          spacesBasePath: siteDraft.spacesBasePath.trim() || null,
          maintenanceWorkspacePath: siteDraft.maintenanceWorkspacePath.trim() || null,
          deploymentNotes: siteDraft.deploymentNotes.trim() || null,
          ativo,
        },
      }, { onSuccess: () => resolve(), onError: reject });
    });
    setEditingKey("");
    setSiteDraft(buildSiteDraft());
    await refreshAll();
    toast({ title: "Site atualizado", description: "Dados operacionais, acesso e deploy agora ficam centralizados no próprio AdOps." });
  }

  async function handleMerge() {
    if (!canRunProtectedMutations) {
      toast({ title: "Ação operacional protegida", description: protectedSettingsMessage });
      return;
    }
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) {
      toast({ title: "Escolha origem e destino", description: "Para consolidar cadastros, selecione dois registros diferentes." });
      return;
    }

    setIsMerging(true);
    try {
      if (tab === "agencies") {
        const sourceId = Number(mergeSourceId);
        const targetId = Number(mergeTargetId);
        const impacted = (campaigns ?? []).filter((campaign) => campaign.agenciaId === sourceId);
        for (const campaign of impacted) {
          await new Promise<void>((resolve, reject) => {
            updateCampaign.mutate({ id: campaign.id, data: { agenciaId: targetId } }, { onSuccess: () => resolve(), onError: reject });
          });
        }
        await new Promise<void>((resolve, reject) => {
          updateAgency.mutate({ id: sourceId, data: { ativo: false } }, { onSuccess: () => resolve(), onError: reject });
        });
      }

      if (tab === "clients") {
        const sourceId = Number(mergeSourceId);
        const targetId = Number(mergeTargetId);
        const sourceClient = (clients ?? []).find((client) => client.id === sourceId);
        const targetClient = (clients ?? []).find((client) => client.id === targetId);
        if (!sourceClient || !targetClient) {
          throw new Error("Não foi possível localizar os clientes escolhidos para consolidação.");
        }
        await new Promise<void>((resolve, reject) => {
          updateClient.mutate({
            id: targetId,
            data: {
              nome: targetClient.nome,
              razaoSocial: mergePreferredText(targetClient.razaoSocial, sourceClient.razaoSocial),
              cnpj: mergePreferredText(targetClient.cnpj, sourceClient.cnpj),
              telefone: mergePreferredText(targetClient.telefone, sourceClient.telefone),
              whatsapp: mergePreferredText(targetClient.whatsapp, sourceClient.whatsapp),
              email: mergePreferredText(targetClient.email, sourceClient.email),
              emailFaturamento: mergePreferredText(targetClient.emailFaturamento, sourceClient.emailFaturamento),
              endereco: mergePreferredText(targetClient.endereco, sourceClient.endereco),
              cidade: mergePreferredText(targetClient.cidade, sourceClient.cidade),
              uf: mergePreferredText(targetClient.uf, sourceClient.uf),
              cep: mergePreferredText(targetClient.cep, sourceClient.cep),
              contatoResponsavel: mergePreferredText(targetClient.contatoResponsavel, sourceClient.contatoResponsavel),
              cargoResponsavel: mergePreferredText(targetClient.cargoResponsavel, sourceClient.cargoResponsavel),
              prazoPagamento: mergePreferredText(targetClient.prazoPagamento, sourceClient.prazoPagamento),
              prazoEnvioDocs: mergePreferredText(targetClient.prazoEnvioDocs, sourceClient.prazoEnvioDocs),
              faturamentoTipoPadrao: mergePreferredText(targetClient.faturamentoTipoPadrao, sourceClient.faturamentoTipoPadrao),
              instrucoesFaturamento: mergePreferredText(targetClient.instrucoesFaturamento, sourceClient.instrucoesFaturamento),
              observacoes: mergePreferredText(targetClient.observacoes, sourceClient.observacoes),
              exigeAceiteFormal: Boolean(targetClient.exigeAceiteFormal || sourceClient.exigeAceiteFormal),
              exigeNotaFiscalDetalhada: Boolean(targetClient.exigeNotaFiscalDetalhada || sourceClient.exigeNotaFiscalDetalhada),
              exigeDeclaracaoArt299: Boolean(targetClient.exigeDeclaracaoArt299 || sourceClient.exigeDeclaracaoArt299),
              exigeComprovanteAssinado: Boolean(targetClient.exigeComprovanteAssinado || sourceClient.exigeComprovanteAssinado),
              exigePrintDiario: Boolean(targetClient.exigePrintDiario || sourceClient.exigePrintDiario),
              ativo: targetClient.ativo,
            },
          }, { onSuccess: () => resolve(), onError: reject });
        });
        const impacted = (campaigns ?? []).filter((campaign) => campaign.clienteId === sourceId);
        for (const campaign of impacted) {
          await new Promise<void>((resolve, reject) => {
            updateCampaign.mutate({ id: campaign.id, data: { clienteId: targetId } }, { onSuccess: () => resolve(), onError: reject });
          });
        }
        await new Promise<void>((resolve, reject) => {
          updateClient.mutate({ id: sourceId, data: { ativo: false } }, { onSuccess: () => resolve(), onError: reject });
        });
      }

      if (tab === "sites") {
        const sourceId = Number(mergeSourceId);
        const targetId = Number(mergeTargetId);
        const impacted = (insertions ?? []).filter((insertion) => insertion.siteId === sourceId);
        for (const insertion of impacted) {
          await new Promise<void>((resolve, reject) => {
            updateInsertion.mutate({ id: insertion.id, data: { siteId: targetId } }, { onSuccess: () => resolve(), onError: reject });
          });
        }
        await new Promise<void>((resolve, reject) => {
          updateSite.mutate({ id: sourceId, data: { ativo: false } }, { onSuccess: () => resolve(), onError: reject });
        });
      }

      setMergeSourceId("");
      setMergeTargetId("");
      await refreshAll();
      toast({ title: "Cadastros consolidados", description: "A origem foi migrada para o destino e marcada como inativa para evitar novos erros." });
    } finally {
      setIsMerging(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Gerencie tabelas mestre, corrija grafias e consolide cadastros duplicados sem mexer em planilha ou código."
      />

      <div className="mx-auto max-w-7xl space-y-6 p-6">
        {isReadonlyPublic ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
            <div className="font-semibold text-amber-50">🔒 Configurações bloqueadas no ambiente público</div>
            <div className="mt-1">{readonlyMessage}</div>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Panel title="Seções">
              <div className="space-y-2">
                {[
                  { key: "agencies", label: "Agências" },
                  { key: "clients", label: "Clientes" },
                  { key: "sites", label: "Sites" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key as TabKey)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition",
                      tab === item.key ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background/50 text-muted-foreground",
                    )}
                  >
                    {item.label}
                    {tab === item.key ? <Check className="h-4 w-4 text-primary" /> : null}
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Sinais de grafia inconsistente">
              {duplicateSuggestions.length ? (
                <div className="space-y-2 text-xs text-muted-foreground">
                  {duplicateSuggestions.map((item, index) => (
                    <div key={`${item.a}-${item.b}-${index}`} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <div className="font-medium text-foreground">{item.a}</div>
                      <div>{item.b}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum par suspeito encontrado nesta seção.</p>
              )}
            </Panel>
          </div>

          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Panel title={tab === "agencies" ? "Cadastrar agência" : tab === "clients" ? "Cadastrar cliente" : "Cadastrar site"}>
                {tab === "agencies" ? (
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <FieldBlock label="Nome da agência" hint="Use a grafia oficial para evitar duplicidade no histórico.">
                      <TextInput value={newAgencyName} onChange={(event) => setNewAgencyName(event.target.value)} placeholder="Nome da agência" />
                    </FieldBlock>
                    <button type="button" onClick={handleCreateAgency} disabled={!canRunProtectedMutations} title={!canRunProtectedMutations ? protectedSettingsMessage : undefined} className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">
                      <Plus className="h-3.5 w-3.5" />
                      Criar agência
                    </button>
                  </div>
                ) : null}

                {tab === "clients" ? (
                  <div className="space-y-4">
                    <SectionLegend
                      title="Ficha mestre do cliente"
                      description="Preencha o que já sabemos agora. Planilha e PI poderão complementar campos vazios depois, sem perder o histórico existente."
                    />
                    <div className="grid gap-4 lg:grid-cols-2">
                      <FieldBlock label="Nome do cliente" hint="Nome oficial usado nas campanhas, relatórios e filtros.">
                        <TextInput value={newClientDraft.nome} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, nome: event.target.value }))} placeholder="Nome do cliente" />
                      </FieldBlock>
                      <FieldBlock label="Razão social" hint="Nome jurídico para documentos e conferência fiscal.">
                        <TextInput value={newClientDraft.razaoSocial} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, razaoSocial: event.target.value }))} placeholder="Razão social" />
                      </FieldBlock>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <FieldBlock label="CNPJ" hint="Importante para declaração, anexo e conferência da PI.">
                        <TextInput value={newClientDraft.cnpj} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, cnpj: event.target.value }))} placeholder="CNPJ" />
                      </FieldBlock>
                      <FieldBlock label="Telefone" hint="Contato principal do cliente.">
                        <TextInput value={newClientDraft.telefone} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, telefone: event.target.value }))} placeholder="Telefone" />
                      </FieldBlock>
                      <FieldBlock label="WhatsApp" hint="Se existir, ajuda em alinhamentos rápidos.">
                        <TextInput value={newClientDraft.whatsapp} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, whatsapp: event.target.value }))} placeholder="WhatsApp" />
                      </FieldBlock>
                      <FieldBlock label="Contato responsável" hint="Pessoa mais recorrente no relacionamento com esse cliente.">
                        <TextInput value={newClientDraft.contatoResponsavel} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, contatoResponsavel: event.target.value }))} placeholder="Nome do responsável" />
                      </FieldBlock>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <FieldBlock label="E-mail principal" hint="Contato geral do cliente ou do setor de atendimento.">
                        <TextInput value={newClientDraft.email} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email principal" />
                      </FieldBlock>
                      <FieldBlock label="E-mail de faturamento" hint="Caixa oficial para NF, documentos e comprovantes.">
                        <TextInput value={newClientDraft.emailFaturamento} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, emailFaturamento: event.target.value }))} placeholder="Email de faturamento" />
                      </FieldBlock>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px_120px]">
                      <FieldBlock label="Endereço" hint="Endereço principal do cliente para uso fiscal e documental.">
                        <TextInput value={newClientDraft.endereco} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, endereco: event.target.value }))} placeholder="Endereço" />
                      </FieldBlock>
                      <FieldBlock label="Cidade" hint="Cidade usada em documentos e conferência.">
                        <TextInput value={newClientDraft.cidade} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, cidade: event.target.value }))} placeholder="Cidade" />
                      </FieldBlock>
                      <FieldBlock label="UF" hint="Sigla do estado.">
                        <TextInput value={newClientDraft.uf} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, uf: event.target.value.toUpperCase() }))} placeholder="UF" maxLength={2} />
                      </FieldBlock>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[160px_160px_minmax(0,1fr)]">
                      <FieldBlock label="CEP" hint="CEP do endereço principal.">
                        <TextInput value={newClientDraft.cep} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, cep: event.target.value }))} placeholder="CEP" />
                      </FieldBlock>
                      <FieldBlock label="Cargo do responsável" hint="Cargo ou função do contato principal.">
                        <TextInput value={newClientDraft.cargoResponsavel} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, cargoResponsavel: event.target.value }))} placeholder="Cargo" />
                      </FieldBlock>
                      <FieldBlock label="Tipo padrão de faturamento" hint="Ex.: direto, via agência, empenho, órgão público.">
                        <TextInput value={newClientDraft.faturamentoTipoPadrao} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, faturamentoTipoPadrao: event.target.value }))} placeholder="Tipo padrão de faturamento" />
                      </FieldBlock>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <FieldBlock label="Prazo de pagamento" hint="Condição comercial recorrente quando conhecida.">
                        <TextInput value={newClientDraft.prazoPagamento} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, prazoPagamento: event.target.value }))} placeholder="Prazo de pagamento" />
                      </FieldBlock>
                      <FieldBlock label="Prazo para envio de docs" hint="Janela operacional para NF, comprovantes e anexos.">
                        <TextInput value={newClientDraft.prazoEnvioDocs} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, prazoEnvioDocs: event.target.value }))} placeholder="Prazo para envio de docs" />
                      </FieldBlock>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <FieldBlock label="Instruções de faturamento" hint="Notas rápidas para quem vai montar o pacote documental.">
                        <TextareaInput value={newClientDraft.instrucoesFaturamento} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, instrucoesFaturamento: event.target.value }))} placeholder="Instruções de faturamento" />
                      </FieldBlock>
                      <FieldBlock label="Observações" hint="Espaço livre para detalhes do cliente que ajudem nas próximas importações.">
                        <TextareaInput value={newClientDraft.observacoes} onChange={(event) => setNewClientDraft((prev) => ({ ...prev, observacoes: event.target.value }))} placeholder="Observações operacionais" />
                      </FieldBlock>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 text-xs text-muted-foreground">
                      {[
                        ["exigeAceiteFormal", "Exige aceite formal"],
                        ["exigeNotaFiscalDetalhada", "Exige NF detalhada"],
                        ["exigeDeclaracaoArt299", "Exige declaração art. 299"],
                        ["exigeComprovanteAssinado", "Exige comprovante assinado"],
                        ["exigePrintDiario", "Exige print diário"],
                      ].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 rounded border border-border px-3 py-2">
                          <input
                            type="checkbox"
                            checked={Boolean(newClientDraft[key as keyof ClientDraft])}
                            onChange={(event) => setNewClientDraft((prev) => ({ ...prev, [key]: event.target.checked }))}
                          />
                          {label}
                        </label>
                      ))}
                    </div>

                    <div className="flex justify-end">
                      <button type="button" onClick={handleCreateClient} disabled={!canRunProtectedMutations} title={!canRunProtectedMutations ? protectedSettingsMessage : undefined} className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">
                        <Plus className="h-3.5 w-3.5" />
                        Criar cliente
                      </button>
                    </div>
                  </div>
                ) : null}

                {tab === "sites" ? (
                  <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <FieldBlock label="Sigla" hint="Sigla curta usada na operação e nos filtros.">
                      <TextInput value={newSiteSigla} onChange={(event) => setNewSiteSigla(event.target.value.toUpperCase())} placeholder="Sigla" maxLength={8} />
                    </FieldBlock>
                    <FieldBlock label="Nome do site" hint="Nome completo do portal.">
                      <TextInput value={newSiteName} onChange={(event) => setNewSiteName(event.target.value)} placeholder="Nome do site" />
                    </FieldBlock>
                    <FieldBlock label="Domínio" hint="Domínio principal do portal.">
                      <TextInput value={newSiteDomain} onChange={(event) => setNewSiteDomain(event.target.value)} placeholder="dominio.com" />
                    </FieldBlock>
                    <button type="button" onClick={handleCreateSite} disabled={!canRunProtectedMutations} title={!canRunProtectedMutations ? protectedSettingsMessage : undefined} className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">
                      <Plus className="h-3.5 w-3.5" />
                      Criar site
                    </button>
                  </div>
                ) : null}
              </Panel>

              <Panel title="Consolidar cadastros duplicados">
                <div className="space-y-3 text-xs text-muted-foreground">
                  <p>Use quando duas grafias representam o mesmo cadastro. O sistema migra os vínculos da origem para o destino e inativa a origem.</p>
                  <FieldBlock label="Cadastro de origem" hint="Registro com grafia errada ou duplicada que será desativado ao final.">
                    <select aria-label="Cadastro de origem" value={mergeSourceId} onChange={(event) => setMergeSourceId(event.target.value)} className="w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground">
                      <option value="">Origem</option>
                      {(tab === "agencies" ? agencies : tab === "clients" ? clients : sites)?.map((item: any) => (
                        <option key={item.id} value={String(item.id)}>{"sigla" in item ? `${item.sigla} • ` : ""}{item.nome}</option>
                      ))}
                    </select>
                  </FieldBlock>
                  <FieldBlock label="Cadastro de destino" hint="Registro correto que vai concentrar o histórico.">
                    <select aria-label="Cadastro de destino" value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)} className="w-full rounded border border-border bg-card px-3 py-2 text-sm text-foreground">
                      <option value="">Destino</option>
                      {(tab === "agencies" ? agencies : tab === "clients" ? clients : sites)?.map((item: any) => (
                        <option key={item.id} value={String(item.id)}>{"sigla" in item ? `${item.sigla} • ` : ""}{item.nome}</option>
                      ))}
                    </select>
                  </FieldBlock>
                  <button type="button" onClick={handleMerge} disabled={isMerging || !canRunProtectedMutations} title={!canRunProtectedMutations ? protectedSettingsMessage : undefined} className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 text-xs font-medium text-foreground disabled:opacity-50 disabled:cursor-not-allowed">
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Consolidar
                  </button>
                </div>
              </Panel>
            </div>

            <Panel title={tab === "agencies" ? "Lista de agências" : tab === "clients" ? "Lista de clientes" : "Lista de sites"}>
              <div className="mb-4 flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cadastro" className="pl-9" />
                </div>
                <div className="text-xs text-muted-foreground">Edite para corrigir grafia, ou consolide para unificar histórico.</div>
              </div>

              {tab === "agencies" ? (
                <div className="space-y-3">
                  {filteredAgencies.map((agency) => {
                    const editing = editingKey === `agency-${agency.id}`;
                    return (
                      <div key={agency.id} className="space-y-4 rounded-xl border border-border bg-background/40 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            {editing ? (
                              <TextInput value={agencyDraft.nome} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, nome: event.target.value }))} />
                            ) : (
                              <div className="text-sm font-medium text-foreground">{agency.nome}</div>
                            )}
                            <div className="text-xs text-muted-foreground">{agency.ativo ? "Ativa" : "Inativa"} • {agencyCounts.get(agency.id) ?? 0} campanhas</div>
                            {!editing ? (
                              <div className="space-y-1 text-xs text-muted-foreground">
                                {agency.razaoSocial ? <div><span className="text-foreground">Razão social:</span> {agency.razaoSocial}</div> : null}
                                {agency.cnpj ? <div><span className="text-foreground">CNPJ:</span> {agency.cnpj}</div> : null}
                                {agency.emailFaturamento ? <div><span className="text-foreground">Faturamento:</span> {agency.emailFaturamento}</div> : null}
                                {agency.prazoEnvioDocs ? <div><span className="text-foreground">Prazo docs:</span> {agency.prazoEnvioDocs}</div> : null}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={agency.ativo}
                                onChange={(event) => {
                                  if (editing) void handleSaveAgency(agency.id, event.target.checked);
                                  else {
                                    setEditingKey(`agency-${agency.id}`);
                                    setAgencyDraft(buildAgencyDraft(agency));
                                  }
                                }}
                              />
                              Ativo
                            </label>
                            {editing ? (
                              <button type="button" onClick={() => void handleSaveAgency(agency.id, agency.ativo)} disabled={!canRunProtectedMutations} title={!canRunProtectedMutations ? protectedSettingsMessage : undefined} className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-3.5 w-3.5" />Salvar</button>
                            ) : (
                              <button type="button" onClick={() => { setEditingKey(`agency-${agency.id}`); setAgencyDraft(buildAgencyDraft(agency)); }} disabled={!canRunProtectedMutations} title={!canRunProtectedMutations ? protectedSettingsMessage : undefined} className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"><Pencil className="h-3.5 w-3.5" />Editar</button>
                            )}
                          </div>
                        </div>

                        {editing ? (
                          <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              <FieldBlock label="Razão social" hint="Nome jurídico da agência para referência fiscal e documental."><TextInput value={agencyDraft.razaoSocial} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, razaoSocial: event.target.value }))} placeholder="Razão social" /></FieldBlock>
                              <FieldBlock label="CNPJ" hint="Cadastro fiscal da agência."><TextInput value={agencyDraft.cnpj} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, cnpj: event.target.value }))} placeholder="CNPJ" /></FieldBlock>
                              <FieldBlock label="Telefone" hint="Contato principal da agência."><TextInput value={agencyDraft.telefone} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, telefone: event.target.value }))} placeholder="Telefone" /></FieldBlock>
                              <FieldBlock label="WhatsApp" hint="Canal rápido para alinhamentos operacionais."><TextInput value={agencyDraft.whatsapp} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, whatsapp: event.target.value }))} placeholder="WhatsApp" /></FieldBlock>
                              <FieldBlock label="E-mail principal" hint="Contato geral usado no relacionamento diário."><TextInput value={agencyDraft.email} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, email: event.target.value }))} placeholder="E-mail principal" /></FieldBlock>
                              <FieldBlock label="E-mail de faturamento" hint="Canal correto para enviar NF e documentação final."><TextInput value={agencyDraft.emailFaturamento} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, emailFaturamento: event.target.value }))} placeholder="E-mail de faturamento" /></FieldBlock>
                              <div className="md:col-span-2">
                                <FieldBlock label="Endereço completo" hint="Ajuda o time financeiro quando a PI exige cadastro completo do fornecedor."><TextInput value={agencyDraft.endereco} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, endereco: event.target.value }))} placeholder="Endereço completo" /></FieldBlock>
                              </div>
                              <FieldBlock label="Cidade" hint="Cidade do cadastro fiscal."><TextInput value={agencyDraft.cidade} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, cidade: event.target.value }))} placeholder="Cidade" /></FieldBlock>
                              <div className="grid gap-3 grid-cols-[90px_minmax(0,1fr)]">
                                <FieldBlock label="UF" hint="Estado do cadastro."><TextInput value={agencyDraft.uf} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, uf: event.target.value.toUpperCase() }))} placeholder="UF" maxLength={2} /></FieldBlock>
                                <FieldBlock label="CEP" hint="CEP do endereço fiscal."><TextInput value={agencyDraft.cep} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, cep: event.target.value }))} placeholder="CEP" /></FieldBlock>
                              </div>
                              <FieldBlock label="Prazo de pagamento" hint="Condição financeira padrão conhecida desta agência."><TextInput value={agencyDraft.prazoPagamento} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, prazoPagamento: event.target.value }))} placeholder="Prazo de pagamento" /></FieldBlock>
                              <FieldBlock label="Prazo para envio de docs" hint="Janela padrão para NF e documentação."><TextInput value={agencyDraft.prazoEnvioDocs} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, prazoEnvioDocs: event.target.value }))} placeholder="Prazo para envio de docs" /></FieldBlock>
                              <FieldBlock label="Desconto padrão (%)" hint="Percentual comercial recorrente, quando existir."><TextInput value={agencyDraft.descontoPadraoPercentual} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, descontoPadraoPercentual: event.target.value }))} placeholder="Desconto padrão da agência (%)" /></FieldBlock>
                              <div className="md:col-span-2">
                                <FieldBlock label="Instruções de faturamento" hint="Resumo operacional do que a equipe precisa lembrar antes de enviar docs."><TextInput value={agencyDraft.instrucoesFaturamento} onChange={(event) => setAgencyDraft((prev) => ({ ...prev, instrucoesFaturamento: event.target.value }))} placeholder="Instruções curtas de faturamento" /></FieldBlock>
                              </div>
                            </div>
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 text-xs text-muted-foreground">
                              {[
                                ["exigeAceiteFormal", "Exige aceite formal"],
                                ["exigeNotaFiscalDetalhada", "Exige NF detalhada"],
                                ["exigeDeclaracaoArt299", "Exige declaração art. 299"],
                                ["exigeComprovanteAssinado", "Exige comprovante assinado"],
                                ["exigePrintDiario", "Exige print diário"],
                              ].map(([key, label]) => (
                                <label key={key} className="flex items-center gap-2 rounded border border-border px-3 py-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(agencyDraft[key as keyof AgencyDraft])}
                                    onChange={(event) => setAgencyDraft((prev) => ({ ...prev, [key]: event.target.checked }))}
                                  />
                                  {label}
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2 text-[11px]">
                            {agency.exigeAceiteFormal ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200">Aceite formal</span> : null}
                            {agency.exigeNotaFiscalDetalhada ? <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-sky-200">NF detalhada</span> : null}
                            {agency.exigeDeclaracaoArt299 ? <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-violet-200">Decl. art. 299</span> : null}
                            {agency.exigeComprovanteAssinado ? <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-200">Comprovante assinado</span> : null}
                            {agency.exigePrintDiario ? <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-rose-200">Print diário</span> : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {tab === "clients" ? (
                <div className="space-y-3">
                  {filteredClients.map((client) => {
                    const editing = editingKey === `client-${client.id}`;
                    const completion = clientCompleteness(client);
                    return (
                      <div key={client.id} className="space-y-4 rounded-xl border border-border bg-background/40 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2">
                            {editing ? (
                              <FieldBlock label="Nome do cliente" hint="Use a grafia oficial para não espalhar relatórios e vínculos de PI.">
                                <TextInput value={clientDraft.nome} onChange={(event) => setClientDraft((prev) => ({ ...prev, nome: event.target.value }))} />
                              </FieldBlock>
                            ) : (
                              <div className="text-sm font-medium text-foreground">{client.nome}</div>
                            )}
                            <div className="text-xs text-muted-foreground">{client.ativo ? "Ativo" : "Inativo"} • {clientCounts.get(client.id) ?? 0} campanhas • ficha {completion}% completa</div>
                            {!editing ? (
                              <div className="space-y-1 text-xs text-muted-foreground">
                                {client.razaoSocial ? <div><span className="text-foreground">Razão social:</span> {client.razaoSocial}</div> : null}
                                {client.cnpj ? <div><span className="text-foreground">CNPJ:</span> {client.cnpj}</div> : null}
                                {client.emailFaturamento || client.email ? <div><span className="text-foreground">Contato:</span> {client.emailFaturamento ?? client.email}</div> : null}
                                {client.prazoEnvioDocs ? <div><span className="text-foreground">Prazo docs:</span> {client.prazoEnvioDocs}</div> : null}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={client.ativo}
                                onChange={(event) => {
                                  if (editing) void handleSaveClient(client.id, event.target.checked);
                                  else {
                                    setEditingKey(`client-${client.id}`);
                                    setClientDraft(buildClientDraft(client));
                                  }
                                }}
                              />
                              Ativo
                            </label>
                            {editing ? (
                              <button type="button" onClick={() => void handleSaveClient(client.id, client.ativo)} disabled={!canRunProtectedMutations} title={!canRunProtectedMutations ? protectedSettingsMessage : undefined} className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-3.5 w-3.5" />Salvar</button>
                            ) : (
                              <button type="button" onClick={() => { setEditingKey(`client-${client.id}`); setClientDraft(buildClientDraft(client)); }} disabled={!canRunProtectedMutations} title={!canRunProtectedMutations ? protectedSettingsMessage : undefined} className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"><Pencil className="h-3.5 w-3.5" />Editar</button>
                            )}
                          </div>
                        </div>

                        {editing ? (
                          <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
                            <SectionLegend
                              title="Identidade fiscal"
                              description="Essa camada é a base dos documentos, da importação por PI e da consistência histórica do cliente."
                            />
                            <div className="grid gap-3 md:grid-cols-2">
                              <FieldBlock label="Razão social" hint="Nome jurídico do cliente para contratos, anexos e conferência fiscal.">
                                <TextInput value={clientDraft.razaoSocial} onChange={(event) => setClientDraft((prev) => ({ ...prev, razaoSocial: event.target.value }))} placeholder="Razão social" />
                              </FieldBlock>
                              <FieldBlock label="CNPJ" hint="Será usado em declaração, anexo V e enriquecimento das próximas PIs.">
                                <TextInput value={clientDraft.cnpj} onChange={(event) => setClientDraft((prev) => ({ ...prev, cnpj: event.target.value }))} placeholder="CNPJ" />
                              </FieldBlock>
                              <FieldBlock label="Endereço" hint="Endereço principal do cliente.">
                                <TextInput value={clientDraft.endereco} onChange={(event) => setClientDraft((prev) => ({ ...prev, endereco: event.target.value }))} placeholder="Endereço" />
                              </FieldBlock>
                              <div className="grid gap-3 sm:grid-cols-3">
                                <FieldBlock label="Cidade" hint="Cidade oficial do cliente.">
                                  <TextInput value={clientDraft.cidade} onChange={(event) => setClientDraft((prev) => ({ ...prev, cidade: event.target.value }))} placeholder="Cidade" />
                                </FieldBlock>
                                <FieldBlock label="UF" hint="Sigla do estado.">
                                  <TextInput value={clientDraft.uf} onChange={(event) => setClientDraft((prev) => ({ ...prev, uf: event.target.value.toUpperCase() }))} placeholder="UF" maxLength={2} />
                                </FieldBlock>
                                <FieldBlock label="CEP" hint="CEP do endereço principal.">
                                  <TextInput value={clientDraft.cep} onChange={(event) => setClientDraft((prev) => ({ ...prev, cep: event.target.value }))} placeholder="CEP" />
                                </FieldBlock>
                              </div>
                            </div>

                            <SectionLegend
                              title="Contato e responsável"
                              description="Ajuda a equipe a saber com quem falar e a preencher automaticamente documentos que já exigem responsável e dados do cliente."
                            />
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <FieldBlock label="Telefone" hint="Contato principal do cliente.">
                                <TextInput value={clientDraft.telefone} onChange={(event) => setClientDraft((prev) => ({ ...prev, telefone: event.target.value }))} placeholder="Telefone" />
                              </FieldBlock>
                              <FieldBlock label="WhatsApp" hint="Canal rápido quando existir.">
                                <TextInput value={clientDraft.whatsapp} onChange={(event) => setClientDraft((prev) => ({ ...prev, whatsapp: event.target.value }))} placeholder="WhatsApp" />
                              </FieldBlock>
                              <FieldBlock label="Contato responsável" hint="Pessoa de referência no cliente.">
                                <TextInput value={clientDraft.contatoResponsavel} onChange={(event) => setClientDraft((prev) => ({ ...prev, contatoResponsavel: event.target.value }))} placeholder="Responsável" />
                              </FieldBlock>
                              <FieldBlock label="Cargo do responsável" hint="Cargo/função do contato principal.">
                                <TextInput value={clientDraft.cargoResponsavel} onChange={(event) => setClientDraft((prev) => ({ ...prev, cargoResponsavel: event.target.value }))} placeholder="Cargo" />
                              </FieldBlock>
                              <FieldBlock label="E-mail principal" hint="Contato geral ou institucional.">
                                <TextInput value={clientDraft.email} onChange={(event) => setClientDraft((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email principal" />
                              </FieldBlock>
                              <FieldBlock label="E-mail de faturamento" hint="Caixa usada para NF, anexos e comprovantes.">
                                <TextInput value={clientDraft.emailFaturamento} onChange={(event) => setClientDraft((prev) => ({ ...prev, emailFaturamento: event.target.value }))} placeholder="Email de faturamento" />
                              </FieldBlock>
                            </div>

                            <SectionLegend
                              title="Faturamento e prazo"
                              description="Esses campos ajudam a normalizar importações novas e deixam a operação menos dependente de memória humana."
                            />
                            <div className="grid gap-3 md:grid-cols-2">
                              <FieldBlock label="Tipo padrão de faturamento" hint="Ex.: direto, órgão público, via agência, empenho.">
                                <TextInput value={clientDraft.faturamentoTipoPadrao} onChange={(event) => setClientDraft((prev) => ({ ...prev, faturamentoTipoPadrao: event.target.value }))} placeholder="Tipo padrão de faturamento" />
                              </FieldBlock>
                              <FieldBlock label="Prazo de pagamento" hint="Condição comercial mais comum para esse cliente.">
                                <TextInput value={clientDraft.prazoPagamento} onChange={(event) => setClientDraft((prev) => ({ ...prev, prazoPagamento: event.target.value }))} placeholder="Prazo de pagamento" />
                              </FieldBlock>
                              <FieldBlock label="Prazo para envio de docs" hint="Janela operacional para montagem do pacote documental.">
                                <TextInput value={clientDraft.prazoEnvioDocs} onChange={(event) => setClientDraft((prev) => ({ ...prev, prazoEnvioDocs: event.target.value }))} placeholder="Prazo para envio de docs" />
                              </FieldBlock>
                              <FieldBlock label="Instruções de faturamento" hint="Resumo operacional útil para o próximo operador.">
                                <TextareaInput value={clientDraft.instrucoesFaturamento} onChange={(event) => setClientDraft((prev) => ({ ...prev, instrucoesFaturamento: event.target.value }))} placeholder="Instruções de faturamento" />
                              </FieldBlock>
                            </div>

                            <SectionLegend
                              title="Regras operacionais"
                              description="Marque exigências recorrentes do cliente para deixar a próxima importação e o fechamento mais inteligentes."
                            />
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 text-xs text-muted-foreground">
                              {[
                                ["exigeAceiteFormal", "Exige aceite formal"],
                                ["exigeNotaFiscalDetalhada", "Exige NF detalhada"],
                                ["exigeDeclaracaoArt299", "Exige declaração art. 299"],
                                ["exigeComprovanteAssinado", "Exige comprovante assinado"],
                                ["exigePrintDiario", "Exige print diário"],
                              ].map(([key, label]) => (
                                <label key={key} className="flex items-center gap-2 rounded border border-border px-3 py-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(clientDraft[key as keyof ClientDraft])}
                                    onChange={(event) => setClientDraft((prev) => ({ ...prev, [key]: event.target.checked }))}
                                  />
                                  {label}
                                </label>
                              ))}
                            </div>

                            <SectionLegend
                              title="Observações"
                              description="Use para contexto solto, exceções do cliente e pistas que possam aparecer de novo nas próximas PIs."
                            />
                            <FieldBlock label="Observações do cliente" hint="Notas livres que ajudam a consolidar a base de conhecimento do cadastro.">
                              <TextareaInput value={clientDraft.observacoes} onChange={(event) => setClientDraft((prev) => ({ ...prev, observacoes: event.target.value }))} placeholder="Observações operacionais do cliente" />
                            </FieldBlock>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2 text-[11px]">
                            {client.cnpj ? <span className="rounded-full border border-border bg-card px-2 py-1 text-foreground">{client.cnpj}</span> : <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200">Sem CNPJ</span>}
                            {client.faturamentoTipoPadrao ? <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-sky-200">{client.faturamentoTipoPadrao}</span> : null}
                            {client.exigeAceiteFormal ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200">Aceite formal</span> : null}
                            {client.exigeNotaFiscalDetalhada ? <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-sky-200">NF detalhada</span> : null}
                            {client.exigeDeclaracaoArt299 ? <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-violet-200">Decl. art. 299</span> : null}
                            {client.exigeComprovanteAssinado ? <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-200">Comprovante assinado</span> : null}
                            {client.exigePrintDiario ? <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-rose-200">Print diário</span> : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {tab === "sites" ? (
                <div className="space-y-3">
                  {filteredSites.map((site) => {
                    const editing = editingKey === `site-${site.id}`;
                    return (
                      <div key={site.id} className="space-y-4 rounded-xl border border-border bg-background/40 p-4">
                        <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)_90px_120px] md:items-start">
                          {editing ? (
                            <FieldBlock label="Sigla" hint="Identificador curto usado no dia a dia.">
                              <TextInput value={siteDraft.sigla} onChange={(event) => setSiteDraft((prev) => ({ ...prev, sigla: event.target.value.toUpperCase() }))} />
                            </FieldBlock>
                          ) : (
                            <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground">{site.sigla}</div>
                          )}
                          <div className="space-y-2">
                            {editing ? (
                              <FieldBlock label="Nome do site" hint="Nome completo do portal.">
                                <TextInput value={siteDraft.nome} onChange={(event) => setSiteDraft((prev) => ({ ...prev, nome: event.target.value }))} />
                              </FieldBlock>
                            ) : <div className="text-sm font-medium text-foreground">{site.nome}</div>}
                            <div className="text-xs text-muted-foreground">{site.ativo ? "Ativo" : "Inativo"} • {siteCounts.get(site.id) ?? 0} inserções</div>
                            {!editing ? (
                              <div className="space-y-1 text-xs text-muted-foreground">
                                {site.dominio ? <div><span className="text-foreground">Domínio:</span> {site.dominio}</div> : null}
                                {site.serverLabel ? <div><span className="text-foreground">Servidor:</span> {site.serverLabel}</div> : null}
                                {site.pagesSubdomain ? <div><span className="text-foreground">Subdomínio Pages:</span> {site.pagesSubdomain}</div> : null}
                                {site.spacesBucket ? <div><span className="text-foreground">Bucket:</span> {site.spacesBucket}</div> : null}
                              </div>
                            ) : null}
                          </div>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <input type="checkbox" checked={site.ativo} onChange={(event) => {
                              if (editing) void handleSaveSite(site.id, event.target.checked);
                              else { setEditingKey(`site-${site.id}`); setSiteDraft(buildSiteDraft(site)); }
                            }} />
                            Ativo
                          </label>
                          <div className="flex items-center justify-end gap-2">
                            {editing ? (
                              <button type="button" onClick={() => void handleSaveSite(site.id, site.ativo)} disabled={!canRunProtectedMutations} title={!canRunProtectedMutations ? protectedSettingsMessage : undefined} className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-3.5 w-3.5" />Salvar</button>
                            ) : (
                              <button type="button" onClick={() => { setEditingKey(`site-${site.id}`); setSiteDraft(buildSiteDraft(site)); }} disabled={!canRunProtectedMutations} title={!canRunProtectedMutations ? protectedSettingsMessage : undefined} className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-2 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"><Pencil className="h-3.5 w-3.5" />Editar</button>
                            )}
                          </div>
                        </div>

                        {editing ? (
                          <div className="space-y-4 rounded-xl border border-border bg-card/50 p-4">
                            <SectionLegend
                              title="Identidade pública"
                              description="Esses campos ajudam o operador a reconhecer o portal correto, abrir o site real e usar o logo certo nas telas e evidências."
                            />
                            <div className="grid gap-3 md:grid-cols-2">
                              <FieldBlock label="Domínio" hint="Domínio principal do portal, sem caminho. Ex.: omatogrossense.com">
                                <TextInput value={siteDraft.dominio} onChange={(event) => setSiteDraft((prev) => ({ ...prev, dominio: event.target.value }))} placeholder="omatogrossense.com" />
                              </FieldBlock>
                              <FieldBlock label="URL pública do site" hint="Endereço principal usado para abrir a home e conferir anúncios.">
                                <TextInput value={siteDraft.siteUrl} onChange={(event) => setSiteDraft((prev) => ({ ...prev, siteUrl: event.target.value }))} placeholder="https://omatogrossense.com" />
                              </FieldBlock>
                              <FieldBlock label="URL exemplo de página interna" hint="Use uma matéria real quando o site tiver banner interno. Isso ajuda a captura de print e a conciliação.">
                                <TextInput value={siteDraft.artigoExemploUrl} onChange={(event) => setSiteDraft((prev) => ({ ...prev, artigoExemploUrl: event.target.value }))} placeholder="https://site.com/materia-exemplo/" />
                              </FieldBlock>
                              <FieldBlock label="URL do logo" hint="Pode ser o arquivo local servido pelo frontend ou a URL oficial do portal.">
                                <TextInput value={siteDraft.logoUrl} onChange={(event) => setSiteDraft((prev) => ({ ...prev, logoUrl: event.target.value }))} placeholder="/site-logos/omt.webp" />
                              </FieldBlock>
                            </div>

                            <SectionLegend
                              title="Servidor e WordPress"
                              description="Esses campos são usados nas rotinas de manutenção, deploy, leitura do AdRotate e operações por WP-CLI."
                            />
                            <div className="grid gap-3 md:grid-cols-3">
                              <FieldBlock label="Resumo do servidor" hint="Rótulo rápido para o time entender onde o site está hospedado.">
                                <TextInput value={siteDraft.serverLabel} onChange={(event) => setSiteDraft((prev) => ({ ...prev, serverLabel: event.target.value }))} placeholder="facilnam@66.253.112.200:215" />
                              </FieldBlock>
                              <FieldBlock label="SSH host" hint="IP ou hostname do servidor.">
                                <TextInput value={siteDraft.sshHost} onChange={(event) => setSiteDraft((prev) => ({ ...prev, sshHost: event.target.value }))} placeholder="66.253.112.200" />
                              </FieldBlock>
                              <FieldBlock label="SSH porta" hint="Porta usada para acesso ao servidor.">
                                <TextInput value={siteDraft.sshPort} onChange={(event) => setSiteDraft((prev) => ({ ...prev, sshPort: event.target.value }))} placeholder="215" />
                              </FieldBlock>
                              <FieldBlock label="SSH usuário" hint="Usuário operacional usado nas rotinas remotas.">
                                <TextInput value={siteDraft.sshUser} onChange={(event) => setSiteDraft((prev) => ({ ...prev, sshUser: event.target.value }))} placeholder="facilnam" />
                              </FieldBlock>
                              <FieldBlock label="Webroot" hint="Raiz web do WordPress/Bedrock. Útil para deploy e inspeção.">
                                <TextInput value={siteDraft.webrootPath} onChange={(event) => setSiteDraft((prev) => ({ ...prev, webrootPath: event.target.value }))} placeholder="/home/user/public_html/site/web" />
                              </FieldBlock>
                              <FieldBlock label="Caminho do WP" hint="Caminho do core WordPress.">
                                <TextInput value={siteDraft.wpPath} onChange={(event) => setSiteDraft((prev) => ({ ...prev, wpPath: event.target.value }))} placeholder="/home/user/public_html/site/web/wp" />
                              </FieldBlock>
                              <FieldBlock label="Caminho do WP-CLI" hint="Comando ou arquivo usado para rodar wp-cli.">
                                <TextInput value={siteDraft.wpCliPath} onChange={(event) => setSiteDraft((prev) => ({ ...prev, wpCliPath: event.target.value }))} placeholder="/home/user/wp-cli.phar" />
                              </FieldBlock>
                              <FieldBlock label="PHP bin" hint="Binário PHP usado no servidor.">
                                <TextInput value={siteDraft.phpBin} onChange={(event) => setSiteDraft((prev) => ({ ...prev, phpBin: event.target.value }))} placeholder="php" />
                              </FieldBlock>
                              <FieldBlock label="Prefixo das tabelas" hint="Normalmente `wp_`. Importante para consultas administrativas.">
                                <TextInput value={siteDraft.tablePrefix} onChange={(event) => setSiteDraft((prev) => ({ ...prev, tablePrefix: event.target.value }))} placeholder="wp_" />
                              </FieldBlock>
                              <FieldBlock label="Versão do AdRotate" hint="Ajuda a rastrear diferenças entre plugins e compatibilidade das rotinas.">
                                <TextInput value={siteDraft.adrotateVersao} onChange={(event) => setSiteDraft((prev) => ({ ...prev, adrotateVersao: event.target.value }))} placeholder="5.17.2-c5.7" />
                              </FieldBlock>
                            </div>

                            <SectionLegend
                              title="Cloudflare e armazenamento"
                              description="Esses campos sustentam o deploy do frontend, o domínio do AdOps e o armazenamento das evidências no Spaces."
                            />
                            <div className="grid gap-3 md:grid-cols-2">
                              <FieldBlock label="Cloudflare Zone ID" hint="Obrigatório quando o time precisar automatizar purge ou revisar regras da zona.">
                                <TextInput value={siteDraft.cloudflareZoneId} onChange={(event) => setSiteDraft((prev) => ({ ...prev, cloudflareZoneId: event.target.value }))} placeholder="Zone ID da zona do portal" />
                              </FieldBlock>
                              <FieldBlock label="Projeto Cloudflare Pages" hint="Projeto do frontend do AdOps. Nesta fase, todos os sites apontam para o mesmo painel do AdOps.">
                                <TextInput value={siteDraft.cloudflareProjectName} onChange={(event) => setSiteDraft((prev) => ({ ...prev, cloudflareProjectName: event.target.value }))} placeholder="adops-codigo5" />
                              </FieldBlock>
                              <FieldBlock label="Subdomínio Pages" hint="Endereço final do frontend do AdOps.">
                                <TextInput value={siteDraft.pagesSubdomain} onChange={(event) => setSiteDraft((prev) => ({ ...prev, pagesSubdomain: event.target.value }))} placeholder="adops.codigo5.com.br" />
                              </FieldBlock>
                              <FieldBlock label="Bucket do Spaces" hint="Bucket onde os prints e evidências do AdOps serão gravados.">
                                <TextInput value={siteDraft.spacesBucket} onChange={(event) => setSiteDraft((prev) => ({ ...prev, spacesBucket: event.target.value }))} placeholder="cod5" />
                              </FieldBlock>
                              <FieldBlock label="Base path do Spaces" hint="Pasta base para organizar prints por competência, campanha e inserção.">
                                <TextInput value={siteDraft.spacesBasePath} onChange={(event) => setSiteDraft((prev) => ({ ...prev, spacesBasePath: event.target.value }))} placeholder="adops-prints" />
                              </FieldBlock>
                            </div>

                            <SectionLegend
                              title="Workspace e notas de rotina"
                              description="Deixe aqui a referência para manutenção e qualquer instrução que um operador precise seguir sem depender de outra documentação."
                            />
                            <div className="space-y-3">
                              <FieldBlock label="Pasta de manutenção / workspace" hint="Diretório local com scripts, runbooks e contexto técnico do site.">
                                <TextInput value={siteDraft.maintenanceWorkspacePath} onChange={(event) => setSiteDraft((prev) => ({ ...prev, maintenanceWorkspacePath: event.target.value }))} placeholder="/Users/.../workspace-do-site" />
                              </FieldBlock>
                              <FieldBlock label="Notas operacionais" hint="Use para descrever rotina de deploy, limpeza de cache, cuidados especiais e diferenças deste portal.">
                                <TextareaInput value={siteDraft.deploymentNotes} onChange={(event) => setSiteDraft((prev) => ({ ...prev, deploymentNotes: event.target.value }))} placeholder="Descreva aqui as rotinas importantes do portal." />
                              </FieldBlock>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
