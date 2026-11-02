# 06 — Integrações externas

Três serviços de fora: **Open-Meteo** (clima e qualidade do ar), **tiles do mapa** e **busca de endereço**. Nenhum exige chave.

> Os endereços e nomes de parâmetros abaixo vêm da documentação pública dos serviços e podem mudar. **Antes de implementar, conferir na documentação oficial** (open-meteo.com). Se algo for diferente do que está aqui, **pare e pergunte ao grupo** (regra de ouro A), não ajuste por conta própria. Limites de uso e termos também devem ser confirmados lá.

## 1. Open-Meteo [RELATÓRIO — RF02, RNF05]

Quem chama: **somente o worker de clima**, nunca o app nem a API.

| Dado | Endereço | Parâmetros |
|---|---|---|
| Temperatura atual | `https://api.open-meteo.com/v1/forecast` | `latitude`, `longitude`, `current=temperature_2m`, `timezone=UTC` |
| Qualidade do ar atual | `https://air-quality-api.open-meteo.com/v1/air-quality` | `latitude`, `longitude`, `current=us_aqi`, `timezone=UTC` |

- **Várias células em uma chamada:** `latitude` e `longitude` aceitam listas separadas por vírgula (`latitude=-21.17,-21.20&longitude=-47.81,-47.79`); a resposta passa a ser uma **lista** de objetos, na mesma ordem. Usar lotes de até `CLIMA_LOTE_MAX` (50) células. Cada célula é consultada pelo **centro** do hexágono (`cellToLatLng`).
- **Resposta (uma localização):** `{ "current": { "time": "...", "temperature_2m": 31.2 } }` e `{ "current": { "time": "...", "us_aqi": 162 } }`.
- **Horário:** com `timezone=UTC`, `current.time` vem sem fuso (ex.: `2026-11-02T18:15`); interpretar como **UTC** ao gravar `lido_em`.
- **Escala do AQI:** usar o `us_aqi` (o limite de 150 do relatório corresponde à faixa "Não saudável" dessa escala).
- **Atribuição:** exibir "Clima e ar: Open-Meteo" no mapa (já está nas telas, canto inferior). A qualidade do ar da Open-Meteo vem do CAMS (Copernicus); manter o crédito conforme a documentação.
- **Sem dado:** se a API falhar ou vier `null`, a célula fica `null` (sem cor). **Nunca inventar valor.** Se já havia leitura no cache e ainda não expirou, continua valendo; não prolongar o TTL.

### Algoritmo do worker de clima [PROPOSTA]
A cada `CLIMA_CICLO_S` (60 s):
1. `ZRANGEBYSCORE clima:demanda (agora − 15 min) agora` → células vistas por clientes. Remove as mais antigas.
2. Para cada célula **sem** chave `clima:{h3}` (expirada ou nunca lida) → entra no lote.
3. Chama a Open-Meteo em lotes (temperatura e AQI, 2 chamadas por lote). Falha → registra o erro, **não** apaga cache, tenta no próximo ciclo (com espera crescente se falhar várias vezes).
4. Para cada leitura: `SET clima:{h3} … EX 600`, `INSERT` em `leituras_clima`.
5. Avalia limites (R4) e gera alertas, se for o caso.
6. Publica **uma** mensagem `ev:camada` com todas as células atualizadas no ciclo.

Efeito: a mesma célula não é consultada mais de uma vez a cada 10 min, não importa quantos clientes olhem (CT05, R02 do relatório).

### Modo de teste (mock) [PROPOSTA]
O serviço `mock-open-meteo` (perfil `testes` do Compose) responde nos mesmos formatos e permite: contar chamadas recebidas (`GET /_contagem`), simular falha (`POST /_falhar`), e forçar valores (`POST /_valores` com `{ "h3": ..., "aqi": 180, "temperatura_c": 38 }`). Para usá-lo, apontar `OPEN_METEO_FORECAST_URL` e `OPEN_METEO_AIR_URL` para ele. É assim que se mostram os alertas de AQI > 150 e temperatura > 35 °C na demonstração (CT04, CT05) sem depender do clima real.

## 2. Mapa — tiles [PROPOSTA]

MapLibre não traz mapa; precisa de um estilo/tiles. Sem chave e sem cobrança:

- **OpenFreeMap**: estilo `https://tiles.openfreemap.org/styles/liberty` (carregado pelo MapLibre como `style`). A atribuição "© OpenStreetMap contributors" deve ficar visível.
- É um serviço público "como está" e pode mudar ou sair do ar. Deixar a URL do estilo em uma variável (`EXPO_PUBLIC_MAP_STYLE_URL`) para trocar rápido; se cair na demonstração, usar um estilo local simples (fundo + cores das telas) — as telas já usam fundo `#E4EAE1` e água `#C5DCE8`.

## 3. Busca de endereço (RF01) [PROPOSTA]

O relatório pede "buscar endereço" sem definir o serviço. Sugestão: **Nominatim** (OpenStreetMap), chamado pelo próprio app:

`https://nominatim.openstreetmap.org/search?q=<texto>&format=json&limit=5&countrycodes=br`

- Política de uso do serviço público: no máximo 1 requisição por segundo, identificar o aplicativo (cabeçalho `User-Agent`/`Referer`) e não fazer busca a cada tecla. Buscar **ao confirmar** o texto (ou com *debounce* ≥ 800 ms).
- Resultado: mover o mapa para `lat`/`lon` retornados (o app já pede as camadas da nova região).
- Alternativa, se o Nominatim não servir: a API de geocodificação da Open-Meteo (`geocoding-api.open-meteo.com`) — acha cidades e bairros, não ruas.
- Ver D11 em `10-decisoes-tomadas.md`.

## 4. Escalas de cor das camadas (usadas nas telas)

Opacidade de preenchimento das células: **0,62** (0,40 no modo "Sem conexão"). Borda branca 2 px. Célula sem dado: **sem preenchimento**, contorno tracejado.

**Qualidade do ar (AQI)** — legenda "Bom → Ruim" [PROPOSTA nas faixas; cores vêm das telas]

| AQI | Cor |
|---|---|
| ≤ 50 | `#F2D16B` |
| 51–100 | `#F0A04B` |
| 101–150 | `#D9622B` |
| > 150 | `#9B3A1A` |

**Calor (temperatura)** — legenda "Menor → Maior" [PROPOSTA nas faixas; cores vêm das telas]

| °C | Cor |
|---|---|
| < 25 | `#F6D5D0` |
| 25 a < 30 | `#EE9A8F` |
| 30 a < 35 | `#D6455D` |
| ≥ 35 | `#8C1D40` |

As células de clima são polígonos hexagonais (`cellToBoundary(h3, true)` do `h3-js` devolve `[lng, lat]` em GeoJSON) desenhados em uma camada `fill` do MapLibre, com a cor escolhida pelas faixas acima.
