# Roteiro do relatório da APS — EcoPulse

Isto não é o relatório. É o mapa do que o Vinicius escreve no documento oficial, para o texto não divergir do que está sendo construído em `docs/`.

O arquivo final (Word ou equivalente, normas ABNT e manual da UNIP) fica fora daqui, com capa, paginação e PDF. Quando uma decisão de `02-decisoes.md` mudar, este roteiro muda no mesmo dia.

Fatos que o texto inteiro precisa sustentar, sem contradizer:

- Título: EcoPulse: Plataforma Distribuída Mobile para Monitoramento Colaborativo de Riscos Ambientais Urbanos e Qualidade do Ar.
- Disciplina: Desenvolvimento de Sistemas Distribuídos. UNIP. Ciência da Computação. 2026/2.
- Autores: Davi e Vinicius. Completar nome, RA e polo na capa. Não inventar o restante do nome.
- O sistema roda localmente, em Docker Compose, com app no celular e no navegador.
- Mapa mundial. Demonstração narrada em Ribeirão Preto.
- Calor e qualidade do ar: Open-Meteo, com cache. Alagamento e via obstruída: relatos dos usuários.
- Stack real: React Native (Expo), Node.js, Express, RabbitMQ, PostgreSQL/PostGIS, Redis, WebSocket, SQLite no aparelho, H3, MapLibre.
- Não afirmar que existem: Google Maps, Kafka, Firebase, cluster Redis em várias máquinas, rota desvio, login com senha, sensor oficial de alagamento.

Tamanhos pedidos no enunciado (seção VI). São teto e piso do documento da disciplina, não destes Markdowns.

| Parte | Tamanho |
| --- | --- |
| Objetivo e motivação | 1 a 2 páginas |
| Introdução | 2 a 4 páginas |
| Fundamentos das tecnologias escolhidas | 4 a 8 páginas |
| Plano de desenvolvimento da aplicação | 5 a 15 páginas |
| Projeto e arquitetura do programa | 3 a 8 páginas |
| Relatório de código | no máximo 10 páginas |
| Apresentação em funcionamento | o que for necessário para reproduzir a demo |

---

## Capa

Campos para preencher:

- Universidade Paulista — UNIP
- Ciência da Computação
- Atividades Práticas Supervisionadas
- Desenvolvimento de Sistemas Distribuídos
- 2026/2
- Título do EcoPulse (o título oficial do enunciado)
- Nomes completos, RA, polo
- Cidade e data da entrega

## Índice

Gerar pelo editor quando o texto estiver estável. Não manter índice manual.

## Objetivo e motivação (1–2 páginas)

Escrever em três blocos:

1. O problema urbano do enunciado, com as próprias palavras: alagamento repentino, ilha de calor, inversão e ar ruim chegam numa escala que um mapa centralizado, de cidade inteira e atualização lenta, não avisa a tempo quem está na rua.
2. O objetivo do EcoPulse: um aplicativo em que a pessoa vê, na região em que está, calor e ar atuais e os incidentes relatados por outros celulares, e recebe alerta ao se aproximar.
3. Por que isso é um trabalho de sistema distribuído, e não só um mapa: o relato entra por mensagem, outro processo grava e agrega, o cache serve a leitura, e um terceiro cliente recebe o alerta sem consultar o banco o tempo todo.

Não prometer defesa civil, integração com prefeitura ou precisão de sensor oficial.

## Introdução (2–4 páginas)

Sugestão de fio:

- Centros urbanos e o limite da resolução espacial e temporal dos boletins tradicionais.
- Crowdsourcing: o celular como quem relata alagamento e via fechada, porque essa informação não está numa API pública mundial.
- Dado meteorológico e de ar como complemento, vindo de serviço público (Open-Meteo), não como se o grupo operasse estação.
- Recorte honesto: protótipo local, uma equipe de dois, demonstração em Ribeirão Preto, mapa capaz de abrir outra região.
- Como o restante do relatório se organiza. Um parágrafo, sem encher linguiça.

## Fundamentos das tecnologias escolhidas (4–8 páginas)

Uma subseção curta por tecnologia, sempre com o uso **neste** projeto. Definição de dicionário sem o EcoPulse não conta.

| Tecnologia | O que explicar | O que amarrar no EcoPulse |
| --- | --- | --- |
| Arquitetura orientada a eventos | Produtor não espera o consumidor terminar | A API responde 202 e segue. O worker conclui |
| Microsserviços | Processos com responsabilidade separada | api, worker-relatos, worker-clima, mobile |
| RabbitMQ | Fila durável, ack, retry, DLQ | Nomes das filas de `04-arquitetura.md` |
| PostgreSQL e PostGIS | Dado que precisa sobreviver, ponto geográfico, consulta por raio e retângulo | Tabelas `relatos`, `incidentes`, `leituras_clima` |
| Redis | Leitura rápida e pub/sub. Consistência eventual | Chave de clima com expiração de 10 minutos. Um nó na demo. Dizer isso |
| H3 | Índice hexagonal hierárquico | Resolução 7 para clima, 9 para agrupar relatos |
| WebSocket | Canal aberto dos dois lados | Alerta e mancha pronta, sem o usuário atualizar |
| React Native e Expo | Um app, celular e navegador | Dois clientes na apresentação |
| MapLibre | Mapa mundial sem chave comercial | Tiles OpenFreeMap, atribuição na tela |
| SQLite no aparelho | Offline-first | Fila de relatos e última camada vista |
| Docker Compose | Ambiente repetível | Qualquer um dos dois sobe a mesma infra |
| Open-Meteo | Fonte externa de temperatura e US AQI | Sem chave, com cache e atribuição |

