#!/usr/bin/env node

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { readFileSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseSpacesEnv, restoreEvidenceFromArchive } = require("./capture-insertion-proof.cjs");

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      throw new Error(`Argumento inválido: ${key}`);
    }
    result[key.slice(2)] = argv[++index];
  }
  const required = ["env-file", "bucket", "source-key", "archive-key", "sha256", "bytes", "confirm-target-key", "public-url"];
  const missing = required.filter((key) => !result[key]);
  if (missing.length) throw new Error(`Argumentos obrigatórios ausentes: ${missing.join(", ")}`);
  if (result["confirm-target-key"] !== result["source-key"]) {
    throw new Error("A confirmação deve repetir exatamente a chave canônica informada.");
  }
  if (!/^[a-f0-9]{64}$/.test(result.sha256) || !/^[1-9][0-9]*$/.test(result.bytes)) {
    throw new Error("SHA-256 ou tamanho inválido.");
  }
  const publicUrl = new URL(result["public-url"]);
  if (publicUrl.protocol !== "https:" || !publicUrl.hostname.startsWith(`${result.bucket}.`)
    || decodeURIComponent(publicUrl.pathname.replace(/^\/+/, "")) !== result["source-key"]) {
    throw new Error("A URL pública deve apontar por HTTPS para o mesmo bucket e objeto canônico.");
  }
  return { ...result, publicUrl };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = parseSpacesEnv(args["env-file"]);
  const restored = restoreEvidenceFromArchive(env, args.bucket, {
    sourceKey: args["source-key"],
    archiveKey: args["archive-key"],
    sha256: args.sha256,
    bytes: Number(args.bytes),
  });
  const tempPath = path.join(os.tmpdir(), `adops-evidence-public-readback-${process.pid}`);
  try {
    const url = new URL(args.publicUrl);
    url.searchParams.set("adops_restore_verify", String(Date.now()));
    execFileSync("curl", ["-fsSL", "--max-time", "30", "-o", tempPath, url.toString()], { stdio: "pipe" });
    const publicBytes = readFileSync(tempPath);
    const publicSha256 = createHash("sha256").update(publicBytes).digest("hex");
    if (publicBytes.length !== restored.bytes || publicSha256 !== restored.sha256) {
      throw new Error("A leitura pública do objeto restaurado diverge do backup.");
    }
  } finally {
    rmSync(tempPath, { force: true });
  }
  process.stdout.write(`${JSON.stringify({ ...restored, publicReadbackVerified: true })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Falha ao restaurar evidência."}\n`);
  process.exitCode = 1;
});
