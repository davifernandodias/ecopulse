# Arquitetura

O EcoPulse é orientado a eventos. O aplicativo não grava o incidente direto no banco. Ele entrega um fato para a API, a API publica uma mensagem, um worker conclui o trabalho e o resultado volta para quem está olhando o mapa.

## Desenho

```text
Celular / navegador
  mapa, GPS, SQLite, WebSocket
           |  HTTP (relato, camadas, busca)
           |  WebSocket (alerta e camada pronta)
           v
        api (Node)
           |  publica
           v
       RabbitMQ
         |    \
         |     \__ fila clima.solicitado
         |
         \__ fila relatos.recebido
                 |
                 v
          worker-relatos --------> PostgreSQL/PostGIS
                 |                 Redis (leitura + pub/sub)
                 |
          worker-clima -----------> Open-Meteo
                 |
                 +-- publica resultado no Redis pub/sub
                            |
                            v
                     api reenvia no WebSocket
```

## Responsabilidade de cada processo

### api

- `GET /saude` para o Compose saber se subiu.
- `GET /camadas?bbox=&zoom=&camadas=` lê Redis. Se a chave de clima daquelas células não existe, publica `clima.solicitado` e devolve o que já tiver (incidentes e clima velho). Não segura a resposta esperando a Open-Meteo.
- `POST /relatos` valida formato, responde `202` com id temporário e publica `relato.recebido`.
- `GET /relatos/fila` não existe no servidor. A fila offline é só no celular.
- WebSocket: o cliente manda `inscrever` com o retângulo visível e, se houver GPS, a posição. A API guarda essa inscrição em memória e também num canal Redis, para o aviso sobreviver mesmo com um único processo hoje e com mais de um amanhã.
- Quando o Redis pub/sub entrega `camada.atualizada` ou `alerta.gerado`, a API empurra para os sockets cujo retângulo ou posição cruza o alvo.

A API não contém a regra de confirmação de incidente nem a chamada à Open-Meteo.

### worker-relatos

Consome `relatos.recebido`.

1. Valida de novo (tipo, gravidade, coordenada, limite por dispositivo).
2. Mensagem inválida vai para a DLQ com o motivo, sem retry. Retry não conserta payload quebrado.
3. Falha transitória (banco fora, timeout) faz retry com espera crescente, no máximo 3 vezes, e depois DLQ.
4. Calcula H3 resolução 9.
5. Grava o relato e o incidente agregado no PostGIS.
6. Atualiza a chave de incidentes da região no Redis.
7. Publica `alerta.gerado` no Redis pub/sub quando a gravidade é média ou alta.

### worker-clima

Consome `clima.solicitado`.

1. Transforma o retângulo em células H3 resolução 7, com teto de células por mensagem para não consultar o mundo num zoom aberto demais.
2. Ignora célula cujo cache ainda está válido.
3. Consulta Open-Meteo (temperatura atual e qualidade do ar) para as células faltantes.
4. Grava PostgreSQL (histórico curto da leitura) e Redis (leitura atual, com expiração).
5. Publica `camada.atualizada`.
6. Falha da API externa: retry e, esgotado, DLQ. O mapa fica com o dado anterior ou com a célula vazia.

### mobile

- Desenha o mapa e as camadas.
- Gera e persiste o UUID do dispositivo.
- Fila SQLite: `pendente`, `enviando`, `enviado`, `falhou`.
- Ao voltar a rede, envia os pendentes em ordem.
- Mantém o WebSocket e reinscreve o retângulo quando a câmera para de se mover (esperar um curto intervalo depois do gesto, para não publicar um pedido de clima por frame).

## Filas RabbitMQ

| Fila | Quem publica | Quem consome | DLQ |
| --- | --- | --- | --- |
| `ecopulse.relatos.recebido` | api | worker-relatos | `ecopulse.relatos.dlq` |
| `ecopulse.clima.solicitado` | api | worker-clima | `ecopulse.clima.dlq` |

Filas duráveis. Mensagem persistida. Ack só depois de gravar no PostgreSQL. Sem ack automático.

Retry: 3 tentativas, espera 2s, 4s e 8s. A contagem vai num header da mensagem.

## Redis

Chaves previstas, todas com expiração:

| Chave | Conteúdo | Expiração |
| --- | --- | --- |
| `clima:h3:{indice}` | temperatura, AQI, horário da leitura | 10 minutos |
| `incidentes:h3:{indice}` | lista resumida de incidentes ativos da célula | 6 horas, renovada a cada relato |
| canal `ecopulse.eventos` | pub/sub de `camada.atualizada` e `alerta.gerado` | não persiste |

O PostgreSQL continua sendo o registro. Perder o Redis só deixa a próxima leitura mais lenta e o alerta dependente do próximo ciclo. Não perde o relato.

## PostgreSQL / PostGIS

Tabelas mínimas:

- `relatos` — um envio do celular: id, dispositivo, tipo, gravidade, texto, ponto (`geography(Point, 4326)`), h3, criado em.
- `incidentes` — agregação por tipo + célula H3: status (`recebido` ou `confirmado`), gravidade mais alta, último relato, expira em.
- `leituras_clima` — célula H3, temperatura, AQI, lido em.

Índice espacial no ponto do relato e índice único em (tipo, h3) do incidente ativo.

## Mensagens (contratos)

Campos em português, JSON.

`relato.recebido`

```json
{
  "id": "uuid",
  "dispositivoId": "uuid",
  "nomeExibicao": "opcional",
  "tipo": "alagamento",
  "gravidade": "media",
  "texto": "opcional",
  "latitude": -21.17,
  "longitude": -47.81,
  "criadoEm": "2026-10-17T18:00:00.000Z"
}
```

`clima.solicitado`

```json
{
  "bbox": [-47.9, -21.3, -47.7, -21.1],
  "zoom": 12
}
```

`bbox` na ordem oeste, sul, leste, norte.

`alerta.gerado` (pub/sub, não fila)

```json
{
  "incidenteId": "uuid",
  "tipo": "alagamento",
  "gravidade": "alta",
  "latitude": -21.17,
  "longitude": -47.81,
  "h3": "89a..."
}
```

## O que esta arquitetura prova para a disciplina

| Pilar do enunciado | Onde está |
| --- | --- |
| Desacoplamento e mensageria | API só publica. Workers consomem |
| Particionamento geoespacial | H3 na célula de clima e na agregação do incidente. A consulta do mapa é por retângulo, então cada pedido trabalha um pedaço |
| Tolerância a falhas | Fila durável, retry, DLQ, ack manual |
| Tempo real | WebSocket a partir do pub/sub |
| Cache e consistência eventual | Leitura no Redis, escrita confirmada no PostgreSQL, cliente atualizado depois |

## Subida local

`infra/docker-compose.yml` sobe PostgreSQL/PostGIS, Redis, RabbitMQ (com painel de gestão), api, worker-relatos e worker-clima. O app Expo roda fora do Compose, no celular ou no navegador, apontando para o IP da máquina na rede local.

O celular físico não enxerga `localhost` da máquina. A URL da API na demo é o IP da rede Wi-Fi. Isso entra no roteiro de demo.
