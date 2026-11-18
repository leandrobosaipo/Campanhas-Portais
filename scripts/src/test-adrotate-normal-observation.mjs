import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../../artifacts/api-server/src/routes/insertions.ts', import.meta.url), 'utf8');
const flow = source.slice(source.indexOf('async function fetchLivePreview('), source.indexOf('router.get("/reports/evidences/monthly"'));
assert.match(flow, /normalObservations/, 'API deve expor a observação da URL pública normal');
assert.doesNotMatch(flow, /cod5_adops_verify|no-cache|no-store|Cookie:/, 'diagnóstico não pode contornar a chave normal');
assert.match(source, /normalObservations: live.normalObservations/);
console.log('ok: normal public observation is exposed without cache bypass');
