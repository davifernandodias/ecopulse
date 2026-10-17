# Dados de cada camada

O mapa mistura duas origens. As duas aparecem juntas, mas não nascem do mesmo lugar.

## Clima e qualidade do ar — API pública

Temperatura e ar já são medidos por serviços meteorológicos e publicados para o mundo. O EcoPulse não tem estação própria. O `worker-clima` pergunta a condição atual do pedaço de mapa que alguém está vendo e guarda a resposta por alguns minutos.

Serviço: **Open-Meteo**.

- Temperatura: API de previsão, variável atual `temperature_2m`, em °C.
- Ar: API de qualidade do ar, índice americano (US AQI).
- Sem chave.
- Uso desta versão: projeto acadêmico, com cache, pedido só das células visíveis que estiverem vencidas.
- A ficha do lugar mostra a atribuição Open-Meteo.

Por isso o calor e o ar existem em Ribeirão Preto, em outra cidade ou em outro país assim que alguém abre aquela região. A primeira abertura da região pode levar um instante, porque o pedido passa pela fila. A segunda abertura dentro de 10 minutos sai do Redis.

O que não fazemos com essa API:

- Não baixar o planeta inteiro.
- Não guardar série histórica longa. Só a leitura atual e o necessário para explicar a arquitetura no relatório.
- Não prometer precisão de quarteirão. A célula H3 resolução 7 é uma vizinhança, e a fonte também é um modelo em grade, não um termômetro na esquina.

## Alagamento e via obstruída — relato da pessoa

Não há API gratuita e mundial que diga, agora, "esta rua em Ribeirão está alagada" ou "esta via está fechada". Inventar essa API deixaria a demo vazia ou com dado falso permanente.

Quem alimenta essas duas camadas é o usuário, pelo botão Relatar. O enunciado chama isso de crowdsourcing: o celular vira o sensor.

Consequência prática:

- Ao abrir Ribeirão Preto pela primeira vez, calor e ar podem aparecer sozinhos.
- Alagamento e via só aparecem depois que alguém relatar.
- Na banca, o relato é feito ao vivo, de um cliente para o outro. Esse é o momento distribuído da apresentação.

O grupo pode, num script de demo, deixar dois ou três relatos já gravados no banco para o mapa não abrir em branco. O relato ao vivo continua obrigatório. Dado de enchente inventado em massa, fingindo ser sensor oficial, fica de fora.

## O que cada um responde na prática

| Pergunta | Resposta |
| --- | --- |
| De onde vem o número da temperatura? | Open-Meteo, via worker, cache no Redis |
| De onde vem o AQI? | Open-Meteo Air Quality, mesmo caminho |
| De onde vem o alagamento? | `POST /relatos` de um celular |
| De onde vem a via obstruída? | `POST /relatos` de um celular |
| Dá para ver outra cidade? | Sim. Clima e ar são buscados para o retângulo novo. Incidentes só se alguém tiver relatado ali |

## Geocodificação da busca

Busca de endereço: Nominatim (OpenStreetMap), um resultado por consulta, com identificação do app no User-Agent conforme a política de uso deles. Sem guardar a busca. Se o Nominatim falhar, a pessoa ainda navega o mapa no gesto.

## O que o celular guarda

SQLite local:

- `dispositivo` — UUID e nome de exibição.
- `outbox` — relatos ainda não aceitos pela API.
- `dispensados` — alertas que a pessoa fechou, com prazo de 30 minutos.
- `camadas_cache` — última resposta por retângulo, para olhar offline o que já tinha aberto.
