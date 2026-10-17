# Roteiro da demo

Apresentação em máquina local e celular físico, na mesma rede Wi-Fi. O navegador do notebook entra como segundo cliente. Se os dois tiverem celular, os dois celulares substituem o navegador.

Antes de falar com a banca, os containers estão no ar e o app já abriu uma vez (cache de clima quente deixa a demo mais calma).

## Preparo

1. `docker compose` na pasta `infra` sobe banco, Redis, RabbitMQ, API e os dois workers.
2. App aponta para `http://IP-DA-MAQUINA:PORTA`, nunca para `localhost`, no celular.
3. Celular e notebook na mesma Wi-Fi. Dados móveis do celular desligados, senão ele não acha o IP local.
4. Painel do RabbitMQ aberto numa aba, sem ser o foco. Serve para mostrar fila e DLQ se a banca pedir a estrutura.
5. Mapa dos dois clientes em Ribeirão Preto.

## História (cerca de 5 a 8 minutos)

1. Abrir o app no celular. Mostrar mancha de calor e de ar em Ribeirão Preto. Tocar numa célula e ler °C e AQI, com a linha da Open-Meteo.
2. Desligar e ligar um chip, para mostrar que a camada é independente.
3. Buscar outro lugar qualquer, rápido, para mostrar que o mapa não está preso numa cidade. Voltar para Ribeirão Preto.
4. No celular, relatar um alagamento de gravidade alta no ponto atual.
5. No navegador (ou no segundo celular), o pino aparece e a faixa de alerta dispara, sem atualizar a página na mão.
6. Abrir o painel do RabbitMQ só o suficiente para mostrar que o relato passou por fila. Se der tempo, mostrar a linha no banco.
7. Modo avião no celular, criar uma via obstruída, mostrar "guardado neste celular", tirar o modo avião, mostrar o pino surgindo no outro cliente.

## Se algo falhar na hora

- Clima vazio: o worker ainda está na primeira consulta. Esperar e mostrar o incidente, que não depende da Open-Meteo.
- Celular não conecta: conferir Wi-Fi e IP. O navegador em `localhost` ainda demonstra o segundo cliente se a API estiver na própria máquina; o celular é que precisa do IP.
- Fila parada: mostrar a mensagem na DLQ e explicar retry. Isso também demonstra tolerância a falhas, desde que a causa seja dita com honestidade.

## O que não improvisar na frente da banca

- Não dizer que o alagamento veio de sensor oficial ou de API de enchente.
- Não dizer que há cluster de Redis se só tem um container.
- Não dizer que o push chega com o app fechado e o processo morto.
- Não prometer rota desvio.
