# Histórico

Registro curto do que foi decidido e do que saiu diferente do plano. Entrada nova no topo.

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
