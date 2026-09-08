import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runner = await readFile(new URL("../../ops/cloudflare-remote-runner/src/runner.mjs", import.meta.url), "utf8");
const compose = await readFile(new URL("../../ops/portainer/adops-stack/docker-compose.volume.yml", import.meta.url), "utf8");

assert(runner.includes('ADOPS_DRIVE_REQUEST_TIMEOUT_MS || "300000"'));
assert(compose.includes("ADOPS_DRIVE_REQUEST_TIMEOUT_MS:-300000"));
console.log("ok: Drive downloads allow five minutes for large campaign media");
