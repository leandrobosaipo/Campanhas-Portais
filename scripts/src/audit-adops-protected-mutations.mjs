import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const TARGETS = [
  "artifacts/adops/src/pages/InsertionDetail.tsx",
  "artifacts/adops/src/components/adops/CaptureProofButton.tsx",
  "artifacts/adops/src/pages/Insertions.tsx",
  "artifacts/adops/src/pages/Dashboard.tsx",
  "artifacts/adops/src/pages/SyncCenter.tsx",
  "artifacts/adops/src/pages/Settings.tsx",
  "artifacts/adops/src/pages/NewCampaign.tsx",
  "artifacts/adops/src/pages/CampaignDetail.tsx",
];

const MUTATION_PATTERNS = [
  /apiFetch\([^)]*\{[\s\S]{0,200}?method:\s*"POST"/g,
  /apiFetch\([^)]*\{[\s\S]{0,200}?method:\s*"PATCH"/g,
  /apiFetch\([^)]*\{[\s\S]{0,200}?method:\s*"DELETE"/g,
  /fetch\(apiUrl\([^)]*\),\s*\{[\s\S]{0,200}?method:\s*"POST"/g,
];

function classifyFile(content) {
  if (!content.match(/apiFetch|fetch\(apiUrl/)) return [];

  const mutations = [];
  for (const pattern of MUTATION_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      mutations.push(match[0].replace(/\s+/g, " ").trim());
    }
  }
  return mutations;
}

function hasGuard(content) {
  return content.includes("canRunProtectedMutations") && content.includes("protectedMutationMessage");
}

const report = [];
let hasFailure = false;

for (const relativePath of TARGETS) {
  const filePath = path.join(ROOT, relativePath);
  const content = fs.readFileSync(filePath, "utf8");
  const mutations = classifyFile(content);
  if (!mutations.length) continue;

  const policy = hasGuard(content) ? "public-with-operator-token" : "missing-guard";
  if (policy === "missing-guard") hasFailure = true;

  report.push({
    file: relativePath,
    policy,
    totalMutations: mutations.length,
    mutations,
  });
}

console.log(JSON.stringify({ ok: !hasFailure, report }, null, 2));

if (hasFailure) {
  process.exit(1);
}
