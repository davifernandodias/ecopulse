# 10 — Decisões tomadas (fora do relatório)

O relatório não define estes pontos. **Em 02/11/2026 o grupo decidiu adotar a recomendação padrão de todos eles** (coluna "Decidido"). O Claude Code deve segui-las sem perguntar de novo. Se algo se mostrar inviável na prática (principalmente D01 e D11), pare, explique o motivo e proponha a alternativa listada.

| # | Decisão | Recomendação padrão | Alternativas / observação | Decidido |
|---|---|---|---|---|
| **D01** | Como rodar o MapLibre no celular **e** no navegador (Expo) | Componente `Mapa` com duas implementações por plataforma: `maplibre-react-native` (development build) no celular e `maplibre-gl` no navegador, mesma interface. **Fazer o spike do mapa primeiro.** | `WebView` com `maplibre-gl` (funciona no Expo Go, mas é mais limitado). Se o development build for inviável no prazo, usar a alternativa. Ver `03` | **Recomendação adotada** |
| **D02** | Resolução H3 | `H3_RES_CLIMA = 7`, `H3_RES_INCIDENTE = 8` | Res 8 para clima aumenta muito as chamadas à Open-Meteo; res 9 para incidentes torna difícil dois relatos caírem na mesma célula | **Recomendação adotada** |
| **D03** | Linguagem | TypeScript em tudo (API, workers, app, pacote compartilhado) | JavaScript puro, se o grupo preferir menos configuração. Decidir antes de criar o repositório | **Recomendação adotada** |
| **D04** | Identificação do aparelho | `dispositivo_id` = UUID v4 gerado no primeiro uso, guardado no SQLite | Id do sistema do aparelho (pior para privacidade) | **Recomendação adotada** |
| **D05** | Onde o limite de 30 relatos/h é conferido | API (Redis, janela deslizante, não bloqueia se o Redis estiver fora) **e** worker (banco, autoridade) | Só no worker — mas a tela 8 não poderia mostrar a recusa na hora | **Recomendação adotada** |
| **D06** | Dois relatos **do mesmo aparelho** confirmam o incidente? | Sim, não exigir aparelhos diferentes (facilita testar e demonstrar com um celular) | Exigir `dispositivo_id` diferentes (mais robusto contra relato falso, mais difícil de demonstrar) | **Recomendação adotada** |
| **D07** | Gravidade do incidente | A **maior** gravidade entre seus relatos | A do último relato | **Recomendação adotada** |
| **D08** | Quando gerar o alerta de incidente | Uma vez, quando o incidente está **confirmado** e com gravidade média/alta (índice único por incidente) | Alertar já no 1º relato (contraria a nota da tela 9: "O alerta só é gerado quando o incidente é confirmado") | **Recomendação adotada** |
| **D09** | Janela de "alertas recentes" na reconexão | 60 minutos | Até 6 h (enquanto o incidente está ativo) | **Recomendação adotada** |
| **D10** | Limite de células por pedido | 150 células H3 res 7 + zoom mínimo no app | Valor maior se o mapa precisar abrir mais amplo | **Recomendação adotada** |
| **D11** | Tiles do mapa e busca de endereço | OpenFreeMap (tiles) e Nominatim (busca), ambos sem chave; conferir termos de uso e ter plano B | Estilo local simples; geocodificação da Open-Meteo (só cidades/bairros) | **Recomendação adotada** |
| **D12** | Onde roda a demonstração | Tudo local (Docker Compose no notebook), celular e navegador na mesma rede Wi-Fi | Hospedar em nuvem (fora do escopo) | **Recomendação adotada** |
| **D13** | Implementação dos retries | Filas de espera com TTL (`relatos.espera.2s/4s/8s`) que devolvem a mensagem à fila principal | Plugin de mensagens atrasadas do RabbitMQ (exige instalar plugin) | **Recomendação adotada** |
| **D14** | Estado inicial das camadas | **Como nas telas:** Qualidade do ar, Alagamento e Via obstruída ligados; Calor desligado | Todas ligadas | **Recomendação adotada** |
| **D15** | Cronograma do Quadro 4 x situação real (o repositório começou vazio em 02/11) | Seguir o calendário de 3 semanas de `09-plano-de-entrega.md`, com trabalho em paralelo e lista do que cortar primeiro | O texto do relatório (seções 4.1 e 4.4) descreve os seis ciclos como já cumpridos: **o grupo deve ajustar as datas e a descrição para refletir o que de fato foi feito** | **Recomendação adotada** |
| **D16** | Mapa em modo "Sem conexão" | Mostra a última camada em cache (células com opacidade 0,40) e os pontos; tiles do mapa base podem não carregar | Cache de tiles (fora do escopo) | **Recomendação adotada** |
| **D17** | Qualidade do ar e Calor ligados ao mesmo tempo | Permitido (RF04: camadas independentes): Calor como preenchimento e Qualidade do ar como contorno de 4 px, com as duas legendas | Fazer as duas camadas de clima mutuamente exclusivas (mais simples, mas contraria "independentes") | **Recomendação adotada** |

## Pendências do **documento** (não do código) — o grupo resolve

- Texto em verde antigo no relatório (RNF09, RNF10, metadados do RF05, menções ao UC03/UC05): passar para preto, no padrão do restante.
- Frases "fora desta versão": manter ou remover.
- Preencher Resumo, seções 6, 7, 8, Referências adicionais (Open-Meteo, MapLibre, H3, se citadas) e Ficha de APS (Anexo A).
- Atualizar o Sumário e as listas de quadros e figuras ao final.
