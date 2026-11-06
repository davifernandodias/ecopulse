// EcoPulse worker-clima — consome ecopulse.clima.solicitado, consulta a Open-Meteo para as células
// H3 res. 7 do retângulo que ainda não estão em cache, grava PostgreSQL + Redis e avisa a api.
import { cellToParent, cellToLatLng } from 'h3-js';
import * as C from '@ecopulse/contratos';
import { celulasClimaDoBbox } from '@ecopulse/contratos/geo';
import { conectarAmqp, criarRedis, criarPool } from '@ecopulse/servico';

const NOME = 'worker-clima';
// A grade da fonte é de alguns km (modelo, não estação). Consultar uma vez por célula pai res. 6
// (~36 km²) e repetir o valor nas 7 filhas res. 7 dá o mesmo resultado com 7x menos chamadas,
// e mantém o projeto dentro do limite por minuto da Open-Meteo gratuita.
const RES_CONSULTA = 6;
const LOTE = 50;

const pool = criarPool(process.env.DATABASE_URL);
const redis = criarRedis(process.env.REDIS_URL, NOME);
const { ch } = await conectarAmqp(process.env.AMQP_URL, NOME);
await ch.prefetch(1); // em série: o segundo pedido do mesmo lugar já encontra o cache

class ErroTransitorio extends Error {}

async function buscarJson(url) {
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch (e) {
    throw new ErroTransitorio(`Open-Meteo inacessível: ${e.message}`);
  }
  if (r.status === 429 || r.status >= 500) throw new ErroTransitorio(`Open-Meteo respondeu ${r.status}`);
  if (!r.ok) throw new C.ErroPermanente(`Open-Meteo respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [j];
}

async function consultarOpenMeteo(pontos) {
  const lat = pontos.map((p) => p[0].toFixed(4)).join(',');
  const lon = pontos.map((p) => p[1].toFixed(4)).join(',');
  const [tempo, ar] = await Promise.all([
    buscarJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m`),
    buscarJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi`),
  ]);
  return pontos.map((_, i) => ({
    temperatura: tempo[i]?.current?.temperature_2m ?? null,
    aqi: ar[i]?.current?.us_aqi ?? null,
  }));
}

async function processar({ bbox, zoom }) {
  const erro = C.validarBbox(bbox);
  if (erro) throw new C.ErroPermanente(erro);
  const celulas = celulasClimaDoBbox(bbox);
  if (!celulas) {
    console.log(`[${NOME}] retângulo grande demais (zoom ${zoom}), ignorado`);
    return;
  }

  const emCache = await redis.mget(celulas.map(C.chaveClima));
  const faltando = celulas.filter((_, i) => emCache[i] == null);
  if (!faltando.length) return;

  // Agrupa as células faltantes pela célula pai de consulta.
  const porPai = new Map();
  for (const c of faltando) {
    const pai = cellToParent(c, RES_CONSULTA);
    if (!porPai.has(pai)) porPai.set(pai, []);
    porPai.get(pai).push(c);
  }
  const pais = [...porPai.keys()];
  const lidoEm = new Date().toISOString();
  const leituras = [];

  for (let i = 0; i < pais.length; i += LOTE) {
    const lote = pais.slice(i, i + LOTE);
    const valores = await consultarOpenMeteo(lote.map((p) => cellToLatLng(p)));
    lote.forEach((pai, j) => {
      for (const h3 of porPai.get(pai)) leituras.push({ h3, ...valores[j], lidoEm });
    });
  }

  if (!leituras.length) return;
  await pool.query(
    `INSERT INTO leituras_clima (h3, temperatura, aqi, lido_em)
     SELECT * FROM unnest($1::text[], $2::real[], $3::int[], $4::timestamptz[])`,
    [leituras.map((l) => l.h3), leituras.map((l) => l.temperatura), leituras.map((l) => l.aqi), leituras.map((l) => l.lidoEm)],
  );
  const p = redis.pipeline();
  for (const l of leituras) p.set(C.chaveClima(l.h3), JSON.stringify(l), 'EX', C.TTL_CLIMA_S);
  await p.exec();
  await redis.publish(C.CANAL_EVENTOS, JSON.stringify({
    evento: C.EVENTOS.CAMADA_ATUALIZADA,
    dados: { camada: 'clima', bbox, celulas: leituras },
  }));
  console.log(`[${NOME}] ${leituras.length} células atualizadas (${pais.length} consultas por ponto)`);
}

function enviarCru(fila, msg, headers) {
  return new Promise((res, rej) => ch.sendToQueue(fila, msg.content, {
    persistent: true,
    contentType: 'application/json',
    headers: { ...msg.properties.headers, ...headers },
  }, (err) => (err ? rej(err) : res())));
}

await ch.consume(C.FILAS.CLIMA, async (msg) => {
  if (!msg) return;
  const tentativas = Number(msg.properties.headers?.[C.HEADER_TENTATIVAS] ?? 0);
  try {
    let pedido;
    try { pedido = JSON.parse(msg.content.toString()); } catch { throw new C.ErroPermanente('JSON inválido'); }
    await processar(pedido);
    ch.ack(msg);
  } catch (e) {
    try {
      if (!(e instanceof C.ErroPermanente) && tentativas < C.MAX_TENTATIVAS) {
        await enviarCru(C.nomeFilaRetry(C.FILAS.CLIMA, tentativas), msg, { [C.HEADER_TENTATIVAS]: tentativas + 1 });
        console.warn(`[${NOME}] falha transitória, tentativa ${tentativas + 1}/${C.MAX_TENTATIVAS}: ${e.message}`);
      } else {
        const motivo = e instanceof C.ErroPermanente ? e.message : `esgotou ${C.MAX_TENTATIVAS} tentativas: ${e.message}`;
        await enviarCru(C.FILAS.CLIMA_DLQ, msg, { [C.HEADER_MOTIVO]: motivo, [C.HEADER_TENTATIVAS]: tentativas });
        console.warn(`[${NOME}] DLQ: ${motivo}`);
      }
      ch.ack(msg);
    } catch (e2) {
      console.error(`[${NOME}] não conseguiu tratar a falha, devolvendo mensagem`, e2.message);
      ch.nack(msg, false, true);
    }
  }
}, { noAck: false });

console.log(`[${NOME}] consumindo ${C.FILAS.CLIMA}`);
