// EcoPulse api — HTTP e WebSocket. Não conclui o relato: valida o mínimo, publica e responde 202.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { latLngToCell, gridDisk, cellToLatLng } from 'h3-js';
import * as C from '@ecopulse/contratos';
import { celulasClimaDoBbox, celulaNoBbox, pontoNoBbox } from '@ecopulse/contratos/geo';
import {
  conectarAmqp, criarRedis, criarPool, publicar,
  incidentesAtivosPorR7, incidentesAtivosNoBbox,
} from '@ecopulse/servico';
import { iniciarTempoReal } from './tempo-real.js';

const PORTA = Number(process.env.PORTA || 3000);
const USER_AGENT = 'EcoPulse/0.1 (projeto academico DSD UNIP; ambiente local)';

const pool = criarPool(process.env.DATABASE_URL);
const redis = criarRedis(process.env.REDIS_URL, 'api');
const { ch } = await conectarAmqp(process.env.AMQP_URL, 'api');

// ---------- Leitura de camadas (Redis primeiro, PostgreSQL na falta) ----------

/** Incidentes por célula res. 7: Redis; chave ausente vem do PostgreSQL e volta para o cache. */
async function incidentesDasCelulas(celulas) {
  const resultado = {};
  let faltando = celulas;
  try {
    const valores = celulas.length ? await redis.mget(celulas.map(C.chaveIncidentes)) : [];
    faltando = [];
    celulas.forEach((c, i) => {
      if (valores[i] == null) faltando.push(c);
      else resultado[c] = JSON.parse(valores[i]);
    });
  } catch (e) {
    console.warn('[api] Redis fora na leitura de incidentes, indo ao PostgreSQL:', e.message);
  }
  if (faltando.length) {
    const doBanco = await incidentesAtivosPorR7(pool, faltando);
    Object.assign(resultado, doBanco);
    // Leitura preenche o cache só se a chave ainda não existe (NX): o worker é quem escreve por cima.
    const p = redis.pipeline();
    for (const [c, lista] of Object.entries(doBanco)) p.set(C.chaveIncidentes(c), JSON.stringify(lista), 'EX', 120, 'NX');
    p.exec().catch(() => {});
  }
  const agora = Date.now();
  for (const c of Object.keys(resultado)) resultado[c] = resultado[c].filter((i) => Date.parse(i.expiraEm) > agora);
  return resultado;
}

