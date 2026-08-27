#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { patchSitesIndexUnlisted } from "./sites-index-unlisted-contract.mjs";

const [cod5_input, cod5_output] = process.argv.slice(2);
if (!cod5_input || !cod5_output) throw new Error("Uso: patch-sites-index-unlisted.mjs <server.js> <server.patched.js>");
const cod5_source = await readFile(cod5_input, "utf8");
const cod5_patched = patchSitesIndexUnlisted(cod5_source);
await writeFile(cod5_output, cod5_patched, "utf8");
console.log(JSON.stringify({ ok: true, changed: cod5_source !== cod5_patched, output: cod5_output }));
