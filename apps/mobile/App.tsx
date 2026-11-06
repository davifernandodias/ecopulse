import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, Vibration, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { Feather } from '@expo/vector-icons';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';

import { Mapa } from './src/mapa/Mapa';
import type { MapaRef, MensagemDoMapa } from './src/mapa/tipos';
import * as Local from './src/armazenamento';
import { buscarCamadas, buscarLugar, enviarRelato, Tempo } from './src/api';
import { uuid } from './src/uuid';
import { TelaRelato, type ResultadoRelato } from './src/TelaRelato';
import type { Alerta, CelulaClima, Gravidade, Incidente, ItemOutbox, Posicao, RespostaCamadas, Tipo, Bbox } from './src/tipos';
import {
  BotaoFaixa, BotaoPrimario, Cartao, Chip, Faixa, Ficha, Legenda, LinhaFicha, Pilula, T,
  cor, fonte, hora, nomeGravidade, nomeTipo, sombra, tempoDesde,
} from './src/ui';

const DISPENSAR_ALERTA_MS = 30 * 60 * 1000;
const ESPERA_SEM_CONEXAO_MS = 5000; // WebSocket caído por mais que isso = "Sem conexão"

type Ficha =
  | { tipo: 'celula'; celula: CelulaClima }
  | { tipo: 'incidente'; incidente: Incidente };

type Camadas = { ar: boolean; calor: boolean; alagamento: boolean; vias: boolean };

export default function App() {
  const [fontes] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  if (!fontes) return <View style={{ flex: 1, backgroundColor: cor.fundoMapa }} />;
  return (
    <SafeAreaProvider>
      <TelaMapa />
    </SafeAreaProvider>
  );
}

/** Textos das faixas de alerta (telas 10, 11 e 14). */
function textoAlerta(a: Alerta): { titulo: string; texto: string } {
  if (a.categoria === 'ar') return { titulo: 'Alerta de qualidade do ar', texto: 'O ar na sua região está ruim (AQI acima de 150).' };
  if (a.categoria === 'calor') return { titulo: 'Alerta de calor', texto: 'A temperatura na sua região está acima de 35 °C.' };
  const metros = Math.max(50, Math.round((a.distanciaM ?? 0) / 50) * 50);
  const gravidade = nomeGravidade[a.gravidade ?? 'media'].toLowerCase();
  return {
    titulo: `Alerta de ${nomeTipo[a.categoria].toLowerCase()}`,
    texto: `Incidente de gravidade ${gravidade} a cerca de ${metros} m de você.`,
  };
}

