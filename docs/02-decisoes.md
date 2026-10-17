# Decisões fechadas

Mudou alguma linha daqui: registrar em `07-historico.md` e ajustar o template do relatório se o fato técnico mudou.

## Produto e demo

| Tema | Decisão |
| --- | --- |
| Nome | EcoPulse |
| Disciplina | DSD, UNIP, Ciência da Computação, 2026/2 |
| Equipe | Davi e Vinicius. Os dois implementam com apoio de IA |
| Mapa | Mundial, com busca e gesto de arrastar e aproximar |
| Cidade da história | Ribeirão Preto. Fallback de GPS também é Ribeirão Preto |
| Usuário | Cidadão urbano em deslocamento (pedestre e condutor no mesmo app) |
| Camadas | Calor, qualidade do ar, alagamento, via obstruída. As quatro entram |
| Núcleo da banca | Mapa com indicativos e alerta no segundo cliente |
| Ambiente | Só local. Sem deploy |

## Stack

| Camada | Escolha | Motivo |
| --- | --- | --- |
| App | React Native com Expo | Davi já usou React Native. Expo abre no celular físico e no navegador, então a demo tem dois clientes sem obrigar dois aparelhos |
| Mapa | MapLibre | Mesmo gesto de um mapa mundial, sem chave e sem cobrança por arrastar o mapa. Tiles gratuitos (OpenFreeMap). Atribuição visível no canto |
| Mapa nativo | `@maplibre/maplibre-react-native` | Celular |
| Mapa web | `maplibre-gl` | Navegador. A lógica de camadas é compartilhada; o componente de mapa troca pela plataforma |
| Backend | Node.js (versão LTS atual no momento da implementação) + Express | Pedido do grupo. Express deixa o fluxo legível no relatório de código |
| Mensageria | RabbitMQ | Cobre desacoplamento, retry e DLQ com um container. É uma das opções do enunciado |
| Banco | PostgreSQL + PostGIS | Ponto geográfico, consulta por retângulo e por raio |
| Cache e fan-out | Redis, um container | Leitura quente do mapa e pub/sub do alerta. O relatório descreve o papel de cache distribuído; a demo sobe um nó |
| Tempo real | WebSocket (`ws`) no processo da API | O alerta chega no cliente sem o usuário atualizar a tela |
| Offline | SQLite no app (`expo-sqlite`) | Fila local de relatos |
| Empacotamento | Docker Compose | API, workers, RabbitMQ, PostgreSQL e Redis |
| Clima e ar | Open-Meteo | Gratuita, sem chave, cobertura mundial. Atribuição obrigatória na ficha do lugar |

Google Maps ficou de fora. O gesto pedido (abrir e explorar o mundo) está coberto. Arrastar mapa na Google consome cota de carregamento; para a faculdade o MapLibre evita conta e cartão.

## Como o trabalho se divide em processos

Quatro processos de aplicação, além da infraestrutura:

1. **api** — HTTP e WebSocket. Não processa o relato até o fim. Valida o mínimo, publica o evento e responde.
2. **worker-relatos** — consome o relato, valida de novo, grava no PostGIS, atualiza o Redis, emite o alerta.
3. **worker-clima** — consome pedido de retângulo do mapa, consulta a Open-Meteo, grava cache.
4. **mobile** — mapa, relato, fila offline, WebSocket.

Contratos das mensagens ficam num pacote compartilhado (`packages/contratos`) para a API e os workers não divergirem.

## Identidade do usuário

Sem senha. Na primeira abertura o app gera um UUID e guarda no SQLite. O relato pode levar um nome de exibição opcional. Isso basta para a demo e para limitar spam por dispositivo.

## Validação do relato

O worker só publica no mapa se:

- tipo é `alagamento` ou `via_obstruida`;
- gravidade é `baixa`, `media` ou `alta`;
- latitude e longitude existem e estão em faixa válida;
- o dispositivo não passou de 30 relatos na última hora.

Confirmação simples, sem votação complicada: dois relatos do mesmo tipo na mesma célula H3, em até 2 horas, marcam o incidente como `confirmado`. O primeiro já aparece no mapa e já pode alertar. O selo muda de `recebido` para `confirmado`.

Incidente some do mapa 6 horas depois do último relato daquela célula e daquele tipo.

## Alerta

Dispara quando a posição do cliente está a até **500 metros** de um incidente ativo de gravidade `media` ou `alta`, ou quando a célula H3 visível da posição está com qualidade do ar acima do limiar ruim (AQI maior que 150) ou temperatura maior que 35 °C.

O cliente manda a posição em intervalo curto enquanto o mapa está aberto. A API consulta os riscos em cache e, no caminho inverso, o worker avisa as conexões inscritas naquela região quando nasce um incidente novo.

## Geo

- Calor e ar: células **H3 resolução 7** (vizinhança de alguns quilômetros).
- Incidente: célula **H3 resolução 9** para agrupar relatos próximos, mais o ponto GPS original para o pino.
- Leitura do mapa: sempre pelo retângulo visível (`bbox`), nunca “o planeta inteiro” num request.

## Consistência

Escrita do relato: fila, depois PostgreSQL, depois Redis. Leitura do mapa: Redis primeiro; se a chave não existe, PostgreSQL, e a resposta de clima pode chegar um instante depois pelo WebSocket. Isso é a consistência eventual pedida no enunciado.

## Árvore prevista do código

Ainda não criar essa árvore até a tarefa correspondente em `06-plano-de-acao.md`.

```text
ecopulse/
  apps/
    mobile/
    api/
    worker-relatos/
    worker-clima/
  packages/
    contratos/
  infra/
    docker-compose.yml
  docs/
```

## Evoluções citadas no relatório, sem implementar agora

- Push remoto com o app fechado.
- Rota desvio desenhada no mapa.
- Foto no relato.
- Mais de um nó de Redis ou de serviço, em máquinas separadas.
