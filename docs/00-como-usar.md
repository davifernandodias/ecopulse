# Como usar esta documentação

Estes arquivos existem para duas pessoas desenvolverem com IA sem perder o fio. Eles não substituem o relatório ABNT.

## Ordem de leitura para quem vai codar

1. `01-escopo.md` — o que entra e o que fica de fora.
2. `02-decisoes.md` — escolhas fechadas. Não reabrir sem registrar em `07-historico.md`.
3. `03-ux.md` — o que a tela faz.
4. `04-arquitetura.md` — serviços, filas, bancos e fluxo dos eventos.
5. `05-dados.md` — de onde vem cada camada do mapa.
6. `06-plano-de-acao.md` — a tarefa atual. Implementar a primeira tarefa com status `pendente`, na ordem.
7. `07-historico.md` — o que já mudou e por quê.

## Regra ao terminar uma tarefa

Atualizar no mesmo commit conceitual (quando o git existir):

- Em `06-plano-de-acao.md`, trocar o status da tarefa para `feito` e anotar a data.
- Em `07-historico.md`, acrescentar uma entrada curta: data, o que foi feito, o que ficou diferente do plano.

Se a implementação precisar contradizer uma decisão de `02-decisoes.md`, parar e registrar a mudança no histórico antes de seguir. O relatório da APS tem que continuar dizendo a mesma coisa que estes arquivos.

## O que não fazer a partir daqui

- Não inventar outra stack.
- Não trocar o mapa para uma cidade só.
- Não tratar alagamento e via obstruída como dado de API externa. Esses dois nascem do usuário.
- Não subir nada em produção. Tudo roda na máquina, via Docker Compose, mais o app no celular e no navegador.
- Não colocar senha, chave ou connection string real dentro destes Markdowns.

## Relatório da disciplina

`relatorio/TEMPLATE-APS.md` é roteiro para o Vinicius redigir o documento da APS. O texto final (capa, ABNT, PDF) é outro arquivo, feito por ele. Os fatos técnicos do template têm que bater com `02-decisoes.md` e `04-arquitetura.md`.
