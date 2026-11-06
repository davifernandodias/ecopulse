// Deixa dois ou três relatos em Ribeirão Preto para o mapa não abrir em branco na banca
// (permitido por docs/05-dados.md). O relato ao vivo continua obrigatório na demo.
// Passa pela API e pela fila, como qualquer relato. Uso: npm run semear
import { randomUUID } from 'node:crypto';

const API = process.env.API_URL || 'http://localhost:3000';
const dispositivoId = '00000000-0000-4000-8000-00000000de30'; // "dispositivo de ensaio", fixo

const relatos = [
  { tipo: 'alagamento', gravidade: 'media', texto: 'Água acumulada perto da rotatória', latitude: -21.1912, longitude: -47.7978 },
  { tipo: 'via_obstruida', gravidade: 'baixa', texto: 'Faixa da direita interditada', latitude: -21.1688, longitude: -47.8241 },
  { tipo: 'alagamento', gravidade: 'baixa', texto: 'Poça grande na esquina', latitude: -21.2034, longitude: -47.8162 },
];

for (const r of relatos) {
  const corpo = { id: randomUUID(), dispositivoId, nomeExibicao: 'Ensaio', criadoEm: new Date().toISOString(), ...r };
  const resp = await fetch(`${API}/relatos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  console.log(resp.status, r.tipo, r.gravidade, r.texto);
}
