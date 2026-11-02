# EcoPulse — Guia de desenvolvimento (LEIA PRIMEIRO)

Este conjunto de arquivos Markdown é a ponte entre o **relatório da APS** (PDF) e o **código**. Ele foi montado para o Claude Code planejar e desenvolver o EcoPulse sem precisar adivinhar nada.

## Onde estão os materiais (pasta `docs/` do repositório)

| Material | Caminho | Para que serve |
|---|---|---|
| **Estes arquivos `.md`** | `docs/00-…` a `docs/10-…` | Detalhes que o relatório não traz: contratos, banco, números, estrutura, testes, plano. |
| **Relatório da APS (PDF)** | `docs/relatorio/Relatorio_APS_EcoPulse.pdf` | Fonte de verdade: requisitos (Quadro 2), casos de uso (Quadro 3), cronograma (Quadro 4), testes (Quadro 5), riscos (Quadro 6), arquitetura (seção 5, Figura 1). As seções 6, 7, 8, Resumo e Referências ainda estão vazias — **ignore os textos de modelo**. |
| **Telas** | `docs/telas/` | `EcoPulse_Telas.pdf` (14 telas, cada uma com sua nota), `tela-01….png` a `tela-14….png` (uma imagem por tela, 390 × 844 px a 2×) e `notas-das-telas.md` (as 14 notas em texto). |

O repositório **começa do zero**: hoje só existem estes arquivos. Nada de código, Compose ou banco foi criado ainda.

## Ordem de leitura

1. `00-leia-me.md` (este) — regras de trabalho e estado atual. **Depois, vá direto ao `11-progresso.md` e pegue a primeira tarefa livre.**
2. `01-escopo-mvp.md` — o que entra, o que não entra, roteiro da demonstração.
3. `02-regras-e-constantes.md` — todos os números e as regras de negócio.
4. `03-stack-e-estrutura.md` — tecnologias, pastas, Docker Compose, variáveis, como rodar.
5. `04-contratos.md` — REST, WebSocket, RabbitMQ, Redis.
6. `05-banco-de-dados.md` — PostgreSQL/PostGIS e SQLite do aparelho.
7. `06-integracoes-externas.md` — Open-Meteo, mapa (tiles) e busca de endereço.
8. `07-app-telas.md` — telas × requisitos × componentes, cores, estados.
9. `08-testes.md` — CT01 a CT10 como testes automatizados.
10. `09-plano-de-entrega.md` — ordem de trabalho, equipe, Git, evidências para o relatório.
11. `10-decisoes-tomadas.md` — decisões já tomadas (recomendação padrão) que o relatório não define.
12. **`11-progresso.md` — lista de tarefas em ordem, com o que já foi feito. É por aqui que se começa e é aqui que se marca o que foi concluído.**

## Convenção de marcação nos arquivos

- **[RELATÓRIO]** — já está definido no relatório. Não mude sem aprovação do grupo.
- **[PROPOSTA]** — o relatório não define; é a decisão tomada pelo grupo (recomendação padrão), listada em `10-decisoes-tomadas.md`.

## Duas regras de ouro (valem acima de todas as outras)

**A. Nunca decida por suposição ou "achismo".** Se esbarrar em um ponto técnico, uma dúvida, algo que os documentos não cobrem, uma contradição entre os arquivos (ou entre eles e o relatório), um erro que não consegue resolver com segurança, ou qualquer coisa que o faça pensar "provavelmente é assim": **pare, não continue naquele ponto e fale com o grupo.** Explique de forma curta:

1. **O que está travando** (a tarefa, o arquivo, o erro ou a dúvida exata).
2. **O que você já verificou** (documento lido, teste feito, mensagem de erro).
3. **As opções que enxerga**, com a sua recomendação e o motivo, se tiver uma.

Espere a resposta antes de seguir. Registre o bloqueio em `11-progresso.md` (seção "Problemas conhecidos e bloqueios") e **não marque a tarefa como concluída**. Se der para avançar em outra parte da tarefa que **não** depende da dúvida, pode fazer, dizendo o que ficou pendente.

Isso vale também para: versões de bibliotecas que não funcionam como esperado, comportamento de serviço externo diferente da documentação, teste que falha por motivo desconhecido e qualquer mudança que contrarie o relatório. As decisões de `10-decisoes-tomadas.md` já estão tomadas e **não** precisam de nova pergunta; o que **não** está lá e não está nos documentos precisa.

**B. Comentários curtos, objetivos e fáceis de entender.** Não encha o código de comentários.

