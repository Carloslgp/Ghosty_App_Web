# ghosty-notes-service

Microserviço do domínio **Notas** do Ghosty, com MongoDB Atlas.

> **Status:** contrato v0 e configuração compartilhada prontos. O código começa na Sprint 1.

## Sobre o Ghosty

O **Ghosty** é um app web de segurança pessoal discreto. Por fora, é um app de notas comum que funciona de verdade. Por dentro, tem uma área de segurança para avisar a rede de apoio da pessoa.

Os avisos à rede de apoio saem pelo **Telegram** (bot) ou por uma **página web** aberta pelo contato, sem telefone, SMS nem WhatsApp. O ensaio (Teste seguro) não envia nada. O Ghosty não aciona nem substitui os canais oficiais (190, 180 e 192).

Projeto acadêmico da disciplina de Soluções Cloud.

## Arquitetura da solução

```mermaid
flowchart LR
  FE["ghosty-web<br/>Static Web Apps"] --> GW["Azure API Management"]
  GW --> BFF["ghosty-bff<br/>Container Apps"]
  BFF --> NS["ghosty-notes-service"]
  BFF --> SS["ghosty-safety-service"]
  BFF --> FN["ghosty-functions<br/>Azure Functions"]
  NS --> MDB[("MongoDB Atlas")]
  SS --> SQL[("Azure SQL")]
  SS -- "eventos" --> Q[["Storage Queues"]]
  Q -- "gatilho" --> FN
  FN -- "resultado" --> Q
  FN -- "avisos" --> TG["Telegram<br/>(bot)"]
```

## Este projeto

Responsável pelas notas do app: notas de texto e checklists, com cores, etiquetas, fixar, arquivar e lembretes. Oferece CRUD completo, documentado com Swagger. Só é chamado pelo BFF.

Casos de uso (vertical slices) previstos: `CreateNote`, `ListNotes`, `GetNote`, `UpdateNote`, `PatchNote`, `DeleteNote`, `DeleteAllNotesOfOwner` e `GetNotesSummary`.

### Organização do código (Clean Architecture + Vertical Slice)

```text
src/
├── domain/          entidade Note, itens de checklist e regras
├── application/     casos de uso organizados por feature (features/<feature>/<caso-de-uso>/)
├── infrastructure/  repositório MongoDB e configuração
└── api/             controllers, DTOs, guards e Swagger (composição)
```

As regras de dependência entre as camadas são verificadas por testes de arquitetura.

## Contrato e mock

O contrato v0 deste projeto está em [`ghosty-docs/contracts/notes-service.openapi.yaml`](../ghosty-docs/contracts/notes-service.openapi.yaml), com exemplos em cada operação. O mock sobe com `cd ../ghosty-docs && npm ci && npm run mock:notes` (porta 4011). Veja o [guia dos contratos e dos mocks](../ghosty-docs/contracts/README.md).

A configuração de TypeScript, ESLint, Prettier, Vitest e das regras de arquitetura vem de [`config/`](../config) (as cópias nesta pasta não devem ser editadas à mão).

## Tecnologias

- Node.js 24 + TypeScript
- NestJS 12 + `@nestjs/swagger`
- MongoDB Atlas (cluster Free em região Azure) com o driver oficial
- Vitest + ArchUnitTS + `mongodb-memory-server` (testes)
- Docker, Azure Container Apps

## Como rodar localmente

> Em construção.

Pré-requisito: Node.js 24 LTS (versão em `.nvmrc`).

Comandos previstos:

```bash
npm ci
cp .env.example .env    # MONGODB_URI do Atlas
npm run start:dev       # porta 3001 · Swagger em http://localhost:3001/docs
```

## Testes

> Em construção. Comandos previstos: `npm test` (unidade, arquitetura e integração).

## Docker

O `Dockerfile` (multi-stage, usuário sem root) e o `.dockerignore` já estão nesta pasta. Sem Docker na máquina, as imagens são publicadas pelo GitHub Actions ([`docker.yml`](../.github/workflows/docker.yml)) ao criar uma tag `v*`. Com Docker:

```bash
docker build -t <usuario>/ghosty-notes-service:v1 .
docker push <usuario>/ghosty-notes-service:v1
```

## Na nuvem (Azure)

> Os links serão adicionados depois do deploy.

## Projetos do repositório

| Pasta | Papel |
|---|---|
| [`ghosty-web`](../ghosty-web) | Microfrontend (shell + remotes `notes` e `safety`) |
| [`ghosty-bff`](../ghosty-bff) | Backend for Frontend: agregação e proxy |
| [`ghosty-notes-service`](../ghosty-notes-service) | Microserviço de notas (MongoDB Atlas) |
| [`ghosty-safety-service`](../ghosty-safety-service) | Microserviço de conta e rede de apoio (Azure SQL) |
| [`ghosty-functions`](../ghosty-functions) | Azure Functions: cálculo, enriquecimento e eventos |
| [`ghosty-docs`](../ghosty-docs) | Documentação: arc42, C4, AsyncAPI, contratos e infraestrutura |

## Alunos

- Amanda Fila de Lima
- Carlos Leonardo Garcia Pscheidt
- Rafael Della
- Gustavo Yuri
