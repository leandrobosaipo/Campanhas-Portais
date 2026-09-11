/** Uma descoberta por pool; a execução continua concorrente. */
export function cod5_coordenar_reservas(cod5_reservar, { cod5_intervalo = 5000, cod5_agora = Date.now, cod5_aleatorio = Math.random } = {}) {
  let cod5_fila = Promise.resolve();
  let cod5_proxima = 0;
  let cod5_vazios = 0;
  return () => {
    const cod5_tentativa = cod5_fila.then(async () => {
      if (cod5_agora() < cod5_proxima) return null;
      try {
        const cod5_job = await cod5_reservar();
        if (cod5_job) {
          cod5_vazios = 0;
          cod5_proxima = 0;
        } else {
          cod5_vazios += 1;
          cod5_proxima = cod5_agora() + Math.min(60_000, cod5_intervalo * 2 ** Math.min(cod5_vazios - 1, 6)) * (1 + cod5_aleatorio() * 0.15);
        }
        return cod5_job;
      } catch (cod5_erro) {
        cod5_vazios += 1;
        const cod5_mensagem = String(cod5_erro?.message || cod5_erro);
        cod5_proxima = /exceeded.*daily.*(?:row|read).*limit|D1.*daily.*limit/i.test(cod5_mensagem)
          ? Math.floor(cod5_agora() / 86_400_000) * 86_400_000 + 86_400_000 + 60_000
          : cod5_agora() + Math.min(60_000, cod5_intervalo * 2 ** Math.min(cod5_vazios, 6));
        throw cod5_erro;
      }
    });
    cod5_fila = cod5_tentativa.catch(() => undefined);
    return cod5_tentativa;
  };
}
