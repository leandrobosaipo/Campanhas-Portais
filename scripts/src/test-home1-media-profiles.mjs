import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
process.env.ADOPS_RUNNER_TEST_MODE = '1';
const runner = await import('../../ops/cloudflare-remote-runner/src/runner.mjs');
const lateralProfile = await runner.loadOperationalMediaProfile('PERRENGUE', 'TOPO LATERAL — HEADER — 380x120');
assert.equal(lateralProfile.groupId, 10);
assert.deepEqual(lateralProfile.formats, ['GIF', 'JPEG', 'PNG']);
const dir = await mkdtemp(join(tmpdir(), 'adops-home1-check-'));
try {
  for (const [ext, format] of [['gif','GIF'],['png','PNG'],['jpg','JPEG']]) {
    const file = join(dir, `banner.${ext}`);
    execFileSync('convert', ['-size','670x90','gradient:#0057b8-#ffffff', file]);
    const result = await runner.prepareOperationalDeliveryMedia(file, {formats:['GIF','PNG','JPEG']});
    assert.equal(result.metadata.format, format);
    assert.equal(result.transformed, false);
    assert.equal(result.aspectWarning, undefined);
  }
  const wrong = join(dir, 'wrong.webp');
  execFileSync('convert', ['-size','20x20','gradient:red-blue', wrong]);
  await assert.rejects(runner.prepareOperationalDeliveryMedia(wrong,{formats:['GIF','PNG','JPEG']}), /Formato|permite/);
  const blank = join(dir, 'blank.gif');
  execFileSync('convert', ['-size','20x20','xc:white', blank]);
  await assert.rejects(runner.prepareOperationalDeliveryMedia(blank,{formats:['GIF','PNG','JPEG']}), /uniforme/);
} finally { await rm(dir, {recursive:true,force:true}); }
const config = JSON.parse(readFileSync(new URL('../../config/adrotate-sites.json', import.meta.url)));
for (const site of ['AFL', 'ROO']) {
  const matches = config[site].formatMappings.filter(m => m.aliases.includes('HOME 1'));
  assert.equal(matches.length, 1);
  assert.equal(matches[0].groupId, 2);
  assert.deepEqual(matches[0].operationalMediaProfile?.formats, ['GIF','PNG','JPEG'], `${site}: HOME1 precisa de perfil de imagem`);
  assert.ok(!matches[0].operationalMediaProfile.formats.includes('MP4'), 'não aceitar vídeo como banner');
}
console.log('ok: HOME1 AFL/ROO possui perfil GIF explícito sem alterar grupo');
