# 07 — Aplicativo: telas, estados e componentes

As telas estão no PDF `EcoPulse_Telas` (14 telas, cada uma com uma nota). Este arquivo diz **como transformá-las em componentes** e onde cada requisito aparece. Tamanho de referência: 390 × 844 px (celular). Fonte **DM Sans** (400, 500, 700).

## Estrutura do app [PROPOSTA]

Só **duas telas de verdade**; o resto é estado do mapa:

| Tela real | Conteúdo |
|---|---|
| **Mapa** (raiz) | Mapa, chips de camadas, legenda, atribuição, botão "Relatar", faixa de alerta/aviso, ficha (painel inferior), lista "Meus relatos" |
| **Novo relato** | Formulário de relato (abre por cima do mapa; botão voltar) |

Navegação simples (pilha com `expo-router` ou `react-navigation`): Mapa → Novo relato → (sucesso) volta ao Mapa com aviso "Relato enviado". Fichas, alertas e avisos são **componentes sobre o mapa**, não telas separadas.

## Telas do PDF × componentes × requisitos

| # | Tela | Estado / componente | Requisitos |
|---|---|---|---|
| 1 | Mapa e camadas | Mapa + 4 chips (Qualidade do ar, Calor, Alagamento, Via obstruída), legenda, atribuição, botão "Relatar" | RF01–RF04, RNF04, RNF05, UC01 |
| 2 | Mapa sem GPS | Mapa em Ribeirão Preto + aviso "Sem localização: mostrando Ribeirão Preto"; sem ponto azul | RF01, UC01 |
| 3 | Calor e célula sem dado | Camada Calor ligada; célula sem dado = contorno tracejado e rótulo "Sem dado da Open-Meteo" | RF02, RNF03, RNF05 |
| 4 | Atualizando camada | Aviso "Atualizando camada" enquanto `atualizando: true`; mapa continua navegável | UC01 (alternativo) |
| 5 | Ficha da célula | Painel inferior: Temperatura, Qualidade do ar (AQI), Horário da leitura, Fonte; botão X | RF04, UC02 |
| 6 | Ficha do incidente | Painel: tipo, Gravidade, Situação "Confirmado", "Relatado há N minutos"; botão X | RF04, RF07, UC02 |
| 13 | Ficha do incidente recebido | Mesmo painel com Situação "Recebido" | RF04, RF07, UC02 |
| 7 | Novo relato | Tipo (2 botões), Gravidade (3), Descrição opcional, linha "Localização por GPS", nota "Sem login…", botão "Enviar relato" | RF05, RNF01, UC03 |
| 8 | Relato recusado | Mesmo formulário com faixa "Relato não enviado" + texto da API; dados mantidos | RF06, UC03 (alt.) |
| 9 | Relato enviado | Volta ao mapa com aviso "Relato enviado — Ele aparece no mapa dos outros usuários em instantes." | RF05, RF09, UC03 |
| 10 | Alerta de incidente | Faixa no topo: "Alerta de {tipo}", texto, botões "Ver local" e "Dispensar por 30 min" | RF08, RF09, RNF08, RNF09, UC05 |
| 11 | Alerta de qualidade do ar | Mesma faixa, texto de AQI | RF08, UC05 |
| 14 | Alerta de calor | Mesma faixa, texto de temperatura | RF08, UC05 |
| 12 | Sem conexão | Faixa "Sem conexão", aviso "Relato guardado no aparelho…", lista "Meus relatos" (Pendente / Enviado / Falhou + "Tentar de novo") e botão "Novo relato" | RF10, UC04 |

## Comportamento de cada componente

**Layout do mapa, de cima para baixo (tela 1)** — a 16 px das bordas:
1. **Campo de busca** "Buscar endereço" (branco, 52 px de altura, raio 16, ícone de lupa, texto 16 px).
2. **Chips de camada** (4, em duas linhas): Qualidade do ar, Calor, Alagamento, Via obstruída.
3. **Avisos** logo abaixo dos chips, em "pílula" branca com ícone: "Sem localização: mostrando Ribeirão Preto" (tela 2) e "Atualizando camada" com ícone girando (tela 4). O aviso de sucesso do relato é um cartão verde `#0B5D4E` (tela 9).
4. **Mapa** ocupando o resto.
5. **Legenda** (canto inferior esquerdo, 210 px de largura, acima da atribuição) e **botão "Relatar"** (canto inferior direito).
6. **Atribuição** "Clima e ar: Open-Meteo" (canto inferior esquerdo, 11 px).

**Quando há faixa de alerta** (telas 10, 11, 14), ela ocupa o lugar do campo de busca no topo (20 px da borda) e os chips descem para baixo dela. **Com a ficha aberta** (telas 5, 6, 13), o painel cobre a parte de baixo e a legenda e o botão "Relatar" ficam escondidos. **Sem conexão** (tela 12) mostra só a faixa cinza, o aviso e o cartão "Meus relatos" por cima do mapa (sem chips nem botão "Relatar").

