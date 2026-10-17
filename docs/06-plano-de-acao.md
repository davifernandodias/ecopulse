# Plano de ação

Status possíveis: `pendente`, `em andamento`, `feito`.

Ordem é a ordem de execução. Não pular para o app antes da fila aceitar um relato, senão a tela não tem como provar o sistema distribuído.

Dono está em branco de propósito. Davi e Vinicius pegam a próxima tarefa `pendente` e preenchem o nome ao começar.

## M0 — Norte do desenvolvimento

| ID | Tarefa | Status | Dono | Pronto quando |
| --- | --- | --- | --- | --- |
| M0.1 | Especificação inicial em `docs/` | feito | Davi + sessão de IA | Arquivos 00 a 08 e o template do relatório existem e contam a mesma história |
| M0.2 | Repositório Git e leitura conjunta do escopo | pendente | Davi | Os dois clonaram, leram `01` e `02`, e anotaram dúvida real no histórico |

## M1 — Infra local

| ID | Tarefa | Status | Dono | Pronto quando |
| --- | --- | --- | --- | --- |
| M1.1 | `infra/docker-compose.yml` com PostgreSQL/PostGIS, Redis e RabbitMQ | pendente | | `docker compose up` sobe os três e o painel do RabbitMQ abre |
| M1.2 | Script SQL inicial: `relatos`, `incidentes`, `leituras_clima`, índices | pendente | | O Compose aplica o SQL sozinho na primeira subida |
| M1.3 | `.env.example` sem segredo real, só porta, usuário local e nome das filas | pendente | | O exemplo basta para subir. Senha local de desenvolvimento não vai para o relatório nem para print |

## M2 — Contratos e API vazia

| ID | Tarefa | Status | Dono | Pronto quando |
| --- | --- | --- | --- | --- |
| M2.1 | `packages/contratos` com os JSON de `04-arquitetura.md` | pendente | | API e workers importam o mesmo objeto |
| M2.2 | `apps/api` com `GET /saude`, no Compose | pendente | | `GET /saude` responde ok com os containers no ar |
| M2.3 | `POST /relatos` valida e publica na fila, responde 202 | pendente | | Uma mensagem aparece em `ecopulse.relatos.recebido` |
| M2.4 | `GET /camadas` lê Redis e, em falta de clima, publica `clima.solicitado` | pendente | | O pedido do retângulo de Ribeirão Preto gera mensagem na fila de clima |

## M3 — Worker de relatos

| ID | Tarefa | Status | Dono | Pronto quando |
| --- | --- | --- | --- | --- |
| M3.1 | Consumo com ack manual, retry 3 vezes e DLQ | pendente | | Payload inválido cai na DLQ sem retry. Falha de banco retenta |
| M3.2 | Gravação no PostGIS e agregação do incidente (H3 res. 9, confirmação com 2 relatos) | pendente | | Dois relatos próximos marcam `confirmado`. Um fica `recebido` |
| M3.3 | Atualização do Redis e publicação de `alerta.gerado` | pendente | | Gravidade média ou alta publica no canal |

## M4 — Worker de clima

| ID | Tarefa | Status | Dono | Pronto quando |
| --- | --- | --- | --- | --- |
| M4.1 | Bbox vira células H3 res. 7, com teto de células | pendente | | Zoom muito aberto não dispara pedido enorme |
| M4.2 | Consulta Open-Meteo (temperatura e US AQI) e grava Redis com TTL de 10 minutos | pendente | | A segunda consulta do mesmo retângulo não chama a API externa |
| M4.3 | Publica `camada.atualizada` | pendente | | A API recebe o evento no pub/sub |

## M5 — Tempo real na API

| ID | Tarefa | Status | Dono | Pronto quando |
| --- | --- | --- | --- | --- |
| M5.1 | WebSocket com `inscrever` (bbox e posição) | pendente | | Cliente de teste recebe `camada.atualizada` da sua região |
| M5.2 | Repasse de `alerta.gerado` para inscrição dentro de 500 m | pendente | | Um relato alto em Ribeirão acorda o socket inscrito ali |

## M6 — App, mapa e camadas

| ID | Tarefa | Status | Dono | Pronto quando |
| --- | --- | --- | --- | --- |
| M6.1 | App Expo abre no celular e no navegador | pendente | | Os dois apontam para o IP da API |
| M6.2 | Mapa MapLibre mundial, fallback Ribeirão Preto, busca Nominatim | pendente | | Dá para sair de Ribeirão e voltar pela busca |
| M6.3 | Chips e manchas de calor e ar conforme `03-ux.md` | pendente | | Toque na célula abre °C, AQI e atribuição |
| M6.4 | Pinos de alagamento e via obstruída | pendente | | Relato já gravado no banco aparece no retângulo |

## M7 — Relato, alerta e offline

| ID | Tarefa | Status | Dono | Pronto quando |
| --- | --- | --- | --- | --- |
| M7.1 | Fluxo Relatar com GPS automático | pendente | | O outro cliente mostra o pino sem refresh manual |
| M7.2 | Faixa de alerta, Ver e Dispensar por 30 minutos | pendente | | A faixa segue a regra de distância e limiar de `02-decisoes.md` |
| M7.3 | UUID do dispositivo e fila SQLite | pendente | | Modo avião guarda o relato e envia ao reconectar |
| M7.4 | Cache da última camada vista, para consulta offline | pendente | | Sem rede, a última mancha já carregada continua visível |

## M8 — Demo e relatório

| ID | Tarefa | Status | Dono | Pronto quando |
| --- | --- | --- | --- | --- |
| M8.1 | Ensaio do `08-roteiro-demo.md` no celular físico | pendente | | Os dois conseguiram contar a história sem improvisar arquitetura que não existe |
| M8.2 | Relatório ABNT a partir de `relatorio/TEMPLATE-APS.md` | pendente | Vinicius | O texto cita só as tecnologias de `02-decisoes.md` e respeita o tamanho de seções do enunciado |
| M8.3 | Relatório de código com trechos reais (fila, retry, DLQ, H3, WebSocket), no máximo 10 páginas | pendente | | Cada trecho tem uma frase dizendo qual pilar da disciplina ele prova |

## Fora deste plano

Push remoto, rota desvio, foto no relato, mais de um nó de infraestrutura. Se alguém começar isso antes de M8.1 estar `feito`, parar.