Citar Kafka, MQTT e Google Maps apenas se for para dizer que foram opções do enunciado ou da conversa inicial e **não** as escolhidas, com um motivo: RabbitMQ torna retry e DLQ visíveis num container só; MapLibre evita cota de mapa ao navegar o mundo. Não escrever um capítulo sobre o que não foi usado.

## Plano de desenvolvimento da aplicação (5–15 páginas)

Contar o plano de `06-plano-de-acao.md` em prosa, na ordem M1 → M8. Para cada marco:

- objetivo;
- o que foi entregue (quando já estiver feito);
- como se verifica (o critério da coluna "Pronto quando").

Incluir o modo de trabalho: dois desenvolvedores, especificação em Markdown como fonte única, atualização de status e de histórico a cada marco. Isso mostra processo, sem precisar inventar metodologia pesada.

Riscos que merecem um parágrafo cada:

- Celular físico não acessa `localhost`. A demo usa o IP da máquina na Wi-Fi.
- Open-Meteo pode atrasar ou limitar. O cache e a célula vazia (sem número inventado) são a contenção.
- Primeira abertura de uma região chega um instante depois, de propósito, porque o clima passa pela fila.
- Escopo estourar com rota, foto e push remoto. Estão listados como evolução.

Cronograma: montar uma tabela simples com os marcos e as semanas reais quando a data de entrega estiver definida. Enquanto a data não existir, deixar a coluna de semana em branco em vez de inventar.

## Projeto e arquitetura do programa (3–8 páginas)

Levar `04-arquitetura.md` para a linguagem do relatório:

- figura do fluxo (a banca entende figura melhor do que lista);
- responsabilidade da API, dos dois workers e do app;
- caminho feliz do relato, do `POST` até o alerta no segundo celular;
- caminho do clima, do retângulo visível até a mancha;
- caminho offline, da fila SQLite até o `POST` tardio;
- tabela dos pilares da disciplina (a que está no fim de `04-arquitetura.md`);
- o que foi simplificado de propósito: um nó de Redis, um container por serviço, sem push remoto.

A figura pode ser desenhada no editor a partir do bloco de texto da arquitetura. Não colar o Markdown cru.

## Relatório de código (no máximo 10 páginas)

Só trechos que existem no repositório no dia da entrega. Cada trecho: 15 a 40 linhas, com uma frase antes dizendo o pilar.

Ordem sugerida, se o código já tiver chegado lá:

1. Publicação do relato na fila e resposta 202.
2. Consumo com ack manual e desvio para DLQ.
3. Cálculo do H3 e gravação do ponto no PostGIS.
4. Leitura do mapa pelo Redis e publicação do pedido de clima quando a chave falta.
5. Inscrição WebSocket e envio do alerta por proximidade.
6. Gravação na fila SQLite quando não há rede.

Não colar arquivo inteiro. Não incluir `node_modules`, configuração com senha ou print de `.env`.

## Apresentação em funcionamento

Reproduzir `08-roteiro-demo.md` como seção de "como executar" e "roteiro da banca":

- pré-requisitos (Docker, Node, Expo, celular na mesma Wi-Fi);
- subir o Compose;
- apontar o app para o IP;
- os passos numerados da história;
- o que a banca deve ver em cada passo;
- falhas conhecidas e a frase honesta correspondente.

## Bibliografia

Separar em dois grupos.

Normas e bases do curso, as que o manual da UNIP pedir (ABNT de citação e referência).

Técnicas, as que forem de fato usadas. Ponto de partida, conferir a versão e a data de acesso na hora de redigir:

- Documentação do RabbitMQ (filas, ack, dead letter).
- Documentação do PostGIS.
- Documentação do Redis (expiração e pub/sub).
- H3, documentação da Uber.
- Open-Meteo, incluindo a exigência de atribuição.
- React Native, Expo, MapLibre.
- Enunciado da APS da disciplina, como documento de requisitos do trabalho.

Não citar artigo que ninguém leu só para engrossar.

## Ficha de APS

Preencher a ficha oficial da UNIP quando o professor entregar o modelo. Não recriar a ficha de cabeça. O conteúdo descritivo sai do objetivo e do roteiro da demo.

## Checagem antes de entregar o PDF

- O título bate com o enunciado.
- Toda tecnologia citada como "usada" está em `02-decisoes.md`.
- Alagamento não é descrito como dado da Open-Meteo.
- Redis não é descrito como cluster de várias máquinas.
- Há figura de arquitetura.
- O relatório de código tem trecho real e passa de folha em branco.
- A seção de funcionamento permite outra pessoa subir o sistema.
- Nomes, RA e data estão na capa.
