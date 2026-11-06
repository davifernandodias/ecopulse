// Teste de ponta a ponta do backend, com os containers no ar.
// Uso: npm run teste:fluxo   (API em http://localhost:3000, RabbitMQ do Docker em localhost:5673)
import { randomUUID } from 'node:crypto';
import amqp from 'amqplib';

const API = process.env.API_URL || 'http://localhost:3000';
const AMQP = process.env.AMQP_URL_HOST || 'amqp://ecopulse:ecopulse_dev@localhost:5673';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (cond, nome) => { console.log(`${cond ? 'OK  ' : 'FALHOU'} ${nome}`); if (!cond) falhas++; };

// Ponto aleatório perto do centro de Ribeirão Preto, para cada execução cair numa célula nova.
const base = { lat: -21.1775 + (Math.random() - 0.5) * 0.04, lon: -47.8103 + (Math.random() - 0.5) * 0.04 };
const bbox = [base.lon - 0.05, base.lat - 0.05, base.lon + 0.05, base.lat + 0.05];
const dispositivoId = randomUUID();

const saude = await fetch(`${API}/saude`).then((r) => r.json());
ok(saude.ok, 'GET /saude');

// Cliente WebSocket inscrito a ~100 m do ponto do relato.
const recebidos = [];
const ws = new WebSocket(API.replace(/^http/, 'ws') + '/ws');
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => recebidos.push(JSON.parse(e.data));
ws.send(JSON.stringify({ tipo: 'inscrever', bbox, posicao: { latitude: base.lat + 0.0009, longitude: base.lon } }));
await espera(300);
ok(recebidos.some((m) => m.tipo === 'inscrito'), 'WebSocket inscrito');

const relato = (extra = {}) => ({
  id: randomUUID(), dispositivoId, tipo: 'alagamento', gravidade: 'alta', texto: 'teste automatizado',
  latitude: base.lat, longitude: base.lon, criadoEm: new Date().toISOString(), ...extra,
});

const r1 = await fetch(`${API}/relatos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(relato()) });
ok(r1.status === 202, 'POST /relatos responde 202');

const invalido = await fetch(`${API}/relatos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(relato({ tipo: 'tsunami' })) });
ok(invalido.status === 400, 'POST /relatos com tipo inválido responde 400');

await espera(1500);
const pino = recebidos.find((m) => m.tipo === 'camada.atualizada' && m.camada === 'incidentes');
ok(pino && pino.incidente.status === 'recebido', 'pino chega pelo WebSocket com status recebido');
const alerta = recebidos.find((m) => m.tipo === 'alerta' && m.alerta.categoria === 'alagamento');
ok(alerta, `alerta de proximidade chega (${alerta?.alerta.mensagem})`);

await fetch(`${API}/relatos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(relato({ latitude: base.lat + 0.0002, gravidade: 'media' })) });
await espera(1500);
const camadas = await fetch(`${API}/camadas?bbox=${bbox.join(',')}&zoom=13`).then((r) => r.json());
const inc = camadas.incidentes.find((i) => i.id === pino?.incidente.id);
ok(inc && inc.status === 'confirmado' && inc.totalRelatos === 2, 'segundo relato na mesma célula marca confirmado');

// Payload quebrado publicado direto na fila: tem que ir para a DLQ sem retry.
const conn = await amqp.connect(AMQP);
const ch = await conn.createChannel();
const antes = (await ch.checkQueue('ecopulse.relatos.dlq')).messageCount;
ch.sendToQueue('ecopulse.relatos.recebido', Buffer.from('{"quebrado": true}'), { persistent: true });
await espera(1500);
const depois = (await ch.checkQueue('ecopulse.relatos.dlq')).messageCount;
ok(depois === antes + 1, 'payload inválido cai na DLQ');
await conn.close();

ws.close();
console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
