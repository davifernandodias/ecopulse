# 05 — Banco de dados

Dois bancos: **PostgreSQL com PostGIS** (registro definitivo, no servidor) e **SQLite** (no aparelho, fila local e cache da última camada). Nomes em português sem acento. Todas as posições são `geography(Point, 4326)` (distância em metros com `ST_DWithin`, índice GiST). O PostgreSQL é o **registro definitivo** (RNF03); o Redis é só cópia para leitura rápida.

## PostgreSQL — `infra/postgres/init/001_schema.sql` [PROPOSTA]

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

-- Incidente = agrupamento de relatos do mesmo tipo na mesma célula H3 (res. H3_RES_INCIDENTE)
CREATE TABLE incidentes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo               text NOT NULL CHECK (tipo IN ('alagamento', 'via_obstruida')),
  h3                 text NOT NULL,
  gravidade          text NOT NULL CHECK (gravidade IN ('baixa', 'media', 'alta')),
  situacao           text NOT NULL DEFAULT 'recebido' CHECK (situacao IN ('recebido', 'confirmado')),
  n_relatos          integer NOT NULL DEFAULT 1,
  posicao            geography(Point, 4326) NOT NULL,   -- posição do relato mais recente
  primeiro_relato_em timestamptz NOT NULL,
  ultimo_relato_em   timestamptz NOT NULL,
  confirmado_em      timestamptz
);
CREATE INDEX incidentes_posicao_gix ON incidentes USING gist (posicao);   -- retângulo visível e raio de 500 m
CREATE INDEX incidentes_busca_idx   ON incidentes (tipo, h3, ultimo_relato_em DESC);

-- Relato = o que o usuário enviou. O id é gerado NO APARELHO (idempotência: reentrega não duplica)
CREATE TABLE relatos (
  id             uuid PRIMARY KEY,
  dispositivo_id text NOT NULL,
  incidente_id   uuid REFERENCES incidentes (id),
  tipo           text NOT NULL CHECK (tipo IN ('alagamento', 'via_obstruida')),
  gravidade      text NOT NULL CHECK (gravidade IN ('baixa', 'media', 'alta')),
  descricao      text,
  posicao        geography(Point, 4326) NOT NULL,
  h3             text NOT NULL,
  precisao_m     real,
  enviado_em     timestamptz NOT NULL,                  -- horário do aparelho (metadado, só exibição)
  gravado_em     timestamptz NOT NULL DEFAULT now()     -- horário do servidor (usado nas janelas de 2 h e 1 h e no teste RNF08)
);
CREATE INDEX relatos_posicao_gix     ON relatos USING gist (posicao);
CREATE INDEX relatos_dispositivo_idx ON relatos (dispositivo_id, gravado_em DESC);   -- limite de 30 por hora
CREATE INDEX relatos_incidente_idx   ON relatos (incidente_id, gravado_em);          -- confirmação (2 relatos em 2 h)

-- Alerta = gravado ANTES de ser publicado (RNF09)
CREATE TABLE alertas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem       text NOT NULL CHECK (origem IN ('incidente', 'aqi', 'temperatura')),
  incidente_id uuid REFERENCES incidentes (id),
  h3           text NOT NULL,                           -- célula do incidente (res 8) ou do clima (res 7)
  posicao      geography(Point, 4326) NOT NULL,         -- incidente: posição do incidente; clima: centro da célula
  gravidade    text CHECK (gravidade IN ('baixa', 'media', 'alta')),   -- só incidente
  valor        real,                                    -- AQI ou temperatura (°C), só clima
  mensagem     text NOT NULL,
  gerado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX alertas_incidente_uq ON alertas (incidente_id) WHERE origem = 'incidente';  -- 1 alerta por incidente
CREATE INDEX alertas_posicao_gix ON alertas USING gist (posicao);
CREATE INDEX alertas_gerado_idx  ON alertas (gerado_em DESC);

