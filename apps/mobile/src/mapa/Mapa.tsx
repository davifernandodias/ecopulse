// Celular: o mapa MapLibre GL roda dentro de uma WebView (funciona no Expo Go, sem build nativo).
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView as WebViewOriginal } from 'react-native-webview';
import type { ComponentType } from 'react';
import { mapaHtml } from './mapaHtml';
import type { MapaProps, MapaRef, MensagemParaMapa } from './tipos';

// A tipagem de WebViewProps na v14 cruza as props de iOS, Android e Windows e vira never; o runtime é normal.
const WebView = WebViewOriginal as unknown as ComponentType<any>;
type WebViewHandle = { injectJavaScript(js: string): void };

export const Mapa = forwardRef<MapaRef, MapaProps>(function Mapa({ onMensagem }, ref) {
  const web = useRef<WebViewHandle>(null);
  const pronto = useRef(false);
  const fila = useRef<MensagemParaMapa[]>([]);

  const injetar = (msg: MensagemParaMapa) =>
    web.current?.injectJavaScript(`window.__receber && window.__receber(${JSON.stringify(msg)}); true;`);

  useImperativeHandle(ref, () => ({
    enviar(msg) {
      if (pronto.current) injetar(msg);
      else fila.current.push(msg);
    },
  }));

  return (
    <WebView
      ref={web}
      style={StyleSheet.absoluteFill}
      originWhitelist={['*']}
      source={{ html: mapaHtml, baseUrl: 'https://localhost/' }}
      javaScriptEnabled
      domStorageEnabled
      cacheEnabled
      setSupportMultipleWindows={false}
      onMessage={(e: { nativeEvent: { data: string } }) => {
        let msg;
        try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
        if (msg.tipo === 'pronto') {
          pronto.current = true;
          fila.current.splice(0).forEach(injetar);
        }
        onMensagem(msg);
      }}
    />
  );
});
