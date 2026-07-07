#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const projectDir = resolve(new URL(".", import.meta.url).pathname);
const logDir = join(projectDir, "logs");
const downloadsDir = join(process.env.HOME || "", "Downloads");

const expected = [
  "OMT-PI-14414-vacina",
  "PERRENGUE-PI-15948-IPVA-2026",
  "PERRENGUE-PI-16091-governo",
  "PPMT-PI-14357-feminicidio",
  "ROO-PI-14355-feminicidio",
];

const failures = [];

for (const label of expected) {
  const zipPath = join(downloadsDir, `${label}.zip`);
  if (!existsSync(zipPath) || statSync(zipPath).size <= 0) {
    failures.push({ label, issue: "zip_missing_or_empty", zipPath });
  }

  const summaryPath = join(logDir, `${label}.json`);
  if (!existsSync(summaryPath)) {
    failures.push({ label, issue: "summary_missing", summaryPath });
    continue;
  }

  const payload = JSON.parse(readFileSync(summaryPath, "utf8"));
  const summary = payload.summary || {};
  const final = payload.audit?.final || [];
  const failedAudit = final.filter((item) => item.ok !== true);
  if (!summary.telegramMessageId) failures.push({ label, issue: "zip_telegram_message_missing" });
  if (!Array.isArray(summary.telegramEvidenceMessages) || summary.telegramEvidenceMessages.length !== summary.evidenceCount) {
    failures.push({
      label,
      issue: "evidence_telegram_messages_incomplete",
      sent: Array.isArray(summary.telegramEvidenceMessages) ? summary.telegramEvidenceMessages.length : 0,
      expected: summary.evidenceCount,
    });
  }
  if (!summary.evidenceCount || final.length !== summary.evidenceCount || failedAudit.length) {
    failures.push({ label, issue: "audit_incomplete", evidenceCount: summary.evidenceCount, final: final.length, failedAudit: failedAudit.length });
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, labels: expected }, null, 2));

