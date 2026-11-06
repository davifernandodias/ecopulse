// Telas 7 (Novo relato) e 8 (Relato recusado). Abre por cima do mapa.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import type { Gravidade, Posicao, Tipo } from './tipos';
import { BotaoPrimario, T, cor, e as base, fonte, nomeGravidade, nomeTipo } from './ui';

export type ResultadoRelato = { resultado: 'enviado' | 'guardado' } | { resultado: 'recusado'; mensagem: string };

export function TelaRelato({ posicao, aoVoltar, aoEnviar }: {
  posicao: Posicao | null;
  aoVoltar(): void;
  aoEnviar(d: { tipo: Tipo; gravidade: Gravidade; texto: string }): Promise<ResultadoRelato>;
}) {
  const ins = useSafeAreaInsets();
  const [tipo, setTipo] = useState<Tipo>('alagamento');
  const [gravidade, setGravidade] = useState<Gravidade>('media');
  const [texto, setTexto] = useState('');
  const [recusa, setRecusa] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    setEnviando(true);
    const r = await aoEnviar({ tipo, gravidade, texto });
    setEnviando(false);
    // Recusado: fica na tela com os dados mantidos (tela 8).
    if (r.resultado === 'recusado') setRecusa(r.mensagem);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[StyleSheet.absoluteFill, { backgroundColor: cor.fundoFormulario }]}>
      <ScrollView contentContainerStyle={{ paddingTop: ins.top + 20, paddingHorizontal: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={s.cabecalho}>
          <Pressable onPress={aoVoltar} style={s.voltar} accessibilityLabel="Voltar ao mapa" accessibilityRole="button">
            <Feather name="chevron-left" size={26} color={cor.texto} />
          </Pressable>
          <T peso="negrito" style={{ fontSize: 26, marginLeft: 14 }}>Novo relato</T>
        </View>

        {recusa && (
          <View style={s.recusa} accessibilityRole="alert">
            <Feather name="alert-circle" size={24} color={cor.erro} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <T peso="negrito" style={{ fontSize: 17, color: cor.erro }}>Relato não enviado</T>
              <T style={{ fontSize: 15, color: cor.erro, marginTop: 4, lineHeight: 21 }}>{recusa}</T>
            </View>
          </View>
        )}

        <T peso="negrito" style={s.rotulo}>Tipo de ocorrência</T>
        <View style={s.linha}>
          {(['alagamento', 'via_obstruida'] as Tipo[]).map((t) => (
            <Opcao key={t} rotulo={nomeTipo[t]} ativo={tipo === t} alto aoTocar={() => setTipo(t)} />
          ))}
        </View>

        <T peso="negrito" style={s.rotulo}>Gravidade</T>
        <View style={s.linha}>
          {(['baixa', 'media', 'alta'] as Gravidade[]).map((g) => (
            <Opcao key={g} rotulo={nomeGravidade[g]} ativo={gravidade === g} aoTocar={() => setGravidade(g)} />
          ))}
        </View>

        <T peso="negrito" style={s.rotulo}>Descrição (opcional)</T>
        <TextInput
          style={s.campo}
          value={texto}
          onChangeText={(v) => setTexto(v.slice(0, 280))}
          placeholder="Ex.: água acima da calçada na esquina"
          placeholderTextColor="#7A8A83"
          multiline
          maxLength={280}
          accessibilityLabel="Descrição (opcional)"
        />

        <View style={s.gps}>
          <Feather name="map-pin" size={24} color={posicao ? cor.primaria : cor.erro} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <T peso="negrito" style={{ fontSize: 17 }}>Localização por GPS</T>
            <T style={{ fontSize: 15, color: posicao ? cor.textoSecundario : cor.erro, marginTop: 2 }}>
              {posicao ? 'Sua posição atual vai junto com o relato.' : 'Ative a localização para relatar.'}
            </T>
          </View>
        </View>

        <T style={s.nota}>
          Sem login: o aparelho é identificado por um código. A data, a hora e a precisão da localização são registradas automaticamente.
        </T>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: ins.bottom + 16, paddingTop: 8 }}>
        <BotaoPrimario rotulo={enviando ? 'Enviando…' : 'Enviar relato'} aoTocar={enviar} desativado={!posicao || enviando} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Opcao({ rotulo, ativo, alto, aoTocar }: { rotulo: string; ativo: boolean; alto?: boolean; aoTocar(): void }) {
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      style={[s.opcao, alto ? { height: 64, borderRadius: 16 } : { height: 48, borderRadius: 24 }, ativo ? s.opcaoAtiva : null]}
    >
      <T peso="negrito" style={{ fontSize: 17 }}>{rotulo}</T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  cabecalho: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  voltar: { ...base.botaoRedondo, width: 46, height: 46, borderRadius: 23, backgroundColor: cor.branco },
  rotulo: { fontSize: 15, color: cor.textoSecundario, marginTop: 22, marginBottom: 10 },
  linha: { flexDirection: 'row', gap: 10 },
  opcao: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cor.branco, borderWidth: 1, borderColor: cor.borda },
  opcaoAtiva: { backgroundColor: cor.selecao, borderWidth: 2, borderColor: cor.primaria },
  campo: {
    minHeight: 96, backgroundColor: cor.branco, borderWidth: 1, borderColor: cor.borda, borderRadius: 16,
    padding: 16, fontSize: 16, fontFamily: fonte.regular, color: cor.texto, textAlignVertical: 'top',
  },
  gps: { flexDirection: 'row', alignItems: 'center', backgroundColor: cor.branco, borderWidth: 1, borderColor: cor.borda, borderRadius: 16, padding: 16, marginTop: 22 },
  nota: { fontSize: 14, color: cor.textoSecundario, marginTop: 22, lineHeight: 20 },
  recusa: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: cor.erroFundo, borderWidth: 1, borderColor: cor.erro, borderRadius: 16, padding: 16, marginTop: 14 },
});
