# 11 — Progresso do desenvolvimento (lista de tarefas em ordem)

> **Este é o arquivo de controle.** Quem entrar no repositório (pessoa ou Claude Code) vê aqui o que já foi feito e **começa pela primeira tarefa `[ ]`**. Quem terminar uma tarefa a **marca aqui, no mesmo commit do código**.

## Próximo passo

**Primeira tarefa livre: `1.1` (etapa 1 — Infraestrutura).**
_(Atualize esta linha a cada tarefa concluída.)_

## Regras de Git (valem para pessoas e para o Claude Code)

- **Uma branch por etapa**, criada a partir da `develop`: `etapa-1-infraestrutura`, `etapa-2-api-e-fila`, `etapa-3-workers`, `etapa-4-tempo-real-e-app`, `etapa-5-relato-alerta-offline`, `etapa-6-fechamento`.
- **Um commit por tarefa (checkbox).** O commit traz o código da tarefa **e** a marcação `[x]` neste arquivo. Mensagem: `<número> <resumo>`, por exemplo `1.3 Esquema SQL do banco`.
- **Dê `git push` a cada commit**, para quem chegar depois ver o progresso.
- **Ao concluir todas as tarefas da etapa:** pull request da branch da etapa para a `develop`, com revisão de outro integrante e merge. A branch da etapa seguinte nasce da `develop` já atualizada.
- A `develop` vai para a `main` só quando o conjunto estiver completo e funcionando (fim da etapa 6).
- **Mais de uma pessoa na mesma etapa:** cada uma pega tarefas diferentes, combinam no Discord quem faz qual e usam `git pull --rebase` antes de cada push.

## Quando algo travar (regra de ouro A, de `00-leia-me.md`)

**Não suponha. Pare e pergunte.** Dúvida técnica, algo que os documentos não cobrem, contradição, erro sem solução segura: não siga naquele ponto. Diga ao grupo **o que está travando, o que já verificou e as opções (com recomendação)**, registre em "Problemas conhecidos e bloqueios" (no fim deste arquivo) e **não marque a tarefa**. Só continue depois da resposta, e registre a decisão em "Desvios e decisões" e no `.md` afetado.

**Comentários no código:** curtos, objetivos e fáceis de entender (uma linha na maioria dos casos; só o que não é óbvio). Ver regra de ouro B.

## Ao começar uma sessão

1. Leia `docs/00-leia-me.md` (regras) e **este arquivo**.
2. `git fetch --all`. **O estado vale na branch da etapa em andamento**, não na `develop` (enquanto o PR não foi aceito, as marcações só existem lá). Veja qual é a branch `etapa-*` mais avançada:
   - se a etapa ainda tem tarefas `[ ]`: `git checkout etapa-N-…` e `git pull`;
   - se a etapa terminou e o PR foi aceito: atualize a `develop` e crie a branch da etapa seguinte;
   - se a etapa terminou mas o PR ainda não foi aceito: peça a revisão do PR antes de seguir (ou continue na etapa seguinte criada a partir da branch da anterior, avisando o grupo).
3. Pegue a **primeira tarefa `[ ]` da lista**, na ordem. Cada tarefa depende das anteriores (as exceções estão indicadas).
4. Antes de escrever código, diga o que vai fazer, os arquivos que vai criar e como vai testar.

## Ao terminar uma tarefa

1. Rode os testes da tarefa e confira o **"Pronto quando"**. Só marque se **todos** os itens forem verdadeiros. Se faltar algo, **não marque**: deixe `[ ]` e escreva o que falta no "Diário".
2. Neste arquivo: troque `[ ]` por `[x]` e preencha ` — AAAA-MM-DD, commit <hash curto>` ao final da linha da tarefa. Evidências (print, log, resultado de teste) vão em `docs/evidencias/` ou `testes/resultados/`, com o caminho citado.
3. Atualize **"Próximo passo"** e acrescente uma linha no **"Diário"**.
4. Se algo saiu diferente dos documentos (nome, campo, regra), registre em **"Desvios e decisões"** e ajuste o `.md` afetado **no mesmo commit**.
5. Faça o commit (`<número> <resumo>`) e o push.

> Se uma tarefa for grande demais, divida em `N.Ma` e `N.Mb` neste arquivo antes de começar.

---

## Etapa 1 — Infraestrutura · branch `etapa-1-infraestrutura`

**Critério da etapa:** todos os serviços sobem com um único comando e o painel do RabbitMQ abre. (O teste do mapa do app entra aqui de propósito: é o maior risco técnico e é melhor descobrir cedo.)

- [ ] **1.1** Repositório base: `package.json` com workspaces, `tsconfig` base, `.gitignore`, `.env.example`, `CLAUDE.md` e `README.md` na raiz, pastas vazias da estrutura de `03-stack-e-estrutura.md`.
  - _Pronto quando:_ `npm install` roda sem erro na raiz; as pastas existem; `.env.example` está completo.
