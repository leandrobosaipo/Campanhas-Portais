import { useState } from "react";
import { useLocation } from "wouter";
import {
  useCreateCampaign, useCreateInsertion,
  useListClients, useListAgencies, useListSites,
  getListCampaignsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/adops/Layout";
import { Plus, Trash2, Copy, Save, ArrowLeft } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "rascunho", label: "Rascunho" },
  { value: "aguardando_publicacao", label: "Ag. Publicação" },
  { value: "publicado_no_site", label: "Publicado" },
  { value: "print_gerado", label: "Print Gerado" },
  { value: "enviado_para_agencia", label: "Enviado" },
  { value: "concluido", label: "Concluído" },
];

const FORMATO_OPTIONS = [
  "MEGABANNER TOPO", "HOME 1", "HOME 2", "VIDEO", "INSTAGRAM",
  "INTERNO DE NOTICIAS", "PRIMEIRA DOBRA", "SEGUNDA DOBRA",
  "TOPO LATERAL", "INTERNO NOTICIA",
];

const COMPETENCIAS = [
  "OUTUBRO/2025", "NOVEMBRO/2025", "DEZEMBRO/2025",
  "JANEIRO/2026", "FEVEREIRO/2026", "MARÇO/2026", "ABRIL/2026",
];

interface InsertionRow {
  key: number;
  siteId: string;
  localFormato: string;
  periodoInicio: string;
  periodoFim: string;
  statusNormalizado: string;
  observacoes: string;
}

let rowKey = 0;
const newRow = (): InsertionRow => ({
  key: rowKey++,
  siteId: "",
  localFormato: "",
  periodoInicio: "",
  periodoFim: "",
  statusNormalizado: "rascunho",
  observacoes: "",
});

function Input({ label, value, onChange, type = "text", placeholder, required }: any) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full text-sm bg-card border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
      />
    </div>
  );
}

function Select({ label, value, onChange, children, required }: any) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full text-sm bg-card border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {children}
      </select>
    </div>
  );
}

