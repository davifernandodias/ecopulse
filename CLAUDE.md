# EcoPulse — instruções para o Claude Code

Projeto acadêmico (APS de Desenvolvimento de Sistemas Distribuídos, UNIP). Aplicativo móvel + sistema distribuído orientado a eventos (RabbitMQ, PostgreSQL/PostGIS, Redis, WebSocket, H3). Tudo está documentado em `docs/`.

## Duas regras de ouro

1. **Nada por suposição ou "achismo".** Dúvida técnica, algo que os documentos não cobrem, contradição, erro sem solução segura: **pare naquele ponto e fale com o grupo.** Diga (1) o que está travando, (2) o que já verificou, (3) as opções com sua recomendação. Espere a resposta, registre em `docs/11-progresso.md` ("Problemas conhecidos e bloqueios") e não marque a tarefa. As decisões de `docs/10-decisoes-tomadas.md` já estão tomadas e não precisam de nova pergunta.
2. **Comentários curtos, objetivos e fáceis de entender.** Só o que não é óbvio, em geral uma linha, em português simples. Sem blocos longos nem comentário decorativo.

## Ao começar QUALQUER sessão

1. Leia `docs/00-leia-me.md` (regras de trabalho, convenções, materiais).
2. Leia `docs/11-progresso.md`. Ele diz o que já foi feito (`[x]`) e qual é a **primeira tarefa `[ ]`**, em ordem. O estado vale na **branch `etapa-*` em andamento** (`git fetch --all`; veja as regras de Git no próprio arquivo).
3. Leia só os arquivos de `docs/` que a tarefa pede (contratos, regras e esquema estão em `02`, `04`, `05`, `06`, `07`, `08`).
4. Antes de escrever código, diga o que vai fazer, os arquivos que vai criar e como vai testar.

## Ao terminar uma tarefa

1. Rode os testes e confira o "Pronto quando" da tarefa em `docs/11-progresso.md`. Só marque se tudo for verdade.
2. Marque `[x]` (com data e hash do commit), atualize "Próximo passo" e o "Diário" **no mesmo commit do código**. Mensagem do commit: `<número> <resumo>` (ex.: `1.3 Esquema SQL do banco`). Dê push.
3. Se algo mudou em relação aos documentos, registre em "Desvios e decisões" e ajuste o `.md` afetado no mesmo commit.
4. Guarde evidências (logs, prints, resultados de testes) onde `docs/09-plano-de-entrega.md` manda.

## Git

- Uma **branch por etapa** (`etapa-1-infraestrutura` … `etapa-6-fechamento`), criada a partir da `develop`.
- **Um commit por tarefa.** Pull request da etapa para a `develop` quando todas as tarefas dela estiverem `[x]`, com revisão de outro integrante. `main` só com o conjunto funcionando.

## Regras principais (detalhes em `docs/00-leia-me.md`)

- O **relatório** (`docs/relatorio/`) manda; se algo contradisser, pare e avise o grupo.
- **Simples primeiro**: poucas dependências, sem camadas desnecessárias.
- **Não implementar**: push com app fechado, rotas alternativas, sharding, Redis Cluster, login.
- Interface em **português do Brasil**, igual às telas (`docs/telas/`).
- Constantes só em `packages/compartilhado`. Nomes de tabelas, filas, canais e campos em português sem acento, como nos documentos.
- Sem segredos no repositório.