- [ ] **1.2** `docker-compose.yml` com `postgres` (PostGIS), `redis` e `rabbitmq`, com healthchecks e volumes.
  - _Pronto quando:_ `docker compose up -d` deixa os três `healthy`; o painel do RabbitMQ abre em `localhost:15672`.
- [ ] **1.3** `infra/postgres/init/001_schema.sql` (ver `05-banco-de-dados.md`).
  - _Pronto quando:_ na primeira subida as 4 tabelas e os índices GiST existem (`\dt`, `\di`); apagar o volume e subir de novo recria o esquema sem erro.
- [ ] **1.4** `packages/compartilhado`: constantes (`02`), tipos e mensagens (`04`), nomes de exchanges/filas/canais/chaves, utilitários H3 (`latLngToCell`, `cellToBoundary`, células de um retângulo) e haversine, **com testes de unidade**.
  - _Pronto quando:_ `npm test` no pacote passa (distância 400/500/600 m, faixas de cor, células de um retângulo, esperas 2/4/8 s e depois DLQ).
- [ ] **1.5** `Dockerfile` e serviços `api`, `worker-relatos` e `worker-clima` no Compose (podem subir só com um `index.ts` que registra "ok").
  - _Pronto quando:_ **`docker compose up --build` sobe tudo com um comando**; `docker compose up -d --scale worker-relatos=3` funciona.
- [ ] **1.6** `services/mock-open-meteo` (perfil `testes`): formatos da Open-Meteo, `GET /_contagem`, `POST /_falhar`, `POST /_valores` (ver `06-integracoes-externas.md`).
  - _Pronto quando:_ responde temperatura e AQI para uma lista de coordenadas e conta as chamadas.
- [ ] **1.7** `npm run seed`: incidentes e leituras de demonstração em Ribeirão Preto (ver `03`).
  - _Pronto quando:_ rodar o seed duas vezes não duplica dados e as linhas aparecem no banco.
- [ ] **1.8** Infra de testes: `vitest`, clientes `ws` de teste, controle do Docker (`stop`/`start`/`--scale`) e gravação de `testes/resultados/resultados.json` e `resultados.md` (ver `08-testes.md`).
  - _Pronto quando:_ um teste de exemplo roda contra o Compose e grava sua linha de resultado.
- [ ] **1.9** **Teste do mapa no Expo** (decisão D01): app em TypeScript mostrando o mapa no **celular físico e no navegador**, com 3 hexágonos H3, 2 pontos, evento de toque e leitura do retângulo visível, atrás de um componente `Mapa` com interface única.
  - _Pronto quando:_ funciona nas duas plataformas; a solução escolhida (por plataforma ou `WebView`) está registrada em "Desvios e decisões".

## Etapa 2 — API e fila · branch `etapa-2-api-e-fila`

**Critério da etapa:** um relato enviado à API aparece na fila e a API responde sem aguardar o processamento.

- [ ] **2.1** Esqueleto Express + `GET /saude` (confere Postgres, Redis e RabbitMQ sem derrubar a API se um falhar).
  - _Pronto quando:_ responde `200` com cada serviço `ok` e, com o Redis parado, continua `200` com `redis: "falha"`.
- [ ] **2.2** Declaração da topologia do RabbitMQ no código (exchanges, `relatos.novos`, filas de espera 2/4/8 s, DLQ), idempotente e reutilizável pelos workers.
  - _Pronto quando:_ subir API e worker várias vezes não dá erro; as filas aparecem no painel como duráveis, com os argumentos de `04-contratos.md`.
- [ ] **2.3** `POST /relatos`: validação (zod), limite de 30/h no Redis (sem bloquear se o Redis cair), publicação com confirmação do broker, DLQ para inválidos e acima do limite, respostas `202/422/429/503`, **com testes de unidade da validação**.
  - _Pronto quando:_ relato válido aparece em `relatos.novos` e a API responde `202` **sem worker rodando**; inválido vai para `relatos.mortas` com `x-motivo`; o 31º relato da hora recebe `429`.
- [ ] **2.4** `GET /camadas`: retângulo → células H3 res 7 → Redis (clima e incidentes) com queda para o PostgreSQL, demanda de clima (`ZADD`), `atualizando`, `area_grande`.
  - _Pronto quando:_ com o seed, devolve incidentes e células do retângulo; área grande devolve `422`; com o Redis parado ainda devolve incidentes pelo PostgreSQL.
- [ ] **2.5** `GET /alertas/recentes` (filtro de proximidade e de célula, janela de 60 min).
  - _Pronto quando:_ devolve só alertas dentro do raio/célula e da janela, depois do `desde`.

## Etapa 3 — Workers · branch `etapa-3-workers`

