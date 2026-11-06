import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';

import { Mapa } from './src/mapa/Mapa';
import type { MapaRef, MensagemDoMapa } from './src/mapa/tipos';
import * as Local from './src/armazenamento';
import { buscarCamadas, buscarLugar, enviarRelato, nomeDoLugar, Tempo } from './src/api';
import { uuid } from './src/uuid';
import type { Alerta, CelulaClima, Gravidade, Incidente, ItemOutbox, Posicao, RespostaCamadas, Tipo, Bbox } from './src/tipos';
import {
  Botao, Chip, Folha, Linha, Opcao, cores, corGravidade, estilos, faixaAqi, haQuanto, hora, nomeGravidade, nomeTipo,
} from './src/ui';

const DISPENSA_MS = 30 * 60 * 1000;

type Ficha =
  | { tipo: 'celula'; celula: CelulaClima; nome: string | null }
  | { tipo: 'incidente'; incidente: Incidente };

function distancia(a: Posicao, b: Posicao) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * r, dLon = (b.longitude - a.longitude) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Tela />
    </SafeAreaProvider>
  );
}

function Tela() {
  const ins = useSafeAreaInsets();
  const mapa = useRef<MapaRef>(null);
  const clima = useRef(new Map<string, CelulaClima>());
  const incidentes = useRef(new Map<string, Incidente>());
  const dispositivo = useRef<{ id: string } | null>(null);
  const dispensados = useRef<Record<string, number>>({});
  const camera = useRef<{ bbox: Bbox; zoom: number } | null>(null);
  const tempo = useRef<Tempo | null>(null);
  const posRef = useRef<{ p: Posicao; simulada: boolean } | null>(null);
  const alertaRef = useRef<Alerta | null>(null);
  const sincronizandoRef = useRef(false);
  const primeiraPosicao = useRef(true);
  const ultimoGps = useRef<Posicao | null>(null);

  const [visivel, setVisivel] = useState({ calor: true, ar: true, alagamento: true, vias: true });
  const [statusCamada, setStatusCamada] = useState<string | null>(null);
  const [redeOk, setRedeOk] = useState(true);
  const [apiOk, setApiOk] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [posicao, setPosicao] = useState<{ p: Posicao; simulada: boolean } | null>(null);
  const [alerta, setAlerta] = useState<Alerta | null>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [folha, setFolha] = useState<'relato' | 'outbox' | null>(null);
  const [outbox, setOutbox] = useState<ItemOutbox[]>([]);
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const avisoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const online = redeOk && apiOk;
  const pendentes = outbox.filter((i) => i.estado === 'pendente' || i.estado === 'enviando').length;

  const mostrarAviso = useCallback((t: string) => {
    setAviso(t);
    clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(null), 4500);
  }, []);

  // ---------- Camadas ----------

  const aplicarResposta = useCallback((r: RespostaCamadas) => {
    for (const c of r.clima.celulas) clima.current.set(c.h3, c);
    mapa.current?.enviar({ tipo: 'clima', celulas: r.clima.celulas });
    incidentes.current = new Map(r.incidentes.map((i) => [i.id, i]));
    mapa.current?.enviar({ tipo: 'incidentes', lista: r.incidentes, substituir: true });
    if (!r.clima.disponivel) setStatusCamada(r.clima.motivo ?? 'aproxime para ver a mancha');
    else if (r.clima.pendente) setStatusCamada('Atualizando camada');
    else setStatusCamada(null);
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
      setStatusCamada('Sem rede. Mostrando a última camada vista.');
    }
  }, [aplicarResposta]);

  // ---------- Posição ----------

  const definirPosicao = useCallback((p: Posicao, simulada: boolean) => {
    posRef.current = { p, simulada };
    setPosicao({ p, simulada });
    mapa.current?.enviar({ tipo: 'eu', posicao: p, simulado: simulada });
    tempo.current?.posicao(p);
  }, []);

  // ---------- Alertas ----------

  const receberAlerta = useCallback((a: Alerta) => {
    if ((dispensados.current[a.chave] ?? 0) > Date.now()) return;
    if (alertaRef.current?.chave === a.chave) return;
    alertaRef.current = a; // não empilha: a faixa troca
    setAlerta(a);
    Vibration.vibrate(400);
  }, []);

  const dispensarAlerta = useCallback(() => {
    const a = alertaRef.current;
    if (!a) return;
    const ate = Date.now() + DISPENSA_MS;
    dispensados.current[a.chave] = ate;
    Local.dispensar(a.chave, ate).catch(() => {});
    alertaRef.current = null;
    setAlerta(null);
  }, []);

  const verAlerta = useCallback(() => {
    const a = alertaRef.current;
    if (!a) return;
    mapa.current?.enviar({ tipo: 'voar', latitude: a.latitude, longitude: a.longitude, zoom: 15 });
    if (a.incidenteId && incidentes.current.has(a.incidenteId)) setFicha({ tipo: 'incidente', incidente: incidentes.current.get(a.incidenteId)! });
    else if (a.h3 && clima.current.has(a.h3)) setFicha({ tipo: 'celula', celula: clima.current.get(a.h3)!, nome: null });
    setFolha(null);
  }, []);

  // ---------- Fila offline ----------

  const recarregarOutbox = useCallback(async () => setOutbox(await Local.listarOutbox()), []);

  const sincronizar = useCallback(async () => {
    if (sincronizandoRef.current || !dispositivo.current) return;
    const fila = (await Local.listarOutbox()).filter((i) => i.estado === 'pendente');
    if (!fila.length) return;
    sincronizandoRef.current = true;
    setSincronizando(true);
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
      setSincronizando(false);
      await recarregarOutbox();
    }
  }, [recarregarOutbox]);

  const enviarNovoRelato = useCallback(async (dados: { tipo: Tipo; gravidade: Gravidade; texto: string }): Promise<string | null> => {
    const pos = posRef.current;
    if (!pos) return 'Sem GPS. Ative a localização (ou toque longo no mapa para simular a posição).';
    const item: ItemOutbox = {
      id: uuid(), tipo: dados.tipo, gravidade: dados.gravidade, texto: dados.texto.trim() || undefined,
      latitude: pos.p.latitude, longitude: pos.p.longitude, criadoEm: new Date().toISOString(), estado: 'pendente',
    };
    await Local.inserirOutbox(item);
    await sincronizar();
    const final = (await Local.listarOutbox()).find((i) => i.id === item.id);
    if (final?.estado === 'enviado') mostrarAviso('Enviado. Vai aparecer no mapa quando o processamento terminar.');
    else if (final?.estado === 'falhou') return final.motivo ?? 'Relato recusado.';
    else mostrarAviso('Guardado neste celular. Envia quando a rede voltar.');
    return null;
  }, [sincronizar, mostrarAviso]);

  // ---------- WebSocket ----------

  const aoEvento = useRef<(m: any) => void>(() => {});
  aoEvento.current = (m: any) => {
    if (m.tipo === 'camada.atualizada' && m.camada === 'clima') {
      for (const c of m.celulas as CelulaClima[]) clima.current.set(c.h3, c);
      mapa.current?.enviar({ tipo: 'clima', celulas: m.celulas });
      setStatusCamada((s) => (s === 'Atualizando camada' ? null : s));
    } else if (m.tipo === 'camada.atualizada' && m.camada === 'incidentes') {
      const i: Incidente = m.incidente;
      incidentes.current.set(i.id, i);
      mapa.current?.enviar({ tipo: 'incidentes', lista: [i] });
      setFicha((f) => (f?.tipo === 'incidente' && f.incidente.id === i.id ? { tipo: 'incidente', incidente: i } : f));
    } else if (m.tipo === 'alerta') {
      receberAlerta(m.alerta);
    }
  };

  // ---------- Mensagens do mapa ----------

  const ultimaCacheada = useRef<RespostaCamadas | null>(null);
  const aoMapa = useCallback((msg: MensagemDoMapa) => {
    switch (msg.tipo) {
      case 'pronto':
        mapa.current?.enviar({ tipo: 'visibilidade', visivel });
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
        if (i) { setFicha({ tipo: 'incidente', incidente: i }); setFolha(null); }
        break;
      }
      case 'toqueCelula': {
        const c = clima.current.get(msg.h3);
        if (!c) break;
        setFicha({ tipo: 'celula', celula: c, nome: null });
        setFolha(null);
        nomeDoLugar({ latitude: msg.latitude, longitude: msg.longitude }).then((nome) =>
          setFicha((f) => (f?.tipo === 'celula' && f.celula.h3 === c.h3 ? { ...f, nome } : f)));
        break;
      }
      case 'toqueVazio':
        setFicha(null);
        break;
      case 'toqueLongo':
        definirPosicao({ latitude: msg.latitude, longitude: msg.longitude }, true);
        mostrarAviso('Posição simulada definida aqui. Toque em "usar GPS" para voltar.');
        break;
      case 'erro':
        console.warn('[mapa]', msg.mensagem);
        break;
    }
  }, [visivel, aplicarResposta, carregarCamadas, definirPosicao, mostrarAviso]);

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
      tempo.current = new Tempo((m) => aoEvento.current(m), () => {});
      if (camera.current) tempo.current.inscrever(camera.current.bbox, posRef.current?.p);
      sincronizar();

      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          mostrarAviso('Sem permissão de localização. O mapa fica em Ribeirão Preto.');
          return;
        }
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
        assinaturaGps = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 15 }, aoGps);
      } catch {
        mostrarAviso('GPS indisponível. O mapa fica em Ribeirão Preto.');
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

  useEffect(() => { mapa.current?.enviar({ tipo: 'visibilidade', visivel }); }, [visivel]);

  // ---------- Ações ----------

  const alternar = (k: keyof typeof visivel) => setVisivel((v) => ({ ...v, [k]: !v[k] }));

  const buscar = async () => {
    const q = busca.trim();
    if (q.length < 2) return;
    try {
      const r = await buscarLugar(q);
      if (!r) return mostrarAviso('Nada encontrado para essa busca.');
      mapa.current?.enviar({ tipo: 'voar', bbox: r.bbox, latitude: r.latitude, longitude: r.longitude });
      mostrarAviso(r.nome);
    } catch {
      mostrarAviso('Busca indisponível agora. O mapa continua navegável no gesto.');
    }
  };

  const usarGps = () => {
    if (ultimoGps.current) {
      definirPosicao(ultimoGps.current, false);
      mapa.current?.enviar({ tipo: 'voar', ...ultimoGps.current });
    } else {
      posRef.current = null;
      setPosicao(null);
      mostrarAviso('Sem GPS no momento.');
    }
  };

  // ---------- Tela ----------

  const indicadorRede = !online
    ? { texto: 'Sem rede. Relatos ficam neste celular.', cor: cores.perigo }
    : sincronizando
      ? { texto: 'Enviando relatos guardados.', cor: cores.alerta }
      : { texto: pendentes ? `${pendentes} pendente(s)` : 'Online', cor: '#16a34a' };

  return (
    <View style={s.raiz}>
      <StatusBar style="dark" />
      <Mapa ref={mapa} onMensagem={aoMapa} />

      <View style={[s.topo, { top: ins.top + 8 }]} pointerEvents="box-none">
        {alerta && (
          <View style={[s.faixa, { backgroundColor: alerta.categoria === 'ar' || alerta.categoria === 'calor' ? '#b45309' : cores.perigo }]}>
            <Text style={s.faixaTexto}>⚠ {alerta.mensagem}</Text>
            <View style={{ flexDirection: 'row' }}>
              <Pressable onPress={verAlerta} style={s.faixaBotao}><Text style={s.faixaBotaoTexto}>Ver</Text></Pressable>
              <Pressable onPress={dispensarAlerta} style={s.faixaBotao}><Text style={s.faixaBotaoTexto}>Dispensar</Text></Pressable>
            </View>
          </View>
        )}

        <View style={s.linhaBusca}>
          <TextInput
            style={s.busca}
            placeholder="Buscar cidade, bairro ou endereço"
            placeholderTextColor={cores.suave}
            value={busca}
            onChangeText={setBusca}
            onSubmitEditing={buscar}
            returnKeyType="search"
          />
          <Pressable onPress={() => { recarregarOutbox(); setFolha('outbox'); setFicha(null); }} style={[s.rede, { borderColor: indicadorRede.cor }]}>
            <View style={[s.bolinha, { backgroundColor: indicadorRede.cor }]} />
            {(!online || sincronizando || pendentes > 0) && <Text style={[s.redeTexto, { color: indicadorRede.cor }]} numberOfLines={2}>{indicadorRede.texto}</Text>}
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ paddingRight: 12 }}>
          <Chip rotulo="Calor" ativo={visivel.calor} cor="#dc2626" aoTocar={() => alternar('calor')} />
          <Chip rotulo="Ar" ativo={visivel.ar} cor="#16a34a" aoTocar={() => alternar('ar')} />
          <Chip rotulo="Alagamento" ativo={visivel.alagamento} cor="#1d4ed8" aoTocar={() => alternar('alagamento')} />
          <Chip rotulo="Vias" ativo={visivel.vias} cor="#111827" aoTocar={() => alternar('vias')} />
        </ScrollView>

        {statusCamada && <Text style={s.status}>{statusCamada}</Text>}
      </View>

      {!ficha && !folha && (
        <>
          <Pressable style={[s.fab, { bottom: ins.bottom + 28 }]} onPress={() => setFolha('relato')}>
            <Text style={s.fabTexto}>＋ Relatar</Text>
          </Pressable>
          <Pressable style={[s.posicao, { bottom: ins.bottom + 34 }]} onPress={posicao?.simulada ? usarGps : undefined}>
            <Text style={s.posicaoTexto}>
              {posicao ? (posicao.simulada ? '◆ Posição simulada · usar GPS' : '● GPS ligado') : '○ Sem GPS'}
            </Text>
          </Pressable>
        </>
      )}

      {aviso && (
        <View style={[s.aviso, { bottom: ins.bottom + (ficha || folha ? 300 : 96) }]} pointerEvents="none">
          <Text style={s.avisoTexto}>{aviso}</Text>
        </View>
      )}

      {ficha?.tipo === 'celula' && (
        <Folha titulo={ficha.nome ?? 'Região selecionada'} aoFechar={() => setFicha(null)} inferior={ins.bottom}>
          <Linha rotulo="Temperatura" valor={ficha.celula.temperatura != null ? `${ficha.celula.temperatura.toFixed(1)} °C` : 'sem dado'} />
          <Linha
            rotulo="Qualidade do ar (US AQI)"
            valor={ficha.celula.aqi != null ? `${ficha.celula.aqi} · ${faixaAqi(ficha.celula.aqi).nome}` : 'sem dado'}
            cor={faixaAqi(ficha.celula.aqi).cor}
          />
          <Linha rotulo="Leitura" valor={`${hora(ficha.celula.lidoEm)}${ficha.celula.antigo ? ' (antiga, atualizando)' : ''}`} />
          <Text style={estilos.rodape}>Clima e ar: Open-Meteo</Text>
        </Folha>
      )}

      {ficha?.tipo === 'incidente' && (
        <Folha titulo={nomeTipo[ficha.incidente.tipo]} aoFechar={() => setFicha(null)} inferior={ins.bottom}>
          <Linha rotulo="Gravidade" valor={nomeGravidade[ficha.incidente.gravidade]} cor={corGravidade[ficha.incidente.gravidade]} />
          <Linha rotulo="Situação" valor={ficha.incidente.status === 'confirmado' ? 'Confirmado' : 'Recebido'} />
          <Linha rotulo="Relatos" valor={String(ficha.incidente.totalRelatos)} />
          <Linha rotulo="Último relato" valor={haQuanto(ficha.incidente.ultimoRelato)} />
          {posicao && <Linha rotulo="Distância" valor={`${Math.round(distancia(posicao.p, ficha.incidente))} m`} />}
          {ficha.incidente.texto ? <Text style={{ marginTop: 10, color: cores.texto }}>“{ficha.incidente.texto}”</Text> : null}
          <Text style={estilos.rodape}>Relatado por pessoas pelo app. Some do mapa 6 h depois do último relato.</Text>
        </Folha>
      )}

      {folha === 'relato' && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <FolhaRelato
            posicao={posicao}
            online={online}
            inferior={ins.bottom}
            aoFechar={() => setFolha(null)}
            aoEnviar={async (d) => {
              const erro = await enviarNovoRelato(d);
              if (!erro) setFolha(null);
              return erro;
            }}
          />
        </KeyboardAvoidingView>
      )}

      {folha === 'outbox' && (
        <Folha titulo="Relatos deste aparelho" aoFechar={() => setFolha(null)} inferior={ins.bottom}>
          <Text style={{ color: indicadorRede.cor, marginBottom: 8, fontWeight: '600' }}>{indicadorRede.texto}</Text>
          {outbox.length === 0 && <Text style={{ color: cores.suave }}>Nenhum relato guardado.</Text>}
          {[...outbox].reverse().map((i) => (
            <View key={i.id} style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: cores.texto }}>{nomeTipo[i.tipo]} · {nomeGravidade[i.gravidade]}</Text>
                <Text style={{ color: cores.suave, fontSize: 12 }}>{haQuanto(i.criadoEm)}{i.motivo && i.estado === 'falhou' ? ` · ${i.motivo}` : ''}</Text>
              </View>
              {i.estado === 'falhou' ? (
                <Pressable onPress={async () => { await Local.atualizarOutbox(i.id, 'pendente'); await recarregarOutbox(); sincronizar(); }}>
                  <Text style={{ color: cores.azul, fontWeight: '700' }}>Tentar de novo</Text>
                </Pressable>
              ) : (
                <Text style={{ color: i.estado === 'enviado' ? '#16a34a' : cores.alerta, fontWeight: '600' }}>{i.estado}</Text>
              )}
            </View>
          ))}
          {outbox.some((i) => i.estado === 'enviado') && (
            <Pressable onPress={async () => { await Local.limparEnviados(); recarregarOutbox(); }}>
              <Text style={[estilos.rodape, { color: cores.azul }]}>Limpar enviados</Text>
            </Pressable>
          )}
        </Folha>
      )}
    </View>
  );
}

