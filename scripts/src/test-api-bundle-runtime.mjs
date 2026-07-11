#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const build = await readFile(path.join(root, "artifacts/api-server/build.mjs"), "utf8");
const upload = await readFile(path.join(root, "ops/portainer/adops-stack/scripts/upload-runtime-volumes.sh"), "utf8");

assert(build.match(/^\s*"playwright",\s*$/m), "playwright precisa continuar externo ao bundle");
assert(upload.includes("mcr.microsoft.com/playwright:v1.59.1-noble"));
assert(upload.includes("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile"));
assert(upload.includes("Runtime dependency install failed"));

console.log("ok: immutable app volume installs runtime dependencies in the production image");