- Comente **só o que não é óbvio**: o motivo de uma regra ("ack só depois de gravar, para não perder relato"), uma restrição, um cuidado. Não explique o que o código já diz.
- **Uma linha** na maioria dos casos; no máximo 2 ou 3 linhas em trechos realmente delicados (transação do worker, retry, roteamento do WebSocket).
- Português simples, sem jargão desnecessário, sem blocos longos, sem comentário decorativo ou "histórico" do que foi mudado.
- Bons nomes de funções e variáveis valem mais que comentário. Se precisar de um parágrafo para explicar, simplifique o código.
- Nada de cabeçalhos grandes em todo arquivo. Mensagens de commit e de log também curtas.

## Regras de trabalho para o Claude Code

1. **O relatório manda.** Se algo aqui contradisser o PDF, pare e avise o grupo antes de decidir (regra de ouro A). Qualquer mudança que contrarie o relatório precisa de aprovação e de ajuste no documento.
2. **Simples primeiro.** Projeto acadêmico com prazo curto. Não adicione bibliotecas, camadas, padrões ou configurações que não sejam necessários. Prefira poucas dependências.
3. **Fora desta versão (não implementar):** notificação push com o app fechado, traçado de rotas alternativas, sharding do banco, Redis Cluster, login/cadastro, mapa de calor por interpolação. Se algo parecer exigir isso, deixe comentado como "versão futura".
4. **Textos da interface em português do Brasil**, exatamente como nas telas (ex.: "Relatar", "Dispensar por 30 min", "Atualizando camada").
5. **Nomes** de tabelas, colunas, filas, canais e campos JSON em português sem acento (como nos arquivos), para o código bater com o relatório. Nomes de funções e variáveis podem ser em português sem acento também; mantenha um único padrão.
6. **Idempotência e confiabilidade antes de recursos novos.** O núcleo da nota é: fila durável, ack só após gravar, novas tentativas, DLQ, PostgreSQL como registro definitivo, Redis como cache.
7. **Constantes em um único lugar** (`packages/compartilhado`), nunca números "soltos" no código. Veja `02-regras-e-constantes.md`.
8. **Cada tarefa termina com teste rodando** (veja `08-testes.md`) e com evidência guardada para o relatório (veja `09-plano-de-entrega.md`).
9. **Git:** uma **branch por etapa** (`etapa-1-infraestrutura` … `etapa-6-fechamento`), criada a partir da `develop`; **um commit por tarefa** (checkbox de `11-progresso.md`); pull request da etapa para a `develop` com revisão de outro integrante; `main` só com o conjunto completo e funcionando. Commits em português, no formato `<número> <resumo>`.
10. **Segredos:** nada de chaves no repositório. A Open-Meteo e o mapa escolhido não exigem chave.
11. **Controle de progresso:** ao começar, leia `11-progresso.md` e pegue a primeira tarefa `[ ]`; ao terminar, marque `[x]` **no mesmo commit do código**, atualize "Próximo passo" e o "Diário", e registre desvios dos documentos.
12. Antes de escrever código de uma etapa, **liste o que vai fazer, os arquivos que vai criar e como vai testar**, e espere confirmação do grupo se houver dúvida.

## Estado atual do projeto

- **02/11/2026:** repositório no GitHub criado e **vazio**, exceto pelos `.md`. Tudo precisa ser construído: monorepo, Docker Compose, banco, API, workers, WebSocket, app e testes.
- **Decisões:** todas as de `10-decisoes-tomadas.md` estão **decididas pela recomendação padrão** (TypeScript, H3 res 7 e 8, mapa por plataforma, etc.). Não pergunte de novo; siga.
- **Prazo de referência:** 22/11/2026 (fim do sprint 6 no relatório). Como o código começa do zero, o calendário real está em `09-plano-de-entrega.md` (3 semanas, com trabalho em paralelo) e inclui o que cortar primeiro se faltar tempo.

## Como começar (primeira conversa com o Claude Code)

Sugestão de primeiro pedido:

> Leia `docs/00-leia-me.md` e `docs/11-progresso.md`, pegue a primeira tarefa livre, diga o que vai fazer e como vai testar, e espere minha confirmação antes de escrever código. Ao terminar, marque a tarefa conforme as regras do `11-progresso.md`.

O arquivo `CLAUDE.md` na raiz do repositório (copie para lá) já faz o Claude Code seguir essa rotina sozinho: basta dizer "continue o desenvolvimento".
