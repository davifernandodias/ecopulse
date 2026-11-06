import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Gravidade, Tipo } from './tipos';

export const cores = {
  fundo: '#ffffff',
  texto: '#111827',
  suave: '#6b7280',
  borda: '#e5e7eb',
  primaria: '#0f766e',
  perigo: '#dc2626',
  alerta: '#f97316',
  azul: '#2563eb',
};

export const nomeTipo: Record<Tipo, string> = { alagamento: 'Alagamento', via_obstruida: 'Via obstruída' };
export const nomeGravidade: Record<Gravidade, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
export const corGravidade: Record<Gravidade, string> = { baixa: '#ca8a04', media: '#ea580c', alta: '#dc2626' };

export function faixaAqi(aqi: number | null): { nome: string; cor: string } {
  if (aqi == null) return { nome: 'Sem dado', cor: cores.suave };
  if (aqi <= 50) return { nome: 'Bom', cor: '#16a34a' };
  if (aqi <= 100) return { nome: 'Moderado', cor: '#ca8a04' };
  if (aqi <= 150) return { nome: 'Ruim', cor: '#ea580c' };
  return { nome: 'Péssimo', cor: '#dc2626' };
}

export function haQuanto(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  return `há ${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
}

export function hora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function Folha({ titulo, aoFechar, children, inferior = 0 }: { titulo: string; aoFechar(): void; children: ReactNode; inferior?: number }) {
  return (
    <View style={[estilos.folha, { paddingBottom: 16 + inferior }]}>
      <View style={estilos.folhaTopo}>
        <Text style={estilos.folhaTitulo}>{titulo}</Text>
        <Pressable onPress={aoFechar} hitSlop={12} accessibilityLabel="Fechar">
          <Text style={estilos.fechar}>✕</Text>
        </Pressable>
      </View>
      <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </View>
  );
}

export function Chip({ rotulo, ativo, cor, aoTocar }: { rotulo: string; ativo: boolean; cor: string; aoTocar(): void }) {
  return (
    <Pressable onPress={aoTocar} style={[estilos.chip, ativo && { backgroundColor: cor, borderColor: cor }]}>
      <Text style={[estilos.chipTexto, ativo && { color: '#fff' }]}>{rotulo}</Text>
    </Pressable>
  );
}

export function Opcao({ rotulo, ativo, cor = cores.primaria, aoTocar }: { rotulo: string; ativo: boolean; cor?: string; aoTocar(): void }) {
  return (
    <Pressable onPress={aoTocar} style={[estilos.opcao, ativo && { backgroundColor: cor, borderColor: cor }]}>
      <Text style={[estilos.opcaoTexto, ativo && { color: '#fff' }]}>{rotulo}</Text>
    </Pressable>
  );
}

export function Botao({ rotulo, aoTocar, cor = cores.primaria, desativado }: { rotulo: string; aoTocar(): void; cor?: string; desativado?: boolean }) {
  return (
    <Pressable onPress={aoTocar} disabled={desativado} style={[estilos.botao, { backgroundColor: cor, opacity: desativado ? 0.5 : 1 }]}>
      <Text style={estilos.botaoTexto}>{rotulo}</Text>
    </Pressable>
  );
}

export function Linha({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.linhaRotulo}>{rotulo}</Text>
      <Text style={[estilos.linhaValor, cor ? { color: cor } : null]}>{valor}</Text>
    </View>
  );
}

export const estilos = StyleSheet.create({
  folha: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: cores.fundo,
    borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 12,
  },
  folhaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  folhaTitulo: { fontSize: 18, fontWeight: '700', color: cores.texto },
  fechar: { fontSize: 18, color: cores.suave },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff',
    borderWidth: 1, borderColor: cores.borda, marginRight: 6,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  chipTexto: { fontSize: 13, fontWeight: '600', color: cores.texto },
  opcao: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: cores.borda, alignItems: 'center', marginHorizontal: 3 },
  opcaoTexto: { fontWeight: '600', color: cores.texto },
  botao: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  botaoTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: cores.borda },
  linhaRotulo: { color: cores.suave },
  linhaValor: { color: cores.texto, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  rotulo: { color: cores.suave, marginTop: 12, marginBottom: 6, fontSize: 13 },
  rodape: { color: cores.suave, fontSize: 12, marginTop: 10 },
});
