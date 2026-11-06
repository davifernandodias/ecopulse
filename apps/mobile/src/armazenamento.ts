// Celular: SQLite local (expo-sqlite). Tabelas de docs/05-dados.md:
// dispositivo, outbox, dispensados, camadas_cache.
import * as SQLite from 'expo-sqlite';
import type { EstadoOutbox, ItemOutbox, RespostaCamadas } from './tipos';
import { uuid } from './uuid';

let db: SQLite.SQLiteDatabase;

export async function iniciar() {
  db = await SQLite.openDatabaseAsync('ecopulse.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS dispositivo (id TEXT PRIMARY KEY NOT NULL, nome TEXT);
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY NOT NULL, tipo TEXT NOT NULL, gravidade TEXT NOT NULL, texto TEXT,
      latitude REAL NOT NULL, longitude REAL NOT NULL, criado_em TEXT NOT NULL,
      estado TEXT NOT NULL, motivo TEXT, seq INTEGER
    );
    CREATE TABLE IF NOT EXISTS dispensados (chave TEXT PRIMARY KEY NOT NULL, ate INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS camadas_cache (chave TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, salvo_em INTEGER NOT NULL);
  `);
  // Se o app fechou no meio de um envio, o item volta para pendente.
  await db.runAsync(`UPDATE outbox SET estado = 'pendente' WHERE estado = 'enviando'`);
}

export async function obterDispositivo(): Promise<{ id: string; nome?: string }> {
  const linha = await db.getFirstAsync<{ id: string; nome: string | null }>('SELECT id, nome FROM dispositivo LIMIT 1');
  if (linha) return { id: linha.id, nome: linha.nome ?? undefined };
  const id = uuid();
  await db.runAsync('INSERT INTO dispositivo (id) VALUES (?)', id);
  return { id };
}

export async function listarOutbox(): Promise<ItemOutbox[]> {
  const linhas = await db.getAllAsync<any>('SELECT * FROM outbox ORDER BY seq ASC');
  return linhas.map((l) => ({
    id: l.id, tipo: l.tipo, gravidade: l.gravidade, texto: l.texto ?? undefined,
    latitude: l.latitude, longitude: l.longitude, criadoEm: l.criado_em, estado: l.estado, motivo: l.motivo ?? undefined,
  }));
}

export async function inserirOutbox(i: ItemOutbox) {
  await db.runAsync(
    `INSERT INTO outbox (id, tipo, gravidade, texto, latitude, longitude, criado_em, estado, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM outbox))`,
    i.id, i.tipo, i.gravidade, i.texto ?? null, i.latitude, i.longitude, i.criadoEm, i.estado,
  );
}

export async function atualizarOutbox(id: string, estado: EstadoOutbox, motivo?: string) {
  await db.runAsync('UPDATE outbox SET estado = ?, motivo = ? WHERE id = ?', estado, motivo ?? null, id);
}

export async function limparEnviados() {
  await db.runAsync(`DELETE FROM outbox WHERE estado = 'enviado'`);
}

export async function dispensar(chave: string, ate: number) {
  await db.runAsync('INSERT OR REPLACE INTO dispensados (chave, ate) VALUES (?, ?)', chave, ate);
}

export async function listarDispensados(): Promise<Record<string, number>> {
  await db.runAsync('DELETE FROM dispensados WHERE ate < ?', Date.now());
  const linhas = await db.getAllAsync<{ chave: string; ate: number }>('SELECT chave, ate FROM dispensados');
  return Object.fromEntries(linhas.map((l) => [l.chave, l.ate]));
}

export async function salvarCamadas(r: RespostaCamadas) {
  await db.runAsync('INSERT OR REPLACE INTO camadas_cache (chave, json, salvo_em) VALUES (?, ?, ?)', 'ultima', JSON.stringify(r), Date.now());
}

export async function ultimaCamada(): Promise<RespostaCamadas | null> {
  const l = await db.getFirstAsync<{ json: string }>(`SELECT json FROM camadas_cache WHERE chave = 'ultima'`);
  return l ? JSON.parse(l.json) : null;
}
