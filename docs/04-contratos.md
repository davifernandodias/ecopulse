# 04 — Contratos entre as partes

Tudo aqui é **[PROPOSTA]** de formato; os comportamentos vêm do relatório. Datas em ISO 8601 UTC (`2026-11-02T18:30:00Z`). Coordenadas em graus decimais (`lat`, `lon`). Textos de erro em português, prontos para a tela.

## 1. API REST (Express)

Base: `http://<host>:3000`. Sem autenticação (sem login).

### `GET /saude`
Verificação de saúde (sprint 2). `200` `{ "status": "ok", "servicos": { "postgres": "ok", "redis": "ok", "rabbitmq": "ok" } }`. Se algum falhar, `200` com o serviço como `"falha"` (a API continua de pé: RNF07).

### `POST /relatos`
Corpo:
```json
{
  "relato_id": "uuid-v4-gerado-no-aparelho",
  "dispositivo_id": "uuid-v4-do-aparelho",
  "tipo": "alagamento",            // alagamento | via_obstruida
  "gravidade": "media",            // baixa | media | alta
  "descricao": "água acima da calçada",   // opcional, até 280 caracteres
  "lat": -21.1775,
  "lon": -47.8103,
  "precisao_m": 12.5,
  "enviado_em": "2026-11-02T18:30:00Z"
}
```
Respostas:
| Código | Corpo | Quando |
|---|---|---|
| `202` | `{ "relato_id": "...", "situacao": "recebido" }` | Publicado na fila. **Não espera o worker** (RNF01). Reenvio do mesmo `relato_id` também devolve `202` |
| `422` | `{ "erro": "invalido", "campo": "gravidade", "mensagem": "Escolha a gravidade do relato." }` | Estrutura/tipo/gravidade/coordenadas inválidos. Mensagem vai para a DLQ com motivo |
| `429` | `{ "erro": "limite", "mensagem": "Você atingiu o limite de 30 relatos por hora. Tente novamente mais tarde." }` | Mais de 30 por aparelho na última hora. Vai para a DLQ com motivo |
| `503` | `{ "erro": "indisponivel", "mensagem": "Servidor indisponível. O relato foi guardado no aparelho." }` | Não conseguiu publicar no RabbitMQ. O app mantém o relato como `pendente` |

Limite de 30/h no Redis: `ZSET` `limite:{dispositivo_id}`; a cada relato válido: `ZREMRANGEBYSCORE` (remove mais antigos que 1 h), `ZCARD` (se ≥ 30 → 429), `ZADD` (score = agora, membro = `relato_id`), `EXPIRE 3600`. Se o `relato_id` já está no `ZSET` (reenvio do app), ele **não conta de novo** e o pedido segue normalmente. Redis fora do ar → **pula a checagem** (fail-open); o worker confere pelo banco.

### `GET /camadas?oeste=&sul=&leste=&norte=&camadas=clima,incidentes`
Devolve só o que está no retângulo (RNF04). `camadas` é opcional (padrão: todas).
```json
{
  "gerado_em": "2026-11-02T18:30:05Z",
  "atualizando": false,
  "clima": [
    { "h3": "87a8a1d9bffffff", "temperatura_c": 31.2, "aqi": 162, "lido_em": "2026-11-02T18:20:00Z" },
    { "h3": "87a8a1d98ffffff", "temperatura_c": null, "aqi": null, "lido_em": null }
  ],
  "incidentes": [
    { "id": "uuid", "tipo": "alagamento", "gravidade": "alta", "situacao": "confirmado",
      "lat": -21.18, "lon": -47.81, "n_relatos": 2, "ultimo_relato_em": "2026-11-02T18:18:00Z" }
  ]
}
```
- `clima[]` traz **todas** as células H3 res 7 do retângulo; sem dado → valores `null` (o app desenha contorno tracejado, sem cor).
- `atualizando: true` se alguma célula estava sem cache e foi para a demanda do worker de clima (tela 4 "Atualizando camada"). Quando o dado chega, o app recebe `camada` pelo WebSocket.
- `422 { "erro": "area_grande", "mensagem": "Aproxime o mapa para ver as camadas." }` se passar de `LIMITE_CELULAS_PEDIDO`.
- Cada chamada também faz `ZADD clima:demanda <agora> <h3>` para as células pedidas.

### `GET /alertas/recentes?lat=&lon=&desde=`
Mesma função usada na reconexão (R5), exposta em REST para teste (CT08). `desde` = ISO ou omitido. Devolve `{ "alertas": [ Alerta, ... ] }` já filtrado por proximidade e pela janela.

**Objeto `Alerta`:**
```json
{ "id": "uuid", "origem": "incidente",        // incidente | aqi | temperatura
  "incidente_id": "uuid-ou-null",
  "gravidade": "alta",                        // null para aqi/temperatura
  "mensagem": "Incidente de gravidade alta a cerca de 400 m de você.",
  "lat": -21.18, "lon": -47.81, "valor": null, // valor = AQI ou °C nos climáticos
  "distancia_m": 400,                         // só nos de incidente
  "gerado_em": "2026-11-02T18:30:01Z" }
```
Mensagens (iguais às telas): incidente → "Incidente de gravidade {gravidade} a cerca de {n} m de você." (`n` arredondado para o múltiplo de 50 m mais próximo, mínimo 50) (título "Alerta de {alagamento|via obstruída}"); AQI → "O ar na sua região está ruim (AQI acima de 150)."; calor → "A temperatura na sua região está acima de 35 °C.".

## 2. WebSocket (`ws`) — `ws://<host>:3000/ws`

