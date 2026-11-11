# C4 Model

Diagramas em Mermaid, na notação do C4 (o GitHub desenha direto). Para exportar em PNG, cole o bloco no [Mermaid Live Editor](https://mermaid.live).

**Legenda:** pessoas em azul-escuro, com cantos arredondados; o sistema em azul; containers em azul-médio; componentes em azul-claro; sistemas externos em cinza. Bancos de dados aparecem como cilindros, filas com borda dupla e os limites (sistema, container, assinatura) como retângulos tracejados. Cada caixa traz o nome, o tipo entre colchetes e o que faz; cada seta, o que passa por ela e, entre colchetes, o protocolo.

## 1. Contexto

```mermaid
---
config:
  flowchart:
    wrappingWidth: 420
    nodeSpacing: 30
    rankSpacing: 45
    padding: 22
---
flowchart TB
  classDef person fill:#08427b,stroke:#052e56,color:#fff
  classDef system fill:#1168bd,stroke:#0b4884,color:#fff
  classDef external fill:#8a8a8a,stroke:#666,color:#fff

  user(["<b>Pessoa usuária</b><br><i>[Pessoa]</i><br>Usa a fachada de notas no dia a dia<br>e, em privado, a área de segurança"]):::person
  contact(["<b>Contato da rede de apoio</b><br><i>[Pessoa]</i><br>Aceita o convite e recebe os avisos"]):::person
  ghosty["<b>Ghosty</b><br><i>[Sistema de software]</i><br>App de notas que funciona de verdade,<br>com uma área de segurança discreta<br>para avisar a rede de apoio"]:::system
  official["<b>Canais oficiais 190, 180 e 192</b><br><i>[Sistema externo]</i><br>O Ghosty só mostra os links tel:<br>Não liga nem avisa esses serviços"]:::external
  telegram["<b>Telegram Bot API</b><br><i>[Sistema externo]</i><br>Entrega as mensagens do bot<br>e recebe o /start e o /parar"]:::external

  user -->|"Notas, rede de apoio, pedido de ajuda,<br>check-in e Teste seguro<br>[HTTPS]"| ghosty
  user -.->|"Liga, se precisar<br>[telefone]"| official
  contact -->|"Abre o convite e vê<br>os avisos no canal web<br>[HTTPS]"| ghosty
  contact -->|"Conversa com o bot"| telegram
  ghosty <-->|"Avisos e webhook<br>[HTTPS]"| telegram
```

## 2. Containers

```mermaid
---
config:
  flowchart:
    wrappingWidth: 420
    nodeSpacing: 30
    rankSpacing: 45
    padding: 22
---
flowchart TB
  classDef person fill:#08427b,stroke:#052e56,color:#fff
  classDef container fill:#438dd5,stroke:#2e6295,color:#fff
  classDef external fill:#8a8a8a,stroke:#666,color:#fff

  user(["<b>Pessoa usuária</b><br><i>[Pessoa]</i>"]):::person
  contact(["<b>Contato da rede de apoio</b><br><i>[Pessoa]</i>"]):::person

  subgraph ghosty["Ghosty: Azure (um resource group, uma região) e MongoDB Atlas"]
    shell["<b>shell</b><br><i>[Container: React 19, Vite, Module Federation,<br>Static Web Apps]</i><br>Entrar, cadastro, configurações,<br>busca com desbloqueio, saída rápida<br>e a rota pública do convite"]:::container
    notesFe["<b>remote notes</b><br><i>[Container: React, Static Web Apps]</i><br>A fachada: notas de texto<br>e checklists"]:::container
    safetyFe["<b>remote safety</b><br><i>[Container: React, Static Web Apps]</i><br>Área de segurança e página do convite,<br>baixadas só depois do desbloqueio<br>ou com um convite válido"]:::container
    apim["<b>API Management</b><br><i>[Container: Consumption]</i><br>Entrada única: roteamento, validate-jwt,<br>CORS, rate-limit e X-Gateway-Secret"]:::container
    bff["<b>BFF</b><br><i>[Container: NestJS, Container Apps]</i><br>JWT RS256 e JWKS, sessão segura,<br>GET /aggregated-data e os proxies<br>dos CRUDs"]:::container
    notes["<b>notes-service</b><br><i>[Container: NestJS, Container Apps]</i><br>Domínio Notas: CRUD<br>e resumo para o painel"]:::container
    core["<b>safety-service</b><br><i>[Container: NestJS, Container Apps]</i><br>Contas, código secreto, rede de apoio,<br>mensagem, check-ins, pedidos de ajuda<br>e outbox"]:::container
    fn["<b>Azure Functions</b><br><i>[Container: Node.js, Flex Consumption]</i><br>Prontidão, prévia e webhook (HTTP);<br>envio dos avisos e prazo<br>do check-in (fila)"]:::container
    queues[["<b>Storage Queues</b><br><i>[Container: Azure Storage]</i><br>help-requests, check-in-deadlines<br>e alert-dispatches"]]:::container
    sql[("<b>Azure SQL Database</b><br><i>[Container: free tier, serverless]</i><br>Contas, rede, check-ins e pedidos<br>(campos sensíveis cifrados)")]:::container
    mongo[("<b>MongoDB Atlas</b><br><i>[Container: cluster Free, fora da Azure]</i><br>Notas")]:::container
    kv["<b>Key Vault</b><br><i>[Container: RBAC]</i><br>Chaves JWT, de cifra e internas,<br>connection strings e token do bot,<br>lidos por referência pelo BFF,<br>pelos serviços e pela Function"]:::container
  end
  telegram["<b>Telegram Bot API</b><br><i>[Sistema externo]</i>"]:::external

  user -->|"Usa<br>[HTTPS]"| shell
  contact -->|"Abre /c/:token<br>[HTTPS]"| shell
  shell -->|"Carrega<br>[Module Federation]"| notesFe
  shell -->|"Carrega<br>[Module Federation]"| safetyFe
  shell -->|"Chama a API<br>[HTTPS + JWT + chave]"| apim
  apim -->|"Encaminha<br>[X-Gateway-Secret]"| bff
  bff -->|"Proxy e resumo<br>[X-Internal-Key]"| notes
  bff -->|"Proxy, sessão e resumo<br>[X-Internal-Key]"| core
  bff -->|"Prontidão e prévia<br>[function key]"| fn
  notes -->|"Lê e grava<br>[TLS]"| mongo
  core -->|"Lê e grava<br>[TLS]"| sql
  core -->|"Publica eventos (outbox)<br>e consome resultados"| queues
  fn -->|"Destinos, vencer check-in<br>e vincular contato<br>[X-Internal-Key]"| core
  fn <-->|"Queue Trigger<br>e AlertDispatched"| queues
  fn <-->|"sendMessage e webhook<br>[HTTPS]"| telegram
  bff ~~~ kv

  style ghosty fill:none,stroke:#555,stroke-dasharray:6 4
```

## 3. Componentes

Todos os backends seguem Clean Architecture com Vertical Slice: `domain` (regras puras), `application/features/<feature>/<caso-de-uso>` (um handler por caso de uso, com portas), `infrastructure` (adaptadores) e a camada de entrada `api` (controllers nos serviços NestJS, funções HTTP e de fila na Function App). As dependências só apontam para dentro, e testes de arquitetura (ArchUnitTS) verificam isso.

### 3.1 BFF

```mermaid
---
config:
  flowchart:
    wrappingWidth: 420
    nodeSpacing: 30
    rankSpacing: 45
    padding: 22
---
flowchart TB
  classDef container fill:#438dd5,stroke:#2e6295,color:#fff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#000

  apim["<b>API Management</b><br><i>[Container]</i>"]:::container
  subgraph bffb["BFF (NestJS)"]
    guards["<b>Guards</b><br><i>[Componente: api/shared]</i><br>Segredo do gateway (403), JWT (401),<br>limite de taxa (429) e sessão segura (403)"]:::component
    controllers["<b>Controllers</b><br><i>[Componente: api/features]</i><br>auth, account, notes, safety, check-ins,<br>help-requests, aggregated-data<br>e invitations"]:::component
    handlers["<b>Casos de uso</b><br><i>[Componente: application/features]</i><br>Register, Login, RefreshSession,<br>UnlockSafety, LockSafety, GetAggregatedData,<br>PreviewMessage e os proxies"]:::component
    domain["<b>Domínio</b><br><i>[Componente: domain]</i><br>SafetySession (10 min de uso,<br>30 min no máximo) e a<br>prontidão de reserva"]:::component
    tokens["<b>JoseTokenService</b><br><i>[Componente: infrastructure/security]</i><br>Assina JWT RS256<br>e publica o JWKS"]:::component
    sessions["<b>Sessões seguras</b><br><i>[Componente: infrastructure/security]</i><br>Sessões e jti revogados<br>em memória"]:::component
    clients["<b>Clientes HTTP</b><br><i>[Componente: infrastructure/http]</i><br>notes-service, safety-service<br>e Function, com timeout"]:::component
  end
  notes["<b>notes-service</b><br><i>[Container]</i>"]:::container
  core["<b>safety-service</b><br><i>[Container]</i>"]:::container
  fn["<b>Azure Functions</b><br><i>[Container]</i>"]:::container

  apim -->|"[HTTPS]"| guards
  guards --> controllers
  controllers --> handlers
  handlers --> domain
  handlers -->|"porta<br>TokenService"| tokens
  handlers -->|"porta<br>SafetySessionStore"| sessions
  handlers -->|"portas dos<br>clientes"| clients
  clients -->|"[HTTP]"| notes
  clients -->|"[HTTP]"| core
  clients -->|"[HTTPS]"| fn

  style bffb fill:none,stroke:#555,stroke-dasharray:6 4
```

### 3.2 notes-service

```mermaid
---
config:
  flowchart:
    wrappingWidth: 420
    nodeSpacing: 30
    rankSpacing: 45
    padding: 22
---
flowchart TB
  classDef container fill:#438dd5,stroke:#2e6295,color:#fff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#000

  bff["<b>BFF</b><br><i>[Container]</i>"]:::container
  subgraph nsb["notes-service (NestJS)"]
    guard["<b>Guard da chave interna</b><br><i>[Componente: api/platform]</i><br>X-Internal-Key e X-User-Id"]:::component
    controllers["<b>Controllers por caso de uso</b><br><i>[Componente: api/features/notes]</i><br>Um controller por rota,<br>com DTOs e Swagger"]:::component
    handlers["<b>Casos de uso</b><br><i>[Componente: application/features/notes]</i><br>CreateNote, ListNotes, GetNote, UpdateNote,<br>PatchNote, DeleteNote, DeleteAllNotesOfOwner<br>e GetNotesSummary"]:::component
    domain["<b>Domínio</b><br><i>[Componente: domain/notes]</i><br>Note e ChecklistItem: título ou conteúdo,<br>conversão texto/checklist<br>e versão otimista"]:::component
    repo["<b>MongoNoteRepository</b><br><i>[Componente: infrastructure/persistence]</i><br>Driver oficial do MongoDB,<br>índices e resumo"]:::component
  end
  mongo[("<b>MongoDB Atlas</b><br><i>[Container: banco de dados]</i>")]:::container

  bff -->|"[HTTP]"| guard
  guard --> controllers
  controllers --> handlers
  handlers --> domain
  handlers -->|"porta<br>NoteRepository"| repo
  repo -->|"[TLS]"| mongo

  style nsb fill:none,stroke:#555,stroke-dasharray:6 4
```

### 3.3 safety-service

```mermaid
---
config:
  flowchart:
    wrappingWidth: 420
    nodeSpacing: 30
    rankSpacing: 45
    padding: 22
---
flowchart TB
  classDef container fill:#438dd5,stroke:#2e6295,color:#fff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#000

  bff["<b>BFF</b><br><i>[Container]</i>"]:::container
  fn["<b>Azure Functions</b><br><i>[Container]</i>"]:::container
  subgraph ssb["safety-service (NestJS)"]
    api["<b>Controllers</b><br><i>[Componente: api/features]</i><br>accounts, refresh-tokens, contacts,<br>invitations, alert-settings, summary,<br>check-ins, help-requests e rotas internas"]:::component
    handlers["<b>Casos de uso</b><br><i>[Componente: application/features]</i><br>Contas e código secreto, contatos e convites,<br>Telegram, mensagem, resumo, check-ins<br>e pedidos de ajuda"]:::component
    domain["<b>Domínio</b><br><i>[Componente: domain]</i><br>Account, Contact, AlertSettings,<br>CheckIn e HelpRequest,<br>com as máquinas de estado"]:::component
    security["<b>Segurança</b><br><i>[Componente: infrastructure/security]</i><br>Argon2id, AES-256-GCM por campo<br>e hash dos tokens"]:::component
    uow["<b>Unidade de trabalho</b><br><i>[Componente: infrastructure/persistence]</i><br>TypeORM: uma transação por caso de uso,<br>com o outbox na mesma transação"]:::component
    outbox["<b>Despachante do outbox</b><br><i>[Componente: infrastructure/messaging]</i><br>Publica logo depois do commit,<br>sem polling no banco"]:::component
    consumer["<b>Consumidor de alert-dispatches</b><br><i>[Componente: infrastructure/messaging]</i><br>Grava a linha do tempo,<br>idempotente pelo id do evento"]:::component
  end
  sql[("<b>Azure SQL</b><br><i>[Container: banco de dados]</i>")]:::container
  queues[["<b>Storage Queues</b><br><i>[Container: filas]</i>"]]:::container

  bff -->|"[HTTP]"| api
  fn -->|"rotas internas<br>[HTTPS]"| api
  api --> handlers
  handlers --> domain
  handlers -->|"portas PasswordHasher<br>e FieldCipher"| security
  handlers -->|"porta<br>UnitOfWork"| uow
  uow -->|"[TLS]"| sql
  uow -->|"depois do<br>commit"| outbox
  outbox -->|"HelpRequestTriggered e<br>CheckInDeadlineScheduled"| queues
  queues -->|"AlertDispatched"| consumer
  consumer -->|"RecordAlertDispatch"| handlers

  style ssb fill:none,stroke:#555,stroke-dasharray:6 4
```

### 3.4 Azure Functions

```mermaid
---
config:
  flowchart:
    wrappingWidth: 420
    nodeSpacing: 30
    rankSpacing: 45
    padding: 22
---
flowchart TB
  classDef container fill:#438dd5,stroke:#2e6295,color:#fff
  classDef component fill:#85bbf0,stroke:#5d82a8,color:#000
  classDef external fill:#8a8a8a,stroke:#666,color:#fff

  bff["<b>BFF</b><br><i>[Container]</i>"]:::container
  telegram["<b>Telegram Bot API</b><br><i>[Sistema externo]</i>"]:::external
  queues[["<b>Storage Queues</b><br><i>[Container: filas]</i>"]]:::container
  subgraph fab["Function App"]
    http["<b>Funções HTTP</b><br><i>[Componente: api]</i><br>readiness, message-preview,<br>telegram-webhook, openapi e docs"]:::component
    triggers["<b>Gatilhos de fila</b><br><i>[Componente: api]</i><br>dispatch-alert e check-in-deadline,<br>com a fila -poison"]:::component
    handlers["<b>Casos de uso</b><br><i>[Componente: application/features]</i><br>CalculateReadiness, PreviewMessage,<br>DispatchAlert, CheckCheckInDeadline<br>e HandleTelegramUpdate"]:::component
    domain["<b>Domínio</b><br><i>[Componente: domain]</i><br>ReadinessCalculator, MessageComposer,<br>DispatchPlanner e TelegramCommandParser"]:::component
    adapters["<b>Adaptadores</b><br><i>[Componente: infrastructure]</i><br>Cliente do safety-service, publicador<br>da fila, TelegramBotGateway<br>e validação dos eventos (ajv)"]:::component
  end
  core["<b>safety-service</b><br><i>[Container]</i>"]:::container

  bff -->|"[HTTPS + function key]"| http
  telegram -->|"Webhook"| http
  queues -->|"Queue Trigger"| triggers
  http --> handlers
  triggers --> handlers
  handlers --> domain
  handlers -->|"portas"| adapters
  adapters -->|"[HTTPS + X-Internal-Key]"| core
  adapters -->|"AlertDispatched"| queues
  adapters -->|"sendMessage"| telegram

  style fab fill:none,stroke:#555,stroke-dasharray:6 4
```