export function NewCampaign() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: clients } = useListClients();
  const { data: agencies } = useListAgencies();
  const { data: sites } = useListSites();

  const createCampaign = useCreateCampaign();
  const createInsertion = useCreateInsertion();

  // Campaign fields
  const [nome, setNome] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [agenciaId, setAgenciaId] = useState("");
  const [piCodigo, setPiCodigo] = useState("");
  const [valorLiquido, setValorLiquido] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Insertions
  const [rows, setRows] = useState<InsertionRow[]>([newRow()]);

  const addRow = () => setRows(r => [...r, newRow()]);
  const removeRow = (key: number) => setRows(r => r.filter(x => x.key !== key));
  const duplicateRow = (key: number) => {
    const idx = rows.findIndex(r => r.key === key);
    const copy = { ...rows[idx]!, key: rowKey++ };
    const next = [...rows];
    next.splice(idx + 1, 0, copy);
    setRows(next);
  };
  const updateRow = (key: number, field: keyof InsertionRow, val: string) => {
    setRows(r => r.map(x => x.key === key ? { ...x, [field]: val } : x));
  };

  const handleSubmit = async (e: React.FormEvent, asDraft = false) => {
    e.preventDefault();
    const campaign = await new Promise<{ id: number }>((res, rej) => {
      createCampaign.mutate({
        data: {
          nome,
          clienteId: clienteId ? parseInt(clienteId) : null,
          agenciaId: agenciaId ? parseInt(agenciaId) : null,
          piCodigo: piCodigo || null,
          valorLiquido: valorLiquido ? parseFloat(valorLiquido) : null,
          competencia: competencia || null,
          observacoes: observacoes || null,
          origem: "manual",
        }
      }, { onSuccess: res, onError: rej });
    });

    for (const row of rows) {
      if (!row.siteId && !row.localFormato) continue;
      await new Promise<void>((res, rej) => {
        createInsertion.mutate({
          data: {
            campanhaId: campaign.id,
            siteId: row.siteId ? parseInt(row.siteId) : null,
            localFormato: row.localFormato || null,
            localFormatoNormalizado: row.localFormato || null,
            periodoInicio: row.periodoInicio || null,
            periodoFim: row.periodoFim || null,
            statusNormalizado: asDraft ? "rascunho" : row.statusNormalizado,
            observacoes: row.observacoes || null,
            bannerPublicadoNoSite: false,
            printGerado: false,
            processoEnviadoAgencia: false,
            docsEnviados: false,
          }
        }, { onSuccess: () => res(), onError: rej });
      });
    }

    qc.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
    navigate(`/campanhas/${campaign.id}`);
  };

  return (
    <form>
      <PageHeader
        title="Nova Campanha"
        subtitle="Cadastre a campanha e adicione inserções"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/campanhas")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded border border-border"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar
            </button>
            <button
              type="button"
              onClick={e => handleSubmit(e, true)}
              disabled={!nome}
              className="flex items-center gap-1.5 text-xs bg-muted text-foreground px-3 py-1.5 rounded font-medium hover:bg-muted/70 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar Rascunho
            </button>
            <button
              type="button"
              onClick={e => handleSubmit(e, false)}
              disabled={!nome}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded font-medium hover:opacity-90 disabled:opacity-50"
            >
              Criar Campanha
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-6 max-w-5xl">
        {/* Campaign info */}
        <div className="bg-card border border-border rounded p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 pb-3 border-b border-border">Dados da Campanha</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Input label="Nome da Campanha" value={nome} onChange={setNome} placeholder="Ex: DENGUE - PREF CBA" required />
            </div>
            <Select label="Cliente" value={clienteId} onChange={setClienteId}>
              <option value="">— Selecione —</option>
              {clients?.map(c => <option key={c.id} value={String(c.id)}>{c.nome}</option>)}
            </Select>
            <Select label="Agência" value={agenciaId} onChange={setAgenciaId}>
              <option value="">— Selecione —</option>
              {agencies?.map(a => <option key={a.id} value={String(a.id)}>{a.nome}</option>)}
            </Select>
            <Input label="Código PI" value={piCodigo} onChange={setPiCodigo} placeholder="PI-001/26" />
            <Input label="Valor Líquido (R$)" type="number" value={valorLiquido} onChange={setValorLiquido} placeholder="45000.00" />
            <Select label="Competência" value={competencia} onChange={setCompetencia}>
              <option value="">— Selecione —</option>
              {COMPETENCIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <div className="col-span-2">
              <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Observações</label>
              <textarea
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                rows={2}
                placeholder="Observações gerais sobre a campanha..."
                className="w-full text-sm bg-card border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground resize-none"
              />
            </div>
          </div>
        </div>

        {/* Insertions */}
        <div className="bg-card border border-border rounded">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Inserções <span className="text-muted-foreground font-normal">({rows.length})</span></h2>
            <button type="button" onClick={addRow} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium">
              <Plus className="w-3.5 h-3.5" />
              Adicionar inserção
            </button>
          </div>

          <div className="divide-y divide-border/50">
            {rows.map((row, i) => (
              <div key={row.key} className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">#{i + 1}</span>
                  <div className="flex-1" />
                  <button type="button" onClick={() => duplicateRow(row.key)} className="p-1 text-muted-foreground hover:text-foreground">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(row.key)} className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Select label="Site" value={row.siteId} onChange={(v: string) => updateRow(row.key, "siteId", v)}>
                    <option value="">— Selecione —</option>
                    {sites?.map(s => <option key={s.id} value={String(s.id)}>{s.sigla}</option>)}
                  </Select>
                  <Select label="Formato / Local" value={row.localFormato} onChange={(v: string) => updateRow(row.key, "localFormato", v)}>
                    <option value="">— Selecione —</option>
                    {FORMATO_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </Select>
                  <Select label="Status" value={row.statusNormalizado} onChange={(v: string) => updateRow(row.key, "statusNormalizado", v)}>
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                  <Input label="Início" type="date" value={row.periodoInicio} onChange={(v: string) => updateRow(row.key, "periodoInicio", v)} />
                  <Input label="Fim" type="date" value={row.periodoFim} onChange={(v: string) => updateRow(row.key, "periodoFim", v)} />
                  <Input label="Observações" value={row.observacoes} onChange={(v: string) => updateRow(row.key, "observacoes", v)} placeholder="Obs..." />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </form>
  );
}
