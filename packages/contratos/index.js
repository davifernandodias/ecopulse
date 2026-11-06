// Contratos compartilhados entre api, worker-relatos e worker-clima.
// Fonte: docs/04-arquitetura.md e docs/02-decisoes.md. Mudou aqui, muda lá.

export const FILAS = {
  RELATOS: 'ecopulse.relatos.recebido',
  RELATOS_DLQ: 'ecopulse.relatos.dlq',
  CLIMA: 'ecopulse.clima.solicitado',
  CLIMA_DLQ: 'ecopulse.clima.dlq',
};

// Espera crescente do retry: 2s, 4s, 8s. Uma fila de espera por degrau,
// cada uma devolve a mensagem para a fila principal quando o TTL vence.
export const RETRY_ESPERAS_MS = [2000, 4000, 8000];
export const MAX_TENTATIVAS = RETRY_ESPERAS_MS.length;
export const HEADER_TENTATIVAS = 'x-ecopulse-tentativas';
export const HEADER_MOTIVO = 'x-ecopulse-motivo';

export const CANAL_EVENTOS = 'ecopulse.eventos';
export const EVENTOS = {
  CAMADA_ATUALIZADA: 'camada.atualizada',
  ALERTA_GERADO: 'alerta.gerado',
};

export const TIPOS = ['alagamento', 'via_obstruida'];
export const GRAVIDADES = ['baixa', 'media', 'alta'];
export const ORDEM_GRAVIDADE = { baixa: 1, media: 2, alta: 3 };

export const H3_RES_CLIMA = 7;
export const H3_RES_INCIDENTE = 9;
export const MAX_CELULAS_CLIMA = 400;

export const TTL_CLIMA_S = 10 * 60;
export const TTL_INCIDENTE_S = 6 * 60 * 60;
export const JANELA_CONFIRMACAO_MS = 2 * 60 * 60 * 1000;
export const LIMITE_RELATOS_HORA = 30;
export const TEXTO_MAX = 280;

export const RAIO_ALERTA_M = 500;
export const AQI_LIMIAR = 150;
export const TEMP_LIMIAR = 35;

export const chaveClima = (h3) => `clima:h3:${h3}`;
// Incidentes são agrupados no Redis pela célula res. 7 que contém a célula res. 9 do incidente,
// para que a leitura do mapa use as mesmas células do clima.
export const chaveIncidentes = (h3r7) => `incidentes:h3:${h3r7}`;

export function nomeFilaRetry(fila, indice) {
  return `${fila}.retry.${RETRY_ESPERAS_MS[indice] / 1000}s`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Validação de formato de relato.recebido. A API usa para responder 400,
 * o worker usa de novo antes de gravar (mensagem inválida vai para a DLQ).
 * Devolve null se ok, ou o motivo em texto.
 */
export function validarRelato(r) {
  if (!r || typeof r !== 'object') return 'corpo ausente';
  if (!ehUuid(r.id)) return 'id inválido';
  if (!ehUuid(r.dispositivoId)) return 'dispositivoId inválido';
  if (!TIPOS.includes(r.tipo)) return 'tipo deve ser alagamento ou via_obstruida';
  if (!GRAVIDADES.includes(r.gravidade)) return 'gravidade deve ser baixa, media ou alta';
  if (!ehNumero(r.latitude) || r.latitude < -90 || r.latitude > 90) return 'latitude fora da faixa';
  if (!ehNumero(r.longitude) || r.longitude < -180 || r.longitude > 180) return 'longitude fora da faixa';
  if (r.texto != null && (typeof r.texto !== 'string' || r.texto.length > TEXTO_MAX)) return `texto até ${TEXTO_MAX} caracteres`;
  if (r.nomeExibicao != null && (typeof r.nomeExibicao !== 'string' || r.nomeExibicao.length > 60)) return 'nomeExibicao inválido';
  if (typeof r.criadoEm !== 'string' || Number.isNaN(Date.parse(r.criadoEm))) return 'criadoEm inválido';
  return null;
}

/** bbox na ordem oeste, sul, leste, norte. */
export function validarBbox(b) {
  if (!Array.isArray(b) || b.length !== 4 || !b.every(ehNumero)) return 'bbox deve ter 4 números';
  const [o, s, l, n] = b;
  if (s < -90 || n > 90 || s >= n) return 'bbox com sul/norte inválidos';
  if (o < -180 || l > 180 || o >= l) return 'bbox com oeste/leste inválidos';
  return null;
}

export function criarRelatoRecebido(corpo) {
  return {
    id: corpo.id,
    dispositivoId: corpo.dispositivoId,
    nomeExibicao: corpo.nomeExibicao || undefined,
    tipo: corpo.tipo,
    gravidade: corpo.gravidade,
    texto: corpo.texto ? String(corpo.texto).trim() : undefined,
    latitude: corpo.latitude,
    longitude: corpo.longitude,
    criadoEm: corpo.criadoEm,
  };
}

export function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Declara filas principais, filas de espera do retry e DLQ.
 * Recebe um channel do amqplib; o pacote de contratos não depende do amqplib.
 */
export async function declararTopologia(ch) {
  for (const [fila, dlq] of [[FILAS.RELATOS, FILAS.RELATOS_DLQ], [FILAS.CLIMA, FILAS.CLIMA_DLQ]]) {
    await ch.assertQueue(fila, { durable: true });
    await ch.assertQueue(dlq, { durable: true });
    for (let i = 0; i < RETRY_ESPERAS_MS.length; i++) {
      await ch.assertQueue(nomeFilaRetry(fila, i), {
        durable: true,
        arguments: {
          'x-message-ttl': RETRY_ESPERAS_MS[i],
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': fila,
        },
      });
    }
  }
}

/** Erro que não adianta tentar de novo: payload quebrado, regra de negócio. Vai direto para a DLQ. */
export class ErroPermanente extends Error {}
