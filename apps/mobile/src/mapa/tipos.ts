export type MensagemDoMapa =
  | { tipo: 'pronto' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'camera'; bbox: [number, number, number, number]; zoom: number; centro: { latitude: number; longitude: number } }
  | { tipo: 'toquePino'; id: string }
  | { tipo: 'toqueCelula'; h3: string; latitude: number; longitude: number }
  | { tipo: 'toqueVazio'; latitude: number; longitude: number }
  | { tipo: 'toqueLongo'; latitude: number; longitude: number };

export type MensagemParaMapa = Record<string, unknown> & { tipo: string };

export interface MapaRef {
  enviar(msg: MensagemParaMapa): void;
}

export interface MapaProps {
  onMensagem(msg: MensagemDoMapa): void;
}
