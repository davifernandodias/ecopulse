// EcoPulse worker-relatos — consome ecopulse.relatos.recebido, grava no PostGIS,
// agrega o incidente por célula H3 res. 9, atualiza o Redis e emite o alerta.
import { latLngToCell, cellToParent } from 'h3-js';
import * as C from '@ecopulse/contratos';
import {
  conectarAmqp, criarRedis, criarPool, incidentesAtivosPorR7, linhaParaIncidente,
} from '@ecopulse/servico';

const NOME = 'worker-relatos';
const pool = criarPool(process.env.DATABASE_URL);
const redis = criarRedis(process.env.REDIS_URL, NOME);
const { ch } = await conectarAmqp(process.env.AMQP_URL, NOME);
await ch.prefetch(5);

/** Grava o relato e atualiza o incidente numa transação. Devolve o incidente e se ele é novo. */
async function gravar(relato) {
  const h3 = latLngToCell(relato.latitude, relato.longitude, C.H3_RES_INCIDENTE);
  const h3r7 = cellToParent(h3, C.H3_RES_CLIMA);
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');

    // Mensagem repetida (redelivery depois de uma queda): já gravado, só refaz cache e eventos.
    const repetido = await cli.query('SELECT incidente_id FROM relatos WHERE id = $1', [relato.id]);
    if (repetido.rowCount) {
      await cli.query('ROLLBACK');
      const { rows } = await pool.query(
        `SELECT id, tipo, gravidade, status, h3, h3_r7, ST_Y(ponto::geometry) AS latitude, ST_X(ponto::geometry) AS longitude,
                texto, total_relatos, ultimo_relato, expira_em FROM incidentes WHERE id = $1`,
        [repetido.rows[0].incidente_id],
      );
      return { incidente: linhaParaIncidente(rows[0]), repetido: true };
    }

    const limite = await cli.query(
      `SELECT count(*)::int AS n FROM relatos WHERE dispositivo_id = $1 AND recebido_em > now() - interval '1 hour'`,
      [relato.dispositivoId],
    );
    if (limite.rows[0].n >= C.LIMITE_RELATOS_HORA) {
      await cli.query('ROLLBACK');
      throw new C.ErroPermanente(`dispositivo passou de ${C.LIMITE_RELATOS_HORA} relatos na última hora`);
    }

    // Incidente vencido (6 h sem relato) deixa de ser o ativo daquela célula.
    await cli.query(
      `UPDATE incidentes SET ativo = false WHERE ativo AND tipo = $1 AND h3 = $2 AND expira_em <= now()`,
      [relato.tipo, h3],
    );

    const existente = await cli.query(
      `SELECT * FROM incidentes WHERE ativo AND tipo = $1 AND h3 = $2 FOR UPDATE`,
      [relato.tipo, h3],
    );

    let incidenteId;
    if (existente.rowCount) {
      const atual = existente.rows[0];
      const recentes = await cli.query(
        `SELECT count(*)::int AS n FROM relatos WHERE tipo = $1 AND h3 = $2 AND recebido_em > now() - $3 * interval '1 millisecond'`,
        [relato.tipo, h3, C.JANELA_CONFIRMACAO_MS],
      );
      // Dois relatos do mesmo tipo na mesma célula em até 2 h: confirmado.
      const status = atual.status === 'confirmado' || recentes.rows[0].n + 1 >= 2 ? 'confirmado' : 'recebido';
      const gravidade = C.ORDEM_GRAVIDADE[relato.gravidade] > C.ORDEM_GRAVIDADE[atual.gravidade] ? relato.gravidade : atual.gravidade;
      await cli.query(
        `UPDATE incidentes SET status = $2, gravidade = $3, texto = COALESCE($4, texto),
                total_relatos = total_relatos + 1, ultimo_relato = now(),
                expira_em = now() + $5 * interval '1 second'
          WHERE id = $1`,
        [atual.id, status, gravidade, relato.texto ?? null, C.TTL_INCIDENTE_S],
      );
      incidenteId = atual.id;
    } else {
      const novo = await cli.query(
        `INSERT INTO incidentes (tipo, h3, h3_r7, status, gravidade, ponto, texto, primeiro_relato, ultimo_relato, expira_em)
         VALUES ($1, $2, $3, 'recebido', $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7,
                 now(), now(), now() + $8 * interval '1 second')
         RETURNING id`,
        [relato.tipo, h3, h3r7, relato.gravidade, relato.longitude, relato.latitude, relato.texto ?? null, C.TTL_INCIDENTE_S],
      );
      incidenteId = novo.rows[0].id;
    }

    await cli.query(
      `INSERT INTO relatos (id, dispositivo_id, nome_exibicao, tipo, gravidade, texto, ponto, h3, incidente_id, criado_em)
       VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9, $10, $11)`,
      [relato.id, relato.dispositivoId, relato.nomeExibicao ?? null, relato.tipo, relato.gravidade, relato.texto ?? null,
        relato.longitude, relato.latitude, h3, incidenteId, relato.criadoEm],
    );

    const { rows } = await cli.query(
      `SELECT id, tipo, gravidade, status, h3, h3_r7, ST_Y(ponto::geometry) AS latitude, ST_X(ponto::geometry) AS longitude,
              texto, total_relatos, ultimo_relato, expira_em FROM incidentes WHERE id = $1`,
      [incidenteId],
    );
    await cli.query('COMMIT');
    return { incidente: linhaParaIncidente(rows[0]), repetido: false };
  } catch (e) {
    await cli.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    cli.release();
  }
}

