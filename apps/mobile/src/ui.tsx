// Tokens e componentes visuais das telas (docs/07-app-telas.md e docs/telas/).
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Gravidade, Tipo } from './tipos';

export const cor = {
  texto: '#12261F',
  textoSecundario: '#4A5D55',
  primaria: '#0B5D4E',
  alerta: '#7A2E0B',
  semConexao: '#34423C',
  erro: '#A12B0B',
  erroFundo: '#FBE9E4',
  fundoFormulario: '#F4F6F3',
  fundoMapa: '#E4EAE1',
  borda: '#C9D3CC',
  divisor: '#DCE3DE',
  selecao: '#E0EFEA',
  usuario: '#1D6FB8',
  alagamento: '#1B5E9B',
  via: '#12261F',
  branco: '#FFFFFF',
};

export const fonte = { regular: 'DMSans_400Regular', medio: 'DMSans_500Medium', negrito: 'DMSans_700Bold' };

// Escalas de docs/06 §4 (as mesmas do mapa), usadas na legenda.
export const escalaAqi = ['#F2D16B', '#F0A04B', '#D9622B', '#9B3A1A'];
export const escalaCalor = ['#F6D5D0', '#EE9A8F', '#D6455D', '#8C1D40'];

export const nomeTipo: Record<Tipo, string> = { alagamento: 'Alagamento', via_obstruida: 'Via obstruída' };
export const nomeGravidade: Record<Gravidade, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };

