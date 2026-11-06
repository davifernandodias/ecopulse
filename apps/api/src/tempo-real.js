// WebSocket da api. O cliente se inscreve com o retângulo visível e a posição;
// eventos do Redis pub/sub (vindos dos workers) são repassados a quem está naquela região.
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { latLngToCell } from 'h3-js';
import * as C from '@ecopulse/contratos';
import { pontoNoBbox } from '@ecopulse/contratos/geo';
import { criarRedis } from '@ecopulse/servico';

const CHAVE_INSCRICOES = 'ecopulse:inscricoes';
const INSTANCIA = randomUUID();

export function iniciarTempoReal({ servidor, redis, redisUrl, riscosNaPosicao, alertaDeIncidente, alertasDeClima, celulaNoBbox }) {
  const wss = new WebSocketServer({ server: servidor, path: '/ws' });
  /** @type {Map<import('ws').WebSocket, {id:string, bbox?:number[], posicao?:{latitude:number,longitude:number}, enviados:Set<string>, vivo:boolean}>} */
  const clientes = new Map();

  const enviar = (ws, msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };

  function enviarAlerta(ws, cliente, alerta) {
    // Não repete o mesmo alerta na mesma conexão. Dispensar por 30 min é regra do aparelho.
    if (cliente.enviados.has(alerta.chave)) return;
    cliente.enviados.add(alerta.chave);
    enviar(ws, { tipo: 'alerta', alerta });
  }

  async function verificarPosicao(ws, cliente) {
    if (!cliente.posicao) return;
    try {
      const alertas = await riscosNaPosicao(cliente.posicao.latitude, cliente.posicao.longitude);
      for (const a of alertas) enviarAlerta(ws, cliente, a);
    } catch (e) {
      console.warn('[ws] falha ao verificar posição', e.message);
    }
  }

  const guardarInscricao = (c) =>
    redis.hset(CHAVE_INSCRICOES, c.id, JSON.stringify({ instancia: INSTANCIA, bbox: c.bbox, posicao: c.posicao, em: new Date().toISOString() })).catch(() => {});

  wss.on('connection', (ws) => {
    const cliente = { id: randomUUID(), enviados: new Set(), vivo: true };
    clientes.set(ws, cliente);
    enviar(ws, { tipo: 'conectado', id: cliente.id });
    ws.on('pong', () => { cliente.vivo = true; });

    ws.on('message', async (bruto) => {
      let msg;
      try { msg = JSON.parse(bruto.toString()); } catch { return; }
      if (msg.tipo === 'inscrever') {
        if (!C.validarBbox(msg.bbox)) cliente.bbox = msg.bbox;
        if (posicaoValida(msg.posicao)) cliente.posicao = msg.posicao;
        guardarInscricao(cliente);
        enviar(ws, { tipo: 'inscrito', bbox: cliente.bbox });
        verificarPosicao(ws, cliente);
      } else if (msg.tipo === 'posicao') {
        if (posicaoValida(msg)) {
          cliente.posicao = { latitude: msg.latitude, longitude: msg.longitude };
          guardarInscricao(cliente);
          verificarPosicao(ws, cliente);
        }
      } else if (msg.tipo === 'ping') {
        enviar(ws, { tipo: 'pong' });
      }
    });

    ws.on('close', () => {
      clientes.delete(ws);
      redis.hdel(CHAVE_INSCRICOES, cliente.id).catch(() => {});
    });
  });

  // Conexão morta (celular saiu da rede sem fechar) é derrubada em até 60 s.
  setInterval(() => {
    for (const [ws, c] of clientes) {
      if (!c.vivo) { ws.terminate(); continue; }
      c.vivo = false;
      ws.ping();
    }
  }, 30000).unref();

  // ---- Redis pub/sub: eventos dos workers ----
  const sub = criarRedis(redisUrl, 'api-sub');
  sub.subscribe(C.CANAL_EVENTOS).then(() => console.log(`[ws] inscrito em ${C.CANAL_EVENTOS}`));
  sub.on('message', (_canal, bruto) => {
    let ev;
    try { ev = JSON.parse(bruto); } catch { return; }
    if (ev.evento === C.EVENTOS.CAMADA_ATUALIZADA) repassarCamada(ev.dados);
    else if (ev.evento === C.EVENTOS.ALERTA_GERADO) repassarAlerta(ev.dados);
  });

  function repassarCamada(dados) {
    if (dados.camada === 'clima') {
      for (const [ws, c] of clientes) {
        if (!c.bbox) continue;
        const celulas = dados.celulas.filter((cel) => celulaNoBbox(cel.h3, c.bbox));
        if (celulas.length) enviar(ws, { tipo: 'camada.atualizada', camada: 'clima', celulas });
        // Célula nova de clima pode estar acima do limiar onde a pessoa está.
        if (c.posicao) verificarPosicaoClima(ws, c, dados.celulas);
      }
    } else if (dados.camada === 'incidentes') {
      const i = dados.incidente;
      for (const [ws, c] of clientes) {
        if (c.bbox && pontoNoBbox(i.latitude, i.longitude, c.bbox)) {
          enviar(ws, { tipo: 'camada.atualizada', camada: 'incidentes', incidente: i });
        }
      }
    }
  }

  function verificarPosicaoClima(ws, c, celulas) {
    const porH3 = new Map(celulas.map((x) => [x.h3, x]));
    const h = latLngToCell(c.posicao.latitude, c.posicao.longitude, C.H3_RES_CLIMA);
    const cel = porH3.get(h);
    if (cel) for (const a of alertasDeClima(cel)) enviarAlerta(ws, c, a);
  }

  function repassarAlerta(dados) {
    for (const [ws, c] of clientes) {
      if (!c.posicao) continue;
      const d = C.distanciaMetros(c.posicao.latitude, c.posicao.longitude, dados.latitude, dados.longitude);
      if (d <= C.RAIO_ALERTA_M) {
        enviarAlerta(ws, c, alertaDeIncidente({ ...dados, id: dados.incidenteId }, d));
      }
    }
  }

  return { wss, clientes };
}

function posicaoValida(p) {
  return p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
}
