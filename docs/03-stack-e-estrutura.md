# 03 — Stack, estrutura do repositório e ambiente

## Tecnologias [RELATÓRIO — seção 3]

| Parte | Tecnologia |
|---|---|
| App | React Native com **Expo**, **MapLibre**, **SQLite** (`expo-sqlite`) |
| API | **Node.js** + **Express**, WebSocket com a biblioteca **`ws`** |
| Workers | Node.js (processos separados) |
| Mensageria | **RabbitMQ** (fila durável, ack manual, retries, DLQ) |
| Banco | **PostgreSQL com PostGIS** (índice GiST) |
| Cache e pub/sub | **Redis** (único contêiner) |
| Partição geográfica | **H3** (biblioteca `h3-js`) |
| Infra | **Docker** e **Docker Compose** |
| Dados externos | **Open-Meteo** (clima e qualidade do ar) |

## Versões e bibliotecas [PROPOSTA]

Conferir as versões atuais no momento de criar o projeto; usar as estáveis.

| Item | Sugestão |
|---|---|
| Node.js | LTS atual (22 ou 24), igual em todos os serviços e na máquina do grupo |
| Linguagem | TypeScript nos serviços e no app (o template do Expo já é TypeScript). Execução em dev com `tsx`. Ver D03 em `10-decisoes-tomadas.md` |
| Gerenciador | `npm` com **workspaces** (um `package.json` na raiz) |
| Imagens Docker | `postgis/postgis:16-3.4`, `redis:7-alpine`, `rabbitmq:3.13-management` |
| API | `express`, `ws`, `amqplib`, `pg`, `ioredis`, `h3-js`, `zod` (validação), `cors` |
| Workers | `amqplib`, `pg`, `ioredis`, `h3-js` (e `fetch` nativo para a Open-Meteo) |
| Testes | `vitest`; clientes WebSocket de teste com `ws` |
| App | `expo`, `expo-sqlite`, `expo-location`, `@react-native-community/netinfo`, `h3-js`, biblioteca de mapa (ver abaixo) |

Evite acrescentar bibliotecas além dessas sem necessidade. Sem ORM: SQL direto com `pg`.

## Ponto de atenção: MapLibre no Expo (fazer um teste rápido no início)

O relatório prevê **o mesmo código no celular físico e no navegador**, com **MapLibre**. Na prática:

- `@maplibre/maplibre-react-native` é uma biblioteca **nativa**: **não roda no Expo Go**, exige um *development build* (`npx expo prebuild` / `expo run:android` ou EAS Build).
- No navegador, o MapLibre é o `maplibre-gl` (outra biblioteca).

Caminho sugerido **[PROPOSTA]**: um componente `Mapa` com duas implementações escolhidas por plataforma — `Mapa.native.tsx` (maplibre-react-native, em development build) e `Mapa.web.tsx` (`maplibre-gl`) — com **a mesma interface** (propriedades: região visível, camadas H3, pontos, posição do usuário, eventos de toque e de mudança de região). Todo o resto do app (SQLite, WebSocket, relatos, alertas, telas) é compartilhado.

Alternativa mais simples para o celular: um `WebView` com `maplibre-gl` dentro (funciona no Expo Go, com troca de mensagens com o app). Em qualquer caso, **a primeira tarefa do app é um "spike" do mapa**: abrir o mapa no celular físico e no navegador, desenhar 3 hexágonos H3 e 2 pontos, e receber o toque. Só depois construir o restante. Ver D01.

## Estrutura do repositório [PROPOSTA]

```
ecopulse/
├─ docker-compose.yml
├─ .env.example
├─ package.json                 # workspaces
├─ README.md                    # como subir tudo (um comando)
├─ CLAUDE.md                    # regras de trabalho (resumo do 00-leia-me.md)
├─ docs/
│  ├─ 00-leia-me.md … 10-decisoes-tomadas.md, 11-progresso.md
│  ├─ relatorio/Relatorio_APS_EcoPulse.pdf
│  └─ telas/                    # EcoPulse_Telas.pdf, tela-01….png … tela-14….png, notas-das-telas.md
├─ infra/
│  └─ postgres/init/001_schema.sql
├─ packages/
│  └─ compartilhado/            # constantes, tipos, utilitários H3/distância, nomes de filas e canais
├─ services/
│  ├─ api/                      # Express + ws + publicação no RabbitMQ + assinatura Redis
│  ├─ worker-relatos/
│  ├─ worker-clima/
│  └─ mock-open-meteo/          # servidor falso só para testes (perfil "testes" do Compose)
├─ app/                         # Expo (React Native)
└─ testes/
   ├─ integracao/               # vitest + clientes ws contra o Compose
   └─ resultados/               # saídas dos testes (alimentam a seção 7.3 do relatório)
```

### Organização interna de cada parte [PROPOSTA]

Poucos arquivos, um assunto por arquivo. Nomes só como guia.

