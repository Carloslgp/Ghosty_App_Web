# ghosty-web

Microfrontend do Ghosty: um shell e dois remotes, unidos por Module Federation.

> **Status:** monorepo (npm workspaces), `packages/ui`, `packages/api-client` (tipos gerados do contrato do BFF), shell (Entrar, Criar conta, Configurações, host dos remotes e desbloqueio pela busca), remote `notes` (a fachada completa) e remote `safety` (painel, rede de apoio e mensagem). Pedido de ajuda, Teste seguro, check-in e a página do convite chegam na próxima etapa.

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

O front só conversa com o BFF, sempre pelo API Gateway. Ele é dividido em apps independentes:

| Pasta | Papel |
|---|---|
| `apps/shell` | Host: login, sessão, carregamento dos remotes e saída rápida |
| `apps/notes` | Remote da fachada: notas e listas |
| `apps/safety` | Remote da área de segurança, carregado sob demanda |
| `packages/ui` | Tokens de design e componentes base |
| `packages/api-client` | Cliente tipado do BFF, gerado a partir do OpenAPI |

## Contrato e mock

O contrato que o front consome está em [`ghosty-docs/contracts/bff.openapi.yaml`](../ghosty-docs/contracts/bff.openapi.yaml), com exemplos em cada operação. O mock sobe com `cd ../ghosty-docs && npm ci && npm run mock:bff` (porta 4010). Veja o [guia dos contratos e dos mocks](../ghosty-docs/contracts/README.md).

Enquanto o BFF não existe, use `VITE_API_BASE_URL=http://localhost:4010` com o mock: `cd ../ghosty-docs && npm run mock:bff`.

A configuração de TypeScript, ESLint, Prettier, Vitest e das regras de arquitetura vem de [`config/`](../config) (as cópias nesta pasta não devem ser editadas à mão).

## Tecnologias

- React 19 + TypeScript
- Vite + `@module-federation/vite`
- React Router 7, TanStack Query 5, react-hook-form + zod
- CSS Modules
- Vitest + Testing Library + MSW
- Hospedagem: Azure Static Web Apps

## Como rodar localmente

Pré-requisito: Node.js 24 LTS. O front chama só o BFF (na máquina local, direto, sem o API Management).

```bash
npm ci
npm run dev          # shell (5173) + notes (5174) + safety (5175), em paralelo
```

- Abra http://localhost:5173. Sem o BFF rodando, aponte para o mock: `cd ../ghosty-docs && npm run mock:bff` (porta 4010) e use `VITE_API_BASE_URL=http://localhost:4010` em `apps/shell/.env.local`.
- Cada remote também roda sozinho contra o mock (`npm run dev:notes` e `npm run dev:safety`), com tokens de desenvolvimento.
- `npm run build` gera os 3 apps (`apps/*/dist`); `npm run preview` serve o build.
- `npm run generate` regera `packages/api-client/src/schema.d.ts` a partir de `ghosty-docs/contracts/bff.openapi.yaml`.

| Variável (build do Vite) | Local | Para quê |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3000` | BFF (na nuvem, a URL do APIM) |
| `VITE_APIM_SUBSCRIPTION_KEY` | vazia | Chave pública do produto `web-app` do APIM |
| `VITE_NOTES_REMOTE_URL` | `http://localhost:5174/remoteEntry.js` | Remote `notes` (o `safety` vem do BFF no desbloqueio) |

### Como as peças se encaixam

```text
apps/shell     host do Module Federation, BrowserRouter, AuthProvider (dono da sessão) e as telas da conta
apps/notes     remote "notes/App": lista, busca local, editor (texto e checklist), cores, etiquetas, lembrete
apps/safety    remote "safety/App": MemoryRouter, onboarding, painel, rede de apoio, mensagem, saída rápida
packages/ui            tokens (variáveis CSS) e componentes base, com alvos de toque de 44 px
packages/api-client    cliente tipado do BFF (openapi-fetch) e o contrato shell ↔ remotes
```

- O JWT e o token da sessão segura ficam só em memória; o refresh token fica no `localStorage` (o "continuar conectado" das notas). Os remotes nunca veem os tokens: recebem um `ApiClient` pronto, que renova o JWT uma vez no 401 e aciona a saída rápida no 403 da área de segurança.
- A busca filtra no navegador. No Enter, o shell testa `/^\d{6,8}$/`: se bater, chama `POST /safety/session`; com o código certo, registra o remote `safety` com a URL que o BFF devolve. A URL continua `/` e o título continua "Notas".
- Saída rápida: botão "Voltar às notas" ou Esc duas vezes. Revoga a sessão no BFF, apaga o cache `[safety, ...]` e volta às notas.
- O remote `safety` sai sem source maps e com arquivos nomeados só pelo hash.

## Testes

```bash
npm test             # Vitest + Testing Library + MSW (jsdom), sem servidor de verdade
npm run lint         # ESLint (com as regras do React) + Prettier
npm run typecheck
npm run build
```

Cobrem: entrar, criar conta, continuar conectado, código de bloqueio com a senha atual, excluir conta, desbloqueio (texto comum nunca chama o BFF; código errado não muda a tela) e saída rápida; a fachada (fixadas primeiro, busca local sem chamada ao servidor, Enter avisando o shell, editor com conflito de versão e item marcado); e, no remote `safety`, a prontidão com o aviso de cálculo simplificado, a reordenação da rede (`PUT /safety/contacts/order`), o convite e o debounce de 500 ms da prévia da mensagem.

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
