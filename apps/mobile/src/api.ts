// Cliente HTTP e WebSocket da api.
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Bbox, ItemOutbox, Posicao, RespostaCamadas } from './tipos';

/**
 * Endereço da api. No celular, o IP é o mesmo do Metro (a máquina que roda o Expo), porta 3000:
 * o celular não enxerga o localhost do computador. EXPO_PUBLIC_API_URL sobrescreve.
 */
export function urlApi(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof location !== 'undefined') return `${location.protocol}//${location.hostname}:3000`;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? '10.0.2.2'}:3000`;
}

const API = urlApi();

async function comTempo(url: string, init: RequestInit = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function buscarCamadas(bbox: Bbox, zoom: number): Promise<RespostaCamadas> {
  const r = await comTempo(`${API}/camadas?bbox=${bbox.map((v) => v.toFixed(5)).join(',')}&zoom=${zoom.toFixed(1)}`);
  if (!r.ok) throw new Error(`camadas ${r.status}`);
  return r.json();
}

export type ResultadoEnvio = { ok: true } | { ok: false; rede: boolean; motivo: string };

/** 202: aceito. 400: inválido, não adianta reenviar. Falha de rede ou 5xx: tenta depois. */
export async function enviarRelato(item: ItemOutbox, dispositivoId: string): Promise<ResultadoEnvio> {
  try {
    const r = await comTempo(`${API}/relatos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: item.id, dispositivoId, tipo: item.tipo, gravidade: item.gravidade, texto: item.texto,
        latitude: item.latitude, longitude: item.longitude, criadoEm: item.criadoEm,
      }),
    });
    if (r.status === 202) return { ok: true };
    const corpo = await r.json().catch(() => ({}));
    if (r.status >= 400 && r.status < 500) return { ok: false, rede: false, motivo: corpo.erro || `erro ${r.status}` };
    return { ok: false, rede: true, motivo: corpo.erro || `servidor ${r.status}` };
  } catch {
    return { ok: false, rede: true, motivo: 'sem conexão com a api' };
  }
}

export async function buscarLugar(q: string): Promise<{ nome: string; latitude: number; longitude: number; bbox: Bbox } | null> {
  const r = await comTempo(`${API}/busca?q=${encodeURIComponent(q)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('busca indisponível');
  return r.json();
}

export async function nomeDoLugar(p: Posicao): Promise<string | null> {
  try {
    const r = await comTempo(`${API}/lugar?lat=${p.latitude}&lon=${p.longitude}`, {}, 5000);
    return r.ok ? (await r.json()).nome : null;
  } catch {
    return null;
  }
}

type Ouvinte = (msg: any) => void;

/** WebSocket com reconexão. Guarda a última inscrição e reenvia ao reconectar. */
export class Tempo {
  private ws?: WebSocket;
  private espera = 1000;
  private inscricao?: { bbox: Bbox; posicao?: Posicao };
  private fechado = false;
  constructor(private ouvinte: Ouvinte, private aoMudarEstado: (conectado: boolean) => void) {
    this.conectar();
  }

  private conectar() {
    if (this.fechado) return;
    const ws = new WebSocket(API.replace(/^http/, 'ws') + '/ws');
    this.ws = ws;
    ws.onopen = () => {
      this.espera = 1000;
      this.aoMudarEstado(true);
      if (this.inscricao) this.mandar({ tipo: 'inscrever', ...this.inscricao });
    };
    ws.onmessage = (e) => {
      try { this.ouvinte(JSON.parse(String(e.data))); } catch { /* ignora */ }
    };
    ws.onclose = () => {
      this.aoMudarEstado(false);
      setTimeout(() => this.conectar(), this.espera);
      this.espera = Math.min(this.espera * 2, 15000);
    };
    ws.onerror = () => ws.close();
  }

  private mandar(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  inscrever(bbox: Bbox, posicao?: Posicao) {
    this.inscricao = { bbox, posicao };
    this.mandar({ tipo: 'inscrever', bbox, posicao });
  }

  posicao(p: Posicao) {
    if (this.inscricao) this.inscricao.posicao = p;
    this.mandar({ tipo: 'posicao', ...p });
  }

  /** Força reconexão imediata (ex.: rede voltou). */
  acordar() {
    if (this.ws?.readyState !== WebSocket.OPEN) { this.espera = 1000; this.ws?.close(); }
  }

  fechar() { this.fechado = true; this.ws?.close(); }
}