Mensagens JSON em texto, campo `tipo` obrigatório.

**Cliente → servidor**
```json
{ "tipo": "inscrever",
  "dispositivo_id": "uuid",
  "retangulo": { "oeste": -47.9, "sul": -21.25, "leste": -47.7, "norte": -21.1 },
  "posicao": { "lat": -21.1775, "lon": -47.8103 },     // null se não houver GPS
  "ultimo_alerta_em": "2026-11-02T18:00:00Z" }         // null se nunca recebeu
```
- Enviar **ao conectar e a cada reconexão** (dispara R5) e **sempre que o retângulo mudar** (com *debounce* de ~500 ms; nesse caso `ultimo_alerta_em` pode ir `null` e o servidor não reenvia alertas).
```json
{ "tipo": "posicao", "lat": -21.1775, "lon": -47.8103 }  // ao andar ~50 m ou a cada 15 s
{ "tipo": "ping" }                                        // a cada 25 s
```

**Servidor → cliente**
```json
{ "tipo": "camada", "clima": [ { "h3": "...", "temperatura_c": 31.2, "aqi": 162, "lido_em": "..." } ] }
{ "tipo": "incidente", "incidente": { "id": "...", "tipo": "alagamento", "gravidade": "media",
    "situacao": "recebido", "lat": -21.18, "lon": -47.81, "n_relatos": 1, "ultimo_relato_em": "..." } }
{ "tipo": "alerta", "alerta": { ...objeto Alerta... } }
{ "tipo": "alertas_recentes", "alertas": [ ...objeto Alerta... ] }
{ "tipo": "pong" }
```
- `camada` e `incidente` só vão para clientes cujo **retângulo** contém a célula/ponto (RNF04, RF09).
- `alerta` só vai para quem está **a ≤ 500 m** (incidente) ou **na mesma célula** (AQI/temperatura) — ver R3 e R4.
- O app descarta alertas com `id` já recebido e atualiza `ultimo_alerta_em` com o maior `gerado_em` visto.
- Reconexão automática no app com espera crescente (1 s, 2 s, 4 s… até 30 s).
- O servidor derruba conexões sem `ping` por 60 s.

## 3. RabbitMQ — topologia [PROPOSTA nos nomes; comportamento RELATÓRIO]

| Item | Nome | Configuração |
|---|---|---|
| Exchange principal | `relatos` | `direct`, durável |
| Fila principal | `relatos.novos` | **durável**, ligada a `relatos` com chave `novo`; `x-dead-letter-exchange = relatos.dlx` e `x-dead-letter-routing-key = morto` (sem isso, uma mensagem rejeitada sem reenfileirar se perderia, porque a chave original `novo` não tem ligação na DLX) |
| Exchange da DLQ | `relatos.dlx` | `direct`, durável |
| **DLQ** | `relatos.mortas` | durável, ligada a `relatos.dlx` com chave `morto` |
| Filas de espera | `relatos.espera.2s`, `relatos.espera.4s`, `relatos.espera.8s` | duráveis, `x-message-ttl` = 2000/4000/8000 e `x-dead-letter-exchange = relatos` com `x-dead-letter-routing-key = novo` (o TTL expira e a mensagem **volta** à fila principal) |

- API publica com **confirmação do broker** (*publisher confirms*), `persistent: true`, `contentType: application/json`, `messageId = relato_id`.
- Worker consome com **ack manual** e `prefetch` pequeno (`PREFETCH_RELATOS`, padrão 5).
- Falha **passageira** (ex.: banco fora do ar): o worker lê o cabeçalho `x-tentativa` (0 se ausente). Se `< 3`: publica a mesma mensagem em `relatos.espera.{2,4,8}s` (na exchange padrão, com chave = nome da fila) conforme a tentativa (0→2 s, 1→4 s, 2→8 s) com `x-tentativa + 1` e **depois** dá ack na original. Se `≥ 3`: publica em `relatos.mortas` com `x-motivo = "tentativas_esgotadas"` e `x-erro` com o texto do erro, e dá ack.
- Mensagem **inválida**: vai direto à DLQ (sem retry) com `x-motivo = "invalido"` e o campo com problema; ack.
- Como o RabbitMQ pode entregar mais de uma vez, o worker é **idempotente** (`relatos.id` único; ver R2).

## 4. Redis — chaves e canais [PROPOSTA nos nomes]

| Tipo | Nome | Conteúdo | TTL |
|---|---|---|---|
| String (JSON) | `clima:{h3_res7}` | `{ temperatura_c, aqi, lido_em }` | **600 s** |
| String (JSON) | `incidente:{id}` | objeto incidente | **6 h**, renovado a cada novo relato |
| Hash | `incidentes:{h3_res8}` | campo = id do incidente, valor = JSON | 6 h, renovado a cada novo relato |
| ZSET | `limite:{dispositivo_id}` | membros = relatos da última hora | 1 h |
| ZSET | `clima:demanda` | membro = h3 res 7 visto por algum cliente, score = horário (s) | limpo pelo worker (> 15 min) |
| String | `clima:alerta:{h3}:{origem}` | marcador de dedupe | 60 min |
| Pub/sub | `ev:incidente` | `{ incidente }` | — |
| Pub/sub | `ev:camada` | `{ clima: [...] }` | — |
| Pub/sub | `ev:alerta` | `{ alerta }` | — |

Pub/sub do Redis é **no máximo uma vez** (se ninguém escuta, perde). Por isso o PostgreSQL guarda os alertas e a reconexão os recupera (RNF09).
