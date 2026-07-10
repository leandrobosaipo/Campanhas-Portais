import { useState } from "react";
import { useUpdateInsertion } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListInsertionsQueryKey, getGetInsertionQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { INSERTION_PROGRESS_STEPS, STATUS_META } from "@/lib/adops-config";

interface Props {
  id: number;
  bannerPublicadoNoSite: boolean;
  printGerado: boolean;
  processoEnviadoAgencia: boolean;
  docsEnviados: boolean;
}

function CheckItem({ label, checked, onToggle, disabled, statusKey }: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  statusKey: string;
}) {
  const meta = STATUS_META[statusKey] ?? STATUS_META.rascunho;
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border transition-all",
        checked
          ? meta.checkOnClass
          : meta.checkOffClass,
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span className={cn(
        "w-3 h-3 rounded-sm border flex items-center justify-center shrink-0",
        checked ? "bg-current/70 border-current/70 text-white" : "border-slate-500"
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
      {INSERTION_PROGRESS_STEPS.map((step) => (
        <CheckItem
          key={step.key}
          label={step.label}
          checked={state[step.key]}
          onToggle={() => update(step.key, !state[step.key])}
          disabled={
            (step.key === "printGerado" && !state.bannerPublicadoNoSite) ||
            (step.key === "processoEnviadoAgencia" && !state.printGerado) ||
            (step.key === "docsEnviados" && !state.processoEnviadoAgencia)
          }
          statusKey={step.status}
        />
      ))}
    </div>
  );
}