-- Leituras de clima e ar por célula H3 (res. H3_RES_CLIMA). Valor ausente = NULL (nunca inventar)
CREATE TABLE leituras_clima (
  h3            text NOT NULL,
  temperatura_c real,
  aqi           integer,
  lido_em       timestamptz NOT NULL,
  PRIMARY KEY (h3, lido_em)
);
```

`gen_random_uuid()` é nativa do PostgreSQL 13+. Os tipos e a gravidade são `text` com `CHECK` (simples; sem `ENUM`).

### Consultas principais

```sql
-- Incidentes no retângulo visível (RNF04) — usa o índice GiST
SELECT id, tipo, gravidade, situacao, n_relatos, ultimo_relato_em,
       ST_Y(posicao::geometry) AS lat, ST_X(posicao::geometry) AS lon
FROM incidentes
WHERE posicao && ST_MakeEnvelope($oeste, $sul, $leste, $norte, 4326)::geography
  AND ultimo_relato_em > now() - interval '6 hours';

-- Incidentes a até 500 m de uma posição
SELECT * FROM incidentes
WHERE ST_DWithin(posicao, ST_SetSRID(ST_MakePoint($lon, $lat), 4326)::geography, 500)
  AND ultimo_relato_em > now() - interval '6 hours';

-- Limite de 30 por hora (no worker, como autoridade)
SELECT count(*) FROM relatos
WHERE dispositivo_id = $1 AND gravado_em > now() - interval '1 hour';

-- Relatos do incidente na janela de confirmação
SELECT count(*) FROM relatos
WHERE incidente_id = $1 AND gravado_em >= now() - interval '2 hours';

-- Alertas recentes para reconexão (depois, filtrar proximidade/célula em código)
SELECT * FROM alertas
WHERE gerado_em > $desde AND gerado_em >= now() - interval '60 minutes'
ORDER BY gerado_em;
```

Para o `ST_MakeEnvelope` com `geography`, use `geometry` no filtro de retângulo (`posicao::geometry && ST_MakeEnvelope(...)`) se a comparação direta não aproveitar o índice; confira com `EXPLAIN`.

## SQLite no aparelho (`expo-sqlite`) [RELATÓRIO — RF10; PROPOSTA nas colunas]

```sql
-- Fila local de relatos (offline-first)
CREATE TABLE relatos_locais (
  relato_id   TEXT PRIMARY KEY,                -- UUID gerado ao criar o relato
  tipo        TEXT NOT NULL,
  gravidade   TEXT NOT NULL,
  descricao   TEXT,
  lat         REAL NOT NULL,
  lon         REAL NOT NULL,
  precisao_m  REAL,
  enviado_em  TEXT NOT NULL,                   -- ISO UTC, horário da criação no aparelho
  estado      TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente', 'enviado', 'falhou')),
  tentativas  INTEGER NOT NULL DEFAULT 0,
  motivo      TEXT,                            -- mensagem de erro mostrada na tela
  criado_em   TEXT NOT NULL
);

-- Valores simples do aparelho: dispositivo_id, ultimo_alerta_em, alertas_dispensados (JSON)
CREATE TABLE config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Última camada consultada, para ver sem rede (RF10)
CREATE TABLE cache_camada (
  chave    TEXT PRIMARY KEY,                   -- 'ultima'
  payload  TEXT NOT NULL,                      -- JSON da resposta de GET /camadas
  retangulo TEXT NOT NULL,                     -- JSON do retângulo a que se refere
  salvo_em TEXT NOT NULL
);
```

### Regras da fila local (UC04, tela 12)
- Ao tocar em "Enviar relato": gera `relato_id`, grava em `relatos_locais` como `pendente` **primeiro**, depois tenta enviar.
- Enviar sempre **em ordem** (`ORDER BY criado_em`), um por vez.
- Resposta `202` → `enviado`. Erro de rede/`503` → continua `pendente` (tenta de novo quando a rede voltar, detectada por `netinfo`, e a cada 30 s com o app aberto). `422`/`429` → `falhou` com `motivo` (mensagem da API).
- "Tentar de novo" muda `falhou` → `pendente` e zera `tentativas`.
- Ao salvar com sucesso um `GET /camadas`, grava em `cache_camada`. Sem rede, o mapa abre com esse cache e a faixa "Sem conexão".
- O `dispositivo_id` é criado uma única vez (UUID v4) e nunca muda.
