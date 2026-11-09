# C4 Model

Diagramas em Mermaid C4 (o GitHub desenha direto). Para exportar em PNG, cole o bloco no [Mermaid Live Editor](https://mermaid.live).

## 1. Contexto

```mermaid
C4Context
  title Ghosty: contexto do sistema

  Person(user, "Pessoa usuária", "Usa a fachada de notas no dia a dia e, em privado, a área de segurança")
  System_Ext(official, "Canais oficiais 190, 180 e 192", "O Ghosty só mostra os links tel:. Não liga nem avisa esses serviços")
  Person(contact, "Contato da rede de apoio", "Aceita o convite e recebe os avisos")
  System(ghosty, "Ghosty", "App de notas que funciona de verdade, com uma área de segurança discreta para avisar a rede de apoio")
  System_Ext(telegram, "Telegram Bot API", "Canal de aviso: entrega as mensagens do bot e o /start e o /parar do contato")

  Rel(user, ghosty, "Notas, rede de apoio, pedido de ajuda, check-in e Teste seguro", "HTTPS")
  Rel(contact, ghosty, "Abre o convite e, no canal web, vê os avisos", "HTTPS")
  BiRel(ghosty, telegram, "Avisos e webhook", "HTTPS")
  Rel(contact, telegram, "Conversa com o bot")
  Rel(user, official, "Liga, se precisar", "Telefone")
  UpdateRelStyle(user, official, $offsetX="-15", $offsetY="-30")
  UpdateRelStyle(ghosty, telegram, $offsetY="60")
  UpdateRelStyle(contact, ghosty, $offsetX="-40", $offsetY="-25")
  UpdateRelStyle(contact, telegram, $offsetX="35", $offsetY="10")
  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## 2. Containers

```mermaid
C4Container
  title Ghosty: containers na Azure

  Person(user, "Pessoa usuária")
  Person(contact, "Contato da rede de apoio")

  System_Boundary(azure, "Azure (um resource group, uma região)") {
    Container(shell, "shell", "React 19, Vite, Module Federation (Static Web Apps)", "Entrar, cadastro, configurações, busca com desbloqueio, saída rápida e a rota pública do convite")
    Container(notesFe, "remote notes", "React (Static Web Apps)", "A fachada: notas de texto e checklists")
    Container(safetyFe, "remote safety", "React (Static Web Apps)", "A área de segurança e a página do convite. Baixado só depois do desbloqueio ou com um convite válido")
    Container(apim, "API Management", "Tier Consumption", "Entrada única: roteamento, validate-jwt, CORS, rate-limit por chave e X-Gateway-Secret")
    Container(bff, "BFF", "NestJS (Container Apps)", "JWT RS256 e JWKS, sessão segura, GET /aggregated-data, proxies dos CRUDs, limite por usuário e por IP")
    Container(notes, "notes-service", "NestJS (Container Apps)", "Domínio Notas: CRUD e resumo para o painel")
    Container(core, "safety-service", "NestJS (Container Apps)", "Domínio Conta e Rede de apoio: contas, código secreto, contatos, convites, mensagem, check-ins, pedidos de ajuda, outbox e consumidor")
    Container(fn, "Azure Functions", "Node.js (Flex Consumption)", "Prontidão e prévia (HTTP), envio dos avisos e prazo do check-in (fila), webhook do bot (HTTP)")
    ContainerQueue(queues, "Storage Queues", "Azure Storage", "help-requests, check-in-deadlines e alert-dispatches")
    ContainerDb(sql, "Azure SQL Database", "Free tier, serverless", "Contas, rede de apoio, check-ins, pedidos e linhas do tempo (campos sensíveis cifrados)")
    Container(kv, "Key Vault", "RBAC", "Chaves JWT, de cifra e internas, connection strings e token do bot")
  }
  Boundary(external, "Fora da assinatura Azure") {
    ContainerDb(mongo, "MongoDB Atlas", "Cluster Free em região Azure", "Notas")
    System_Ext(telegram, "Telegram Bot API")
  }

  Rel(user, shell, "Usa", "HTTPS")
  Rel(contact, shell, "Abre /c/:token", "HTTPS")
  Rel(shell, notesFe, "Carrega o remote", "Module Federation")
  Rel(shell, safetyFe, "Registra e carrega em tempo de execução", "Module Federation")
  Rel(shell, apim, "Chama a API", "HTTPS + JWT + chave do produto web-app")
  Rel(apim, bff, "Encaminha", "HTTPS + X-Gateway-Secret")
  Rel(bff, notes, "Proxy e resumo", "HTTP + X-Internal-Key + X-User-Id")
  Rel(bff, core, "Proxy, sessão e resumo", "HTTP + X-Internal-Key + X-User-Id")
  Rel(bff, fn, "Prontidão e prévia", "HTTPS + x-functions-key")
  Rel(notes, mongo, "Lê e grava", "TLS")
  Rel(core, sql, "Lê e grava", "TLS")
  Rel(core, queues, "Publica eventos (outbox) e consome resultados", "HTTPS")
  BiRel(queues, fn, "Queue Trigger e publica AlertDispatched")
  Rel(fn, core, "Destinos de entrega, vencer check-in, vincular contato", "HTTPS + X-Internal-Key")
  BiRel(fn, telegram, "sendMessage e webhook (/start, /parar)", "HTTPS + function key + secret token")
  UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## 3. Componentes

Todos os backends seguem Clean Architecture com Vertical Slice: `domain` (regras puras), `application/features/<feature>/<caso-de-uso>` (um handler por caso de uso, com portas), `infrastructure` (adaptadores) e a camada de entrada `api` (controllers nos serviços NestJS, funções HTTP e de fila na Function App). As dependências só apontam para dentro, e testes de arquitetura (ArchUnitTS) verificam isso.

### 3.1 BFF

```mermaid
C4Component
  title BFF: componentes

  Container(apim, "API Management")
  Container_Boundary(bff, "BFF (NestJS)") {
    Component(guards, "Guards", "api/shared", "Segredo do gateway (403), JWT (401), limite de taxa (429) e sessão segura (403)")
    Component(controllers, "Controllers", "api/features", "auth, account, notes, safety/session, safety, check-ins, help-requests, aggregated-data, invitations")
    Component(handlers, "Casos de uso", "application/features", "Register, Login, RefreshSession, UnlockSafety, LockSafety, GetAggregatedData, PreviewMessage, proxies")
    Component(domain, "Domínio", "domain", "SafetySession (10 min de uso, 30 min no máximo) e a prontidão de reserva")
    Component(tokens, "JoseTokenService", "infrastructure/security", "Assina JWT RS256 e publica o JWKS")
    Component(sessions, "Sessões seguras", "infrastructure/security", "Sessões e jti revogados em memória")
    Component(clients, "Clientes HTTP", "infrastructure/http", "notes-service, safety-service e Function, com timeout de 3 s")
  }
  Boundary(upstream, "Chamados pelo BFF") {
    Container(notes, "notes-service")
    Container(core, "safety-service")
    Container(fn, "Azure Functions")
  }

  Rel(apim, guards, "HTTPS")
  Rel(guards, controllers, "")
  Rel(controllers, handlers, "")
  Rel(handlers, domain, "")
  Rel(handlers, tokens, "porta TokenService")
  Rel(handlers, sessions, "porta SafetySessionStore")
  Rel(handlers, clients, "portas dos clientes")
  Rel(clients, notes, "HTTP")
  Rel(clients, core, "HTTP")
  Rel(clients, fn, "HTTPS")
  UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

### 3.2 notes-service

```mermaid
C4Component
  title notes-service: componentes

  Container(bff, "BFF")
  Container_Boundary(ns, "notes-service (NestJS)") {
    Component(guard, "Guard da chave interna", "api/platform", "X-Internal-Key e X-User-Id")
    Component(controllers, "Controllers por caso de uso", "api/features/notes", "Um controller por rota, com DTOs e Swagger")
    Component(handlers, "Casos de uso", "application/features/notes", "CreateNote, ListNotes, GetNote, UpdateNote, PatchNote, DeleteNote, DeleteAllNotesOfOwner, GetNotesSummary")
    Component(domain, "Domínio", "domain/notes", "Note e ChecklistItem: título ou conteúdo, conversão texto/checklist, versão otimista")
    Component(repo, "MongoNoteRepository", "infrastructure/persistence", "Driver oficial do MongoDB, índices e resumo")
  }
  Boundary(data, "Dados") {
    ContainerDb(mongo, "MongoDB Atlas")
  }

  Rel(bff, guard, "HTTP")
  Rel(guard, controllers, "")
  Rel(controllers, handlers, "")
  Rel(handlers, domain, "")
  Rel(handlers, repo, "porta NoteRepository")
  Rel(repo, mongo, "TLS")
  UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

### 3.3 safety-service

```mermaid
C4Component
  title safety-service: componentes

  Container(bff, "BFF")
  Container(fn, "Azure Functions")
  Container_Boundary(ss, "safety-service (NestJS)") {
    Component(api, "Controllers", "api/features", "accounts, refresh-tokens, contacts, invitations, alert-settings, summary, check-ins, help-requests e as rotas internas")
    Component(handlers, "Casos de uso", "application/features", "Contas e código secreto, contatos e convites, Telegram, mensagem, resumo, check-ins (Start, Extend, Confirm, Cancel, Expire), pedidos de ajuda (Trigger, Get, List, Cancel, GetDeliveryTargets, RecordAlertDispatch)")
    Component(domain, "Domínio", "domain", "Account, Contact, AlertSettings, CheckIn e HelpRequest, com as máquinas de estado")
    Component(uow, "Unidade de trabalho", "infrastructure/persistence", "TypeORM (SQL Server ou SQLite): uma transação por caso de uso, outbox na mesma transação")
    Component(security, "Segurança", "infrastructure/security", "Argon2id, AES-256-GCM por campo, hash dos tokens")
    Component(outbox, "Despachante do outbox", "infrastructure/messaging", "Publica logo depois do commit (sem polling no banco)")
    Component(consumer, "Consumidor de alert-dispatches", "infrastructure/messaging", "Grava a linha do tempo, idempotente pelo id do evento")
  }
  Boundary(data, "Dados e mensageria") {
    ContainerDb(sql, "Azure SQL")
    ContainerQueue(queues, "Storage Queues")
  }

  Rel(bff, api, "HTTP")
  Rel(fn, api, "HTTPS (rotas internas)")
  Rel(api, handlers, "")
  Rel(handlers, domain, "")
  Rel(handlers, uow, "porta UnitOfWork")
  Rel(handlers, security, "portas PasswordHasher e FieldCipher")
  Rel(uow, sql, "TLS")
  Rel(uow, outbox, "depois do commit")
  Rel(outbox, queues, "HelpRequestTriggered, CheckInDeadlineScheduled")
  Rel(queues, consumer, "AlertDispatched")
  Rel(consumer, handlers, "RecordAlertDispatch")
  UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```

### 3.4 Azure Functions

```mermaid
C4Component
  title Azure Functions: componentes

  Container(bff, "BFF")
  ContainerQueue(queues, "Storage Queues")
  System_Ext(telegram, "Telegram Bot API")
  Container_Boundary(fa, "Function App") {
    Component(http, "Funções HTTP", "api", "readiness, message-preview, telegram-webhook, openapi e docs")
    Component(triggers, "Gatilhos de fila", "api", "dispatch-alert (help-requests) e check-in-deadline (check-in-deadlines), com a fila -poison")
    Component(handlers, "Casos de uso", "application/features", "CalculateReadiness, PreviewMessage, DispatchAlert, CheckCheckInDeadline, HandleTelegramUpdate")
    Component(domain, "Domínio", "domain", "ReadinessCalculator, MessageComposer, DispatchPlanner, TelegramCommandParser")
    Component(adapters, "Adaptadores", "infrastructure", "Cliente do safety-service, publicador da fila, TelegramBotGateway e validação dos eventos (ajv)")
  }

  Boundary(called, "Chamado pela Function") {
    Container(core, "safety-service")
  }

  Rel(bff, http, "HTTPS + function key")
  Rel(telegram, http, "Webhook")
  Rel(queues, triggers, "Queue Trigger")
  Rel(http, handlers, "")
  Rel(triggers, handlers, "")
  Rel(handlers, domain, "")
  Rel(handlers, adapters, "portas")
  Rel(adapters, core, "HTTPS + X-Internal-Key")
  Rel(adapters, queues, "AlertDispatched")
  Rel(adapters, telegram, "sendMessage")
  UpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")
```
