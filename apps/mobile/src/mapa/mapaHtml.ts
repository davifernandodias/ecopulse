// Página do mapa. A mesma página roda numa WebView (celular, Expo Go) e num iframe (navegador).
// MapLibre GL + tiles OpenFreeMap; h3-js desenha o contorno das células de calor e ar.
// Mensagens: app -> mapa por window.__receber(msg); mapa -> app por postMessage.

export const RIBEIRAO = { latitude: -21.1775, longitude: -47.8103 };

export const mapaHtml = `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link href="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css" rel="stylesheet">
<script src="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
<script src="https://unpkg.com/h3-js@4.5.0/dist/h3-js.umd.js"></script>
<style>
  html,body,#mapa{margin:0;padding:0;width:100%;height:100%;background:#e5e7eb}
  .maplibregl-ctrl-attrib{font-size:10px}
  #erro{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font:14px system-ui;color:#374151;text-align:center;padding:24px}
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
  var visivel = { calor: true, ar: true, alagamento: true, vias: true };
  var eu = null, simulado = false;

  var mapa = new maplibregl.Map({
    container: 'mapa',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [${RIBEIRAO.longitude}, ${RIBEIRAO.latitude}],
    zoom: 12,
    attributionControl: { compact: true, customAttribution: 'OpenFreeMap © OpenStreetMap' },
    dragRotate: false,
    pitchWithRotate: false
  });
  mapa.touchZoomRotate.disableRotation();
  window.__mapa = mapa; // depuração

  function contorno(h3idx, escala){
    var b = h3.cellToBoundary(h3idx, true); // [lng, lat]
    if (escala !== 1) {
      var c = h3.cellToLatLng(h3idx);
      b = b.map(function(p){ return [c[1] + (p[0]-c[1])*escala, c[0] + (p[1]-c[0])*escala]; });
    }
    b.push(b[0]);
    return [b];
  }

  function geoClima(escala){
    var f = [];
    clima.forEach(function(c){
      f.push({ type:'Feature', properties:{ h3:c.h3, temperatura:c.temperatura, aqi:c.aqi },
               geometry:{ type:'Polygon', coordinates: contorno(c.h3, escala) } });
    });
    return { type:'FeatureCollection', features:f };
  }

  function geoIncidentes(){
    var f = [];
    incidentes.forEach(function(i){
      if (i.tipo === 'alagamento' && !visivel.alagamento) return;
      if (i.tipo === 'via_obstruida' && !visivel.vias) return;
      f.push({ type:'Feature', properties:{ id:i.id, tipo:i.tipo, gravidade:i.gravidade, status:i.status,
               letra: i.tipo === 'alagamento' ? 'A' : 'V' },
               geometry:{ type:'Point', coordinates:[i.longitude, i.latitude] } });
    });
    return { type:'FeatureCollection', features:f };
  }

  function geoEu(){
    return { type:'FeatureCollection', features: eu ? [{ type:'Feature', properties:{ simulado: simulado },
      geometry:{ type:'Point', coordinates:[eu.longitude, eu.latitude] } }] : [] };
  }

  var pronto = false;
  function redesenharClima(){ if(!pronto) return; mapa.getSource('calor').setData(geoClima(1)); mapa.getSource('ar').setData(geoClima(0.45)); }
  function redesenharIncidentes(){ if(!pronto) return; mapa.getSource('incidentes').setData(geoIncidentes()); }
  function redesenharEu(){ if(!pronto) return; mapa.getSource('eu').setData(geoEu()); }

  function aplicarVisibilidade(){
    if(!pronto) return;
    mapa.setLayoutProperty('calor-fill', 'visibility', visivel.calor ? 'visible' : 'none');
    mapa.setLayoutProperty('ar-fill', 'visibility', visivel.ar ? 'visible' : 'none');
    mapa.setLayoutProperty('ar-borda', 'visibility', visivel.ar ? 'visible' : 'none');
    redesenharIncidentes();
  }

  mapa.on('load', function(){
    mapa.addSource('calor', { type:'geojson', data: geoClima(1) });
    mapa.addSource('ar', { type:'geojson', data: geoClima(0.45) });
    mapa.addSource('incidentes', { type:'geojson', data: geoIncidentes() });
    mapa.addSource('eu', { type:'geojson', data: geoEu() });

    // Calor: azul abaixo de 20 °C, amarelo por volta de 28 °C, vermelho a partir de 35 °C.
    // Paradas intermediárias (24 °C azul-claro, 31 °C laranja) para a faixa do meio não virar
    // um cinza-esverdeado que some no mapa base.
    mapa.addLayer({ id:'calor-fill', type:'fill', source:'calor',
      filter:['!=', ['typeof', ['get','temperatura']], 'null'],
      paint:{ 'fill-color':['interpolate',['linear'],['to-number',['get','temperatura'],0],
                20,'#2563eb', 24,'#38bdf8', 28,'#facc15', 31,'#fb923c', 35,'#dc2626'],
              'fill-opacity':0.45, 'fill-outline-color':'rgba(255,255,255,0.7)' } });
    // Ar: hexágono interno, cor por faixa do US AQI, com borda branca para separar do calor.
    mapa.addLayer({ id:'ar-fill', type:'fill', source:'ar',
      filter:['!=', ['typeof', ['get','aqi']], 'null'],
      paint:{ 'fill-color':['step',['to-number',['get','aqi'],0], '#16a34a', 51,'#eab308', 101,'#f97316', 151,'#dc2626'],
              'fill-opacity':0.7 } });
    mapa.addLayer({ id:'ar-borda', type:'line', source:'ar',
      filter:['!=', ['typeof', ['get','aqi']], 'null'],
      paint:{ 'line-color':'#ffffff', 'line-width':1.5, 'line-opacity':0.9 } });

    mapa.addLayer({ id:'eu-halo', type:'circle', source:'eu',
      paint:{ 'circle-radius':16, 'circle-color':['case',['get','simulado'],'#a855f7','#2563eb'], 'circle-opacity':0.18 } });
    mapa.addLayer({ id:'eu', type:'circle', source:'eu',
      paint:{ 'circle-radius':7, 'circle-color':['case',['get','simulado'],'#a855f7','#2563eb'],
              'circle-stroke-color':'#fff', 'circle-stroke-width':2.5 } });

    mapa.addLayer({ id:'incidentes', type:'circle', source:'incidentes',
      paint:{ 'circle-radius':12,
              'circle-color':['match',['get','gravidade'],'alta','#dc2626','media','#f97316','#facc15'],
              'circle-stroke-color':['match',['get','tipo'],'alagamento','#1d4ed8','#111827'],
              'circle-stroke-width':['case',['==',['get','status'],'confirmado'],4,2.5] } });
    mapa.addLayer({ id:'incidentes-letra', type:'symbol', source:'incidentes',
      layout:{ 'text-field':['get','letra'], 'text-font':['Noto Sans Bold'], 'text-size':12, 'text-allow-overlap':true },
      paint:{ 'text-color':'#fff' } });

    pronto = true;
    aplicarVisibilidade();
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
  mapa.on('moveend', function(){ clearTimeout(tCamera); tCamera = setTimeout(avisarCamera, 450); });

  mapa.on('click', function(e){
    var pad = 10, p = e.point;
    var caixa = [[p.x-pad,p.y-pad],[p.x+pad,p.y+pad]];
    var pin = mapa.queryRenderedFeatures(caixa, { layers:['incidentes'] })[0];
    if (pin) { enviar({ tipo:'toquePino', id: pin.properties.id }); return; }
    var camadas = [];
    if (visivel.ar) camadas.push('ar-fill');
    if (visivel.calor) camadas.push('calor-fill');
    var cel = camadas.length ? mapa.queryRenderedFeatures(p, { layers: camadas })[0] : null;
    if (cel) { enviar({ tipo:'toqueCelula', h3: cel.properties.h3, latitude: e.lngLat.lat, longitude: e.lngLat.lng }); return; }
    enviar({ tipo:'toqueVazio', latitude: e.lngLat.lat, longitude: e.lngLat.lng });
  });

  // Toque longo (ou botão direito) define uma posição simulada para ensaiar o alerta.
  mapa.on('contextmenu', function(e){
    enviar({ tipo:'toqueLongo', latitude: e.lngLat.lat, longitude: e.lngLat.lng });
  });

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
        visivel = msg.visivel; aplicarVisibilidade(); break;
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
