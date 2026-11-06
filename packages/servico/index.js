import amqp from 'amqplib';
import Redis from 'ioredis';
import pg from 'pg';
import { declararTopologia } from '@ecopulse/contratos';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export async function conectarAmqp(url, nome) {
  for (let i = 1; ; i++) {
    try {
      const conn = await amqp.connect(url);
      // Perdeu o RabbitMQ: encerra e deixa o Docker reiniciar. Mais simples que reconectar canal por canal.
      conn.on('close', () => { console.error(`[${nome}] conexão AMQP fechada, encerrando`); process.exit(1); });
      conn.on('error', (e) => console.error(`[${nome}] erro AMQP`, e.message));
      const ch = await conn.createConfirmChannel();
      await declararTopologia(ch);
      console.log(`[${nome}] RabbitMQ conectado`);
      return { conn, ch };
    } catch (e) {
      console.warn(`[${nome}] RabbitMQ indisponível (tentativa ${i}): ${e.message}`);
      await espera(Math.min(1000 * i, 5000));
    }
  }
}

export function criarRedis(url, nome) {
  const r = new Redis(url, { maxRetriesPerRequest: 2 });
  r.on('error', (e) => console.warn(`[${nome}] Redis: ${e.message}`));
  return r;
}

export function criarPool(url) {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  pool.on('error', (e) => console.warn('[pg] erro no pool', e.message));
  return pool;
}

/** Publica com confirmação do broker: só retorna quando o RabbitMQ guardou a mensagem. */
export function publicar(ch, fila, corpo, extra = {}) {
  return new Promise((resolve, reject) => {
    ch.sendToQueue(
      fila,
      Buffer.from(JSON.stringify(corpo)),
      { persistent: true, contentType: 'application/json', ...extra },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

// ---- Incidentes: formato único no Redis, na API e no WebSocket ----

const COLUNAS_INCIDENTE = `id, tipo, gravidade, status, h3, h3_r7,
  ST_Y(ponto::geometry) AS latitude, ST_X(ponto::geometry) AS longitude,
  texto, total_relatos, ultimo_relato, expira_em`;

export function linhaParaIncidente(r) {
  return {
    id: r.id,
    tipo: r.tipo,
    gravidade: r.gravidade,
    status: r.status,
    h3: r.h3,
    h3r7: r.h3_r7,
    latitude: r.latitude,
    longitude: r.longitude,
    texto: r.texto || undefined,
    totalRelatos: r.total_relatos,
    ultimoRelato: new Date(r.ultimo_relato).toISOString(),
    expiraEm: new Date(r.expira_em).toISOString(),
  };
}

/** Incidentes ativos agrupados pela célula res. 7. Sempre devolve uma entrada (talvez vazia) por célula pedida. */
export async function incidentesAtivosPorR7(pool, celulas) {
  const porCelula = Object.fromEntries(celulas.map((c) => [c, []]));
  if (celulas.length === 0) return porCelula;
  const { rows } = await pool.query(
    `SELECT ${COLUNAS_INCIDENTE} FROM incidentes WHERE ativo AND expira_em > now() AND h3_r7 = ANY($1)`,
    [celulas],
  );
  for (const r of rows) porCelula[r.h3_r7].push(linhaParaIncidente(r));
  return porCelula;
}

/** Zoom aberto demais para células: consulta direta por retângulo no PostGIS. */
export async function incidentesAtivosNoBbox(pool, [o, s, l, n], limite = 1000) {
  const { rows } = await pool.query(
    `SELECT ${COLUNAS_INCIDENTE} FROM incidentes
      WHERE ativo AND expira_em > now()
        AND ponto && ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography
      ORDER BY ultimo_relato DESC LIMIT $5`,
    [o, s, l, n, limite],
  );
  return rows.map(linhaParaIncidente);
}
