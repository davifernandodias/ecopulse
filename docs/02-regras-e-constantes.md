# 02 — Regras de negócio e constantes

Todas as constantes ficam em `packages/compartilhado/constantes` e são importadas por API, workers e app. Nunca repita o número no código.

## Tabela de constantes

| Constante | Valor | Origem | Observação |
|---|---|---|---|
| `RAIO_ALERTA_M` | 500 | [RELATÓRIO] RF08 | Distância até o incidente para disparar o alerta |
| `JANELA_CONFIRMACAO_H` | 2 | [RELATÓRIO] RF07 | Dois relatos do mesmo tipo na mesma célula dentro dessa janela confirmam o incidente |
| `PERMANENCIA_INCIDENTE_H` | 6 | [RELATÓRIO] RF07, RNF03 | Incidente sai do mapa 6 h após o **último** relato; é também o TTL no Redis |
| `DISPENSAR_ALERTA_MIN` | 30 | [RELATÓRIO] RF08 | Silencia o aviso no aparelho |
| `LIMITE_RELATOS_HORA` | 30 | [RELATÓRIO] RF06 | Por aparelho, na última hora |
| `AQI_LIMITE` | 150 | [RELATÓRIO] RF08 | Alerta quando **AQI > 150** |
| `TEMP_LIMITE_C` | 35 | [RELATÓRIO] RF08 | Alerta quando **temperatura > 35 °C** |
| `CACHE_CLIMA_S` | 600 | [RELATÓRIO] RNF03 | 10 minutos |
| `META_ALERTA_S` | 5 | [RELATÓRIO] RNF08 | Do relato gravado até o alerta no cliente |
| `RETRY_ESPERAS_S` | `[2, 4, 8]` | [RELATÓRIO] RNF02 | Três novas tentativas, depois DLQ |
| `H3_RES_CLIMA` | 7 | [PROPOSTA] | Célula ≈ 5 km². Cada célula = 1 consulta e 1 chave de cache |
| `H3_RES_INCIDENTE` | 8 | [PROPOSTA] | Célula ≈ 0,7 km² (aresta ≈ 460 m). Agrupa relatos próximos. Pai da célula res 8 em res 7 = célula de clima |
| `LIMITE_CELULAS_PEDIDO` | 150 | [PROPOSTA] RNF04 | Máximo de células H3 res 7 por `GET /camadas`; acima disso, erro `area_grande` |
| `GRAVIDADES_ALERTA` | `['media','alta']` | [RELATÓRIO] RF08 | Só essas geram alerta de incidente |
| `TIPOS_RELATO` | `['alagamento','via_obstruida']` | [RELATÓRIO] RF05 | Somente dois tipos |
| `GRAVIDADES` | `['baixa','media','alta']` | [RELATÓRIO] RF05 | |
| `JANELA_ALERTAS_RECENTES_MIN` | 60 | [PROPOSTA] RNF09 | Na reconexão, alertas gerados nessa janela e depois do `ultimo_alerta_em` do cliente |
| `INTERVALO_MIN_ALERTA_CLIMA_MIN` | 60 | [PROPOSTA] | Não repetir alerta de AQI/temperatura da mesma célula antes disso |
| `CLIMA_DEMANDA_JANELA_MIN` | 15 | [PROPOSTA] | O worker de clima só atualiza células vistas por algum cliente nesse período |
| `CLIMA_CICLO_S` | 60 | [PROPOSTA] | De quanto em quanto tempo o worker de clima verifica o que precisa atualizar |
| `CLIMA_LOTE_MAX` | 50 | [PROPOSTA] | Coordenadas por chamada à Open-Meteo |
| `REGIAO_PADRAO` | Ribeirão Preto: lat -21.1775, lon -47.8103, zoom 12 | [RELATÓRIO] RF01 | Quando não há GPS |

## Regras

### R1 — Recebimento de relato (API)
1. Valida a **estrutura** (JSON, campos obrigatórios, tipos básicos, `relato_id` UUID).
2. Valida o essencial barato: `tipo`, `gravidade` e faixa das coordenadas.
3. Confere o limite de 30 relatos por hora **no Redis** (janela deslizante, ver `04-contratos.md`). **Se o Redis estiver fora, não bloqueia** (RNF07): o worker confere de novo pelo banco.
4. Se inválido ou acima do limite: responde `422`/`429` **e publica a mensagem na DLQ** com o motivo (o relato "vai para a fila de mensagens mortas", CT02).
5. Se válido: publica na fila `relatos.novos` (mensagem persistente, com confirmação do broker) e responde `202` **sem esperar o worker** (RNF01).
6. Se o RabbitMQ estiver indisponível: responde `503` e o app mantém o relato na fila local.

> [PROPOSTA] O relatório diz que a API faz "validação mínima" e o worker "valida"; a tela 8 mostra a recusa na hora. Por isso a API faz os testes baratos e rejeita na hora, e o **worker repete todas as validações** (ele é a autoridade), inclusive o limite pelo banco.

### R2 — Processamento do relato (worker de relatos)
Em **uma transação** do PostgreSQL:

