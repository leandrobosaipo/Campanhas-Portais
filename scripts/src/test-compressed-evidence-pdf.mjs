#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const inputRoot = process.argv[2];
const outputPath = process.argv[3];

if (!inputRoot || !outputPath) {
  throw new Error("Uso: node test-compressed-evidence-pdf.mjs <pasta-com-pngs> <saida.pdf>");
}

async function listPngFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listPngFiles(fullPath);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".png") ? [fullPath] : [];
  }));
  return nested.flat();
}

const files = (await listPngFiles(path.resolve(inputRoot))).sort();
if (!files.length) throw new Error("Nenhum PNG encontrado.");

const tempDir = await mkdtemp(path.join(tmpdir(), "adops-compressed-pdf-test-"));
const manifestPath = path.join(tempDir, "manifest.json");
const imagesOutputDir = `${path.resolve(outputPath)}-images`;
await writeFile(manifestPath, JSON.stringify({
  version: 1,
  maxWidth: 1920,
  quality: 68,
  resolution: 120,
  imagesOutputDir,
  pages: files.map((inputPath, index) => ({
    inputPath,
    dateKey: null,
    evidenceId: index + 1,
    insertionId: 0,
    outputRelativePath: `${String(index + 1).padStart(3, "0")}-${path.basename(inputPath, path.extname(inputPath))}.jpg`,
  })),
}), "utf8");

const scriptPath = path.resolve("scripts/src/build-compressed-evidence-pdf.py");
const { stdout } = await execFileAsync("python3", [
  scriptPath,
  "--manifest",
  manifestPath,
  "--output",
  path.resolve(outputPath),
]);
process.stdout.write(stdout);