function FolhaRelato({ posicao, online, inferior, aoFechar, aoEnviar }: {
  posicao: { p: Posicao; simulada: boolean } | null;
  online: boolean;
  inferior: number;
  aoFechar(): void;
  aoEnviar(d: { tipo: Tipo; gravidade: Gravidade; texto: string }): Promise<string | null>;
}) {
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [gravidade, setGravidade] = useState<Gravidade>('media');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!tipo) return setErro('Escolha o tipo: Alagamento ou Via obstruída.');
    setErro(null);
    setEnviando(true);
    const e = await aoEnviar({ tipo, gravidade, texto });
    setEnviando(false);
    if (e) setErro(e);
  };

  return (
    <Folha titulo="Relatar" aoFechar={aoFechar} inferior={inferior}>
      <Text style={estilos.rotulo}>Tipo</Text>
      <View style={{ flexDirection: 'row' }}>
        <Opcao rotulo="Alagamento" ativo={tipo === 'alagamento'} cor="#1d4ed8" aoTocar={() => setTipo('alagamento')} />
        <Opcao rotulo="Via obstruída" ativo={tipo === 'via_obstruida'} cor="#111827" aoTocar={() => setTipo('via_obstruida')} />
      </View>
      <Text style={estilos.rotulo}>Gravidade</Text>
      <View style={{ flexDirection: 'row' }}>
        {(['baixa', 'media', 'alta'] as Gravidade[]).map((g) => (
          <Opcao key={g} rotulo={nomeGravidade[g]} ativo={gravidade === g} cor={corGravidade[g]} aoTocar={() => setGravidade(g)} />
        ))}
      </View>
      <Text style={estilos.rotulo}>Texto (opcional)</Text>
      <TextInput
        style={s.campo}
        value={texto}
        onChangeText={(t) => setTexto(t.slice(0, 280))}
        placeholder="Ex.: água na altura da calçada"
        placeholderTextColor={cores.suave}
        multiline
        maxLength={280}
      />
      <Text style={estilos.rodape}>{texto.length}/280</Text>
      <Text style={estilos.rotulo}>Local</Text>
      <Text style={{ color: posicao ? cores.texto : cores.perigo }}>
        {posicao
          ? `${posicao.p.latitude.toFixed(5)}, ${posicao.p.longitude.toFixed(5)}${posicao.simulada ? ' (simulada)' : ' (GPS)'}`
          : 'Sem GPS'}
      </Text>
      {!online && <Text style={[estilos.rodape, { color: cores.alerta }]}>Sem rede: o relato fica guardado neste celular.</Text>}
      {erro && <Text style={{ color: cores.perigo, marginTop: 10 }}>{erro}</Text>}
      <Botao rotulo={enviando ? 'Enviando…' : 'Enviar'} aoTocar={enviar} desativado={enviando} />
    </Folha>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: '#e5e7eb' },
  topo: { position: 'absolute', left: 12, right: 12 },
  faixa: { borderRadius: 12, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
  faixaTexto: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 8 },
  faixaBotao: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, marginRight: 8 },
  faixaBotaoTexto: { color: '#fff', fontWeight: '700' },
  linhaBusca: { flexDirection: 'row', alignItems: 'center' },
  busca: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: cores.texto,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
  },
  rede: {
    marginLeft: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', maxWidth: 170, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
  },
  bolinha: { width: 10, height: 10, borderRadius: 5 },
  redeTexto: { marginLeft: 6, fontSize: 11, fontWeight: '600', flexShrink: 1 },
  status: {
    alignSelf: 'flex-start', marginTop: 8, backgroundColor: 'rgba(17,24,39,0.75)', color: '#fff', fontSize: 12,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden',
  },
  fab: {
    position: 'absolute', right: 16, backgroundColor: cores.primaria, paddingHorizontal: 20, paddingVertical: 15, borderRadius: 999,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  fabTexto: { color: '#fff', fontWeight: '800', fontSize: 16 },
  posicao: { position: 'absolute', left: 16, backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  posicaoTexto: { fontSize: 12, color: cores.texto, fontWeight: '600' },
  aviso: { position: 'absolute', left: 24, right: 24, backgroundColor: 'rgba(17,24,39,0.9)', borderRadius: 12, padding: 12 },
  avisoTexto: { color: '#fff', textAlign: 'center' },
  campo: { borderWidth: 1, borderColor: cores.borda, borderRadius: 10, padding: 10, minHeight: 60, textAlignVertical: 'top', color: cores.texto },
});