/** Reescreve a lista da célula res. 7 no Redis a partir do PostgreSQL (o registro) e avisa a api. */
async function propagar(incidente) {
  const porR7 = await incidentesAtivosPorR7(pool, [incidente.h3r7]);
  await redis.set(C.chaveIncidentes(incidente.h3r7), JSON.stringify(porR7[incidente.h3r7]), 'EX', C.TTL_INCIDENTE_S);
  await redis.publish(C.CANAL_EVENTOS, JSON.stringify({
    evento: C.EVENTOS.CAMADA_ATUALIZADA,
    dados: { camada: 'incidentes', incidente },
  }));
  if (C.ORDEM_GRAVIDADE[incidente.gravidade] >= C.ORDEM_GRAVIDADE.media) {
    await redis.publish(C.CANAL_EVENTOS, JSON.stringify({
      evento: C.EVENTOS.ALERTA_GERADO,
      dados: {
        incidenteId: incidente.id,
        tipo: incidente.tipo,
        gravidade: incidente.gravidade,
        latitude: incidente.latitude,
        longitude: incidente.longitude,
        h3: incidente.h3,
      },
    }));
  }
}

/** Conteúdo original intacto na DLQ; o motivo vai no header. */
function paraDlq(msg, motivo, tentativas) {
  console.warn(`[${NOME}] DLQ: ${motivo}`);
  return enviarCru(C.FILAS.RELATOS_DLQ, msg, { [C.HEADER_MOTIVO]: motivo, [C.HEADER_TENTATIVAS]: tentativas });
}

function enviarCru(fila, msg, headers) {
  return new Promise((res, rej) => ch.sendToQueue(fila, msg.content, {
    persistent: true,
    contentType: 'application/json',
    messageId: msg.properties.messageId,
    headers: { ...msg.properties.headers, ...headers },
  }, (err) => (err ? rej(err) : res())));
}

await ch.consume(C.FILAS.RELATOS, async (msg) => {
  if (!msg) return;
  const tentativas = Number(msg.properties.headers?.[C.HEADER_TENTATIVAS] ?? 0);
  try {
    let relato;
    try { relato = JSON.parse(msg.content.toString()); } catch { throw new C.ErroPermanente('JSON inválido'); }
    const motivo = C.validarRelato(relato);
    if (motivo) throw new C.ErroPermanente(motivo);

    const { incidente, repetido } = await gravar(relato);
    await propagar(incidente);
    ch.ack(msg); // ack só depois de gravar no PostgreSQL
    console.log(`[${NOME}] relato ${relato.id} -> incidente ${incidente.id} (${incidente.tipo}, ${incidente.gravidade}, ${incidente.status})${repetido ? ' [repetido]' : ''}`);
  } catch (e) {
    try {
      if (e instanceof C.ErroPermanente) {
        // Retry não conserta payload quebrado.
        await paraDlq(msg, e.message, tentativas);
      } else if (tentativas < C.MAX_TENTATIVAS) {
        await enviarCru(C.nomeFilaRetry(C.FILAS.RELATOS, tentativas), msg, { [C.HEADER_TENTATIVAS]: tentativas + 1 });
        console.warn(`[${NOME}] falha transitória, tentativa ${tentativas + 1}/${C.MAX_TENTATIVAS} em ${C.RETRY_ESPERAS_MS[tentativas] / 1000}s: ${e.message}`);
      } else {
        await paraDlq(msg, `esgotou ${C.MAX_TENTATIVAS} tentativas: ${e.message}`, tentativas);
      }
      ch.ack(msg);
    } catch (e2) {
      // Nem retry nem DLQ conseguiram publicar: devolve para a fila.
      console.error(`[${NOME}] não conseguiu tratar a falha, devolvendo mensagem`, e2.message);
      ch.nack(msg, false, true);
    }
  }
}, { noAck: false });

console.log(`[${NOME}] consumindo ${C.FILAS.RELATOS}`);
