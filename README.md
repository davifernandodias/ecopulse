# EcoPulse

Plataforma móvel distribuída para monitoramento colaborativo de riscos ambientais urbanos e qualidade do ar.

Trabalho da disciplina **Desenvolvimento de Sistemas Distribuídos (DSD)**, Ciência da Computação, UNIP, 2026/2.

A pasta `docs/` é o norte do desenvolvimento: o que o sistema é, o que já foi decidido, o que falta fazer e o que já foi feito. Quem for implementar (pessoa ou sessão de IA) lê os documentos nesta ordem antes de alterar qualquer coisa:

1. [docs/00-como-usar.md](docs/00-como-usar.md)
2. [docs/01-escopo.md](docs/01-escopo.md)
3. [docs/02-decisoes.md](docs/02-decisoes.md)
4. [docs/06-plano-de-acao.md](docs/06-plano-de-acao.md)
5. [docs/07-historico.md](docs/07-historico.md)

O relatório escrito da APS não é estes Markdowns. O roteiro para redigir esse relatório, alinhado com as decisões daqui, está em [docs/relatorio/TEMPLATE-APS.md](docs/relatorio/TEMPLATE-APS.md).

## Equipe

- Davi
- Vinicius

## O que a demo precisa mostrar

Um mapa mundial, no gesto de abrir e explorar qualquer lugar. A história contada para a banca acontece em Ribeirão Preto: calor e qualidade do ar reais no mapa, um celular publica um alagamento, o outro recebe o alerta.

## Rodar na máquina

Pré-requisitos: Docker Desktop aberto, Node.js 22 ou mais novo e, no celular, o app **Expo Go** (loja do Android ou do iPhone). Celular e computador na mesma rede Wi-Fi.

```bash
npm install                       # dependências da api e dos workers (raiz)
npm run infra:up                  # sobe PostgreSQL/PostGIS, Redis, RabbitMQ, api e workers
npm run semear                    # opcional: três relatos de ensaio em Ribeirão Preto
npm run teste:fluxo               # opcional: teste de ponta a ponta do backend

cd apps/mobile && npm install     # só na primeira vez
npx expo start                    # QR code para o Expo Go; tecla "w" abre no navegador
```

| O quê | Onde |
| --- | --- |
| App no navegador | http://localhost:8081 |
| App no celular | Ler o QR code do `npx expo start` com o Expo Go (Android) ou a câmera (iPhone) |
| API | http://localhost:3000/saude |
| Filas (resumo) | http://localhost:3000/status/filas |
| Painel do RabbitMQ | http://localhost:15673 (usuário e senha de `infra/.env.example`) |

O celular acha a API sozinho: usa o mesmo IP do QR code, porta 3000. Para isso o firewall do Windows precisa aceitar conexões da rede local nas portas **3000** (api) e **8081** (Expo).

Parar tudo: `npm run infra:down`. Apagar banco e filas e começar do zero: `docker compose -f infra/docker-compose.yml down -v`.

Toque longo no mapa define uma posição simulada (roxa), útil para o navegador receber o alerta de um relato feito no celular.
