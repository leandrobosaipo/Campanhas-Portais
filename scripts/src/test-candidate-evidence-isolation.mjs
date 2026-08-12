#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const captureSource = await readFile(path.join(repoRoot, "scripts/src/capture-insertion-proof.cjs"), "utf8");
const runtimeSource = await readFile(path.join(repoRoot, "artifacts/api-server/src/lib/local-capture-runtime.ts"), "utf8");

assert.match(runtimeSource, /["']--candidateOnly["'][\s\S]*?["']--saveEvidence["']/);
assert.match(runtimeSource, /options\.promoteCandidate \? ["']true["'] : ["']false["']/);
assert.match(captureSource, /args\.candidateOnly\s*\?\s*path\.join\([\s\S]*?generatedPrintsRoot,[\s\S]*?["']candidates["']/);
assert.match(captureSource, /if \(args\.saveEvidence && args\.apiBase && internalCaptureToken\)/);
assert.match(captureSource, /if \(args\.saveEvidence && publicUrl\)/);

console.log("ok: candidate artifacts and metadata are isolated from current evidence");