/** "12 minutos", "1 hora", "2 horas e 5 minutos". */
export function tempoDesde(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 1) return 'menos de 1 minuto';
  if (min < 60) return `${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.floor(min / 60), m = min % 60;
  const horas = `${h} ${h === 1 ? 'hora' : 'horas'}`;
  return m ? `${horas} e ${m} min` : horas;
}

export function hora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function T({ style, peso = 'regular', children, ...resto }: React.ComponentProps<typeof Text> & { peso?: keyof typeof fonte }) {
  return <Text {...resto} style={[{ fontFamily: fonte[peso], color: cor.texto }, style]}>{children}</Text>;
}

export function Chip({ rotulo, ligado, aoTocar }: { rotulo: string; ligado: boolean; aoTocar(): void }) {
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityState={{ selected: ligado }}
      accessibilityLabel={`Camada ${rotulo}`}
      style={[e.chip, ligado ? e.chipLigado : e.chipDesligado]}
    >
      {ligado && <Feather name="check" size={16} color={cor.branco} style={{ marginRight: 8 }} />}
      <T peso="negrito" style={{ fontSize: 15, color: ligado ? cor.branco : cor.texto }}>{rotulo}</T>
    </Pressable>
  );
}

/** Aviso em pílula branca abaixo dos chips (telas 2 e 4). */
export function Pilula({ texto, girando, icone }: { texto: string; girando?: boolean; icone?: keyof typeof Feather.glyphMap }) {
  return (
    <View style={e.pilula}>
      {girando ? <ActivityIndicator size="small" color={cor.primaria} /> : icone ? <Feather name={icone} size={16} color={cor.primaria} /> : null}
      <T peso="medio" style={{ fontSize: 15, marginLeft: 8 }}>{texto}</T>
    </View>
  );
}

/** Cartão de aviso: verde no sucesso (tela 9), branco com check no relato guardado (tela 12). */
export function Cartao({ titulo, texto, verde }: { titulo?: string; texto: string; verde?: boolean }) {
  return (
    <View style={[e.cartao, verde ? { backgroundColor: cor.primaria } : { backgroundColor: cor.branco }]} accessibilityLiveRegion="polite">
      <Feather name="check-circle" size={24} color={verde ? cor.branco : cor.primaria} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        {titulo && <T peso="negrito" style={{ fontSize: 17, color: verde ? cor.branco : cor.texto }}>{titulo}</T>}
        <T peso={titulo ? 'regular' : 'negrito'} style={{ fontSize: 15, color: verde ? cor.branco : cor.texto, marginTop: titulo ? 2 : 0 }}>{texto}</T>
      </View>
    </View>
  );
}

/** Faixa do topo: alerta (marrom, telas 10/11/14) ou sem conexão (cinza, tela 12). */
export function Faixa({ titulo, texto, icone, fundo, children }: {
  titulo: string; texto: string; icone: keyof typeof Feather.glyphMap; fundo: string; children?: ReactNode;
}) {
  return (
    <View style={[e.faixa, { backgroundColor: fundo }]} accessibilityRole="alert">
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Feather name={icone} size={24} color={cor.branco} />
        <T peso="negrito" style={{ fontSize: 19, color: cor.branco, marginLeft: 12, flex: 1 }}>{titulo}</T>
      </View>
      <T style={{ fontSize: 16, color: cor.branco, marginTop: 10, lineHeight: 22 }}>{texto}</T>
      {children}
    </View>
  );
}

export function BotaoFaixa({ rotulo, cheio, estreito, aoTocar }: { rotulo: string; cheio?: boolean; estreito?: boolean; aoTocar(): void }) {
  return (
    <Pressable onPress={aoTocar} accessibilityRole="button" style={[e.botaoFaixa, estreito && { flex: 0.75 }, cheio ? { backgroundColor: cor.branco } : { borderWidth: 2, borderColor: cor.branco }]}>
      <T peso="negrito" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 15, color: cheio ? cor.alerta : cor.branco }}>{rotulo}</T>
    </Pressable>
  );
}

/** Painel inferior (telas 5, 6, 13). */
export function Ficha({ titulo, aoFechar, children, inferior = 0 }: { titulo: string; aoFechar(): void; children: ReactNode; inferior?: number }) {
  return (
    <View style={[e.ficha, { paddingBottom: 20 + inferior }]}>
      <View style={e.alca} />
      <View style={e.fichaTopo}>
        <T peso="negrito" style={{ fontSize: 24, flex: 1 }}>{titulo}</T>
        <Pressable onPress={aoFechar} style={e.botaoRedondo} accessibilityLabel="Fechar" accessibilityRole="button">
          <Feather name="x" size={22} color={cor.texto} />
        </Pressable>
      </View>
      {children}
    </View>
  );
}

export function LinhaFicha({ rotulo, valor, corValor }: { rotulo: string; valor: string; corValor?: string }) {
  return (
    <View style={e.linhaFicha}>
      <T style={{ fontSize: 16, color: cor.textoSecundario }}>{rotulo}</T>
      <T peso="negrito" style={{ fontSize: 17, color: corValor ?? cor.texto }}>{valor}</T>
    </View>
  );
}

function BarraEscala({ cores }: { cores: string[] }) {
  return (
    <View style={e.barra}>
      {cores.map((c) => <View key={c} style={{ flex: 1, backgroundColor: c }} />)}
    </View>
  );
}

/** Legenda do canto inferior esquerdo (telas 1 e 3). Com ar e calor ligados, empilha as duas. */
export function Legenda({ ar, calor, pontos }: { ar: boolean; calor: boolean; pontos: boolean }) {
  if (!ar && !calor) return null;
  return (
    <View style={e.legenda}>
      {calor && (
        <View>
          <T peso="negrito" style={{ fontSize: 14 }}>Calor (temperatura)</T>
          <BarraEscala cores={escalaCalor} />
          <View style={e.extremos}><T style={e.extremo}>Menor</T><T style={e.extremo}>Maior</T></View>
          <View style={e.chave}>
            <View style={e.semDado} />
            <T style={e.chaveTexto}>Sem dado da Open-Meteo</T>
          </View>
        </View>
      )}
      {ar && (
        <View style={calor ? { marginTop: 10 } : undefined}>
          <T peso="negrito" style={{ fontSize: 14 }}>Qualidade do ar (AQI)</T>
          <BarraEscala cores={escalaAqi} />
          <View style={e.extremos}><T style={e.extremo}>Bom</T><T style={e.extremo}>Ruim</T></View>
          {pontos && (
            <View style={e.chave}>
              <View style={[e.bolinha, { backgroundColor: cor.alagamento }]} />
              <T style={e.chaveTexto}>Alagamento</T>
              <View style={[e.losango, { marginLeft: 14 }]} />
              <T style={e.chaveTexto}>Via</T>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export function BotaoPrimario({ rotulo, aoTocar, desativado, icone }: { rotulo: string; aoTocar(): void; desativado?: boolean; icone?: keyof typeof Feather.glyphMap }) {
  return (
    <Pressable onPress={aoTocar} disabled={desativado} accessibilityRole="button" accessibilityState={{ disabled: !!desativado }}
      style={[e.botaoPrimario, { opacity: desativado ? 0.45 : 1 }]}>
      {icone && <Feather name={icone} size={22} color={cor.branco} style={{ marginRight: 10 }} />}
      <T peso="negrito" style={{ fontSize: 18, color: cor.branco }}>{rotulo}</T>
    </Pressable>
  );
}

export const sombra = { shadowColor: '#12261F', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 };

export const e = StyleSheet.create({
  chip: { height: 44, borderRadius: 22, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', marginRight: 8, marginBottom: 8 },
  chipLigado: { backgroundColor: cor.primaria },
  chipDesligado: { backgroundColor: cor.branco, borderWidth: 1, borderColor: cor.borda },
  pilula: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', backgroundColor: cor.branco, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, ...sombra },
  cartao: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 16, ...sombra },
  faixa: { borderRadius: 18, padding: 16, ...sombra },
  botaoFaixa: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  ficha: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: cor.branco, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, ...sombra },
  alca: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: cor.borda, marginBottom: 10 },
  fichaTopo: { flexDirection: 'row', alignItems: 'center', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: cor.divisor },
  botaoRedondo: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: cor.borda, backgroundColor: cor.fundoFormulario, alignItems: 'center', justifyContent: 'center' },
  linhaFicha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: cor.divisor },
  legenda: { width: 210, backgroundColor: cor.branco, borderRadius: 16, padding: 14, ...sombra },
  barra: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  extremos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  extremo: { fontSize: 13, color: cor.textoSecundario },
  chave: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  chaveTexto: { fontSize: 13, marginLeft: 6 },
  bolinha: { width: 12, height: 12, borderRadius: 6 },
  losango: { width: 10, height: 10, backgroundColor: cor.via, transform: [{ rotate: '45deg' }] },
  semDado: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderStyle: 'dashed', borderColor: cor.textoSecundario },
  botaoPrimario: { height: 56, borderRadius: 28, backgroundColor: cor.primaria, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
