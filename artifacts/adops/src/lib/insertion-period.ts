import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatInsertionPeriodCompact(input: {
  periodoOriginal?: string | null;
  periodoInicio?: string | null;
  periodoFim?: string | null;
}) {
  if (input.periodoOriginal?.trim()) return input.periodoOriginal.trim();
  const start = parseDateOnly(input.periodoInicio);
  const end = parseDateOnly(input.periodoFim);
  if (!start || !end) return "—";
  return `${format(start, "dd/MM/yy", { locale: ptBR })} — ${format(end, "dd/MM/yy", { locale: ptBR })}`;
}

export function formatInsertionPeriodLong(input: {
  periodoInicio?: string | null;
  periodoFim?: string | null;
}) {
  const start = parseDateOnly(input.periodoInicio);
  const end = parseDateOnly(input.periodoFim);
  if (!start || !end) return "Período não informado";
  return `${format(start, "dd/MM/yyyy (EEE)", { locale: ptBR })} até ${format(end, "dd/MM/yyyy (EEE)", { locale: ptBR })}`;
}
