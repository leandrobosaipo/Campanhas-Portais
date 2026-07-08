import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const figmaUrl = String(process.env.FIGMA_URL || "").trim();
const figmaFileKey = String(process.env.FIGMA_FILE_KEY || "").trim();
const figmaNodeId = String(process.env.FIGMA_NODE_ID || "").trim();
const contextJsonPath = path.resolve(root, "docs/figma-context/adops-responsive-v1/design-context.json");
const screenshotPath = path.resolve(root, "docs/figma-context/adops-responsive-v1/screenshot.png");

function hasUrlContract() {
  if (!figmaUrl) return false;
  try {
    const parsed = new URL(figmaUrl);
    const nodeId = parsed.searchParams.get("node-id");
    const chunks = parsed.pathname.split("/").filter(Boolean);
    const designIndex = chunks.indexOf("design");
    const fileKey = designIndex >= 0 ? chunks[designIndex + 1] : "";
    return Boolean(fileKey && nodeId);
  } catch {
    return false;
  }
}

function hasFileNodeContract() {
  return Boolean(figmaFileKey && figmaNodeId);
}

async function hasLocalContextContract() {
  try {
    await fs.access(contextJsonPath);
    await fs.access(screenshotPath);
    return true;
  } catch {
    return false;
  }
}

const checks = [];
checks.push({ mode: "url", ok: hasUrlContract() });
checks.push({ mode: "file_node", ok: hasFileNodeContract() });
checks.push({ mode: "local_context", ok: await hasLocalContextContract() });

const ok = checks.some((item) => item.ok);
if (ok) {
  console.log(`Figma input contract OK: ${checks.filter((item) => item.ok).map((item) => item.mode).join(", ")}`);
  process.exit(0);
}

console.error("Figma input contract missing.");
console.error("Provide FIGMA_URL or FIGMA_FILE_KEY+FIGMA_NODE_ID, or save local context at docs/figma-context/adops-responsive-v1/.");
process.exit(1);
