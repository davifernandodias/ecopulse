# Escopo

## Produto

**EcoPulse** é um aplicativo móvel em que a pessoa abre um mapa, explora qualquer região do mundo e vê risco ambiental urbano naquela vista: calor, qualidade do ar, alagamento e via obstruída.

O celular faz os dois papéis do enunciado: relata o que a pessoa viu e recebe alerta quando entra numa zona de risco.

## Usuário

Um único usuário: o cidadão urbano em deslocamento. O enunciado cita pedestre e condutor. Os dois são a mesma pessoa em momentos diferentes, no mesmo aplicativo. Não há perfil separado de motorista, morador ou órgão público.

O que essa pessoa faz:

- Olha o mapa antes e durante o trajeto.
- Liga e desliga camadas.
- Toca numa região e lê os números.
- Envia um relato com a coordenada do celular.
- Recebe alerta ao se aproximar de um risco.

## Lugar

O mapa é mundial. Dá para arrastar, aproximar e buscar um endereço em qualquer país, no mesmo gesto de um mapa comum.

A apresentação para a banca usa **Ribeirão Preto** como história, porque é concreto: dois clientes abertos na mesma cidade, um relato publicado, um alerta recebido. Se o GPS falhar, o mapa abre em Ribeirão Preto.

Coordenada padrão: latitude `-21.1775`, longitude `-47.8103`.

## Funcionalidades que a banca precisa ver funcionando

As quatro da seção IV do enunciado entram na demo.

| Função | O que está visível |
| --- | --- |
| Mapa e camadas | Calor, qualidade do ar, alagamento e via obstruída, cada uma ligável |
| Relato colaborativo | Botão de relato, GPS preenchido sozinho, tipo e gravidade |
| Alerta de proximidade | Faixa no app quando o cliente entra na área de um risco |
| Offline | Relato gravado sem rede e enviado quando a rede volta |

O núcleo da demo, na ordem em que a banca entende, é o mapa com as camadas e o alerta chegando no segundo cliente.

## Dentro do escopo técnico

- App React Native (Expo) no celular físico e no navegador.
- Dois clientes ao mesmo tempo: celular e navegador, ou dois celulares.
- API HTTP e WebSocket em Node.js.
- RabbitMQ com retry e fila de mensagens mortas.
- PostgreSQL com PostGIS.
- Redis para cache de leitura e para espalhar o alerta entre conexões.
- Índice geoespacial H3.
- Docker Compose na máquina local.
- Clima e ar consultados na Open-Meteo, com cache.
- Alagamento e via obstruída criados só pelo relato.

## Fora do escopo

- Produção, nuvem paga, domínio, loja de aplicativo.
- Conta de usuário com senha, recuperação de e-mail e perfil social.
- Roteamento com curva a curva (tipo navegação do Google Maps). O enunciado cita roteamento preventivo; nesta versão o alerta diz o risco e a distância, e o mapa mostra o ponto. Traçar a rota desvio fica registrado como evolução, não como entrega.
- Cluster real de Redis, Kafka e vários nós em máquinas diferentes. O desenho distribuído existe no código (filas, retry, DLQ, cache, pub/sub). Localmente cada infraestrutura sobe como um container.
- Notificação push remota com o aplicativo fechado (Firebase). O alerta da demo dispara com o aplicativo aberto ou em segundo plano imediato, via WebSocket. Push remoto fica como evolução, citada no relatório sem ser vendida como pronta.
- Foto obrigatória no relato. O relato leva tipo, gravidade, texto curto e GPS. Foto pode entrar depois se sobrar tempo.
- Previsão de vários dias. O mapa mostra a condição atual.

## Critério de pronto da disciplina

A demo local percorre o roteiro de `08-roteiro-demo.md`. O relatório ABNT descreve esta mesma arquitetura, sem tecnologias que não estejam em `02-decisoes.md`.
