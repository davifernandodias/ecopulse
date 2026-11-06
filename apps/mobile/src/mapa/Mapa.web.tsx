// Navegador: a mesma página do mapa num iframe. A lógica das camadas é a mesma do celular.
import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { mapaHtml } from './mapaHtml';
import type { MapaProps, MapaRef, MensagemParaMapa } from './tipos';

export const Mapa = forwardRef<MapaRef, MapaProps>(function Mapa({ onMensagem }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const pronto = useRef(false);
  const fila = useRef<MensagemParaMapa[]>([]);
  const callback = useRef(onMensagem);
  callback.current = onMensagem;

  const postar = (msg: MensagemParaMapa) =>
    frame.current?.contentWindow?.postMessage({ ecopulse: true, paraMapa: true, dados: JSON.stringify(msg) }, '*');

  useImperativeHandle(ref, () => ({
    enviar(msg) {
      if (pronto.current) postar(msg);
      else fila.current.push(msg);
    },
  }));

  useEffect(() => {
    const ouvir = (ev: MessageEvent) => {
      if (ev.source !== frame.current?.contentWindow || !ev.data?.ecopulse || ev.data.paraMapa) return;
      const msg = JSON.parse(ev.data.dados);
      if (msg.tipo === 'pronto') {
        pronto.current = true;
        fila.current.splice(0).forEach(postar);
      }
      callback.current(msg);
    };
    window.addEventListener('message', ouvir);
    return () => window.removeEventListener('message', ouvir);
  }, []);

  return createElement('iframe', {
    ref: frame,
    srcDoc: mapaHtml,
    title: 'Mapa EcoPulse',
    style: { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 },
  });
});