async function climaDasCelulas(celulas) {
  const resultado = {};
  let faltando = celulas;
  try {
    const valores = celulas.length ? await redis.mget(celulas.map(C.chaveClima)) : [];
    faltando = [];
    celulas.forEach((c, i) => {
      if (valores[i] == null) faltando.push(c);
      else resultado[c] = JSON.parse(valores[i]);
    });
  } catch (e) {
    console.warn('[api] Redis fora na leitura de clima:', e.message);
  }
  if (faltando.length) {
    // Leitura antiga do PostgreSQL (até 6 h) enquanto a nova não chega. Marcada como antiga.
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (h3) h3, temperatura, aqi, lido_em FROM leituras_clima
        WHERE h3 = ANY($1) AND lido_em > now() - interval '6 hours'
        ORDER BY h3, lido_em DESC`,
      [faltando],
    );
    for (const r of rows) {
      resultado[r.h3] = { h3: r.h3, temperatura: r.temperatura, aqi: r.aqi, lidoEm: r.lido_em.toISOString(), antigo: true };
    }
  }
  return { resultado, faltando };
}

async function solicitarClima(bbox, zoom) {
  // Evita publicar o mesmo pedido a cada gesto: um pedido por retângulo arredondado a cada 20 s.
  const chave = `clima:pedido:${bbox.map((v) => v.toFixed(2)).join(',')}`;
  const novo = await redis.set(chave, '1', 'EX', 20, 'NX').catch(() => 'OK');
  if (!novo) return false;
  await publicar(ch, C.FILAS.CLIMA, { bbox, zoom });
  return true;
}

// ---------- HTTP ----------

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/saude', async (_req, res) => {
  const servicos = {};
  servicos.redis = await redis.ping().then(() => 'ok', (e) => e.message);
  servicos.postgres = await pool.query('SELECT 1').then(() => 'ok', (e) => e.message);
  servicos.rabbitmq = await ch.checkQueue(C.FILAS.RELATOS).then(() => 'ok', (e) => e.message);
  const ok = Object.values(servicos).every((v) => v === 'ok');
  res.status(ok ? 200 : 503).json({ ok, servicos });
});

// Contagem das filas, para mostrar na demo sem abrir o painel.
app.get('/status/filas', async (_req, res) => {
  const nomes = Object.values(C.FILAS);
  const filas = {};
  for (const n of nomes) {
    const q = await ch.checkQueue(n);
    filas[n] = { mensagens: q.messageCount, consumidores: q.consumerCount };
  }
  res.json(filas);
});

app.get('/camadas', async (req, res) => {
  const bbox = String(req.query.bbox || '').split(',').map(Number);
  const erro = C.validarBbox(bbox);
  if (erro) return res.status(400).json({ erro });
  const zoom = Number(req.query.zoom) || 12;
  const pedidas = String(req.query.camadas || 'calor,ar,alagamento,vias').split(',');
  const querClima = pedidas.includes('calor') || pedidas.includes('ar');
  const querIncidentes = pedidas.includes('alagamento') || pedidas.includes('vias');

  try {
    const celulas = celulasClimaDoBbox(bbox);
    const resposta = { bbox, zoom, clima: { disponivel: !!celulas, pendente: false, celulas: [] }, incidentes: [] };

    if (!celulas) resposta.clima.motivo = 'aproxime para ver a mancha';

    if (querClima && celulas) {
      const { resultado, faltando } = await climaDasCelulas(celulas);
      resposta.clima.celulas = Object.values(resultado);
      if (faltando.length) {
        await solicitarClima(bbox, zoom);
        resposta.clima.pendente = true;
      }
    }

    if (querIncidentes) {
      let lista;
      if (celulas) lista = Object.values(await incidentesDasCelulas(celulas)).flat();
      else lista = await incidentesAtivosNoBbox(pool, bbox);
      resposta.incidentes = lista.filter((i) =>
        pontoNoBbox(i.latitude, i.longitude, bbox) &&
        ((i.tipo === 'alagamento' && pedidas.includes('alagamento')) || (i.tipo === 'via_obstruida' && pedidas.includes('vias'))));
    }
    res.json(resposta);
  } catch (e) {
    console.error('[api] /camadas', e);
    res.status(500).json({ erro: 'falha ao ler camadas' });
  }
});

app.post('/relatos', async (req, res) => {
  const corpo = { ...req.body };
  if (!corpo.id) corpo.id = randomUUID();
  if (!corpo.criadoEm) corpo.criadoEm = new Date().toISOString();
  if (typeof corpo.latitude === 'string') corpo.latitude = Number(corpo.latitude);
  if (typeof corpo.longitude === 'string') corpo.longitude = Number(corpo.longitude);
  if (corpo.texto === '') delete corpo.texto;
  const erro = C.validarRelato(corpo);
  if (erro) return res.status(400).json({ erro });
  const mensagem = C.criarRelatoRecebido(corpo);
  try {
    await publicar(ch, C.FILAS.RELATOS, mensagem, { messageId: mensagem.id });
    res.status(202).json({ id: mensagem.id, status: 'aceito' });
  } catch (e) {
    console.error('[api] falha ao publicar relato', e);
    res.status(503).json({ erro: 'fila indisponível, tente de novo' });
  }
});

// Busca de endereço: Nominatim, um resultado, User-Agent do app. Nada é guardado.
app.get('/busca', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.status(400).json({ erro: 'busca vazia' });
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return res.status(502).json({ erro: `Nominatim respondeu ${r.status}` });
    const [primeiro] = await r.json();
    if (!primeiro) return res.status(404).json({ erro: 'nada encontrado' });
    const [s, n, o, l] = primeiro.boundingbox.map(Number);
    res.json({ nome: primeiro.display_name, latitude: Number(primeiro.lat), longitude: Number(primeiro.lon), bbox: [o, s, l, n] });
  } catch (e) {
    res.status(502).json({ erro: 'busca indisponível' });
  }
});

// Nome aproximado do lugar para a ficha. Cache de 1 dia por coordenada arredondada.
app.get('/lugar', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ erro: 'lat/lon' });
  const chave = `lugar:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const emCache = await redis.get(chave).catch(() => null);
  if (emCache) return res.json(JSON.parse(emCache));
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lon}`;
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(8000) });
    const j = r.ok ? await r.json() : null;
    const a = j?.address || {};
    const nome = [a.suburb || a.neighbourhood || a.quarter, a.city || a.town || a.village || a.municipality].filter(Boolean).join(', ') || null;
    const corpo = { nome };
    redis.set(chave, JSON.stringify(corpo), 'EX', 86400).catch(() => {});
    res.json(corpo);
  } catch {
    res.json({ nome: null });
  }
});

// ---------- Riscos na posição (usado pelo WebSocket) ----------

/** Riscos ativos perto de uma posição: incidentes até 500 m (média/alta) e clima acima do limiar. */
async function riscosNaPosicao(lat, lon) {
  const centro = latLngToCell(lat, lon, C.H3_RES_CLIMA);
  const vizinhas = gridDisk(centro, 1);
  const porCelula = await incidentesDasCelulas(vizinhas);
  const alertas = [];
  for (const i of Object.values(porCelula).flat()) {
    if (C.ORDEM_GRAVIDADE[i.gravidade] < C.ORDEM_GRAVIDADE.media) continue;
    const d = C.distanciaMetros(lat, lon, i.latitude, i.longitude);
    if (d <= C.RAIO_ALERTA_M) alertas.push(alertaDeIncidente(i, d));
  }
  const clima = await redis.get(C.chaveClima(centro)).catch(() => null);
  if (clima) alertas.push(...alertasDeClima(JSON.parse(clima)));
  return alertas;
}

function alertaDeIncidente(i, distancia) {
  const nome = i.tipo === 'alagamento' ? 'Alagamento' : 'Via obstruída';
  const metros = Math.max(50, Math.round(distancia / 50) * 50);
  return {
    chave: `incidente:${i.id}`,
    categoria: i.tipo,
    mensagem: `${nome} a cerca de ${metros} m`,
    gravidade: i.gravidade,
    incidenteId: i.id,
    latitude: i.latitude,
    longitude: i.longitude,
    distanciaM: Math.round(distancia),
  };
}

function alertasDeClima(c) {
  const [latitude, longitude] = cellToLatLng(c.h3);
  const lista = [];
  if (c.aqi != null && c.aqi > C.AQI_LIMIAR) {
    lista.push({ chave: `ar:${c.h3}`, categoria: 'ar', mensagem: `Ar ruim nesta região (AQI ${c.aqi})`, h3: c.h3, latitude, longitude });
  }
  if (c.temperatura != null && c.temperatura > C.TEMP_LIMIAR) {
    lista.push({ chave: `calor:${c.h3}`, categoria: 'calor', mensagem: `Calor acima de ${C.TEMP_LIMIAR} °C nesta região`, h3: c.h3, latitude, longitude });
  }
  return lista;
}

// ---------- Subida ----------

const servidor = http.createServer(app);
iniciarTempoReal({ servidor, redis, redisUrl: process.env.REDIS_URL, riscosNaPosicao, alertaDeIncidente, alertasDeClima, celulaNoBbox });
servidor.listen(PORTA, '0.0.0.0', () => console.log(`[api] ouvindo em :${PORTA}`));

const encerrar = () => servidor.close(() => process.exit(0));
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