**Chips de camada** — 4 botões independentes (`aria-pressed`, ícone de check quando ligado, altura 44 px). **Estado inicial, como nas telas: Qualidade do ar, Alagamento e Via obstruída ligados; Calor desligado.** Ligar/desligar só mostra ou esconde a camada (não precisa nova chamada). Qualidade do ar e Calor usam as mesmas células H3; se **as duas** estiverem ligadas, desenhar o Calor como preenchimento e a Qualidade do ar como contorno colorido de 4 px, e mostrar as duas legendas empilhadas [PROPOSTA, D17].

**Mapa**
- Abre na posição do GPS; sem permissão/sinal → `REGIAO_PADRAO` (Ribeirão Preto) + aviso da tela 2. Ponto azul `#1D6FB8` com halo (opacidade 0,22) na posição do usuário.
- Ao terminar de mover/zoom (*debounce* ~500 ms): `GET /camadas` com o retângulo visível **e** `inscrever` no WebSocket com o mesmo retângulo.
- Zoom mínimo tal que o retângulo caiba em `LIMITE_CELULAS_PEDIDO`; se a API responder `area_grande`, mostrar "Aproxime o mapa para ver as camadas.".
- Células H3: polígonos com as cores de `06-integracoes-externas.md` (seção 4). Pontos: **alagamento** = círculo azul `#1B5E9B` com gota branca; **via obstruída** = losango `#12261F` com traço branco (tamanho ~30 px, borda branca 3–4 px).
- Toque numa célula → ficha da célula (tela 5). Toque num ponto → ficha do incidente (tela 6 ou 13, conforme `situacao`).
- Legenda no canto inferior esquerdo, **acima** da atribuição, sem sobrepor o botão "Relatar": título "Qualidade do ar (AQI)" ou "Calor (temperatura)", barra de gradiente com "Bom → Ruim" ou "Menor → Maior" e, na camada de ar, a chave dos pontos ("● Alagamento  ◆ Via"); na de calor aparece também "○ Sem dado da Open-Meteo" (círculo tracejado). Atribuição "Clima e ar: Open-Meteo" no canto inferior esquerdo (e a do mapa base, ver 06).
- Seleção: a célula tocada ganha contorno preto grosso (tela 5); o ponto tocado ganha anel escuro (tela 6).

**Ficha** (painel inferior, cantos superiores arredondados 24 px, alça cinza). Título da ficha da célula: "Qualidade do ar e calor"; título da ficha do incidente: o tipo ("Alagamento" ou "Via obstruída"). Valores no formato "31 °C", "AQI 162", horário local `HH:mm` (ex.: "14:30"), "Relatado há 12 minutos". — dados vêm do que já foi carregado em `/camadas`; não precisa nova chamada. "Relatado há" = diferença entre agora e `ultimo_relato_em`, em minutos ou horas. Botão X (44 × 44) fecha.

**Realce no mapa durante um alerta de incidente (tela 10)** — círculo tracejado `#7A2E0B` de **500 m** de raio em volta do usuário (fundo levemente acinzentado) e o ponto do incidente com **anel `#7A2E0B`** em volta do ícone. Nos alertas de AQI/calor (telas 11 e 14) a célula alertada recebe contorno tracejado `#7A2E0B`, 4 px.

**Faixa de alerta** (topo, cor `#7A2E0B`, texto branco, `role="alert"`)
- Aparece ao receber `alerta` (ou `alertas_recentes`) pelo WebSocket, se a chave do alerta **não** estiver dispensada (R7).
- "Ver local": centraliza o mapa no alerta e abre a ficha (incidente) ou a célula.
- "Dispensar por 30 min": guarda a chave com expiração de 30 min e fecha a faixa.
- Vários alertas: mostra o mais recente; os demais ficam na fila e aparecem depois de dispensar. A faixa só some ao dispensar (não fecha sozinha quando o usuário sai do raio).
- Distância do texto: arredondar para o múltiplo de 50 m mais próximo (mínimo 50 m).
- Se o app está em segundo plano imediato, o WebSocket continua; **com o app fechado não há alerta** (push é versão futura).

**Faixa "Sem conexão"** (cinza-escuro `#34423C`) — aparece quando `netinfo` informa sem internet **ou** o WebSocket está desconectado há mais de alguns segundos. O mapa mostra a última camada em cache (opacidade 0,40 nas células). Ao voltar a rede: some a faixa, reconecta o WebSocket (com `ultimo_alerta_em`) e envia a fila local em ordem.