1. `pg_advisory_xact_lock(hashtext(tipo || h3))` — evita que dois workers criem o mesmo incidente ao mesmo tempo.
2. Revalida tipo, gravidade, coordenadas e limite (conta os `relatos` do `dispositivo_id` na última hora, **antes** de inserir este; se já houver 30, recusa). Inválido ou acima do limite → DLQ direto, sem retry. Um reenvio do mesmo `relato_id` que já foi gravado **não** é recusado: segue para o passo 3 e termina em ack.
3. `INSERT` em `relatos` com `ON CONFLICT (id) DO NOTHING`. Se já existia, é reentrega: **só dá ack** (idempotência).
4. Calcula `h3 = latLngToCell(lat, lon, H3_RES_INCIDENTE)`.
5. Procura incidente do mesmo `tipo` e `h3` com `ultimo_relato_em > agora − 6 h`. Se não há, cria (`n_relatos = 1`, situação `recebido`). Se há, atualiza: `n_relatos + 1`, `gravidade` = **a maior** entre os relatos, `posicao` = a do relato mais recente, `ultimo_relato_em = agora`.
6. Conta os relatos do incidente com `gravado_em ≥ agora − 2 h`. Se ≥ 2 e a situação é `recebido`, marca `confirmado` e `confirmado_em = agora`.
7. Se o incidente está `confirmado` **e** a gravidade é `media` ou `alta`, tenta `INSERT` em `alertas` (origem `incidente`). Há índice único por incidente: **um alerta por incidente**.
8. `COMMIT`.
9. **Depois do commit**: grava `incidente:{id}` no Redis (TTL 6 h) e publica `ev:incidente` e, se criou alerta, `ev:alerta`. Falha ao publicar no Redis **não** impede o ack (o PostgreSQL é o registro definitivo, e a reconexão recupera alertas).
10. `ack` da mensagem.

Falha passageira (banco fora, timeout): não dá ack; segue o fluxo de retry de `04-contratos.md` (2 s, 4 s, 8 s, depois DLQ).

### R3 — Alerta de incidente: quem recebe
A API mantém as conexões WebSocket em memória com o retângulo visível e a última posição de cada cliente. Ao receber `ev:alerta` de origem `incidente`, envia **apenas** aos clientes com `posicao` conhecida a ≤ `RAIO_ALERTA_M` (haversine) do alerta. Não envia por retângulo: alerta é por proximidade.

### R4 — Alertas climáticos (worker de clima)
- Depois de gravar uma leitura nova de uma célula: se `aqi > AQI_LIMITE` → alerta `aqi`; se `temperatura_c > TEMP_LIMITE_C` → alerta `temperatura`.
- Dedupe: chave Redis `clima:alerta:{h3}:{origem}` com TTL de `INTERVALO_MIN_ALERTA_CLIMA_MIN` (se a chave existe, não gera outro). Sem Redis, consulta o último alerta no PostgreSQL.
- O alerta é gravado no PostgreSQL **antes** de publicado (RNF09), com `posicao` = centro da célula.
- Quem recebe: clientes cuja `posicao` cai **dentro da mesma célula** (`latLngToCell(pos, H3_RES_CLIMA) == alerta.h3`).
- Vem da Open-Meteo, **não depende de relato**.

### R5 — Reconexão (RNF09)
Ao conectar ou reconectar, o cliente informa `ultimo_alerta_em` (horário do último alerta que recebeu; `null` se nunca recebeu) e a posição. A API consulta no PostgreSQL os alertas com `gerado_em > ultimo_alerta_em` e `gerado_em ≥ agora − JANELA_ALERTAS_RECENTES_MIN`, aplica o **mesmo filtro de proximidade** (R3/R4) e envia em uma mensagem `alertas_recentes`.

### R6 — Camadas e cache (RNF03, RNF04, RNF05)
- `GET /camadas` calcula as células H3 res 7 do retângulo; se passar de `LIMITE_CELULAS_PEDIDO`, responde `422 area_grande` (o app limita o zoom mínimo para não chegar nisso).
- Clima/ar: lê `clima:{h3}` no Redis (TTL 600 s). Células sem chave entram na lista de demanda (`ZADD clima:demanda`) e a resposta traz `atualizando: true`.
- Incidentes: lê do Redis (`incidentes:{h3_res8}`); se o Redis falhar ou vier vazio para o retângulo todo, consulta o PostgreSQL (`posicao && envelope` + `ultimo_relato_em > agora − 6 h`).
- Célula sem dado da Open-Meteo: **sem valor, sem cor** (nunca inventar).

### R7 — Dispensar alerta (app)
"Dispensar por 30 min" é **só do aparelho**: guarda localmente a chave do alerta (`incidente_id` ou `h3 + origem`) com horário de expiração. Enquanto estiver silenciado, a faixa não reaparece para aquela chave. Não precisa ir ao servidor.

### R8 — Incidente "Recebido" x "Confirmado"
- `recebido`: 1 relato (ou 2 relatos fora da janela de 2 h). Aparece no mapa (tela 13).
- `confirmado`: 2 relatos do mesmo tipo na mesma célula H3 res 8 dentro de 2 h (tela 6).
- Some do mapa 6 h após o último relato (não precisa de job: a consulta filtra por `ultimo_relato_em` e o Redis expira sozinho).

### R9 — Relato sem login
O aparelho gera um `dispositivo_id` (UUID v4) no primeiro uso e guarda no SQLite. Ele identifica o autor e serve ao limite de 30/h. Cada relato também tem um `relato_id` (UUID v4) gerado **no aparelho** na hora de criar — é a chave de idempotência e funciona mesmo quando o envio é feito depois (offline).
