# 01 — Escopo do MVP

## Objetivo

EcoPulse: aplicativo móvel + sistema distribuído orientado a eventos que mostra em um mapa **calor**, **qualidade do ar**, **alagamentos** e **vias obstruídas**, recebe **relatos colaborativos** e **alerta** o usuário quando ele se aproxima de um risco. O foco da disciplina (e da nota) é o sistema distribuído: mensageria assíncrona, tolerância a falhas, cache e consistência eventual, particionamento geoespacial e tempo real.

## O que entra [RELATÓRIO — Quadro 2]

| Código | Resumo | Prioridade | Detalhes em |
|---|---|---|---|
| RF01 | Mapa navegável (arrastar, aproximar, buscar endereço); abre no GPS ou em Ribeirão Preto | Alta | 07, 06 |
| RF02 | Camadas de calor e qualidade do ar em células H3 (dados Open-Meteo) | Alta | 06, 07 |
| RF03 | Camadas de alagamento e via obstruída como pontos, só por relatos | Alta | 04, 07 |
| RF04 | Ligar/desligar cada camada; tocar numa célula/ponto abre a ficha | Média | 07 |
| RF05 | Enviar relato (tipo, gravidade, texto opcional, GPS, metadados), sem login, código do aparelho | Alta | 04, 07 |
| RF06 | Validar relato (tipo, gravidade, coordenadas, 30/h) e mandar inválidos à DLQ | Alta | 02, 04 |
| RF07 | Agrupar por célula H3; confirmar com 2 relatos do mesmo tipo em 2 h; sair do mapa 6 h após o último | Alta | 02, 05 |
| RF08 | Alerta (faixa no mapa; "Ver local"; "Dispensar por 30 min") a ≤500 m de incidente ativo média/alta, ou em célula com AQI>150 ou temp>35 °C | Alta | 02, 07 |
| RF09 | Atualizações e alertas em tempo real por WebSocket | Alta | 04 |
| RF10 | Relatos sem rede ficam no aparelho e são enviados em ordem; última camada guardada | Média | 05, 07 |
| RNF01 | API responde sem esperar o processamento | Alta | 04 |
| RNF02 | Nenhum relato perdido: filas duráveis, ack após gravar, 3 retries (2/4/8 s), DLQ | Alta | 04 |
| RNF03 | PostgreSQL definitivo; Redis cache com TTL (10 min clima/ar, 6 h incidentes) | Alta | 02, 05 |
| RNF04 | Consultas só da região visível (retângulo + células H3), com limite de células | Alta | 04, 02 |
| RNF05 | Cache para limitar a Open-Meteo; célula sem dado fica sem cor; mostrar atribuição | Média | 06 |
| RNF06 | Infra com um único comando do Docker Compose; app no celular físico e no navegador | Média | 03 |
| RNF07 | API aceita relatos mesmo com workers, Redis ou Open-Meteo fora do ar | Alta | 04 |
| RNF08 | Alerta chega em até 5 s depois de o relato ser gravado | Média | 08 |
| RNF09 | Alerta gravado no PostgreSQL antes de publicado; reconexão recebe alertas recentes da região | Alta | 04, 05 |
| RNF10 | Vários workers na mesma fila dividem a carga | Média | 03, 08 |

Prioridade **Alta** = núcleo da demonstração: mapa com camadas, relato colaborativo e alerta recebido em um segundo cliente.

## Casos de uso [RELATÓRIO — Quadro 3]

- **UC01** Explorar o mapa e as camadas (telas 1, 2, 3, 4)
- **UC02** Consultar a ficha de um local (telas 5, 6, 13)
- **UC03** Enviar relato (telas 7, 8, 9)
- **UC04** Enviar relato sem conexão (tela 12)
- **UC05** Receber alerta de proximidade (telas 10, 11, 14)

## O que NÃO entra (versão futura)

- Notificação push com o aplicativo fechado (o alerta só chega com o app aberto ou em segundo plano imediato).
- Traçado de rotas alternativas / roteamento de pedestres e condutores.
- Sharding do PostgreSQL, Redis Cluster, Kafka/MQTT.
- Login, cadastro, perfis, moderação.
- Mapa de calor por interpolação (as camadas são células H3 com um valor cada).
- Histórico/estatísticas, painel administrativo, hospedagem em nuvem.

## Arquitetura em uma página [RELATÓRIO — seção 5, Figura 1]

```
Aplicativo (Expo)  <--HTTP / WebSocket-->  API (Node/Express + ws)
   SQLite local                               |  publica relato          ^ assina eventos
                                              v                          |
                                         RabbitMQ  --consome-->  Worker de relatos --grava--> PostgreSQL/PostGIS
                                      (fila + DLQ)                       |  publica eventos        ^ consultas do mapa
                                                                         v                         |
                                                                       Redis  <--- Worker de clima ---> Open-Meteo (externa)
```

Quatro processos de aplicação: **app**, **API**, **worker de relatos**, **worker de clima**. Serviços de apoio: RabbitMQ, PostgreSQL com PostGIS, Redis. Tudo menos o app roda em contêineres (Docker Compose).

## Roteiro da demonstração (usado no sprint 6 e na seção 7 do relatório) [PROPOSTA]

Dois clientes: o **celular físico (A)** e o **navegador (B)**, ambos apontando para a mesma API.

1. `docker compose up` sobe tudo; mostrar `docker compose ps` e o painel do RabbitMQ (`:15672`).
2. Abrir A e B: o mapa abre no GPS (A) ou em Ribeirão Preto (B). Ligar e desligar as quatro camadas.
3. Tocar numa célula de qualidade do ar → ficha (temperatura, AQI, horário, fonte).
4. Em A, enviar um relato de **Alagamento, gravidade alta**. O ponto aparece em B sem atualizar a tela (situação "Recebido").
5. Em B (ou A de novo), enviar um **segundo relato do mesmo tipo na mesma célula**: o incidente vira **Confirmado** e o alerta aparece para quem estiver a ≤500 m.
6. Medir o tempo do alerta (RNF08, ≤5 s) — ver `08-testes.md`.
7. Em A, ligar o modo avião, enviar um relato (fica **Pendente**), desligar o modo avião: o relato é enviado em ordem.
8. Parar o worker de relatos (`docker compose stop worker-relatos`), enviar relatos (API continua aceitando), subir de novo e mostrar que foram processados. Mostrar a DLQ com um relato inválido.
9. Mostrar a tela de alerta de qualidade do ar (AQI>150) usando o modo de teste do `06-integracoes-externas.md`.

Critério de pronto do sprint 6: roteiro executado do início ao fim **sem intervenção manual** além dos toques no app.
