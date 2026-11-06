# 09 — Plano de entrega, Git e evidências

> **A lista executável, com caixinhas para marcar o que foi feito, está em `11-progresso.md`** (tarefas em ordem, uma branch por etapa, um commit por tarefa). Este arquivo explica o plano, o calendário, o que cortar se faltar tempo e as evidências para o relatório.

## Ponto de partida

Em **02/11/2026 o repositório está vazio** (só a documentação). O relatório (Quadro 4) organiza o trabalho em seis etapas, com a ordem de dependência: **infraestrutura → API e fila → workers → tempo real e app → relato, alerta e offline → testes e fechamento**. A ordem continua valendo. O **calendário** é que precisa caber em **três semanas** (02/11 a 22/11), o que exige que as pessoas trabalhem **em paralelo dentro de cada etapa**. Isso é possível porque os contratos já estão fechados em `04-contratos.md` e `05-banco-de-dados.md`: o app pode ser feito contra dados falsos enquanto a API é construída (tarefa 4.6).

## Calendário real [PROPOSTA]

| Semana | Período | Etapas |
|---|---|---|
| **1** | 02/11 a 08/11 | **1 (infraestrutura), 2 (API e fila) e 3 (workers)** |
| **2** | 09/11 a 15/11 | **4 (tempo real e app)** e começo da 5 |
| **3** | 16/11 a 22/11 | **5 (relato, alerta e offline)** e **6 (fechamento)** |

Critérios de conclusão de cada etapa (do Quadro 4 do relatório):

| Etapa | Critério |
|---|---|
| 1 | Todos os serviços sobem com um único comando e o painel do RabbitMQ abre |
| 2 | Um relato enviado à API aparece na fila e a API responde sem aguardar o processamento |
| 3 | Relato inválido cai na DLQ, dois relatos próximos confirmam o incidente e a segunda consulta de uma região sai do cache |
| 4 | O aplicativo abre no celular e no navegador e exibe as camadas da região |
| 5 | Um relato feito em um cliente aparece no outro sem atualizar a tela, e o relato feito sem rede é enviado ao reconectar |
| 6 | Roteiro da demonstração executado do início ao fim sem intervenção manual |

## O que cortar primeiro se faltar tempo

Em ordem (corte de baixo para cima na lista mantém o núcleo da demonstração):

1. **Busca de endereço** (RF01 fica só com GPS e arrastar/aproximar) — mas o relatório promete; só cortar se for inevitável e ajustar o texto.
2. **"Meus relatos" detalhado** (manter só o envio em ordem e o aviso de "guardado no aparelho").
3. **CT09** (vários workers): manter `--scale` funcionando, mas teste manual com print.
4. **Cache da última camada no SQLite** (manter só a fila de relatos pendentes).
5. **Alertas climáticos** (AQI e temperatura): manter só o alerta de incidente.

**Nunca cortar:** `POST /relatos` assíncrono com RabbitMQ, ack manual + retries + DLQ, gravação no PostgreSQL, confirmação de incidente, WebSocket entregando o ponto ao segundo cliente, alerta de proximidade, relato offline. É o núcleo da disciplina.

## Git [RELATÓRIO — seção 4.1, adaptado]

- `main` = versões estáveis; `develop` = o que já foi validado.
- **Uma branch por etapa**, criada a partir da `develop` (`etapa-1-infraestrutura` … `etapa-6-fechamento`). A etapa faz o papel da "funcionalidade" descrita no relatório.
- **Um commit por tarefa** de `11-progresso.md`, com a marcação `[x]` no mesmo commit.
- Ao fim da etapa: **pull request para a `develop` com revisão** de outro integrante. A `develop` vai para a `main` só quando o conjunto estiver completo e funcionando.
- Tarefas e prazos semanais no **GitHub Projects**; comunicação por WhatsApp e Discord.
- Como API, workers e app dependem de `packages/compartilhado` e do esquema do banco, a **etapa 1 deve ser mesclada na `develop` logo**, antes de a etapa 2 avançar muito.

## Evidências para o relatório

O relatório ainda precisa das seções **6 (Relatório de Código, máx. 10 páginas)** e **7 (Apresentação em Funcionamento)**. Enquanto desenvolve, o Claude Code deve **deixar o material pronto** para quem escreve o relatório:

### Para a seção 6 — `docs/trechos-relatorio.md`
- **6.1 Estrutura do repositório:** a árvore de pastas real, com uma linha por pasta.
- **6.2 Trechos relevantes** — escolher **até 6 trechos curtos (≤ 25 linhas)**, cada um com caminho do arquivo, linhas e 2–3 frases do que mostra e do requisito que atende:
  1. Consumidor do worker: ack manual, retry com espera crescente e DLQ (RNF02).
  2. Transação do worker: gravar relato, atualizar incidente, gerar alerta antes de publicar (RF07, RNF09).
  3. Regra de confirmação do incidente e gravidade (RF07).
  4. Roteamento do WebSocket por retângulo e por proximidade (RF09, RNF04).
  5. Consulta PostGIS pelo retângulo visível com índice GiST (RNF04).
  6. Fila local do app (SQLite) com envio em ordem (RF10).
- Marcar os trechos no código com o comentário `// RELATÓRIO: <tema>` para localizá-los.

### Para a seção 7 — pasta `docs/evidencias/`
- **7.1 Ambiente de execução:** versões (Node, Docker, PostgreSQL, Redis, RabbitMQ, Expo), comando de subida, dispositivos usados. Salvar a saída de `docker compose ps`.
- **7.2 Demonstração das funcionalidades:** prints numerados (`01-mapa.png`, …) do roteiro: mapa com as 4 camadas; sem GPS; ficha da célula; ficha do incidente (recebido e confirmado); formulário e relato enviado; relato recusado; alerta de incidente, de AQI e de calor; sem conexão com a lista "Meus relatos"; painel do RabbitMQ (fila, DLQ, mensagens por worker); logs de `alerta_entregue`.
- **7.3 Resultados dos testes:** `testes/resultados/resultados.md` (tabela CT01–CT10 com esperado × observado) e os tempos do CT10.

### Também ao final
- Um `README.md` na raiz com: o que é, como subir (`docker compose up --build`), como rodar o app, como rodar os testes, como rodar o roteiro da demonstração.
- Lista de **limitações conhecidas** e **itens de versão futura** (push, rotas alternativas, sharding e Redis Cluster) para a seção 8 (Considerações finais).
