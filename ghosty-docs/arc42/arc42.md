# Ghosty: documentação de arquitetura (arc42)

Projeto acadêmico da disciplina de Soluções Cloud.

**Equipe:** Amanda Fila de Lima · Carlos Leonardo Garcia Pscheidt · Rafael Della · Gustavo Yuri

> Para gerar o PDF da entrega (com o C4 em anexo e os diagramas desenhados): `cd ghosty-docs && npm run arc42:pdf`, que usa o Chrome em modo headless e grava `dist/arc42/arc42.pdf`.

## Links da entrega

| Item | Link |
|---|---|
| Repositório (GitHub) | https://github.com/Carloslgp/Ghosty_App_Web |
| Pastas: [`ghosty-web`](https://github.com/Carloslgp/Ghosty_App_Web/tree/main/ghosty-web) · [`ghosty-bff`](https://github.com/Carloslgp/Ghosty_App_Web/tree/main/ghosty-bff) · [`ghosty-notes-service`](https://github.com/Carloslgp/Ghosty_App_Web/tree/main/ghosty-notes-service) · [`ghosty-safety-service`](https://github.com/Carloslgp/Ghosty_App_Web/tree/main/ghosty-safety-service) · [`ghosty-functions`](https://github.com/Carloslgp/Ghosty_App_Web/tree/main/ghosty-functions) · [`ghosty-docs`](https://github.com/Carloslgp/Ghosty_App_Web/tree/main/ghosty-docs) | — |
| Frontend | https://delightful-flower-05caf9c0f.6.azurestaticapps.net |
| API Gateway (API Management) | https://apim-notas-oigv.azure-api.net |
| Swagger do API Gateway | [BFF](https://proud-field-09986c10f.3.azurestaticapps.net/swagger.html?spec=apim-web-bff) · [notes-service](https://proud-field-09986c10f.3.azurestaticapps.net/swagger.html?spec=apim-notes-service) · [safety-service](https://proud-field-09986c10f.3.azurestaticapps.net/swagger.html?spec=apim-safety-service) · [Function](https://proud-field-09986c10f.3.azurestaticapps.net/swagger.html?spec=apim-functions) |
| Swagger do BFF | https://app-web-api.graybeach-32f9183a.brazilsouth.azurecontainerapps.io/docs |
| Swagger do notes-service | https://app-notes.graybeach-32f9183a.brazilsouth.azurecontainerapps.io/docs |
| Swagger do safety-service | https://app-core.graybeach-32f9183a.brazilsouth.azurecontainerapps.io/docs |
| Swagger da Azure Function | https://func-notas-oigv.azurewebsites.net/api/docs |
| Swagger dos eventos (AsyncAPI) | https://proud-field-09986c10f.3.azurestaticapps.net/events/ |
| Docker Hub: `ghosty-bff`, `ghosty-notes-service`, `ghosty-safety-service` | https://hub.docker.com/u/oldspiffy (tags `v1` e `v1.1`; a `v1.1` é a que roda na Azure) |
| Página com todos os links e Swaggers | https://proud-field-09986c10f.3.azurestaticapps.net |
| Canvas | [Anexo: Canvas](#anexo-canvas) · [`canvas.pdf`](https://github.com/Carloslgp/Ghosty_App_Web/blob/main/ghosty-docs/canvas/canvas.pdf) |
| Prints (Swaggers, frontend, API Gateway, Docker Hub, CI) | [Anexo: prints do app na Azure](#anexo-prints-do-app-na-azure) |
| Vídeo (YouTube) | _preencher depois da gravação_ |

O comando `bash ghosty-docs/infra/deploy.sh status` imprime todos os links do ambiente. O API Gateway exige a chave de assinatura (`Ocp-Apim-Subscription-Key`) do produto `web-app`, que já vai no front; os serviços são escalados a zero, então a primeira chamada depois de um tempo parado pode levar alguns segundos.

---

## 1. Introdução e objetivos

O **Ghosty** é um app web de segurança pessoal discreto. Por fora, é um bloco de notas comum que funciona de verdade. Por dentro, tem uma área de segurança que só abre com um código digitado na busca. Nela, a pessoa mantém uma rede de apoio e pode pedir ajuda: o sistema monta a mensagem e avisa os contatos, na ordem definida, pelo **Telegram** (bot) ou por uma **página web** aberta pelo contato. Não há telefone, SMS nem WhatsApp.

O Ghosty **não aciona** a polícia nem outros serviços de emergência e não os substitui. Os números 190, 180 e 192 aparecem sempre na área de segurança, só como links.

### Objetivos

| # | Objetivo | Como medir |
|---|---|---|
| O1 | Demonstrar a arquitetura distribuída: microfrontend, API Gateway, BFF, dois microserviços com bancos diferentes, Azure Function e eventos | Todos os componentes no ar com URLs públicas na Azure |
| O2 | Clean Architecture + Vertical Slice com testes de unidade e de arquitetura | CI verde em todos os projetos |
| O3 | Fachada crível e útil de verdade | Criar, editar e buscar notas sem saber que existe outra área |
| O4 | Fluxo de segurança testável de ponta a ponta, com um ensaio que não envia nada | O Teste seguro mostra a linha do tempo completa; um pedido real chega ao Telegram de um contato de teste |

### Stakeholders

| Quem | Interesse |
|---|---|
| Pessoa usuária | Pedir ajuda com discrição e confiança de que a rede vai ser avisada |
| Contato da rede de apoio | Receber o aviso de forma simples, e poder sair quando quiser |
| Professor e avaliação | Ver os requisitos da disciplina atendidos e demonstrados |
| Equipe | Trabalhar em paralelo, com contratos claros entre as frentes |

## 2. Restrições

| Restrição | Consequência |
|---|---|
| Tudo na Azure (assinatura Azure for Students) | APIM, Container Apps, Functions, Azure SQL, Storage, Key Vault e Static Web Apps. O MongoDB Atlas (exigido pelo enunciado) roda num cluster em região Azure |
| Assinatura de estudante: crédito limitado, regiões restritas, alguns tiers bloqueados | Free tier do Azure SQL com pausa automática, APIM Consumption, Container Apps com escala a zero, Static Web Apps Free. Planos B registrados para a Function (Consumption) e o front (site estático do Storage) |
| Desenvolvimento sem Docker | SQLite na máquina local no lugar do SQL Server, Azurite via npm, MongoDB em memória. As imagens são publicadas pelo GitHub Actions |
| Sem telefone, SMS nem WhatsApp | Avisos só pelo Telegram (bot gratuito, sem aprovação) e pela página web do contato |
| Tier Consumption do APIM | Sem `rate-limit-by-key`: o limite por usuário e por IP fica no BFF |
| Enunciado da disciplina | BFF em Node.js com `GET /aggregated-data`, MS1 com MongoDB Atlas, MS2 com Azure SQL, Function com cálculo e enriquecimento, Swagger em todas as APIs, imagens no Docker Hub, arc42, C4 e vídeo |

## 3. Contexto e escopo

Ver o [C4 de contexto](../c4/README.md#1-contexto).

| Vizinho | Entrada | Saída |
|---|---|---|
| Pessoa usuária (navegador ou PWA) | Notas, código de desbloqueio, contatos, mensagem, pedidos de ajuda e check-ins | Fachada, painel de prontidão, linha do tempo dos avisos |
| Contato (navegador) | Aceite ou recusa do convite | Avisos na página do convite (canal web) |
| Telegram Bot API | `/start <token>` e `/parar` (webhook) | Mensagens do bot com o aviso |
| Canais oficiais (190, 180, 192) | — | Apenas links `tel:` |

Fora do escopo: chamar serviços de emergência, gravar áudio ou vídeo, rastrear a localização continuamente, notificação push (registrada como recurso desligado, com o motivo).

## 4. Estratégia da solução

| Tema | Decisão |
|---|---|
| Fachada | App de notas e listas (estilo Keep), com 3 notas de exemplo no cadastro |
| Desbloqueio | Código de 6 a 8 dígitos digitado na busca; o servidor conta as tentativas (5 erros bloqueiam por 15 minutos) e responde sempre igual |
| Front | React + Module Federation: o shell é o host, `notes` é carregado sempre, `safety` só é registrado e baixado depois do desbloqueio |
| Entrada | API Management como gateway único; o BFF recusa chamadas sem o segredo que só o gateway injeta |
| BFF | NestJS: JWT RS256 com JWKS, sessão segura separada (`X-Safety-Token`), `GET /aggregated-data` com 3 fontes em paralelo e prontidão de reserva |
| Dados | MongoDB Atlas para as notas, Azure SQL para conta e rede de apoio; campos sensíveis cifrados com AES-256-GCM |
| Eventos | Storage Queues com transactional outbox; o prazo do check-in é uma mensagem que fica invisível até a hora |
| Avisos | A Function busca os destinos na hora do envio (o evento não leva o chat do Telegram) e grava uma linha do tempo por contato |
| Código | TypeScript em tudo, Clean Architecture + Vertical Slice, contratos OpenAPI e AsyncAPI escritos antes do código |

## 5. Visão de blocos

Ver os [C4 de containers e de componentes](../c4/README.md#2-containers).

| Bloco | Tecnologia | Responsabilidade |
|---|---|---|
| `shell` | React 19, Vite, `@module-federation/vite` | Entrar, cadastro, configurações, busca e desbloqueio, saída rápida, trancamento com a aba oculta, rota pública do convite, PWA |
| remote `notes` | React | Fachada: notas de texto e checklists, cores, etiquetas, fixar, arquivar, lembrete, busca local |
| remote `safety` | React | Painel, rede de apoio, mensagem, pedido de ajuda, check-in, Teste seguro, canais oficiais, ajustes, página do convite |
| API Management | Consumption | Roteamento, `validate-jwt`, CORS, `rate-limit` por produto, segredo do gateway |
| BFF | NestJS | Autenticação, sessão segura, agregação, proxies, limite de taxa por usuário e IP |
| `notes-service` | NestJS + MongoDB | Domínio Notas |
| `safety-service` | NestJS + TypeORM (SQL Server; SQLite local) | Domínio Conta e Rede de apoio, outbox e consumidor |
| `ghosty-functions` | Azure Functions (Node.js) | Prontidão, prévia, envio dos avisos, webhook do bot, prazo do check-in |

Organização interna de cada backend:

```text
src/
├── domain/          entidades, value objects e máquinas de estado (sem framework)
├── application/     features/<feature>/<caso-de-uso>/ (um handler por caso de uso) e ports/
├── infrastructure/  banco, filas, criptografia, clientes HTTP e configuração
└── api/             controllers, DTOs, guards, Swagger e composição (na Function App: as funções HTTP e de fila)
```

## 6. Visão de execução

### 6.1 `GET /aggregated-data`

```mermaid
sequenceDiagram
  autonumber
  participant F as Front (safety)
  participant G as API Management
  participant B as BFF
  participant N as notes-service
  participant S as safety-service
  participant FN as Function (HTTP)
  F->>G: GET /aggregated-data (JWT + X-Safety-Token + chave)
  G->>G: validate-jwt, rate-limit, CORS
  G->>B: encaminha + X-Gateway-Secret
  par em paralelo
    B->>N: GET /notes/summary
  and
    B->>S: GET /summary
  end
  B->>FN: POST /api/readiness (os dois resumos)
  FN-->>B: pontuação, itens e prévia
  B-->>F: JSON único, com sources (ok, unavailable ou fallback)
```

Cada chamada tem 3 segundos de limite. Uma fonte fora do ar não derruba a resposta: o bloco dela vem `null` e `sources` diz o que faltou. Sem a Function, o BFF calcula uma prontidão de reserva.

### 6.2 Pedido de ajuda (assíncrono)

```mermaid
sequenceDiagram
  autonumber
  participant F as Front (safety)
  participant B as BFF
  participant S as safety-service
  participant Q1 as fila help-requests
  participant FN as Function dispatch-alert
  participant Q2 as fila alert-dispatches
  participant TG as Telegram
  F->>F: segurar 2 s, contagem regressiva, localização (se permitida)
  F->>B: POST /safety/help-requests (Idempotency-Key)
  B->>S: POST /help-requests
  S->>S: grava o pedido e o evento no outbox (mesma transação)
  S-->>F: 202 + Location
  S->>Q1: HelpRequestTriggered (logo depois do commit)
  Q1->>FN: Queue Trigger
  FN->>S: GET /internal/help-requests/{id}/delivery-targets
  loop cada contato confirmado, na ordem
    FN->>TG: sendMessage (canal Telegram, modo real)
    Note over FN: canal web: published_web · Teste seguro: would_send
  end
  FN->>Q2: AlertDispatched (um passo por contato)
  Q2->>S: consumidor grava a linha do tempo (idempotente)
  F->>B: GET /safety/help-requests/{id} a cada 2 s
```

### 6.3 Check-in vencido

```mermaid
sequenceDiagram
  autonumber
  participant S as safety-service
  participant Q as fila check-in-deadlines
  participant FN as Function check-in-deadline
  S->>Q: CheckInDeadlineScheduled (invisível até dueAt + tolerância, com a versão)
  Q->>FN: Queue Trigger no prazo
  FN->>S: POST /internal/check-ins/{id}/expire (versão)
  alt ativo e na mesma versão
    S->>S: vence o check-in e cria um pedido de ajuda (origem check_in) + outbox
  else confirmado, cancelado ou estendido
    S-->>FN: ignored
  end
```

### 6.4 Convite e vínculo com o Telegram

O contato abre `/c/:token`. O shell confirma o token no BFF e só então carrega a página do convite (remote `safety`). Aceitando pelo navegador, o contato vira `confirmed` na hora, e a mesma página passa a mostrar os avisos. Aceitando pelo Telegram, ele abre `t.me/<bot>?start=<token>` e toca em Iniciar: o webhook da Function confere o segredo, chama `POST /internal/contacts/telegram-link` e o contato vira `confirmed`. `/parar` tira o contato da rede.

## 7. Visão de implantação

```mermaid
flowchart LR
  subgraph SWA["Static Web Apps (Free)"]
    main["web-main: shell"]
    wn["web-n: remote notes"]
    ws["web-s: remote safety"]
    wd["web-docs: documentação"]
  end
  apim["API Management (Consumption)"]
  subgraph CAE["Container Apps (escala a zero)"]
    bff["app-web-api: BFF"]
    notes["app-notes: notes-service"]
    core["app-core: safety-service"]
  end
  fn["Function App (Flex Consumption)"]
  st[["Storage: filas"]]
  sql[("Azure SQL (free tier)")]
  kv["Key Vault"]
  law["Log Analytics"]
  atlas[("MongoDB Atlas (região Azure)")]
  hub["Docker Hub"]
  main --> apim --> bff
  bff --> notes --> atlas
  bff --> core --> sql
  bff --> fn
  core <--> st <--> fn
  fn --> core
  kv -.-> bff & notes & core & fn & apim
  hub -. imagens .-> CAE
  CAE -.-> law
```

- **Implantação:** `ghosty-docs/infra/deploy.sh`, com o Azure CLI, em passos que podem rodar de novo (Key Vault com segredos gerados, Azure SQL com usuário de privilégio mínimo e migrações, filas, Function, Container Apps, Static Web Apps, APIM com políticas em arquivo, testes de fumaça).
- **Imagens:** publicadas no Docker Hub pelo GitHub Actions (`docker.yml`, tag `v*`).
- **Nomes neutros:** nada com "ghosty", "safety" ou "segurança" em domínios e recursos visíveis no navegador.

## 8. Conceitos transversais

### 8.1 Segurança e privacidade

- **Senhas e código secreto:** Argon2id (parâmetros da OWASP). Código errado e conta bloqueada recebem a mesma resposta.
- **Tokens:** JWT de acesso RS256 de 15 minutos (JWKS público para o APIM); refresh token opaco, rotacionado a cada uso, com só o hash no banco; token de sessão segura separado, só em memória, 10 minutos de uso e no máximo 30, revogado na saída rápida.
- **Cifra por campo:** AES-256-GCM no apelido e no chat do Telegram do contato, no modelo da mensagem, no destino do check-in, na localização e no texto dos avisos. A chave fica no Key Vault.
- **Entrada centralizada:** `X-Gateway-Secret` no BFF, `X-Internal-Key` nos microserviços, function key na Function, segredo do webhook do Telegram.
- **Front:** CSP estrita (só as origens do front, dos remotes e do gateway), `no-referrer`, `noindex`; remote `safety` sem source maps e com arquivos nomeados só por hash; service worker que nunca guarda a área de segurança nem a API.
- **LGPD:** sem telefone; consentimento do contato no aceite; saída pelo `/parar` ou recusando; exclusão da conta apaga tudo em cascata (notas e conta); avisos guardados por 90 dias; só dados fictícios na demonstração.

### 8.2 Eventos

Envelope no estilo CloudEvents, validado com os JSON Schemas do AsyncAPI dos dois lados (quem publica e quem consome). Transactional outbox, entrega pelo menos uma vez com consumidores idempotentes, fila `-poison` depois de 5 falhas, versão no prazo do check-in para descartar mensagens antigas. Nenhum evento leva destino de entrega.

### 8.3 Observabilidade

Logs em JSON (`pino`) com `correlationId`, que atravessa gateway, BFF, serviços e mensagens de fila. Campos sensíveis são redigidos (tokens, chaves, senha, código, chat, mensagem e localização). Container Apps e Function enviam os logs ao Log Analytics.

### 8.4 Testes

| Tipo | Ferramenta | Onde |
|---|---|---|
| Unidade | Vitest, Testing Library | Domínio, casos de uso, componentes React |
| Arquitetura | ArchUnitTS | Camadas, slices sem dependência entre si, sem ciclos, nomes |
| Integração | Supertest, SQLite em memória, `mongodb-memory-server`, Azurite | Controllers, repositórios, outbox, consumidor, gatilhos de fila |
| Contrato | Redocly, `ajv`, comparação do OpenAPI gerado com o contrato | `ghosty-docs` e cada serviço |
| Ponta a ponta | `ghosty-docs/scripts/e2e-flow.mjs` | Todos os serviços reais na máquina (e no CI) ou pelo APIM na nuvem |

### 8.5 Configuração

Cada projeto valida as variáveis de ambiente com `zod` na subida e lista o que falta sem mostrar valores. Na nuvem, os segredos são referências ao Key Vault (Container Apps e Function App).

## 9. Decisões de arquitetura

| # | Decisão | Alternativas | Motivo |
|---|---|---|---|
| 01 | Fachada "Notas e listas" | Receitas, clima | Uso diário crível e domínio rico para o MS1 |
| 02 | TypeScript em tudo | .NET nos microserviços | Uma linguagem e um toolchain para a equipe |
| 03 | Module Federation com o `safety` registrado em tempo de execução | SPA única | Microfrontend de verdade, e o código da área de segurança não chega antes da hora |
| 04 | Tudo na Azure, com o APIM Consumption como gateway | AWS API Gateway, YARP | Uma nuvem só |
| 05 | MongoDB Atlas em região Azure | Cosmos DB for MongoDB | Exigência do enunciado |
| 06 | Storage Queues + transactional outbox | Service Bus, Event Grid | Roda sem Docker (Azurite), custo baixo, atraso nativo e gatilho nativo da Function |
| 07 | O BFF emite JWT RS256 e publica o JWKS | Microsoft Entra External ID | Sem dependência externa; o APIM valida pelo `openid-config` |
| 08 | Limite por usuário e por IP no BFF | `rate-limit-by-key` no APIM | Política indisponível no tier Consumption |
| 09 | SQLite na máquina local, SQL Server na nuvem (TypeORM) | SQL Server em container | Desenvolvimento sem Docker |
| 10 | A aplicação não roda DDL; migrações com o usuário admin | Migrações na subida | Usuário da aplicação só com leitura e escrita |
| 11 | CORS só no APIM (BFF com `CORS_ORIGINS=none` na nuvem) | CORS nos dois | Cabeçalhos duplicados fazem o navegador recusar a resposta |
| 12 | Refresh token no `localStorage` | Cookie `httpOnly` | Front e API em sites diferentes |
| 13 | Avisos pelo Telegram e pela página web do contato | SMS, WhatsApp, e-mail | Grátis, sem aprovação, e o `/start` serve de consentimento |
| 14 | Repositório único (monorepo) | Um repositório por projeto | Contrato e código mudam no mesmo pull request |

## 10. Requisitos de qualidade

| Cenário | Estímulo | Resposta esperada |
|---|---|---|
| Discrição | Alguém olha a tela ou o histórico do navegador | Título "Notas", URL `/`, área de segurança em roteamento de memória, saída rápida (botão ou Esc duas vezes), trancamento com a aba oculta por 2 minutos |
| Força bruta do código | Várias tentativas na busca | Bloqueio de 15 minutos depois de 5 erros, sem mudar nada na tela |
| Disponibilidade parcial | O notes-service ou a Function caem | `/aggregated-data` responde 200 com `sources` e prontidão de reserva |
| Disparo acidental | Toque sem querer | Segurar 2 s + contagem com "Cancelar" já focado |
| Entrega dos avisos | A mesma mensagem da fila chega duas vezes | Nenhum aviso repetido; a linha do tempo não duplica |
| Ensaio | Teste seguro | Nada sai, nem pelo Telegram nem pela página web; cada passo termina em "teria sido enviado" |
| Entrada centralizada | Chamada direta à URL do BFF | 403 |

## 11. Riscos e débitos técnicos

| Risco ou débito | Mitigação |
|---|---|
| Oferta "Starter" sem free tier do Azure SQL | Checagem no passo `check`; pedir a oferta com crédito |
| Policy de regiões bloqueando um serviço | Uma região para tudo; planos B para a Function e o front |
| Franquia do Azure SQL acabar | Pool com mínimo 0, health sem banco, pausa automática |
| Cold start na apresentação | Esquentar antes; mínimo de 1 réplica durante a gravação |
| Atlas Free pausado | Conferir antes de apresentar |
| Revogação da sessão segura só em memória | Basta para 1 réplica do BFF; com mais réplicas, passa para o safety-service |
| Página do contato (canal web) só mostra avisos aberta | Recomendar o Telegram; Web Push registrado como recurso desligado |
| Testes contra o SQL Server real | A migração é verificada contra os `EntitySchema`; rodar as migrações no Azure SQL assim que ele existir |

## 12. Glossário

| Termo | Significado |
|---|---|
| Fachada | O app de notas que funciona de verdade e esconde a área de segurança |
| Área de segurança | A parte do app que só abre com o código secreto |
| Código secreto | Os 6 a 8 dígitos digitados na busca (na tela de configurações, "código de bloqueio do app") |
| Rede de apoio | Os contatos que recebem os avisos, na ordem definida |
| Convite | Link de uso único, válido por 72 horas, com o qual o contato aceita (pelo Telegram ou pelo navegador) ou recusa |
| Pedido de ajuda | O aviso disparado pelo botão ou por um check-in vencido |
| Check-in | "Cheguei bem": se a pessoa não confirmar até o prazo, a rede é avisada |
| Teste seguro | O ensaio do pedido e do check-in, com `mode: test`, que nunca envia nada |
| Prontidão | Pontuação de 0 a 100 de quanto a rede está pronta para funcionar |
| Linha do tempo | O que aconteceu com cada contato num pedido (enviado, publicado na página, teria sido enviado, falhou) |
| Outbox | Tabela em que o evento é gravado na mesma transação da mudança, e publicado logo depois |
| Saída rápida | Volta instantânea às notas, revogando a sessão segura |

## Anexo: Canvas

Lean Canvas da versão web, na ordem de preenchimento do modelo (problema e segmentos primeiro, vantagem competitiva por último). A fonte é [`canvas/canvas.html`](https://github.com/Carloslgp/Ghosty_App_Web/blob/main/ghosty-docs/canvas/canvas.html); `npm run canvas` gera esta imagem e o [`canvas.pdf`](https://github.com/Carloslgp/Ghosty_App_Web/blob/main/ghosty-docs/canvas/canvas.pdf), uma página A4 para entregar à parte.

![Lean Canvas do Ghosty](../canvas/canvas.png)

## Anexo: prints do app na Azure

Tirados com `npm run prints` (Chrome headless), direto das URLs públicas da tabela "Links da entrega", na conta de demonstração "Maria Exemplo". O Teste seguro não envia nada para ninguém. Chaves e tokens aparecem cortados.

### Swagger do BFF

![Swagger do BFF no Azure Container Apps](prints/swagger-bff.png)

### Swagger dos microserviços

![Swagger do notes-service (MongoDB Atlas)](prints/swagger-notes-service.png)

![Swagger do safety-service (Azure SQL)](prints/swagger-safety-service.png)

### Swagger da Azure Function e dos eventos

![Swagger da Azure Function (HTTP triggers)](prints/swagger-function.png)

![AsyncAPI: eventos das Storage Queues](prints/swagger-eventos-asyncapi.png)

### API Gateway

![Swagger do BFF exportado do API Management, com o gateway como servidor](prints/swagger-api-gateway-bff.png)

![Chamadas reais pelo API Gateway: 200 com as 3 fontes no /aggregated-data, 401 sem a chave de assinatura e 403 direto no BFF](prints/chamadas-api-gateway.png)

### Frontend funcionando

![Entrar (shell)](prints/front-entrar.png)

![Fachada: notas e listas (remote notes)](prints/front-fachada-notas.png)

![Área de segurança depois do código na busca (remote safety): painel e prontidão calculada pela Function](prints/front-seguranca-painel.png)

![Rede de apoio: contatos, status do convite e ordem de aviso](prints/front-seguranca-rede-de-apoio.png)

![Mensagem com a prévia montada pela Function](prints/front-seguranca-mensagem.png)

![Check-in "cheguei bem"](prints/front-seguranca-check-in.png)

![Teste seguro: contagem antes do envio](prints/front-teste-seguro-contagem.png)

![Teste seguro: linha do tempo, com cada contato em "teria sido enviado"](prints/front-teste-seguro.png)

![Página do contato (canal web), aberta pelo link do convite](prints/front-pagina-do-contato.png)

### Docker Hub, GitHub Actions e documentação

![Docker Hub: as 3 imagens](prints/docker-hub.png)

![Docker Hub: tags v1 e sha da imagem do BFF](prints/docker-hub-tags.png)

![GitHub Actions: CI de cada projeto, e2e e publicação das imagens](prints/github-actions.png)

![Página de documentação com todos os links e Swaggers](prints/documentacao-links.png)
