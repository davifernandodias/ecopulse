// Navegador: mesma interface do armazenamento do celular, sobre localStorage.
// (SQLite no navegador pede WASM e cabeçalhos especiais; para o segundo cliente da demo isto basta.)
import type { EstadoOutbox, ItemOutbox, RespostaCamadas } from './tipos';
import { uuid } from './uuid';

const ler = <T,>(k: string, padrao: T): T => {
  try { const v = localStorage.getItem(`ecopulse:${k}`); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
};
const gravar = (k: string, v: unknown) => {
  try { localStorage.setItem(`ecopulse:${k}`, JSON.stringify(v)); } catch { /* sem armazenamento */ }
};

export async function iniciar() {
  const lista = ler<ItemOutbox[]>('outbox', []);
  gravar('outbox', lista.map((i) => (i.estado === 'enviando' ? { ...i, estado: 'pendente' } : i)));
}

export async function obterDispositivo() {
  let d = ler<{ id: string; nome?: string } | null>('dispositivo', null);
  if (!d) { d = { id: uuid() }; gravar('dispositivo', d); }
  return d;
}

export async function listarOutbox(): Promise<ItemOutbox[]> {
  return ler<ItemOutbox[]>('outbox', []);
}

export async function inserirOutbox(i: ItemOutbox) {
  gravar('outbox', [...ler<ItemOutbox[]>('outbox', []), i]);
}

export async function atualizarOutbox(id: string, estado: EstadoOutbox, motivo?: string) {
  gravar('outbox', ler<ItemOutbox[]>('outbox', []).map((i) => (i.id === id ? { ...i, estado, motivo } : i)));
}

export async function limparEnviados() {
  gravar('outbox', ler<ItemOutbox[]>('outbox', []).filter((i) => i.estado !== 'enviado'));
}

export async function dispensar(chave: string, ate: number) {
  gravar('dispensados', { ...ler<Record<string, number>>('dispensados', {}), [chave]: ate });
}

export async function listarDispensados(): Promise<Record<string, number>> {
  const agora = Date.now();
  const d = Object.fromEntries(Object.entries(ler<Record<string, number>>('dispensados', {})).filter(([, ate]) => ate > agora));
  gravar('dispensados', d);
  return d;
}

export async function salvarCamadas(r: RespostaCamadas) { gravar('camadas_cache', r); }
export async function ultimaCamada(): Promise<RespostaCamadas | null> { return ler('camadas_cache', null); }

export async function removerOutbox(id: string) {
  gravar('outbox', ler<ItemOutbox[]>('outbox', []).filter((i) => i.id !== id));
}
