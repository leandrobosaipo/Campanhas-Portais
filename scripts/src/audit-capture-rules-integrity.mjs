#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(repoRoot, "config/adrotate-sites.json");
const knownDriftPath = path.join(repoRoot, "config/capture-rules-known-drift.json");
const API_BASE = (process.env.ADOPS_PUBLIC_API_BASE_URL || "https://adops-api.codigo5.com.br/api").replace(/\/$/, "");
const STRICT = process.env.ADOPS_CAPTURE_RULE_AUDIT_STRICT !== "0";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizeProofStyle(value) {
  const normalized = String(value || "").trim();
  return normalized || "viewport_only";
}

function normalizeContextSelector(rule) {
  return String(rule.contextSelector || rule.slotSelector || "").trim();
}

function issue(severity, code, message, details = {}) {
  return { severity, code, message, details };
}

function matchesKnownDrift(item, baseline) {
  if (item.severity !== "error" || item.code !== baseline.code) return false;
  return Object.entries(baseline)
    .filter(([key]) => key !== "code")
    .every(([key, value]) => JSON.stringify(item.details?.[key]) === JSON.stringify(value));
}

function addToMap(map, key, value) {
  const bucket = map.get(key) || [];
  bucket.push(value);
  map.set(key, bucket);
}

function flattenJsonConfig(config) {
  const rules = [];
  for (const [siteSigla, site] of Object.entries(config || {})) {
    const mappings = Array.isArray(site?.formatMappings) ? site.formatMappings : [];
    for (const mapping of mappings) {
      rules.push({
        source: "json",
        siteSigla,
        groupId: Number(mapping.groupId),
        aliases: Array.isArray(mapping.aliases) ? mapping.aliases : [],
        inputAliases: Array.isArray(mapping.inputAliases) ? mapping.inputAliases : [],
        page: String(mapping.page || "home"),
        slotSelector: String(mapping.slotSelector || ""),
        contextSelector: normalizeContextSelector(mapping),
        scrollMode: String(mapping.scrollMode || "slot"),
        proofStyle: normalizeProofStyle(mapping.proofStyle),
      });
    }
  }
  return rules;
}

async function fetchRules(status = null) {
  const items = [];
  let cursor = "";
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`${API_BASE}/capture-rules`);
    url.searchParams.set("limit", "200");
    if (status) url.searchParams.set("status", status);
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url);
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`capture-rules retornou JSON inválido: ${text.slice(0, 180)}`);
    }
    if (!response.ok) {
      throw new Error(`capture-rules falhou: HTTP ${response.status} ${JSON.stringify(payload)}`);
    }
    const pageItems = Array.isArray(payload?.items) ? payload.items : [];
    items.push(...pageItems);
    if (!payload?.hasMore || !payload?.nextCursor) break;
    cursor = String(payload.nextCursor);
  }
  return items.map((rule) => ({
    source: "api",
    id: Number(rule.id),
    siteSigla: String(rule.siteSigla || ""),
    groupId: Number(rule.groupId),
    aliases: Array.isArray(rule.aliases) ? rule.aliases : [],
    page: String(rule.page || "home"),
    slotSelector: String(rule.slotSelector || ""),
    contextSelector: normalizeContextSelector(rule),
    scrollMode: String(rule.scrollMode || "slot"),
    proofStyle: normalizeProofStyle(rule.proofStyle),
    statusPublished: rule.statusPublished === true,
    enabled: rule.enabled !== false,
    ruleVersionHash: rule.ruleVersionHash || null,
    archivedAt: rule.archivedAt || null,
  }));
}

function auditNonPublishedRules(allRules) {
  const issues = [];
  const bySiteGroup = new Map();
  for (const rule of allRules.filter((item) => !item.archivedAt)) {
    addToMap(bySiteGroup, `${rule.siteSigla}:${rule.groupId}`, rule);
  }
  for (const [key, bucket] of bySiteGroup.entries()) {
    const published = bucket.filter((item) => item.statusPublished === true);
    const drafts = bucket.filter((item) => item.statusPublished !== true);
    if (published.length === 1 && drafts.length > 0) {
      issues.push(issue("warning", "non_published_rule_same_position", `Existe regra não publicada para a mesma posição ${key}. Ela não afeta o runtime, mas pode confundir no painel.`, {
        key,
        publishedRuleId: published[0]?.id ?? null,
        nonPublishedRuleIds: drafts.map((item) => item.id),
      }));
    }
  }
  return issues;
}

