import assert from 'node:assert/strict';
import test from 'node:test';
import { cod5_coordenar_reservas } from '../../ops/cloudflare-remote-runner/src/runner-polling.mjs';

test('tres consumidores ociosos fazem uma consulta e respeitam backoff', async () => {
  let cod5_tempo = 100_000, cod5_consultas = 0;
  const cod5_reservar = cod5_coordenar_reservas(async () => { cod5_consultas++; return null; }, { cod5_agora: () => cod5_tempo, cod5_aleatorio: () => 0 });
  await Promise.all([cod5_reservar(), cod5_reservar(), cod5_reservar()]);
  assert.equal(cod5_consultas, 1);
  cod5_tempo += 5000; await cod5_reservar(); assert.equal(cod5_consultas, 2);
  cod5_tempo += 5000; await cod5_reservar(); assert.equal(cod5_consultas, 2);
});
test('jobs disponiveis ocupam slots sem atrasar concorrencia', async () => {
  let cod5_numero = 0;
  const cod5_reservar = cod5_coordenar_reservas(async () => ({ id: ++cod5_numero }));
  assert.deepEqual((await Promise.all([cod5_reservar(), cod5_reservar(), cod5_reservar()])).map(x => x.id), [1, 2, 3]);
});
test('cota abre circuito ate o proximo reset UTC e erro transitorio recupera', async () => {
  let cod5_tempo = 100_000, cod5_consultas = 0;
  const cod5_reservar = cod5_coordenar_reservas(async () => {
    cod5_consultas++;
    if (cod5_consultas === 1) throw new Error("Your account has exceeded D1's free tier daily row read limit");
    return { id: 1 };
  }, { cod5_agora: () => cod5_tempo });
  await assert.rejects(cod5_reservar());
  cod5_tempo += 60_000; assert.equal(await cod5_reservar(), null); assert.equal(cod5_consultas, 1);
  cod5_tempo = 86_460_000; assert.deepEqual(await cod5_reservar(), { id: 1 });
});
