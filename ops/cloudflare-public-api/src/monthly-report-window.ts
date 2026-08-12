const cod5_monthNames = [
  "JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

function cod5_dateInCuiaba(value: Date) {
  const cod5_parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const cod5_map = Object.fromEntries(cod5_parts.map((part) => [part.type, part.value]));
  return `${cod5_map.year}-${cod5_map.month}-${cod5_map.day}`;
}

export function isMonthlyEvidenceReportCron(cron: string | null | undefined) {
  return String(cron || "").trim() === "15 2 * * *";
}

export function buildMonthlyEvidenceReportSchedule(now: Date) {
  const cod5_targetDate = cod5_dateInCuiaba(now);
  const [cod5_year, cod5_month] = cod5_targetDate.split("-").map(Number);
  return {
    competencia: `${cod5_monthNames[cod5_month - 1]}/${cod5_year}`,
    targetDate: cod5_targetDate,
    idempotencyKey: `evidence-monthly-report:${cod5_targetDate}`,
    source: "cloudflare-cron-evidence-monthly-report",
  };
}