function auditRuleSet(name, rules) {
  const issues = [];
  const bySiteGroup = new Map();
  const bySitePageSlot = new Map();
  const bySiteAlias = new Map();

  for (const rule of rules) {
    const ref = `${rule.siteSigla}/grupo-${rule.groupId}`;
    if (!rule.siteSigla) issues.push(issue("error", "missing_site", `${name}: regra sem siteSigla.`, { rule }));
    if (!Number.isFinite(rule.groupId) || rule.groupId <= 0) issues.push(issue("error", "invalid_group", `${name}: ${ref} tem groupId inválido.`, { rule }));
    if (!rule.slotSelector) issues.push(issue("error", "missing_slot_selector", `${name}: ${ref} não tem slotSelector.`, { rule }));
    if (rule.scrollMode !== "top" && rule.scrollMode !== "slot") issues.push(issue("error", "invalid_scroll_mode", `${name}: ${ref} tem scrollMode inválido.`, { scrollMode: rule.scrollMode }));
    if (rule.proofStyle !== "viewport_only" && rule.proofStyle !== "viewport_with_slot_inset") issues.push(issue("error", "invalid_proof_style", `${name}: ${ref} tem proofStyle inválido.`, { proofStyle: rule.proofStyle }));

    addToMap(bySiteGroup, `${rule.siteSigla}:${rule.groupId}`, rule);
    addToMap(bySitePageSlot, `${rule.siteSigla}:${rule.page}:${rule.slotSelector}`, rule);

    for (const alias of [...rule.aliases, ...(rule.inputAliases || [])]) {
      const normalizedAlias = normalizeText(alias);
      if (!normalizedAlias) continue;
      addToMap(bySiteAlias, `${rule.siteSigla}:${normalizedAlias}`, rule);
    }
  }

  for (const [key, bucket] of bySiteGroup.entries()) {
    if (bucket.length > 1) {
      issues.push(issue("error", "duplicate_site_group", `${name}: existe mais de uma regra para ${key}.`, {
        key,
        rules: bucket.map((item) => ({ id: item.id, siteSigla: item.siteSigla, groupId: item.groupId, aliases: item.aliases })),
      }));
    }
  }

  for (const [key, bucket] of bySitePageSlot.entries()) {
    const groupIds = [...new Set(bucket.map((item) => item.groupId))];
    if (groupIds.length > 1) {
      issues.push(issue("error", "duplicate_site_page_slot", `${name}: o mesmo slotSelector aponta para grupos diferentes em ${key}.`, {
        key,
        groupIds,
        rules: bucket.map((item) => ({ id: item.id, groupId: item.groupId, aliases: item.aliases, inputAliases: item.inputAliases || [] })),
      }));
    }
  }

  for (const [key, bucket] of bySiteAlias.entries()) {
    const groupIds = [...new Set(bucket.map((item) => item.groupId))];
    if (groupIds.length > 1) {
      issues.push(issue("error", "duplicate_site_alias", `${name}: o mesmo nome operacional está em grupos diferentes: ${key}.`, {
        key,
        groupIds,
        rules: bucket.map((item) => ({ id: item.id, groupId: item.groupId, aliases: item.aliases })),
      }));
    }
  }

  return issues;
}

function compareJsonAndApi(jsonRules, apiRules) {
  const issues = [];
  const jsonByKey = new Map(jsonRules.map((rule) => [`${rule.siteSigla}:${rule.groupId}`, rule]));
  const apiByKey = new Map(apiRules.map((rule) => [`${rule.siteSigla}:${rule.groupId}`, rule]));
  const allKeys = [...new Set([...jsonByKey.keys(), ...apiByKey.keys()])].sort();
  const fields = ["page", "slotSelector", "contextSelector", "scrollMode", "proofStyle"];

  for (const key of allKeys) {
    const jsonRule = jsonByKey.get(key);
    const apiRule = apiByKey.get(key);
    if (!jsonRule) {
      issues.push(issue("error", "api_rule_missing_from_json", `API tem regra publicada sem par no JSON: ${key}.`, { key, apiRule }));
      continue;
    }
    if (!apiRule) {
      issues.push(issue("error", "json_rule_missing_from_api", `JSON tem regra sem regra publicada no painel/API: ${key}.`, { key, jsonRule }));
      continue;
    }
    for (const field of fields) {
      if (String(jsonRule[field] || "") !== String(apiRule[field] || "")) {
        issues.push(issue("error", "json_api_field_mismatch", `JSON e API divergem em ${key}.${field}.`, {
          key,
          field,
          json: jsonRule[field],
          api: apiRule[field],
          apiRuleId: apiRule.id,
        }));
      }
    }
    const jsonAliases = [...new Set(jsonRule.aliases.map(normalizeText).filter(Boolean))].sort();
    const apiAliases = [...new Set(apiRule.aliases.map(normalizeText).filter(Boolean))].sort();
    if (JSON.stringify(jsonAliases) !== JSON.stringify(apiAliases)) {
      issues.push(issue("error", "json_api_alias_mismatch", `JSON e API divergem nos aliases de ${key}.`, {
        key,
        jsonAliases,
        apiAliases,
        apiRuleId: apiRule.id,
      }));
    }
  }
  return issues;
}

const startedAt = Date.now();
const config = JSON.parse(await readFile(configPath, "utf8"));
const knownDrift = JSON.parse(await readFile(knownDriftPath, "utf8"));
const jsonRules = flattenJsonConfig(config);
const allApiRules = await fetchRules(null);
const apiRules = allApiRules.filter((rule) => rule.statusPublished === true);

const observedIssues = [
  ...auditRuleSet("JSON", jsonRules),
  ...auditRuleSet("API publicada", apiRules),
  ...auditNonPublishedRules(allApiRules),
  ...compareJsonAndApi(jsonRules, apiRules),
];
const issues = observedIssues.map((item) => {
  const baseline = knownDrift.issues.find((entry) => matchesKnownDrift(item, entry));
  if (!baseline) return item;
  return {
    ...item,
    severity: "warning",
    code: "known_baseline_drift",
    message: `${item.message} Divergência conhecida; os valores precisam continuar exatamente iguais à baseline para não bloquear.`,
    details: { ...item.details, originalCode: item.code, baselineVersion: knownDrift.version },
  };
});

const errors = issues.filter((item) => item.severity === "error");
const warnings = issues.filter((item) => item.severity === "warning");
const summary = {
  ok: errors.length === 0,
  strict: STRICT,
  knownDriftBaseline: { version: knownDrift.version, reviewedAt: knownDrift.reviewedAt },
  apiBase: API_BASE,
  durationMs: Date.now() - startedAt,
  totals: {
    jsonRules: jsonRules.length,
    apiTotalRules: allApiRules.length,
    apiPublishedRules: apiRules.length,
    errors: errors.length,
    warnings: warnings.length,
  },
  issues,
};

console.log(JSON.stringify(summary, null, 2));

if (STRICT && errors.length > 0) {
  process.exit(1);
}