```
packages/compartilhado/src/
  constantes.ts          # tabela de 02-regras-e-constantes.md
  tipos.ts               # Relato, Incidente, Alerta, mensagens do WebSocket (de 04-contratos.md)
  mensageria.ts          # nomes de exchanges, filas, canais Redis e chaves
  geo.ts                 # H3 (latLngToCell, cellToBoundary, células do retângulo) e haversine

services/api/src/
  index.ts               # sobe Express + ws
  rotas/saude.ts  rotas/relatos.ts  rotas/camadas.ts  rotas/alertas.ts
  ws/servidor.ts         # conexões, inscrição, roteamento por retângulo e proximidade
  ws/eventos.ts          # assinatura Redis (ev:*) → clientes
  infra/amqp.ts  infra/redis.ts  infra/postgres.ts   # conexões e declaração da topologia

services/worker-relatos/src/
  index.ts               # consumidor (ack manual, prefetch)
  processar.ts           # transação do R2
  retry.ts               # espera 2/4/8 s, DLQ
  infra/…                # amqp, redis, postgres

services/worker-clima/src/
  index.ts               # ciclo de 60 s
  openmeteo.ts           # chamadas em lote e leitura das respostas
  alertas.ts             # AQI > 150 e temperatura > 35 °C

app/
  app/ (ou src/telas)    # Mapa, NovoRelato
  src/mapa/              # Mapa.native.tsx, Mapa.web.tsx, camadas H3, pontos
  src/componentes/       # Chips, Legenda, FaixaAlerta, FaixaAviso, Ficha, MeusRelatos
  src/dados/             # sqlite.ts (fila local, config, cache), api.ts, ws.ts
  src/estado/            # alertas, camadas, rede (estado simples com hooks/contexto)
```

Cada serviço tem seu `Dockerfile` (Node LTS, instala só o necessário) e é montado a partir da raiz do monorepo para enxergar `packages/compartilhado`.

## Docker Compose [RELATÓRIO — RNF06; PROPOSTA nos detalhes]

Serviços: `postgres`, `redis`, `rabbitmq`, `api`, `worker-relatos`, `worker-clima` (+ `mock-open-meteo` no perfil `testes`).

- Um único comando: `docker compose up --build` (RNF06). Todos com `restart: unless-stopped`.
- `healthcheck` em `postgres` (`pg_isready`), `redis` (`redis-cli ping`) e `rabbitmq` (`rabbitmq-diagnostics -q ping`); `api` e workers com `depends_on: condition: service_healthy`.
- O script `infra/postgres/init/001_schema.sql` roda sozinho na primeira subida (montado em `/docker-entrypoint-initdb.d`).
- `worker-relatos` **não** fixa `container_name` nem porta, para permitir `docker compose up --scale worker-relatos=3` (RNF10, CT09).
- Volumes nomeados para `postgres`, `rabbitmq` e `redis` (o relatório exige fila durável; o volume do RabbitMQ mantém as mensagens se o contêiner reiniciar).
- Portas no host: API `3000`, RabbitMQ `5672` (AMQP) e `15672` (painel), PostgreSQL `5432`, Redis `6379`.

## Variáveis de ambiente [PROPOSTA] — `.env.example`

```
# Serviços
DATABASE_URL=postgres://ecopulse:ecopulse@postgres:5432/ecopulse
REDIS_URL=redis://redis:6379
AMQP_URL=amqp://ecopulse:ecopulse@rabbitmq:5672
POSTGRES_USER=ecopulse
POSTGRES_PASSWORD=ecopulse
POSTGRES_DB=ecopulse
RABBITMQ_DEFAULT_USER=ecopulse
RABBITMQ_DEFAULT_PASS=ecopulse

# API
PORT=3000

# Workers
PREFETCH_RELATOS=5

# Open-Meteo (trocar pelos endereços do mock nos testes)
OPEN_METEO_FORECAST_URL=https://api.open-meteo.com/v1/forecast
OPEN_METEO_AIR_URL=https://air-quality-api.open-meteo.com/v1/air-quality

# Constantes que podem ser ajustadas sem mexer no código
H3_RES_CLIMA=7
H3_RES_INCIDENTE=8
```

No app (`app/.env`): `EXPO_PUBLIC_API_URL=http://<IP-da-máquina-na-rede>:3000` e `EXPO_PUBLIC_WS_URL=ws://<IP-da-máquina-na-rede>:3000/ws`.

## Como o app alcança a API (celular físico)

- O celular e o computador devem estar na **mesma rede Wi-Fi**; usar o IP do computador (não `localhost`).
- Emulador Android: `10.0.2.2`. Simulador iOS: `localhost`. Navegador no mesmo computador: `localhost`.
- Liberar a porta `3000` no firewall do computador.
- Android pode bloquear HTTP sem TLS; em *development build*, habilitar `usesCleartextTraffic` (via `expo-build-properties`) se a conexão falhar.
- A API libera **CORS** para qualquer origem em desenvolvimento (o app web roda em outra porta).

## Dados de demonstração [PROPOSTA]

Script `npm run seed` que cria, em Ribeirão Preto (centro ≈ -21.1775, -47.8103): 3 incidentes confirmados e 2 recebidos (alagamento e via obstruída), distribuídos em células H3 res 8 diferentes, e leituras de clima para as células do centro. Serve para o app mostrar algo logo na primeira abertura e para o roteiro da demonstração.

## Logs

JSON em uma linha por evento (`nivel`, `servico`, `evento`, dados). Eventos obrigatórios, que servem de evidência para o relatório: `relato_recebido`, `relato_gravado`, `retry_agendado`, `relato_na_dlq`, `incidente_confirmado`, `alerta_gerado`, `alerta_entregue` (com o `cliente_id`), `clima_consultado`, `clima_cache_hit`.
