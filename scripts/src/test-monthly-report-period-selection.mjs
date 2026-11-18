import assert from "node:assert/strict";
import { monthlyReportInsertionMatches } from "../../artifacts/api-server/src/lib/monthly-evidence-report-query.ts";

const september = { start: "2026-09-01", end: "2026-09-30" };
assert.equal(monthlyReportInsertionMatches({ competencia: "OUTUBRO/2025", periodoInicio: "2026-09-18", periodoFim: "2026-10-31", statusNormalizado: "publicado" }, september), true);
assert.equal(monthlyReportInsertionMatches({ periodoInicio: "2026-10-01", periodoFim: "2026-10-31", statusNormalizado: "publicado" }, september), false);
assert.equal(monthlyReportInsertionMatches({ periodoInicio: "2026-09-18", periodoFim: "2026-10-31", statusNormalizado: "cancelado" }, september), false);
console.log("monthly report period selection passed");