**Critério da etapa:** relato inválido cai na DLQ, dois relatos próximos confirmam o incidente e a segunda consulta de uma região sai do cache.

- [ ] **3.1** Worker de relatos: consumo com ack manual e `prefetch`, revalidação, **transação R2** (lock por tipo + célula, idempotência por `relato_id`, incidente, confirmação, alerta com índice único), **com testes de unidade da confirmação e da gravidade**.
  - _Pronto quando:_ um relato publicado vira linha em `relatos` e cria/atualiza `incidentes`; dois do mesmo tipo e célula em menos de 2 h confirmam; reenviar a mesma mensagem não duplica.
- [ ] **3.2** Retries (2/4/8 s) e DLQ no worker.
  - _Pronto quando:_ com o Postgres parado a mensagem passa pelas filas de espera 3 vezes e vai para `relatos.mortas` com `x-motivo = tentativas_esgotadas`; mensagem inválida vai direto à DLQ; o ack só vem depois da gravação.
- [ ] **3.3** Redis e eventos: `incidente:{id}` e `incidentes:{h3}` (TTL 6 h) e publicação de `ev:incidente` e `ev:alerta` **depois do commit**; falha do Redis não impede o ack.
  - _Pronto quando:_ `redis-cli SUBSCRIBE ev:*` mostra os eventos; com o Redis parado o relato é gravado e confirmado.
- [ ] **3.4** Worker de clima: ciclo de 60 s, demanda `clima:demanda`, lotes de até 50, cache `clima:{h3}` de 600 s, `leituras_clima`, `ev:camada`; falha da API mantém o cache e não inventa valor.
  - _Pronto quando:_ a segunda consulta de uma região sai do cache (a contagem do mock não sobe) e célula sem dado fica `null`.
- [ ] **3.5** Alertas climáticos (AQI > 150, temperatura > 35 °C) com dedupe de 60 min, gravados antes de publicados.
  - _Pronto quando:_ com o mock forçando AQI 180, cria 1 alerta (não repete antes de 60 min) e publica `ev:alerta`.
- [ ] **3.6** Testes de integração **CT02, CT03 e CT05**.
  - _Pronto quando:_ os três casos aprovados e registrados em `testes/resultados/`.

## Etapa 4 — Tempo real e aplicativo · branch `etapa-4-tempo-real-e-app`

**Critério da etapa:** o aplicativo abre no celular e no navegador e exibe as camadas da região.

- [ ] **4.1** WebSocket `/ws` na API: mensagens `inscrever`, `posicao`, `ping`/`pong`, registro dos clientes em memória, derrubar quem fica 60 s sem `ping`.
  - _Pronto quando:_ um cliente de teste conecta, se inscreve e recebe `pong`.
- [ ] **4.2** Assinatura Redis `ev:*` e entrega de `camada` e `incidente` **só a clientes cujo retângulo contém** a célula ou o ponto.
  - _Pronto quando:_ cliente com retângulo fora **não** recebe; cliente com retângulo dentro recebe.
- [ ] **4.3** Alertas: `alerta` por proximidade (≤ 500 m) e por célula (clima); `alertas_recentes` na inscrição usando `ultimo_alerta_em`.
  - _Pronto quando:_ cliente a 400 m recebe, a 700 m não; reconectar depois de perder um alerta devolve esse alerta.
- [ ] **4.4** Testes de integração **CT01 e CT08**.
  - _Pronto quando:_ os dois casos aprovados e registrados.
- [ ] **4.5** Base do app: pastas, constantes compartilhadas, SQLite (`config`, `dispositivo_id`), tokens de design (`07-app-telas.md`), componentes básicos.
  - _Pronto quando:_ o app abre, cria o `dispositivo_id` uma única vez e usa os tokens.
- [ ] **4.6** Cliente da API (`GET /camadas`, `POST /relatos`) com **modo de dados falsos**, selecionado por variável de ambiente.
  - _Pronto quando:_ as telas funcionam com dados falsos e com a API real trocando só a variável.
- [ ] **4.7** Mapa e camadas: GPS e região padrão (tela 2), chips, células de clima com as escalas de cor, pontos, legenda, atribuição, aviso "Atualizando camada" (telas 1 a 4).
  - _Pronto quando:_ com a API real, mostra as camadas da região no celular e no navegador.
- [ ] **4.8** Fichas (telas 5, 6 e 13): célula, incidente confirmado e incidente recebido.
  - _Pronto quando:_ o toque abre e o X fecha a ficha, com os dados corretos.
- [ ] **4.9** Busca de endereço (Nominatim, no máximo 1 requisição por segundo).
  - _Pronto quando:_ buscar um endereço de Ribeirão Preto move o mapa e recarrega as camadas.
