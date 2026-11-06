# EcoPulse

**Plataforma distribuída mobile para monitoramento colaborativo de riscos ambientais urbanos e qualidade do ar.**

Atividade Prática Supervisionada (APS) da disciplina **Desenvolvimento de Sistemas Distribuídos (DSD)** — Ciência da Computação, Universidade Paulista (UNIP), 8º semestre, 2026/2. Professor: Jean Scatena. Ribeirão Preto, 2026.

> **Status:** em desenvolvimento. O progresso, tarefa por tarefa, está em [`docs/11-progresso.md`](docs/11-progresso.md).

## O que é

O EcoPulse é um aplicativo móvel ligado a um sistema distribuído orientado a eventos. Ele mostra em um mapa o **calor**, a **qualidade do ar**, os **alagamentos** e as **vias obstruídas** de uma região, recebe **relatos colaborativos** dos usuários e **alerta em tempo real** quando alguém se aproxima de um risco.

- **Calor e qualidade do ar:** células hexagonais (H3) com dados da [Open-Meteo](https://open-meteo.com/).
- **Alagamento e via obstruída:** pontos criados pelos relatos dos usuários. Dois relatos do mesmo tipo na mesma célula em até 2 horas confirmam o incidente.
- **Alertas:** faixa no mapa quando o usuário está a até 500 m de um incidente confirmado, ou em uma célula com AQI acima de 150 ou temperatura acima de 35 °C.
- **Modo offline:** relatos feitos sem rede ficam guardados no aparelho e são enviados em ordem quando a conexão volta.

<p align="center">
  <img src="docs/telas/visao-geral.png" alt="Telas do aplicativo EcoPulse" width="900">
</p>

## Arquitetura

Arquitetura orientada a eventos com quatro processos de aplicação (aplicativo, API, worker de relatos e worker de clima) e três serviços de apoio (RabbitMQ, PostgreSQL com PostGIS e Redis). A API recebe o relato, publica na fila e responde sem esperar; o worker processa, grava e gera os alertas; o WebSocket entrega as atualizações aos clientes.

<p align="center">
  <img src="docs/imagens/arquitetura.png" alt="Arquitetura do EcoPulse" width="900">
</p>

| Parte | Tecnologia |
|---|---|
| Aplicativo | React Native (Expo), MapLibre, SQLite |
| API e workers | Node.js, Express, `ws` (WebSocket) |
| Mensageria | RabbitMQ (fila durável, ack manual, novas tentativas, fila de mensagens mortas) |
| Banco de dados | PostgreSQL com PostGIS |
| Cache e pub/sub | Redis |
| Particionamento geográfico | H3 |
| Infraestrutura | Docker e Docker Compose |

Conceitos de sistemas distribuídos aplicados: desacoplamento por mensageria assíncrona, tolerância a falhas, consistência eventual entre cache e banco, particionamento geoespacial e comunicação em tempo real.

## Como rodar

> **Protótipo (05/11/2026).** Já existe uma primeira versão funcionando, feita antes da documentação de 02/11 chegar à `main`. Ela ainda **não segue** a estrutura e algumas decisões de `docs/` (ver "Desvios" e "Problemas conhecidos" em [`docs/11-progresso.md`](docs/11-progresso.md)). Os comandos abaixo são os do protótipo e vão mudar quando ele for adaptado.

Pré-requisitos: Docker Desktop aberto, Node.js 22 ou mais novo e, no celular, o app **Expo Go**. Celular e computador na mesma rede Wi-Fi.

```bash
npm install                       # dependências da api e dos workers
npm run infra:up                  # sobe PostgreSQL/PostGIS, Redis, RabbitMQ, api e workers
npm run semear                    # opcional: relatos de ensaio em Ribeirão Preto
npm run teste:fluxo               # opcional: teste de ponta a ponta do backend

cd apps/mobile && npm install     # só na primeira vez
npx expo start                    # QR code para o Expo Go; tecla "w" abre no navegador
```

| O quê | Onde |
|---|---|
| App no navegador | http://localhost:8081 |
| App no celular | QR code do `npx expo start` (câmera do iPhone ou Expo Go no Android) |
| API | http://localhost:3000/saude |
| Painel do RabbitMQ | http://localhost:15673 (portas 5673/15673 no protótipo; usuário e senha em `infra/.env.example`) |

O celular acha a API pelo mesmo IP do QR code, porta 3000. O firewall do Windows precisa liberar as portas **3000** e **8081** para a rede local. Se o roteador isolar os aparelhos, use o hotspot do celular e fixe o IP: `$env:REACT_NATIVE_PACKAGER_HOSTNAME="172.20.10.x"; npx expo start`.

Parar tudo: `npm run infra:down`. Apagar banco e filas: `docker compose -f infra/docker-compose.yml down -v`.

## Documentação

Toda a documentação de projeto está em [`docs/`](docs/):

| Arquivo | Conteúdo |
|---|---|
| [`00-leia-me.md`](docs/00-leia-me.md) | Regras de trabalho e ordem de leitura (**comece por aqui**) |
| [`11-progresso.md`](docs/11-progresso.md) | Lista de tarefas em ordem e o que já foi feito |
| [`01-escopo-mvp.md`](docs/01-escopo-mvp.md) | Escopo, o que fica de fora e roteiro da demonstração |
| [`02-regras-e-constantes.md`](docs/02-regras-e-constantes.md) | Regras de negócio e constantes |
| [`03-stack-e-estrutura.md`](docs/03-stack-e-estrutura.md) | Tecnologias, estrutura de pastas e ambiente |
| [`04-contratos.md`](docs/04-contratos.md) | API REST, WebSocket, RabbitMQ e Redis |
| [`05-banco-de-dados.md`](docs/05-banco-de-dados.md) | Esquema do PostgreSQL e do SQLite |
| [`06-integracoes-externas.md`](docs/06-integracoes-externas.md) | Open-Meteo, mapa e busca de endereço |
| [`07-app-telas.md`](docs/07-app-telas.md) | Telas, componentes e design |
| [`08-testes.md`](docs/08-testes.md) | Casos de teste e critérios de aceite |
| [`09-plano-de-entrega.md`](docs/09-plano-de-entrega.md) | Calendário, cortes possíveis e evidências para o relatório |
| [`10-decisoes-tomadas.md`](docs/10-decisoes-tomadas.md) | Decisões de projeto fora do relatório |
| [`docs/telas/`](docs/telas/) | As 14 telas do aplicativo, com as notas de cada uma |
| [`docs/relatorio/`](docs/relatorio/) | Relatório da APS (PDF) |

## Como contribuir

- Uma **branch por etapa** (`etapa-1-infraestrutura` … `etapa-6-fechamento`), criada a partir da `develop`.
- **Um commit por tarefa** de [`docs/11-progresso.md`](docs/11-progresso.md), com a marcação `[x]` no mesmo commit. Mensagem no formato `<número> <resumo>` (ex.: `1.3 Esquema SQL do banco`).
- Pull request da etapa para a `develop`, com revisão de outro integrante. A `develop` vai para a `main` só quando o conjunto estiver completo e funcionando.
- Dúvida técnica ou algo que os documentos não cobrem: não decidir por suposição; avisar o grupo. Detalhes em [`docs/00-leia-me.md`](docs/00-leia-me.md).

## Equipe

- Vinicius Oliveira dos Santos
- Gabriel Boaron Dalsas Resende
- Carlos Eduardo Martins Penna
- Felipe Cantareli Andrucioli
- Davi Fernando Sousa Dias

## Licença e uso

Projeto acadêmico, desenvolvido para a disciplina de Desenvolvimento de Sistemas Distribuídos da UNIP. Os dados de clima e qualidade do ar vêm da [Open-Meteo](https://open-meteo.com/) (atribuição exibida no aplicativo) e o mapa usa dados do © OpenStreetMap contributors.
