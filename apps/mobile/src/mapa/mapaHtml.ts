// Página do mapa. A mesma página roda numa WebView (celular, Expo Go) e num iframe (navegador).
// MapLibre GL + tiles OpenFreeMap; h3-js desenha as células. Cores e medidas: docs/06 §4 e docs/07.
// Mensagens: app -> mapa por window.__receber(msg); mapa -> app por postMessage.

export const RIBEIRAO = { latitude: -21.1775, longitude: -47.8103, zoom: 12 };

export const mapaHtml = `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link href="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css" rel="stylesheet">
<script src="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
<script src="https://unpkg.com/h3-js@4.5.0/dist/h3-js.umd.js"></script>
<style>
  html,body,#mapa{margin:0;padding:0;width:100%;height:100%;background:#E4EAE1}
  /* Sem lupa nem menu do iOS ao segurar o dedo no mapa */
  html,body{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}
  .maplibregl-ctrl-bottom-right{bottom:0;right:0}
  .maplibregl-ctrl-attrib{font:10px system-ui;background:rgba(255,255,255,.7)!important}
  #erro{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font:15px system-ui;color:#4A5D55;text-align:center;padding:24px}
</style>
</head><body>
<div id="mapa"></div>
<div id="erro">Não foi possível carregar o mapa base. Verifique a internet.</div>
<script>
(function(){
  function enviar(msg){
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent !== window) window.parent.postMessage({ ecopulse: true, dados: s }, '*');
  }
  if (typeof maplibregl === 'undefined') {
    document.getElementById('erro').style.display = 'flex';
    enviar({ tipo: 'erro', mensagem: 'maplibre não carregou' });
    return;
  }

  var clima = new Map();      // h3 -> {h3, temperatura, aqi, lidoEm}
  var incidentes = new Map(); // id -> incidente
  var visivel = { ar: true, calor: false, alagamento: true, vias: true };
  var eu = null, simulado = false, semConexao = false;
  var selecao = { h3: null, incidenteId: null };
  var alerta = null;          // {incidenteId?, h3?}

  var mapa = new maplibregl.Map({
    container: 'mapa',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [${RIBEIRAO.longitude}, ${RIBEIRAO.latitude}],
    zoom: ${RIBEIRAO.zoom},
    minZoom: 9,
    attributionControl: false, // a atribuição do mapa base aparece no app, junto com a da Open-Meteo
    dragRotate: false,
    pitchWithRotate: false
  });
  mapa.touchZoomRotate.disableRotation();

  // Ícones dos pontos (tela 1): gota no círculo azul e losango escuro com traço.
  function icone(desenhar){
    var px = 2, t = 34 * px, c = document.createElement('canvas');
    c.width = c.height = t;
    var g = c.getContext('2d');
    desenhar(g, t, px);
    return { width: t, height: t, data: g.getImageData(0, 0, t, t).data };
  }
  var iconeAlagamento = icone(function(g, t, px){
    g.beginPath(); g.arc(t/2, t/2, t/2 - 1, 0, Math.PI*2); g.fillStyle = '#fff'; g.fill();
    g.beginPath(); g.arc(t/2, t/2, t/2 - 4*px, 0, Math.PI*2); g.fillStyle = '#1B5E9B'; g.fill();
    g.beginPath(); g.moveTo(t/2, t/2 - 7*px);
    g.bezierCurveTo(t/2 + 6*px, t/2 + 1*px, t/2 + 5*px, t/2 + 7*px, t/2, t/2 + 7*px);
    g.bezierCurveTo(t/2 - 5*px, t/2 + 7*px, t/2 - 6*px, t/2 + 1*px, t/2, t/2 - 7*px);
    g.fillStyle = '#fff'; g.fill();
  });
  var iconeVia = icone(function(g, t, px){
    function losango(r, cor){ g.beginPath(); g.moveTo(t/2, t/2-r); g.lineTo(t/2+r, t/2); g.lineTo(t/2, t/2+r); g.lineTo(t/2-r, t/2); g.closePath(); g.fillStyle = cor; g.fill(); }
    losango(t/2 - 1, '#fff'); losango(t/2 - 5*px, '#12261F');
    g.fillStyle = '#fff'; g.fillRect(t/2 - 6*px, t/2 - 1.5*px, 12*px, 3*px);
  });

  function contorno(h3idx){
    var b = h3.cellToBoundary(h3idx, true); // [lng, lat]
    b.push(b[0]);
    return [b];
  }

  function geoClima(){
    var f = [];
    clima.forEach(function(c){
      f.push({ type:'Feature', properties:{ h3:c.h3, temperatura:c.temperatura, aqi:c.aqi },
               geometry:{ type:'Polygon', coordinates: contorno(c.h3) } });
    });
    return { type:'FeatureCollection', features:f };
  }

  function geoIncidentes(){
    var f = [];
    incidentes.forEach(function(i){
      if (i.tipo === 'alagamento' && !visivel.alagamento) return;
      if (i.tipo === 'via_obstruida' && !visivel.vias) return;
      f.push({ type:'Feature', properties:{ id:i.id, tipo:i.tipo, icone: i.tipo === 'alagamento' ? 'alagamento' : 'via' },
               geometry:{ type:'Point', coordinates:[i.longitude, i.latitude] } });
    });
    return { type:'FeatureCollection', features:f };
  }

  function geoEu(){
    return { type:'FeatureCollection', features: eu ? [{ type:'Feature', properties:{ simulado: simulado },
      geometry:{ type:'Point', coordinates:[eu.longitude, eu.latitude] } }] : [] };
  }

  // Círculo de 500 m em volta do usuário durante um alerta de incidente (tela 10).
  function geoRaio(){
    if (!alerta || !alerta.incidenteId || !eu) return { type:'FeatureCollection', features:[] };
    var pts = [], r = 500, lat = eu.latitude * Math.PI / 180;
    for (var i = 0; i <= 64; i++) {
      var a = i / 64 * Math.PI * 2;
      pts.push([eu.longitude + (r * Math.cos(a)) / (111320 * Math.cos(lat)), eu.latitude + (r * Math.sin(a)) / 110540]);
    }
    return { type:'FeatureCollection', features:[{ type:'Feature', properties:{}, geometry:{ type:'Polygon', coordinates:[pts] } }] };
  }

  var pronto = false;
  function redesenharClima(){ if(pronto) mapa.getSource('clima').setData(geoClima()); }
  function redesenharIncidentes(){ if(pronto) mapa.getSource('incidentes').setData(geoIncidentes()); }
  function redesenharEu(){ if(pronto) { mapa.getSource('eu').setData(geoEu()); mapa.getSource('raio').setData(geoRaio()); } }

  var temValor = function(campo){ return ['!=', ['typeof', ['get', campo]], 'null']; };
  var semValor = function(campo){ return ['==', ['typeof', ['get', campo]], 'null']; };
  // Faixas de cor de docs/06 §4.
  var corAqi = ['step', ['to-number', ['get','aqi'], 0], '#F2D16B', 51,'#F0A04B', 101,'#D9622B', 151,'#9B3A1A'];
  var corCalor = ['step', ['to-number', ['get','temperatura'], 0], '#F6D5D0', 25,'#EE9A8F', 30,'#D6455D', 35,'#8C1D40'];

  // Regras de exibição: só ar = preenchimento de AQI; só calor = preenchimento de temperatura;
  // os dois = calor preenchido e ar como contorno de 4 px (decisão D17).
  function aplicarCamadas(){
    if(!pronto) return;
    var op = semConexao ? 0.40 : 0.62;
    var mostra = function(id, sim){ mapa.setLayoutProperty(id, 'visibility', sim ? 'visible' : 'none'); };
    var soAr = visivel.ar && !visivel.calor;
    mapa.setPaintProperty('clima-fill', 'fill-color', visivel.calor ? corCalor : corAqi);
    mapa.setFilter('clima-fill', temValor(visivel.calor ? 'temperatura' : 'aqi'));
    mapa.setPaintProperty('clima-fill', 'fill-opacity', op);
    mostra('clima-fill', visivel.ar || visivel.calor);
    mostra('clima-borda', visivel.ar || visivel.calor);
    mostra('ar-contorno', visivel.ar && visivel.calor);
    mapa.setFilter('sem-dado', semValor(visivel.calor ? 'temperatura' : 'aqi'));
    mostra('sem-dado', visivel.ar || visivel.calor);
    redesenharIncidentes();
  }

  function aplicarSelecao(){
    if(!pronto) return;
    mapa.setFilter('celula-selecionada', ['==', ['get','h3'], selecao.h3 || '']);
    mapa.setFilter('ponto-selecionado', ['==', ['get','id'], selecao.incidenteId || '']);
    mapa.setFilter('ponto-alerta', ['==', ['get','id'], (alerta && alerta.incidenteId) || '']);
    mapa.setFilter('celula-alerta', ['==', ['get','h3'], (alerta && !alerta.incidenteId && alerta.h3) || '']);
    mapa.getSource('raio').setData(geoRaio());
  }

  mapa.on('load', function(){
    mapa.addImage('alagamento', iconeAlagamento, { pixelRatio: 2 });
    mapa.addImage('via', iconeVia, { pixelRatio: 2 });
    mapa.addSource('clima', { type:'geojson', data: geoClima() });
    mapa.addSource('incidentes', { type:'geojson', data: geoIncidentes() });
    mapa.addSource('eu', { type:'geojson', data: geoEu() });
    mapa.addSource('raio', { type:'geojson', data: geoRaio() });

    mapa.addLayer({ id:'clima-fill', type:'fill', source:'clima', paint:{ 'fill-color': corAqi, 'fill-opacity': 0.62 } });
    mapa.addLayer({ id:'clima-borda', type:'line', source:'clima', paint:{ 'line-color':'#ffffff', 'line-width':2 } });
    // Célula sem dado: sem cor, contorno tracejado (nunca inventar valor).
    mapa.addLayer({ id:'sem-dado', type:'line', source:'clima',
      paint:{ 'line-color':'#4A5D55', 'line-width':2, 'line-dasharray':[2, 2] } });
    mapa.addLayer({ id:'ar-contorno', type:'line', source:'clima', filter: temValor('aqi'),
      paint:{ 'line-color': corAqi, 'line-width':4, 'line-offset':-2 } });
    mapa.addLayer({ id:'celula-alerta', type:'line', source:'clima', filter:['==',['get','h3'],''],
      paint:{ 'line-color':'#7A2E0B', 'line-width':4, 'line-dasharray':[2, 1.5] } });
    mapa.addLayer({ id:'celula-selecionada', type:'line', source:'clima', filter:['==',['get','h3'],''],
      paint:{ 'line-color':'#12261F', 'line-width':4 } });

    mapa.addLayer({ id:'raio-fill', type:'fill', source:'raio', paint:{ 'fill-color':'#4A5D55', 'fill-opacity':0.10 } });
    mapa.addLayer({ id:'raio-linha', type:'line', source:'raio',
      paint:{ 'line-color':'#7A2E0B', 'line-width':2, 'line-dasharray':[3, 2] } });

    mapa.addLayer({ id:'eu-halo', type:'circle', source:'eu',
      paint:{ 'circle-radius':20, 'circle-color':['case',['get','simulado'],'#7B4FB8','#1D6FB8'], 'circle-opacity':0.22 } });
    mapa.addLayer({ id:'eu', type:'circle', source:'eu',
      paint:{ 'circle-radius':8, 'circle-color':['case',['get','simulado'],'#7B4FB8','#1D6FB8'],
              'circle-stroke-color':'#fff', 'circle-stroke-width':3 } });

    mapa.addLayer({ id:'ponto-alerta', type:'circle', source:'incidentes', filter:['==',['get','id'],''],
      paint:{ 'circle-radius':21, 'circle-color':'#7A2E0B' } });
    mapa.addLayer({ id:'ponto-selecionado', type:'circle', source:'incidentes', filter:['==',['get','id'],''],
      paint:{ 'circle-radius':21, 'circle-color':'#12261F' } });
    mapa.addLayer({ id:'incidentes', type:'symbol', source:'incidentes',
      layout:{ 'icon-image':['get','icone'], 'icon-allow-overlap':true, 'icon-ignore-placement':true } });

    pronto = true;
    aplicarCamadas(); aplicarSelecao();
    redesenharClima(); redesenharIncidentes(); redesenharEu();
    enviar({ tipo:'pronto' });
    avisarCamera();
  });

  mapa.on('error', function(e){ enviar({ tipo:'erro', mensagem: String(e && e.error && e.error.message || e) }); });

  var tCamera = null;
  function avisarCamera(){
    var b = mapa.getBounds();
    var bbox = [Math.max(-180,b.getWest()), Math.max(-85,b.getSouth()), Math.min(180,b.getEast()), Math.min(85,b.getNorth())];
    var c = mapa.getCenter();
    enviar({ tipo:'camera', bbox: bbox, zoom: mapa.getZoom(), centro:{ latitude:c.lat, longitude:c.lng } });
  }
  // Espera o gesto terminar antes de pedir camada (não publica um pedido por frame).
  mapa.on('moveend', function(){ clearTimeout(tCamera); tCamera = setTimeout(avisarCamera, 500); });

  mapa.on('click', function(e){
    var pad = 14, p = e.point;
    var pin = mapa.queryRenderedFeatures([[p.x-pad,p.y-pad],[p.x+pad,p.y+pad]], { layers:['incidentes'] })[0];
    if (pin) { enviar({ tipo:'toquePino', id: pin.properties.id }); return; }
    var cel = (visivel.ar || visivel.calor) ? mapa.queryRenderedFeatures(p, { layers: ['clima-fill', 'sem-dado'] })[0] : null;
    if (!cel && (visivel.ar || visivel.calor)) {
      // Célula sem dado não tem preenchimento: procura pelo ponto dentro do hexágono.
      var h = h3.latLngToCell(e.lngLat.lat, e.lngLat.lng, 7);
      if (clima.has(h)) cel = { properties: { h3: h } };
    }
    if (cel) { enviar({ tipo:'toqueCelula', h3: cel.properties.h3, latitude: e.lngLat.lat, longitude: e.lngLat.lng }); return; }
    enviar({ tipo:'toqueVazio', latitude: e.lngLat.lat, longitude: e.lngLat.lng });
  });

  // Toque longo (ou botão direito) define uma posição simulada para ensaiar o alerta.
  var ultimoLongo = 0;
  function toqueLongo(lat, lng){
    if (Date.now() - ultimoLongo < 1000) return; // Android dispara contextmenu e o timer: vale um só
    ultimoLongo = Date.now();
    enviar({ tipo:'toqueLongo', latitude: lat, longitude: lng });
  }
  mapa.on('contextmenu', function(e){ cancelarLongo(); toqueLongo(e.lngLat.lat, e.lngLat.lng); });

  // iPhone não dispara contextmenu no toque longo: conta o tempo do dedo parado.
  var area = mapa.getCanvasContainer(), tLongo = null, inicio = null;
  function cancelarLongo(){ clearTimeout(tLongo); tLongo = null; }
  area.addEventListener('touchstart', function(ev){
    cancelarLongo();
    if (ev.touches.length !== 1) return;
    inicio = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    tLongo = setTimeout(function(){
      var r = area.getBoundingClientRect();
      var ll = mapa.unproject([inicio.x - r.left, inicio.y - r.top]);
      toqueLongo(ll.lat, ll.lng);
    }, 600);
  }, { passive: true });
  area.addEventListener('touchmove', function(ev){
    var t = ev.touches[0];
    if (!inicio || ev.touches.length !== 1 || Math.abs(t.clientX - inicio.x) > 10 || Math.abs(t.clientY - inicio.y) > 10) cancelarLongo();
  }, { passive: true });
  area.addEventListener('touchend', cancelarLongo, { passive: true });
  area.addEventListener('touchcancel', cancelarLongo, { passive: true });

  window.__receber = function(msg){
    switch (msg.tipo) {
      case 'clima':
        if (msg.substituir) clima.clear();
        msg.celulas.forEach(function(c){ clima.set(c.h3, c); });
        if (clima.size > 4000) { var n = clima.size - 4000; for (var k of clima.keys()) { if (n-- <= 0) break; clima.delete(k); } }
        redesenharClima(); break;
      case 'incidentes':
        if (msg.substituir) incidentes.clear();
        msg.lista.forEach(function(i){ incidentes.set(i.id, i); });
        redesenharIncidentes(); break;
      case 'visibilidade':
        visivel = msg.visivel; aplicarCamadas(); break;
      case 'semConexao':
        semConexao = !!msg.valor; aplicarCamadas(); break;
      case 'selecao':
        selecao = { h3: msg.h3 || null, incidenteId: msg.incidenteId || null }; aplicarSelecao(); break;
      case 'alerta':
        alerta = msg.alerta || null; aplicarSelecao(); break;
      case 'eu':
        eu = msg.posicao; simulado = !!msg.simulado; redesenharEu(); break;
      case 'voar':
        if (msg.bbox) mapa.fitBounds([[msg.bbox[0],msg.bbox[1]],[msg.bbox[2],msg.bbox[3]]], { padding: 40, maxZoom: 15, duration: 900 });
        else mapa.flyTo({ center:[msg.longitude, msg.latitude], zoom: msg.zoom || Math.max(mapa.getZoom(), 14), duration: 900 });
        break;
    }
  };
  window.addEventListener('message', function(ev){
    var d = ev.data;
    if (d && d.ecopulse && d.paraMapa) window.__receber(JSON.parse(d.dados));
  });
})();
</script>
</body></html>`;