- [ ] **4.10** Cliente WebSocket com reconexão (espera crescente até 30 s) e `inscrever` a cada mudança do retângulo; atualiza camadas e pontos em tempo real.
  - _Pronto quando:_ um relato feito por outro cliente aparece no mapa **sem atualizar a tela**.

## Etapa 5 — Relato, alerta e modo offline · branch `etapa-5-relato-alerta-offline`

**Critério da etapa:** um relato feito em um cliente aparece no outro sem atualizar a tela, e o relato feito sem rede é enviado ao reconectar.

- [ ] **5.1** Formulário de relato (telas 7, 8 e 9): GPS, metadados, envio, recusa com a mensagem da API, sucesso volta ao mapa.
  - _Pronto quando:_ relato válido chega ao banco; o limite de 30/h mostra a mensagem da tela 8 com os dados mantidos.
- [ ] **5.2** Faixa de alerta (telas 10, 11 e 14): "Ver local", "Dispensar por 30 min" (silencia a chave por 30 min), círculo de 500 m, **com teste da função de silenciar**.
  - _Pronto quando:_ o alerta aparece no segundo cliente a ≤ 500 m e não reaparece por 30 min depois de dispensado.
- [ ] **5.3** Modo offline: fila local SQLite em ordem, estados Pendente/Enviado/Falhou, "Tentar de novo", "Meus relatos", faixa "Sem conexão", cache da última camada (tela 12).
  - _Pronto quando:_ relato feito sem rede fica `pendente` e é enviado em ordem quando a rede volta, sem duplicar.
- [ ] **5.4** Testes de integração **CT04, CT07, CT09 e CT10** (CT10: 10 medições, máximo ≤ 5 s).
  - _Pronto quando:_ os quatro casos aprovados; os tempos do CT10 registrados.
- [ ] **5.5** **CT06** (fila local offline) e roteiro visual de RF01 a RF04 com prints.
  - _Pronto quando:_ caso aprovado e prints em `docs/evidencias/`.

## Etapa 6 — Fechamento · branch `etapa-6-fechamento`

**Critério da etapa:** roteiro da demonstração executado do início ao fim sem intervenção manual.

- [ ] **6.1** Ensaio completo do roteiro da demonstração (`01-escopo-mvp.md`), corrigindo as falhas encontradas.
  - _Pronto quando:_ roteiro executado do início ao fim sem intervenção manual além dos toques no app.
- [ ] **6.2** `README.md` final (o que é, como subir, como rodar o app, os testes e o roteiro).
  - _Pronto quando:_ uma pessoa que nunca viu o projeto sobe tudo só com o README.
- [ ] **6.3** `docs/trechos-relatorio.md`: árvore real do repositório e até 6 trechos marcados com `// RELATÓRIO:` (ver `09-plano-de-entrega.md`).
  - _Pronto quando:_ arquivo pronto, com caminho, linhas e 2–3 frases por trecho.
- [ ] **6.4** `docs/evidencias/`: prints numerados da demonstração, painel do RabbitMQ, `docker compose ps`, logs de `alerta_entregue` e tabela `resultados.md`.
  - _Pronto quando:_ todos os itens da seção "Evidências" de `09` existem.
- [ ] **6.5** `docs/limitacoes.md`: limitações conhecidas e versão futura (push, rotas alternativas, sharding, Redis Cluster), para a seção 8 do relatório.
  - _Pronto quando:_ texto curto pronto.
- [ ] **6.6** _(documento, não código)_ Relatório: ajustar datas e descrição das seções 4.1 e 4.4 ao que de fato aconteceu (D15), escrever as seções 6, 7 e 8, Resumo, Referências e Ficha de APS; atualizar Sumário e listas. Pode começar antes pelas seções 4.1 e 4.4.
  - _Pronto quando:_ PDF final sem textos de modelo.

Ao concluir a etapa 6: pull request da branch `etapa-6-fechamento` para a `develop` e, com tudo funcionando, da `develop` para a `main`.

---

## Diário (uma linha por sessão de trabalho, a mais recente em cima)

| Data | Quem | O que foi feito | Commit / PR | Notas e o que falta |
|---|---|---|---|---|
| 2026-11-02 | grupo | Documentação criada (`docs/00` a `docs/11`); repositório vazio | — | Começar pela tarefa `1.1` |

## Desvios e decisões durante o desenvolvimento

> Tudo que mudou em relação aos documentos (e **por quê**). Ajuste também o `.md` afetado no mesmo commit. Se contrariar o relatório, avise o grupo.

| Data | Quem | O que mudou | Motivo | Arquivo(s) ajustado(s) |
|---|---|---|---|---|
| — | — | — | — | — |

## Problemas conhecidos e bloqueios

| Data | Quem | Tarefa | O que está travando (e opções) | Resposta do grupo |
|---|---|---|---|---|
| — | — | — | — | — |