**Formulário de relato (tela 7)**
- Tipo: dois botões (um selecionado, borda `#0B5D4E` 2 px, fundo `#E0EFEA`). Gravidade: Baixa / Média / Alta. Descrição: até 280 caracteres.
- GPS: pega a posição ao abrir e de novo ao enviar; sem GPS → mensagem "Ative a localização para relatar." e botão desabilitado (o relato exige coordenadas).
- Metadados registrados sozinhos: `enviado_em` e `precisao_m` (do GPS). Mostrar a nota "Sem login: o aparelho é identificado por um código. A data, a hora e a precisão da localização são registradas automaticamente."
- "Enviar relato": grava na fila local como `pendente` → tenta enviar → `202`: volta ao mapa com o aviso de sucesso; `422`/`429`: tela 8 (faixa "Relato não enviado" + `mensagem` da API, formulário preenchido); sem rede/`503`: volta ao mapa com o aviso "Relato guardado no aparelho. Será enviado quando a rede voltar."

**Meus relatos (tela 12)** — lista a partir de `relatos_locais`: "{Tipo} · {Gravidade}" e estado (Pendente em cinza, Enviado em verde `#0B5D4E`, Falhou em vermelho `#A12B0B` + botão "Tentar de novo"). Abre por um botão/ícone no mapa [PROPOSTA]; aparece sozinha quando há relato pendente.

## Textos exatos da interface (copiar das telas)

| Onde | Texto |
|---|---|
| Busca | placeholder "Buscar endereço" |
| Chips | "Qualidade do ar", "Calor", "Alagamento", "Via obstruída" |
| Botão do mapa | "Relatar" |
| Atribuição | "Clima e ar: Open-Meteo" |
| Aviso sem GPS | "Sem localização: mostrando Ribeirão Preto" |
| Aviso de carregamento | "Atualizando camada" |
| Célula sem dado | "Sem dado da Open-Meteo" |
| Ficha da célula | "Qualidade do ar e calor" · "Temperatura" · "Qualidade do ar" · "Horário da leitura" · "Fonte" |
| Ficha do incidente | tipo · "Gravidade" (Baixa/Média/Alta) · "Situação" (Recebido/Confirmado) · "Relatado há" |
| Formulário | "Novo relato" · "Tipo de ocorrência" · "Gravidade" · "Baixa" "Média" "Alta" · "Descrição (opcional)" (placeholder "Ex.: água acima da calçada na esquina") · "Localização por GPS" · "Sua posição atual vai junto com o relato." · "Enviar relato" |
| Nota do formulário | "Sem login: o aparelho é identificado por um código. A data, a hora e a precisão da localização são registradas automaticamente." |
| Recusa (tela 8) | título "Relato não enviado" · "Você atingiu o limite de 30 relatos por hora. Tente novamente mais tarde." |
| Sucesso (tela 9) | "Relato enviado" · "Ele aparece no mapa dos outros usuários em instantes." |
| Alerta de incidente | título "Alerta de alagamento" (ou "… de via obstruída") · "Incidente de gravidade alta a cerca de 400 m de você." |
| Alerta de ar | "Alerta de qualidade do ar" · "O ar na sua região está ruim (AQI acima de 150)." |
| Alerta de calor | "Alerta de calor" · "A temperatura na sua região está acima de 35 °C." |
| Botões do alerta | "Ver local" · "Dispensar por 30 min" |
| Sem conexão | título "Sem conexão" · "Mostrando a última camada consultada. Os relatos pendentes serão enviados quando a rede voltar." |
| Relato guardado | "Relato guardado no aparelho. Será enviado quando a rede voltar." |
| Meus relatos | "Meus relatos" · "{Tipo} · {Gravidade}" · "Pendente" · "Enviado" · "Falhou" · "Tentar de novo" · "Novo relato" |

## Tokens de design (das telas)

| Uso | Valor |
|---|---|
| Texto principal | `#12261F` |
| Texto secundário | `#4A5D55` |
| Primária (botões, chips ligados) | `#0B5D4E` |
| Faixa de alerta | `#7A2E0B` |
| Faixa "sem conexão" | `#34423C` |
| Erro | `#A12B0B` |
| Fundo de telas de formulário | `#F4F6F3` |
| Fundo do mapa / áreas verdes / água | `#E4EAE1` / `#CFE0C8` / `#C5DCE8` |
| Borda / divisor | `#C9D3CC` / `#DCE3DE` |
| Seleção | `#E0EFEA` |
| Ponto do usuário | `#1D6FB8` |
| Alagamento / via obstruída | `#1B5E9B` / `#12261F` |

Medidas: alvo de toque ≥ **44 px**; chips 44 px de altura, raio 22; botão principal 56 px de altura, raio 28; botão "Relatar" flutuante 56 px; faixa de alerta raio 18 com sombra; ficha com raio superior 24; título de tela 26/700; título de faixa 19/700; texto 15–17.

## Acessibilidade mínima
Todos os botões com `accessibilityLabel`, contraste conforme os tokens acima, estados que não dependam só de cor (rótulo "Pendente/Enviado/Falhou", ícone no chip ligado).
