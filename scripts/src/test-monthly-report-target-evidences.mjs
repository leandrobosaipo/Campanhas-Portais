import assert from "node:assert/strict";

const reportUrl = process.env.ADOPS_REPORT_DATA_URL || "https://sites.codigo5.com.br/reports/adops-evidencias-agosto-2026/data.json";
const targetDate = process.env.ADOPS_EVIDENCE_TARGET_DATE || "2026-08-21";
const targetIds = String(process.env.ADOPS_EVIDENCE_TARGET_IDS || "2692,2693,2712,2713")
  .split(",").map(Number).filter(Number.isInteger);
const response = await fetch(reportUrl, { cache: "no-store" });
assert.equal(response.ok, true, `relatório indisponível: HTTP ${response.status}`);
const report = await response.json();
for (const insertionId of targetIds) {
  const insertion = report.insertions?.find((item) => Number(item.id) === insertionId);
  assert.ok(insertion, `inserção #${insertionId} ausente do relatório`);
  const day = insertion.evidenceDays?.find((item) => item.date === targetDate);
  assert.ok(day, `#${insertionId} sem o dia ${targetDate}`);
  assert.match(day.status, /^audited(?:_best_effort)?$/, `#${insertionId} está ${day.status}`);
  assert.equal(insertion.invalidDates?.includes(targetDate), false, `#${insertionId} ainda marca ${targetDate} inválido`);
}
console.log(JSON.stringify({ ok: true, reportUrl, targetDate, targetIds }));
