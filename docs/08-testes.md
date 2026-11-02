# 08 — Testes e critérios de aceite

Os testes verificam cada requisito do Quadro 2 e são **automatizados**, rodando contra o ambiente completo iniciado com `docker compose up` [RELATÓRIO — seção 4.5]. Os resultados alimentam a **seção 7.3** do relatório. Três níveis: **unidade** (regras isoladas), **integração** (API + fila + banco + cache) e **ponta a ponta** (dois clientes na mesma API).

## Como organizar [PROPOSTA]

- `vitest` em `testes/integracao/`, com o Compose subindo antes (`docker compose --profile testes up -d --build` e `--wait`).
- Clientes de teste: duas conexões WebSocket (`ws`) simulando o **cliente 1** e o **cliente 2**, e chamadas HTTP com `fetch`.
- Ferramentas do ambiente: `mock-open-meteo` (contagem de chamadas, falha forçada, valores forçados — ver `06`), `docker compose stop/start/up --scale` chamados pelo próprio teste (via `child_process`), e consultas diretas ao PostgreSQL/RabbitMQ (API HTTP de gerenciamento em `:15672`) para conferir fila e DLQ.
- Cada teste usa `dispositivo_id` e coordenadas próprias (ex.: uma célula H3 diferente por teste) para não interferir nos outros.
- Cada caso escreve uma linha em `testes/resultados/resultados.json` e `resultados.md`: **caso, requisito, resultado esperado, resultado observado, aprovado/reprovado, tempo, data**. O relatório copia essa tabela.

## Testes de unidade (rápidos, sem Docker)

| Alvo | O que verificar |
|---|---|
| Distância (haversine) | 400 m dentro do raio, 600 m fora, 500 m exato **dentro** (a regra é "até 500 metros", ou seja, `≤ 500`) |
| Validação do relato | tipo fora de `TIPOS_RELATO`, gravidade inválida, `lat` fora de [-90, 90], `lon` fora de [-180, 180], `descricao` > 280, UUID inválido |
| Regra de confirmação | 1 relato → `recebido`; 2 do mesmo tipo na mesma célula em < 2 h → `confirmado`; 2 relatos com mais de 2 h de diferença → continua `recebido`; tipos diferentes na mesma célula → incidentes separados |
| Gravidade do incidente | fica com a maior gravidade entre os relatos |
| Faixas de cor | limites de AQI e temperatura (51, 101, 151; 25, 30, 35) |
| Retry | tentativa 0→espera 2 s, 1→4 s, 2→8 s, 3→DLQ |

## Casos do Quadro 5 como testes automatizados

| Caso | Requisitos | Como automatizar | Critério |
|---|---|---|---|
| **CT01** | RF05, RF09, RNF01 | Cliente 2 conecta (`inscrever` com retângulo que contém o ponto). Cliente 1 faz `POST /relatos` válido. Mede o tempo da resposta e aguarda a mensagem `incidente` no cliente 2. | `202` volta **sem esperar o worker** (ex.: < 200 ms, e a resposta chega com o worker pausado); cliente 2 recebe o ponto sem nenhuma chamada HTTP |
| **CT02** | RF06, RNF02 | Enviar relatos com tipo, gravidade e coordenadas inválidos (um por teste) e o 31º relato do mesmo aparelho na hora. | `422` ou `429`; cada mensagem aparece em `relatos.mortas` com `x-motivo`; nada é gravado em `relatos` |
| **CT03** | RF07 | Dois `POST` do mesmo tipo, mesma célula H3 res 8, em seguida (e outro par com tipos diferentes). | `GET /camadas` mostra `situacao: "confirmado"` no primeiro par; tipos diferentes → dois incidentes `recebido` |
| **CT04** | RF08 | (a) Cliente 2 com `posicao` a 400 m do ponto; gerar incidente confirmado de gravidade média/alta → recebe `alerta`. (b) Cliente a 700 m → **não** recebe. (c) Com o mock, forçar AQI 180 e 38 °C na célula do cliente → recebe alertas `aqi` e `temperatura`. (d) "Dispensar" é do app: testar a função de silenciar (30 min) em unidade/UI. | (a) recebe, (b) não recebe, (c) recebe cada um, (d) a chave fica silenciada por 30 min |
| **CT05** | RNF03, RNF05 | Pedir `GET /camadas` da mesma região duas vezes seguidas; depois uma célula que o mock devolve sem dado. Ler `GET /_contagem` do mock. | 2ª consulta não aumenta a contagem de chamadas; célula sem dado volta com `null`, sem cor |
| **CT06** | RF10 | No app (ou no módulo da fila local, em teste): sem rede, criar 3 relatos; religar. | Os 3 ficam `pendente` e depois `enviado`, **na ordem de criação**; reenvio não duplica (mesmo `relato_id`) |
| **CT07** | RNF07 | `docker compose stop worker-relatos redis` e parar o mock/derrubar o acesso à Open-Meteo; enviar relatos; `start` de volta. | `POST /relatos` continua `202`; mensagens ficam em `relatos.novos`; depois que os serviços voltam, os relatos aparecem no PostgreSQL |
| **CT08** | RNF09 | Cliente 2 desconecta; gerar alerta; cliente 2 reconecta com seu `ultimo_alerta_em` anterior. | Recebe `alertas_recentes` com o alerta perdido (vindo do **PostgreSQL**); o alerta existe em `alertas` desde antes da publicação |
| **CT09** | RNF10 | `docker compose up -d --scale worker-relatos=3`; enviar 20 relatos; parar um worker no meio (`docker stop`). | Os 20 relatos acabam gravados exatamente uma vez cada (sem duplicata); logs mostram mais de um worker processando; mensagens não confirmadas do worker parado são reentregues |
| **CT10** | RNF08 | Cliente 2 posicionado a 400 m; enviar relato que confirma incidente. Tempo = (horário em que o cliente 2 recebeu o `alerta`) − (`relatos.gravado_em` do relato que confirmou). Repetir 10 vezes e registrar média, máximo e % dentro da meta. | Máximo ≤ **5 s** (`META_ALERTA_S`) |

As telas de mapa, camadas e busca (RF01–RF04) dependem da interface: ficam num **roteiro visual** no aparelho [RELATÓRIO], com prints.

### Roteiro visual (RF01–RF04) — marcar e tirar print
1. Abre no GPS; sem GPS abre em Ribeirão Preto com o aviso (tela 2).
2. As 4 camadas aparecem e se ligam/desligam separadamente.
3. Arrastar, aproximar e buscar um endereço move o mapa e recarrega as camadas.
4. Toque numa célula abre a ficha (tela 5); toque num ponto abre a ficha do incidente (telas 6 e 13).
5. "Atualizando camada" (tela 4) e célula sem dado (tela 3) aparecem nas situações certas.
6. Sem rede: faixa "Sem conexão", cache da última camada e lista "Meus relatos" (tela 12).

## Critério de pronto de cada tarefa
Código **+** teste passando **+** evidência salva (log/print/linha em `resultados`) **+** marcação `[x]` em `11-progresso.md` no mesmo commit. A revisão por outro integrante acontece no pull request da etapa.
