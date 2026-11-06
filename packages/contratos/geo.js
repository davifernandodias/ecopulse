import { polygonToCells, cellToLatLng, latLngToCell } from 'h3-js';
import { H3_RES_CLIMA, MAX_CELULAS_CLIMA } from './index.js';

// Área média de uma célula H3 res. 7, em km².
const AREA_R7_KM2 = 5.16;

export function areaBboxKm2([o, s, l, n]) {
  const latMedia = ((s + n) / 2) * (Math.PI / 180);
  return (l - o) * 111.32 * Math.cos(latMedia) * (n - s) * 110.57;
}

/**
 * Células H3 res. 7 que cobrem o retângulo, ou null se o retângulo é grande demais
 * (zoom aberto). A estimativa vem antes do cálculo para não gerar milhões de células.
 */
export function celulasClimaDoBbox(bbox, max = MAX_CELULAS_CLIMA) {
  if (areaBboxKm2(bbox) / AREA_R7_KM2 > max * 1.3) return null;
  // polygonToCells só devolve células cujo centro cai dentro do polígono. Sem margem,
  // as bordas da tela ficam sem mancha (e num zoom alto quase nenhuma célula entra).
  const [o, s, l, n] = expandirBbox(bbox);
  const anel = [[s, o], [s, l], [n, l], [n, o], [s, o]];
  let celulas = polygonToCells(anel, H3_RES_CLIMA);
  if (celulas.length === 0) {
    celulas = [latLngToCell((s + n) / 2, (o + l) / 2, H3_RES_CLIMA)];
  }
  return celulas.length > max ? celulas.slice(0, max) : celulas;
}

export function pontoNoBbox(lat, lon, [o, s, l, n]) {
  return lat >= s && lat <= n && lon >= o && lon <= l;
}

/** Centro da célula dentro do retângulo com a mesma margem usada para escolher as células. */
export function celulaNoBbox(h3, bbox) {
  const [lat, lon] = cellToLatLng(h3);
  return pontoNoBbox(lat, lon, expandirBbox(bbox));
}

// Margem de ~1,5 km: um pouco mais que a aresta de uma célula res. 7 (~1,2 km).
const MARGEM_GRAUS = 0.014;

export function expandirBbox([o, s, l, n]) {
  const cosLat = Math.max(0.2, Math.cos((((s + n) / 2) * Math.PI) / 180));
  const dLon = MARGEM_GRAUS / cosLat;
  return [Math.max(-180, o - dLon), Math.max(-90, s - MARGEM_GRAUS), Math.min(180, l + dLon), Math.min(90, n + MARGEM_GRAUS)];
}

