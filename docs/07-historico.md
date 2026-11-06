# Histórico

Registro curto do que foi decidido e do que saiu diferente do plano. Entrada nova no topo.

## 2026-11-05 — M1 a M7 implementados (Davi + sessão de IA)

Feito:

- Infra no Docker Compose, SQL inicial, `.env.example`, contratos, api, worker-relatos, worker-clima, WebSocket e app Expo.
- `npm run teste:fluxo` passa: saúde, 202/400, pino pelo WebSocket, alerta a 100 m, confirmação com 2 relatos, payload quebrado na DLQ. Retry testado parando o PostgreSQL no meio: retenta e grava quando o banco volta.
- No navegador, com dois clientes isolados: A relata alagamento alto, B (a ~150 m) recebe pino e faixa sem atualizar. Com a api fora do ar, A guarda o relato, mostra "Guardado neste celular" e a fila envia sozinha quando a api volta; B recebe o alerta. Ficha da célula com nome do lugar, °C, AQI e atribuição.

Diferente do plano:

- **Mapa do celular:** `@maplibre/maplibre-react-native` não roda no Expo Go e exigiria build nativo (Android Studio/SDK/JDK ou conta EAS). Decisão do Davi: `maplibre-gl` dentro de `react-native-webview`, a mesma página do navegador. Continua MapLibre, sem Google e sem chave. GPS, SQLite e WebSocket seguem nativos. `02-decisoes.md` atualizado.
- **Navegador sem SQLite:** a fila offline do navegador usa `localStorage` com a mesma interface. O celular usa SQLite.
- **Open-Meteo por célula res. 6:** ver `04-arquitetura.md`, "Detalhes que a implementação fixou".
- **Posição simulada** por toque longo, para ensaiar o alerta no navegador sem GPS. Documentada em `03-ux.md`.
- **Portas do RabbitMQ** 5673/15673 no host, por conflito com um RabbitMQ local.
- **Escala de cor do calor** ganhou paradas intermediárias (24 °C azul-claro, 31 °C laranja), dentro da regra do `03-ux.md`. Sem isso a faixa de 22 a 26 °C ficava cinza e sumia no mapa.

Ainda falta:

- Abrir no celular físico pelo Expo Go (M6.1) e testar o modo avião de verdade (M7.3). Depende de liberar as portas 3000 e 8081 no firewall do Windows; o Wi-Fi da máquina está como rede pública.
- Avaliar no ensaio se a mancha de ar (hexágono interno) e a de calor juntas ficam legíveis no celular.

## 2026-10-17 — Especificação inicial

Participantes da conversa: Davi. Vinicius ainda não passou por estes arquivos.

Fechado a partir do enunciado da APS e das respostas do Davi:

- Equipe de dois, os dois usando IA. A documentação é o contexto compartilhado.
- As quatro funcionalidades da seção IV entram na demo, não só no papel.
- Mapa mundial, no gesto de explorar. A história da banca é Ribeirão Preto.
- Usuário único: cidadão em deslocamento. O enunciado fala em pedestre e condutor; não serão apps separados.
- Núcleo visível: mapa com as quatro camadas e alerta no segundo cliente.
- Calor e ar vêm da Open-Meteo. Alagamento e via obstruída vêm do relato. Isso foi explicado porque a separação não estava clara.
- App em React Native (Expo), backend em Node.js, celular físico e também navegador.
- Mapa com MapLibre, sem Google Maps, para não depender de chave ao arrastar o mundo.
- RabbitMQ, PostGIS, Redis de um nó, WebSocket. Push com app fechado e rota desvio ficam de fora da implementação e entram no relatório só como evolução.
- Documentos criados em `ecopulse/docs/`. Código da aplicação ainda não começou.
- Template do relatório escrito da APS criado para o Vinicius em `docs/relatorio/TEMPLATE-APS.md`.

Ainda em aberto, sem travar o desenvolvimento:

- Sobrenome, RA, polo e nomes completos na capa.
- Data de entrega e de apresentação.
- Quem pega a primeira tarefa de código quando o repositório existir.
