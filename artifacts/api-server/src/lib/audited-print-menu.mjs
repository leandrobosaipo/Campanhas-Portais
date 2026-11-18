import { menuDate } from "./whatsapp-menu.mjs";
export const auditedPrintHelp =
  "Use print AAAA-MM-DD PORTAL POSIÇÃO (ex.: print 2026-11-09 PERRENGUE HOME 1), ou menu 7 2026-11-09 #3122. A data é opcional e assume hoje em Cuiabá. Só entrega arquivo real aprovado; não gera captura e não usa prévia.";
export const printNormalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
export function parsePrintQuery(query, today) {
  const date = query.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? today;
  if (!menuDate(date)) throw Error("audited_print_invalid_date");
  const id = query.match(/(?:^|\s)#(\d+)(?:\s|$)/)?.[1];
  const rest = query
    .replace(/\b\d{4}-\d{2}-\d{2}\b/, "")
    .replace(/#\d+/, "")
    .trim();
  if (id) {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0 || rest)
      throw Error("audited_print_invalid_query");
    return { date, insertionId: Number(id) };
  }
  if (!rest) return { date, help: true };
  const [site, ...format] = printNormalize(rest).split(" ");
  if (!["AFL", "OMT", "PERRENGUE", "ROO", "PNMT", "PPMT"].includes(site))
    throw Error("audited_print_invalid_portal");
  return { date, site, format: format.join(" ") };
}
export function selectPrintRows(rows, query) {
  return rows.filter(
    (r) =>
      (!query.insertionId || r.id === query.insertionId) &&
      (!query.site || r.site === query.site) &&
      (!query.format ||
        [r.format, r.normalizedFormat].some(
          (f) => printNormalize(f) === query.format,
        )),
  );
}
