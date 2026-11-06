-- EcoPulse — esquema inicial. Aplicado pelo container do PostgreSQL na primeira subida
-- (pasta montada em /docker-entrypoint-initdb.d). Para reaplicar: docker compose down -v.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Um envio do celular.
CREATE TABLE relatos (
  id             uuid PRIMARY KEY,
  dispositivo_id uuid        NOT NULL,
  nome_exibicao  text,
  tipo           text        NOT NULL CHECK (tipo IN ('alagamento', 'via_obstruida')),
  gravidade      text        NOT NULL CHECK (gravidade IN ('baixa', 'media', 'alta')),
  texto          text        CHECK (char_length(texto) <= 280),
  ponto          geography(Point, 4326) NOT NULL,
  h3             text        NOT NULL,          -- resolução 9
  incidente_id   uuid,
  criado_em      timestamptz NOT NULL,          -- hora no celular (pode ser offline)
  recebido_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX relatos_ponto_gix   ON relatos USING gist (ponto);
CREATE INDEX relatos_tipo_h3_idx ON relatos (tipo, h3, recebido_em DESC);
CREATE INDEX relatos_disp_idx    ON relatos (dispositivo_id, recebido_em DESC);

-- Agregação por tipo + célula H3 res. 9.
CREATE TABLE incidentes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo           text        NOT NULL CHECK (tipo IN ('alagamento', 'via_obstruida')),
  h3             text        NOT NULL,          -- resolução 9
  h3_r7          text        NOT NULL,          -- célula pai res. 7 (chave do Redis e da leitura do mapa)
  status         text        NOT NULL CHECK (status IN ('recebido', 'confirmado')),
  gravidade      text        NOT NULL CHECK (gravidade IN ('baixa', 'media', 'alta')),
  ponto          geography(Point, 4326) NOT NULL, -- GPS do primeiro relato, para o pino
  texto          text,                            -- texto do relato mais recente que tinha texto
  total_relatos  integer     NOT NULL DEFAULT 1,
  primeiro_relato timestamptz NOT NULL,
  ultimo_relato  timestamptz NOT NULL,
  expira_em      timestamptz NOT NULL,
  ativo          boolean     NOT NULL DEFAULT true
);

-- Só um incidente ativo por (tipo, célula).
CREATE UNIQUE INDEX incidentes_ativo_uq ON incidentes (tipo, h3) WHERE ativo;
CREATE INDEX incidentes_ponto_gix ON incidentes USING gist (ponto);
CREATE INDEX incidentes_r7_idx    ON incidentes (h3_r7) WHERE ativo;

ALTER TABLE relatos
  ADD CONSTRAINT relatos_incidente_fk FOREIGN KEY (incidente_id) REFERENCES incidentes (id);

-- Histórico curto das leituras da Open-Meteo, por célula H3 res. 7.
CREATE TABLE leituras_clima (
  id          bigserial PRIMARY KEY,
  h3          text        NOT NULL,
  temperatura real,
  aqi         integer,
  lido_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leituras_clima_h3_idx ON leituras_clima (h3, lido_em DESC);
