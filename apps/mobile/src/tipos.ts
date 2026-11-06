export type Tipo = 'alagamento' | 'via_obstruida';
export type Gravidade = 'baixa' | 'media' | 'alta';
export type Bbox = [number, number, number, number];
export interface Posicao { latitude: number; longitude: number }

export interface CelulaClima {
  h3: string;
  temperatura: number | null;
  aqi: number | null;
  lidoEm: string;
  antigo?: boolean;
}

export interface Incidente {
  id: string;
  tipo: Tipo;
  gravidade: Gravidade;
  status: 'recebido' | 'confirmado';
  latitude: number;
  longitude: number;
  texto?: string;
  totalRelatos: number;
  ultimoRelato: string;
  expiraEm: string;
}

export interface RespostaCamadas {
  bbox: Bbox;
  zoom: number;
  clima: { disponivel: boolean; pendente: boolean; motivo?: string; celulas: CelulaClima[] };
  incidentes: Incidente[];
}

export interface Alerta {
  chave: string;
  categoria: 'alagamento' | 'via_obstruida' | 'ar' | 'calor';
  mensagem: string;
  gravidade?: Gravidade;
  incidenteId?: string;
  h3?: string;
  latitude: number;
  longitude: number;
  distanciaM?: number;
}

export type EstadoOutbox = 'pendente' | 'enviando' | 'enviado' | 'falhou';

export interface ItemOutbox {
  id: string;
  tipo: Tipo;
  gravidade: Gravidade;
  texto?: string;
  latitude: number;
  longitude: number;
  criadoEm: string;
  estado: EstadoOutbox;
  motivo?: string;
}
