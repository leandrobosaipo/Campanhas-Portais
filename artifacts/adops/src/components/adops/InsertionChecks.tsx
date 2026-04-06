import { useState } from "react";
import { useUpdateInsertion } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListInsertionsQueryKey, getGetInsertionQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Props {
  id: number;
  bannerPublicadoNoSite: boolean;
  printGerado: boolean;
  processoEnviadoAgencia: boolean;
  docsEnviados: boolean;
}

function CheckItem({ label, checked, onToggle, disabled }: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border transition-all",
        checked
          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
          : "bg-slate-700/40 text-slate-500 border-slate-600/30 hover:border-slate-500/50 hover:text-slate-400",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span className={cn(
        "w-3 h-3 rounded-sm border flex items-center justify-center shrink-0",
        checked ? "bg-emerald-500 border-emerald-400" : "border-slate-500"
      )}>
        {checked && <Check className="w-2 h-2 text-white" />}
      </span>
      {label}
    </button>
  );
}

export function InsertionChecks({ id, bannerPublicadoNoSite, printGerado, processoEnviadoAgencia, docsEnviados }: Props) {
  const qc = useQueryClient();
  const mutation = useUpdateInsertion();
  const [state, setState] = useState({ bannerPublicadoNoSite, printGerado, processoEnviadoAgencia, docsEnviados });

  const update = async (field: keyof typeof state, value: boolean) => {
    const newState = { ...state, [field]: value };
    setState(newState);

    let statusNormalizado: string | undefined;
    if (!newState.bannerPublicadoNoSite) statusNormalizado = "aguardando_publicacao";
    else if (!newState.printGerado) statusNormalizado = "publicado_no_site";
    else if (!newState.processoEnviadoAgencia) statusNormalizado = "print_gerado";
    else if (!newState.docsEnviados) statusNormalizado = "enviado_para_agencia";
    else statusNormalizado = "concluido";

    mutation.mutate(
      { id, data: { ...newState, statusNormalizado } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListInsertionsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetInsertionQueryKey(id) });
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
      }
    );
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <CheckItem label="Banner" checked={state.bannerPublicadoNoSite} onToggle={() => update("bannerPublicadoNoSite", !state.bannerPublicadoNoSite)} />
      <CheckItem label="Print" checked={state.printGerado} onToggle={() => update("printGerado", !state.printGerado)} disabled={!state.bannerPublicadoNoSite} />
      <CheckItem label="Enviado" checked={state.processoEnviadoAgencia} onToggle={() => update("processoEnviadoAgencia", !state.processoEnviadoAgencia)} disabled={!state.printGerado} />
      <CheckItem label="Docs" checked={state.docsEnviados} onToggle={() => update("docsEnviados", !state.docsEnviados)} disabled={!state.processoEnviadoAgencia} />
    </div>
  );
}