function TelaMapa() {
  const ins = useSafeAreaInsets();
  const mapa = useRef<MapaRef>(null);
  const clima = useRef(new Map<string, CelulaClima>());
  const incidentes = useRef(new Map<string, Incidente>());
  const dispositivo = useRef<{ id: string } | null>(null);
  const dispensados = useRef<Record<string, number>>({});
  const camera = useRef<{ bbox: Bbox; zoom: number } | null>(null);
  const tempo = useRef<Tempo | null>(null);
  const posRef = useRef<{ p: Posicao; simulada: boolean } | null>(null);
  const filaAlertas = useRef<Alerta[]>([]);
  const sincronizandoRef = useRef(false);
  const primeiraPosicao = useRef(true);
  const ultimoGps = useRef<Posicao | null>(null);
  const timerWs = useRef<ReturnType<typeof setTimeout>>(undefined);
  const timerCartao = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ultimaCacheada = useRef<RespostaCamadas | null>(null);

  // Estado inicial das camadas como nas telas: Calor desligado (decisão D14).
  const [camadas, setCamadas] = useState<Camadas>({ ar: true, calor: false, alagamento: true, vias: true });
  const [atualizando, setAtualizando] = useState(false);
  const [areaGrande, setAreaGrande] = useState(false);
  const [redeOk, setRedeOk] = useState(true);
  const [apiOk, setApiOk] = useState(true);
  const [wsCaido, setWsCaido] = useState(false);
  const [semGps, setSemGps] = useState(false);
  const [posicao, setPosicao] = useState<{ p: Posicao; simulada: boolean } | null>(null);
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [tela, setTela] = useState<'mapa' | 'relato'>('mapa');
  const [meusRelatosAberto, setMeusRelatosAberto] = useState(false);
  const [outbox, setOutbox] = useState<ItemOutbox[]>([]);
  const [busca, setBusca] = useState('');
  const [cartao, setCartao] = useState<{ titulo?: string; texto: string; verde?: boolean } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const semConexao = !redeOk || !apiOk || wsCaido;
  const pendentes = outbox.filter((i) => i.estado === 'pendente' || i.estado === 'enviando').length;

  // fixo: fica na tela até a conexão voltar (aviso de relato guardado, tela 12).
  const mostrarCartao = useCallback((c: { titulo?: string; texto: string; verde?: boolean }, fixo = false) => {
    setCartao(c);
    clearTimeout(timerCartao.current);
    if (!fixo) timerCartao.current = setTimeout(() => setCartao(null), 6000);
  }, []);

  const mostrarAviso = useCallback((t: string) => {
    setAviso(t);
    setTimeout(() => setAviso((a) => (a === t ? null : a)), 4000);
  }, []);

  // ---------- Camadas ----------

  const aplicarResposta = useCallback((r: RespostaCamadas) => {
    for (const c of r.clima.celulas) clima.current.set(c.h3, c);
    mapa.current?.enviar({ tipo: 'clima', celulas: r.clima.celulas });
    incidentes.current = new Map(r.incidentes.map((i) => [i.id, i]));
    mapa.current?.enviar({ tipo: 'incidentes', lista: r.incidentes, substituir: true });
    setAreaGrande(!r.clima.disponivel);
    setAtualizando(r.clima.disponivel && r.clima.pendente);
  }, []);

  const carregarCamadas = useCallback(async () => {
    const c = camera.current;
    if (!c) return;
    try {
      const r = await buscarCamadas(c.bbox, c.zoom);
      setApiOk(true);
      aplicarResposta(r);
      Local.salvarCamadas(r).catch(() => {});
    } catch {
      setApiOk(false);
      setAtualizando(false);
    }
  }, [aplicarResposta]);

  // ---------- Posição ----------

  const definirPosicao = useCallback((p: Posicao, simulada: boolean) => {
    posRef.current = { p, simulada };
    setPosicao({ p, simulada });
    setSemGps(false);
    mapa.current?.enviar({ tipo: 'eu', posicao: p, simulado: simulada });
    tempo.current?.posicao(p);
  }, []);

  // ---------- Alertas: mostra o mais recente; os outros esperam o "Dispensar" ----------

  const mostrarProximoAlerta = useCallback(() => {
    const agora = Date.now();
    filaAlertas.current = filaAlertas.current.filter((a) => (dispensados.current[a.chave] ?? 0) <= agora);
    const proximo = filaAlertas.current[0] ?? null;
    setAlerta(proximo);
    mapa.current?.enviar({ tipo: 'alerta', alerta: proximo ? { incidenteId: proximo.incidenteId, h3: proximo.h3 } : null });
  }, []);

  const receberAlerta = useCallback((a: Alerta) => {
    if ((dispensados.current[a.chave] ?? 0) > Date.now()) return;
    if (filaAlertas.current[0]?.chave === a.chave) return;
    filaAlertas.current = [a, ...filaAlertas.current.filter((x) => x.chave !== a.chave)];
    mostrarProximoAlerta();
    Vibration.vibrate(400);
  }, [mostrarProximoAlerta]);

  const dispensarAlerta = useCallback(() => {
    const a = filaAlertas.current[0];
    if (!a) return;
    const ate = Date.now() + DISPENSAR_ALERTA_MS;
    dispensados.current[a.chave] = ate;
    Local.dispensar(a.chave, ate).catch(() => {});
    mostrarProximoAlerta();
  }, [mostrarProximoAlerta]);

  const abrirFicha = useCallback((f: Ficha | null) => {
    setFicha(f);
    mapa.current?.enviar({
      tipo: 'selecao',
      h3: f?.tipo === 'celula' ? f.celula.h3 : null,
      incidenteId: f?.tipo === 'incidente' ? f.incidente.id : null,
    });
  }, []);

  const verLocal = useCallback(() => {
    const a = filaAlertas.current[0];
    if (!a) return;
    mapa.current?.enviar({ tipo: 'voar', latitude: a.latitude, longitude: a.longitude, zoom: 15 });
    if (a.incidenteId && incidentes.current.has(a.incidenteId)) abrirFicha({ tipo: 'incidente', incidente: incidentes.current.get(a.incidenteId)! });
    else if (a.h3 && clima.current.has(a.h3)) abrirFicha({ tipo: 'celula', celula: clima.current.get(a.h3)! });
  }, [abrirFicha]);

  // ---------- Fila local (offline) ----------

  const recarregarOutbox = useCallback(async () => setOutbox(await Local.listarOutbox()), []);

  const sincronizar = useCallback(async () => {
    if (sincronizandoRef.current || !dispositivo.current) return;
    const fila = (await Local.listarOutbox()).filter((i) => i.estado === 'pendente');
    if (!fila.length) return;
    sincronizandoRef.current = true;
    try {
      for (const item of fila) {
        await Local.atualizarOutbox(item.id, 'enviando');
        const r = await enviarRelato(item, dispositivo.current.id);
        if (r.ok) {
          await Local.atualizarOutbox(item.id, 'enviado');
          setApiOk(true);
        } else if (!r.rede) {
          await Local.atualizarOutbox(item.id, 'falhou', r.motivo);
        } else {
          await Local.atualizarOutbox(item.id, 'pendente', r.motivo);
          setApiOk(false);
          break; // sem rede: para e tenta depois, na ordem
        }
      }
    } finally {
      sincronizandoRef.current = false;
      await recarregarOutbox();
    }
  }, [recarregarOutbox]);

  const enviarNovoRelato = useCallback(async (d: { tipo: Tipo; gravidade: Gravidade; texto: string }): Promise<ResultadoRelato> => {
    const pos = posRef.current;
    if (!pos) return { resultado: 'recusado', mensagem: 'Ative a localização para relatar.' };
    const item: ItemOutbox = {
      id: uuid(), tipo: d.tipo, gravidade: d.gravidade, texto: d.texto.trim() || undefined,
      latitude: pos.p.latitude, longitude: pos.p.longitude, criadoEm: new Date().toISOString(), estado: 'pendente',
    };
    // Grava como pendente antes de tentar: se a rede cair no meio, o relato não se perde.
    await Local.inserirOutbox(item);
    await sincronizar();
    const final = (await Local.listarOutbox()).find((i) => i.id === item.id);
    if (final?.estado === 'falhou') {
      // Recusado pela API: sai da fila local e os dados ficam no formulário (tela 8).
      await Local.removerOutbox(item.id);
      await recarregarOutbox();
      return { resultado: 'recusado', mensagem: final.motivo ?? 'Relato recusado.' };
    }
    setTela('mapa');
    if (final?.estado === 'enviado') {
      mostrarCartao({ titulo: 'Relato enviado', texto: 'Ele aparece no mapa dos outros usuários em instantes.', verde: true });
      return { resultado: 'enviado' };
    }
    mostrarCartao({ texto: 'Relato guardado no aparelho. Será enviado quando a rede voltar.' }, true);
    return { resultado: 'guardado' };
  }, [sincronizar, mostrarCartao, recarregarOutbox]);

  // ---------- WebSocket ----------

  const aoEvento = useRef<(m: any) => void>(() => {});
  aoEvento.current = (m: any) => {
    if (m.tipo === 'camada.atualizada' && m.camada === 'clima') {
      for (const c of m.celulas as CelulaClima[]) clima.current.set(c.h3, c);
      mapa.current?.enviar({ tipo: 'clima', celulas: m.celulas });
      setAtualizando(false);
    } else if (m.tipo === 'camada.atualizada' && m.camada === 'incidentes') {
      const i: Incidente = m.incidente;
      incidentes.current.set(i.id, i);
      mapa.current?.enviar({ tipo: 'incidentes', lista: [i] });
      setFicha((f) => (f?.tipo === 'incidente' && f.incidente.id === i.id ? { tipo: 'incidente', incidente: i } : f));
    } else if (m.tipo === 'alerta') {
      receberAlerta(m.alerta);
    }
  };

  const aoMudarWs = useCallback((conectado: boolean) => {
    if (conectado) {
      clearTimeout(timerWs.current);
      timerWs.current = undefined;
      setWsCaido(false);
    } else if (!timerWs.current) {
      // Conta a partir da primeira queda; as tentativas de reconexão não reiniciam o prazo.
      timerWs.current = setTimeout(() => setWsCaido(true), ESPERA_SEM_CONEXAO_MS);
    }
  }, []);

  // ---------- Mensagens do mapa ----------

  const aoMapa = useCallback((msg: MensagemDoMapa) => {
    switch (msg.tipo) {
      case 'pronto':
        mapa.current?.enviar({ tipo: 'visibilidade', visivel: camadas });
        if (ultimaCacheada.current) aplicarResposta(ultimaCacheada.current);
        if (posRef.current) mapa.current?.enviar({ tipo: 'eu', posicao: posRef.current.p, simulado: posRef.current.simulada });
        break;
      case 'camera':
        camera.current = { bbox: msg.bbox, zoom: msg.zoom };
        carregarCamadas();
        tempo.current?.inscrever(msg.bbox, posRef.current?.p);
        break;
      case 'toquePino': {
        const i = incidentes.current.get(msg.id);
        if (i) abrirFicha({ tipo: 'incidente', incidente: i });
        break;
      }
      case 'toqueCelula': {
        const c = clima.current.get(msg.h3);
        if (c) abrirFicha({ tipo: 'celula', celula: c });
        break;
      }
      case 'toqueVazio':
        abrirFicha(null);
        break;
      case 'toqueLongo':
        definirPosicao({ latitude: msg.latitude, longitude: msg.longitude }, true);
        mostrarAviso('Posição simulada definida aqui');
        break;
      case 'erro':
        console.warn('[mapa]', msg.mensagem);
        break;
    }
  }, [camadas, aplicarResposta, carregarCamadas, abrirFicha, definirPosicao, mostrarAviso]);

  // ---------- Efeitos ----------

  useEffect(() => {
    let vivo = true;
    let assinaturaGps: Location.LocationSubscription | undefined;
    (async () => {
      await Local.iniciar();
      dispositivo.current = await Local.obterDispositivo();
      dispensados.current = await Local.listarDispensados();
      ultimaCacheada.current = await Local.ultimaCamada();
      if (ultimaCacheada.current) aplicarResposta(ultimaCacheada.current);
      await recarregarOutbox();
      if (!vivo) return;
      tempo.current = new Tempo((m) => aoEvento.current(m), aoMudarWs);
      if (camera.current) tempo.current.inscrever(camera.current.bbox, posRef.current?.p);
      sincronizar();

      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') { setSemGps(true); return; }
        const aoGps = (loc: Location.LocationObject) => {
          const p = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          ultimoGps.current = p;
          if (posRef.current?.simulada) return;
          definirPosicao(p, false);
          if (primeiraPosicao.current) {
            primeiraPosicao.current = false;
            mapa.current?.enviar({ tipo: 'voar', ...p, zoom: 14 });
          }
        };
        const atual = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
        if (atual && vivo) aoGps(atual);
        else if (!posRef.current) setSemGps(true);
        assinaturaGps = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 15 }, aoGps);
      } catch {
        if (!posRef.current) setSemGps(true);
      }
    })();
    return () => { vivo = false; assinaturaGps?.remove(); tempo.current?.fechar(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => NetInfo.addEventListener((s) => {
    const on = s.isConnected !== false;
    setRedeOk(on);
    if (on) {
      tempo.current?.acordar();
      sincronizar();
      carregarCamadas();
    }
  }), [sincronizar, carregarCamadas]);

  useEffect(() => {
    const t = setInterval(() => {
      sincronizar();
      if (!apiOk) carregarCamadas();
    }, 15000);
    return () => clearInterval(t);
  }, [sincronizar, carregarCamadas, apiOk]);

  useEffect(() => { mapa.current?.enviar({ tipo: 'visibilidade', visivel: camadas }); }, [camadas]);
  useEffect(() => { mapa.current?.enviar({ tipo: 'semConexao', valor: semConexao }); }, [semConexao]);
  // "Meus relatos" aparece sozinho quando há relato pendente.
  useEffect(() => { if (pendentes > 0) setMeusRelatosAberto(true); }, [pendentes]);
  // Conexão voltou: o aviso de relato guardado sai depois de alguns segundos.
  useEffect(() => {
    if (!semConexao && cartao && !cartao.verde) {
      const t = setTimeout(() => setCartao(null), 4000);
      return () => clearTimeout(t);
    }
  }, [semConexao, cartao]);

  // ---------- Ações ----------

  const alternar = (k: keyof Camadas) => setCamadas((c) => ({ ...c, [k]: !c[k] }));

  const buscar = async () => {
    const q = busca.trim();
    if (q.length < 2) return;
    try {
      const r = await buscarLugar(q);
      if (!r) return mostrarAviso('Endereço não encontrado');
      mapa.current?.enviar({ tipo: 'voar', bbox: r.bbox, latitude: r.latitude, longitude: r.longitude });
    } catch {
      mostrarAviso('Busca indisponível no momento');
    }
  };

  const usarGps = () => {
    if (ultimoGps.current) {
      definirPosicao(ultimoGps.current, false);
      mapa.current?.enviar({ tipo: 'voar', ...ultimoGps.current });
    } else {
      posRef.current = null;
      setPosicao(null);
      setSemGps(true);
      mapa.current?.enviar({ tipo: 'eu', posicao: null });
    }
  };

  const tentarDeNovo = async (id: string) => {
    await Local.atualizarOutbox(id, 'pendente');
    await recarregarOutbox();
    sincronizar();
  };

  // ---------- Tela ----------

  const textoDoAlerta = alerta ? textoAlerta(alerta) : null;
  const mostrarControles = !semConexao && !ficha;

  return (
    <View style={s.raiz}>
      <StatusBar style={alerta || semConexao ? 'light' : 'dark'} />
      <Mapa ref={mapa} onMensagem={aoMapa} />

      {/* Topo: faixa (sem conexão ou alerta) ou busca; depois chips e avisos */}
      <View style={[s.topo, { top: ins.top + 16 }]} pointerEvents="box-none">
        {semConexao ? (
          <Faixa fundo={cor.semConexao} icone="wifi-off" titulo="Sem conexão"
            texto="Mostrando a última camada consultada. Os relatos pendentes serão enviados quando a rede voltar." />
        ) : alerta && textoDoAlerta ? (
          <Faixa fundo={cor.alerta} icone="alert-triangle" titulo={textoDoAlerta.titulo} texto={textoDoAlerta.texto}>
            <View style={s.botoesFaixa}>
              <BotaoFaixa rotulo="Ver local" cheio aoTocar={verLocal} estreito />
              <View style={{ width: 12 }} />
              <BotaoFaixa rotulo="Dispensar por 30 min" aoTocar={dispensarAlerta} />
            </View>
          </Faixa>
        ) : !ficha ? (
          <View style={s.busca}>
            <Feather name="search" size={22} color={cor.textoSecundario} />
            <TextInput
              style={s.buscaCampo}
              placeholder="Buscar endereço"
              placeholderTextColor="#7A8A83"
              value={busca}
              onChangeText={setBusca}
              onSubmitEditing={buscar}
              returnKeyType="search"
              accessibilityLabel="Buscar endereço"
            />
          </View>
        ) : null}

        {!semConexao && !ficha && (
          <View style={s.chips}>
            <Chip rotulo="Qualidade do ar" ligado={camadas.ar} aoTocar={() => alternar('ar')} />
            <Chip rotulo="Calor" ligado={camadas.calor} aoTocar={() => alternar('calor')} />
            <Chip rotulo="Alagamento" ligado={camadas.alagamento} aoTocar={() => alternar('alagamento')} />
            <Chip rotulo="Via obstruída" ligado={camadas.vias} aoTocar={() => alternar('vias')} />
          </View>
        )}

        <View style={{ gap: 10, marginTop: semConexao ? 16 : 4 }} pointerEvents="box-none">
          {cartao && <Cartao {...cartao} />}
          {!semConexao && !ficha && semGps && !posicao && <Pilula icone="map-pin" texto="Sem localização: mostrando Ribeirão Preto" />}
          {!semConexao && !ficha && atualizando && (camadas.ar || camadas.calor) && <Pilula girando texto="Atualizando camada" />}
          {!semConexao && !ficha && areaGrande && (camadas.ar || camadas.calor) && <Pilula icone="zoom-in" texto="Aproxime o mapa para ver as camadas." />}
          {!semConexao && !ficha && aviso && <Pilula icone="info" texto={aviso} />}
          {!semConexao && !ficha && posicao?.simulada && (
            <Pressable onPress={usarGps} accessibilityRole="button" accessibilityLabel="Voltar a usar o GPS">
              <Pilula icone="crosshair" texto="Posição simulada · toque para usar o GPS" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Base: legenda + atribuição (esquerda), Meus relatos + Relatar (direita) */}
      {mostrarControles && (
        <>
          <View style={[s.baseEsquerda, { bottom: ins.bottom + 16 }]} pointerEvents="box-none">
            {!meusRelatosAberto && <Legenda ar={camadas.ar} calor={camadas.calor} pontos={camadas.alagamento || camadas.vias} />}
            <View style={s.atribuicao}>
              <T style={{ fontSize: 11, color: cor.textoSecundario }}>Clima e ar: Open-Meteo</T>
              <T style={{ fontSize: 9, color: cor.textoSecundario }}>Mapa © OpenFreeMap © OpenStreetMap</T>
            </View>
          </View>
          <View style={[s.baseDireita, { bottom: ins.bottom + 16 }]} pointerEvents="box-none">
            <Pressable style={s.botaoMeus} onPress={() => { recarregarOutbox(); setMeusRelatosAberto((v) => !v); }}
              accessibilityRole="button" accessibilityLabel="Meus relatos">
              <Feather name="list" size={22} color={cor.texto} />
              {pendentes > 0 && <View style={s.selo}><T peso="negrito" style={{ fontSize: 11, color: cor.branco }}>{pendentes}</T></View>}
            </Pressable>
            <Pressable style={s.relatar} onPress={() => { setTela('relato'); setMeusRelatosAberto(false); }}
              accessibilityRole="button" accessibilityLabel="Relatar">
              <Feather name="plus" size={26} color={cor.branco} />
              <T peso="negrito" style={{ fontSize: 18, color: cor.branco, marginLeft: 10 }}>Relatar</T>
            </Pressable>
          </View>
        </>
      )}

      {/* Meus relatos (tela 12): sempre visível sem conexão; com rede, pelo botão ou quando há pendente */}
      {!ficha && (semConexao || meusRelatosAberto) && (
        <View style={[s.meus, { bottom: ins.bottom + (semConexao ? 16 : 144) }]}>
          <View style={s.meusTopo}>
            <T peso="negrito" style={{ fontSize: 20 }}>Meus relatos</T>
            {!semConexao && (
              <Pressable onPress={() => setMeusRelatosAberto(false)} hitSlop={12} accessibilityLabel="Fechar Meus relatos">
                <Feather name="x" size={20} color={cor.textoSecundario} />
              </Pressable>
            )}
          </View>
          {outbox.length === 0 && <T style={{ color: cor.textoSecundario, paddingVertical: 14, fontSize: 15 }}>Nenhum relato feito neste aparelho.</T>}
          {[...outbox].reverse().slice(0, 4).map((i) => (
            <View key={i.id} style={s.meusLinha}>
              <T peso="negrito" style={{ fontSize: 16, flex: 1 }}>{nomeTipo[i.tipo]} · {nomeGravidade[i.gravidade]}</T>
              {i.estado === 'falhou' ? (
                <>
                  <T peso="negrito" style={{ fontSize: 14, color: cor.erro, marginRight: 10 }}>Falhou</T>
                  <Pressable onPress={() => tentarDeNovo(i.id)} style={s.tentar} accessibilityRole="button">
                    <T peso="negrito" style={{ fontSize: 14, color: cor.primaria }}>Tentar de novo</T>
                  </Pressable>
                </>
              ) : i.estado === 'enviado' ? (
                <T peso="negrito" style={{ fontSize: 14, color: cor.primaria }}>Enviado</T>
              ) : (
                <T peso="negrito" style={{ fontSize: 14, color: cor.textoSecundario }}>Pendente</T>
              )}
            </View>
          ))}
          {semConexao && (
            <View style={{ marginTop: 14 }}>
              <BotaoPrimario rotulo="Novo relato" aoTocar={() => setTela('relato')} />
            </View>
          )}
        </View>
      )}

      {ficha?.tipo === 'celula' && (
        <Ficha titulo="Qualidade do ar e calor" aoFechar={() => abrirFicha(null)} inferior={ins.bottom}>
          <LinhaFicha rotulo="Temperatura" valor={ficha.celula.temperatura != null ? `${Math.round(ficha.celula.temperatura)} °C` : 'Sem dado da Open-Meteo'} />
          <LinhaFicha rotulo="Qualidade do ar" valor={ficha.celula.aqi != null ? `AQI ${ficha.celula.aqi}` : 'Sem dado da Open-Meteo'} />
          <LinhaFicha rotulo="Horário da leitura" valor={hora(ficha.celula.lidoEm)} />
          <LinhaFicha rotulo="Fonte" valor="Open-Meteo" />
        </Ficha>
      )}

      {ficha?.tipo === 'incidente' && (
        <Ficha titulo={nomeTipo[ficha.incidente.tipo]} aoFechar={() => abrirFicha(null)} inferior={ins.bottom}>
          <LinhaFicha rotulo="Gravidade" valor={nomeGravidade[ficha.incidente.gravidade]} />
          <LinhaFicha rotulo="Situação" valor={ficha.incidente.status === 'confirmado' ? 'Confirmado' : 'Recebido'} />
          <LinhaFicha rotulo="Relatado há" valor={tempoDesde(ficha.incidente.ultimoRelato)} />
        </Ficha>
      )}

      {tela === 'relato' && (
        <TelaRelato posicao={posicao?.p ?? null} aoVoltar={() => setTela('mapa')} aoEnviar={enviarNovoRelato} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cor.fundoMapa },
  topo: { position: 'absolute', left: 16, right: 16 },
  busca: { height: 52, borderRadius: 16, backgroundColor: cor.branco, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, ...sombra },
  buscaCampo: { flex: 1, marginLeft: 12, fontSize: 16, fontFamily: fonte.regular, color: cor.texto, height: '100%' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  botoesFaixa: { flexDirection: 'row', marginTop: 14 },
  baseEsquerda: { position: 'absolute', left: 16, gap: 8, alignItems: 'flex-start' },
  atribuicao: { backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  baseDireita: { position: 'absolute', right: 16, alignItems: 'flex-end', gap: 12 },
  relatar: { height: 56, borderRadius: 28, backgroundColor: cor.primaria, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, ...sombra },
  botaoMeus: { width: 48, height: 48, borderRadius: 24, backgroundColor: cor.branco, alignItems: 'center', justifyContent: 'center', ...sombra },
  selo: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: cor.erro, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  meus: { position: 'absolute', left: 16, right: 16, backgroundColor: cor.branco, borderRadius: 24, padding: 18, ...sombra },
  meusTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: cor.divisor },
  meusLinha: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: cor.divisor, minHeight: 56 },
  tentar: { height: 40, borderRadius: 20, borderWidth: 2, borderColor: cor.primaria, paddingHorizontal: 14, justifyContent: 'center' },
});
