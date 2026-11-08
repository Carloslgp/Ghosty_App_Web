# Contratos de API

Os contratos são acordados antes do código. Cada frente desenvolve contra um mock gerado do contrato, e integrar vira trocar uma URL. Toda mudança passa por pull request, aprovado por quem produz e por quem consome a API.

| Contrato | Produz | Consome | Mock |
|---|---|---|---|
| [`bff.openapi.yaml`](bff.openapi.yaml) | Carlos (`ghosty-bff`) | Amanda e Gustavo (remotes `notes` e `safety`) | `http://localhost:4010` |
| [`notes-service.openapi.yaml`](notes-service.openapi.yaml) | Amanda (`ghosty-notes-service`) | Carlos (BFF) | `http://localhost:4011` |
| [`safety-service.openapi.yaml`](safety-service.openapi.yaml) | Rafael (`ghosty-safety-service`) | Carlos (BFF) e Gustavo (Function) | `http://localhost:4012` |
| [`functions.openapi.yaml`](functions.openapi.yaml) | Gustavo (`ghosty-functions`) | Carlos (BFF) | `http://localhost:4013` |
| [`../asyncapi/asyncapi.yaml`](../asyncapi/asyncapi.yaml) | Gustavo e Rafael | Rafael e Gustavo | — |

Versão atual: **0.1.0** (v0). Os contratos usam **OpenAPI 3.0.3**, o mesmo formato que o `@nestjs/swagger` gera, para a comparação do contrato com o OpenAPI gerado pelo código não acusar diferenças falsas.

## Mocks (Prism)

Os mocks rodam com o Prism instalado como dependência deste projeto. Não precisa de Docker.

```bash
cd ghosty-docs
npm ci
npm run mock:all          # os 4 mocks juntos (Ctrl+C para parar)

npm run mock:bff          # só o BFF, na porta 4010
npm run mock:notes        # 4011
npm run mock:safety       # 4012
npm run mock:functions    # 4013

npm run test:mocks        # sobe os 4, faz chamadas de verdade e derruba tudo (também roda no CI)
```

### Apontar um projeto para o mock

Basta trocar a URL no `.env` do projeto:

| Quem | Variável | Valor com o mock |
|---|---|---|
| `ghosty-web` (shell e remotes) | `VITE_API_BASE_URL` | `http://localhost:4010` |
| `ghosty-bff` | `NOTES_SERVICE_URL` | `http://localhost:4011` |
| `ghosty-bff` | `SAFETY_SERVICE_URL` | `http://localhost:4012` |
| `ghosty-bff` | `FUNCTIONS_BASE_URL` | `http://localhost:4013` |
| `ghosty-functions` | `SAFETY_SERVICE_URL` | `http://localhost:4012` |

### Como o mock se comporta

- **Credenciais:** qualquer valor serve, mas o cabeçalho precisa existir. Sem `Authorization: Bearer ...`, sem `X-Safety-Token` (BFF), sem `X-Internal-Key` (serviços) ou sem `x-functions-key` (Function), o mock responde 401.
- **Validação:** os mocks rodam com `--errors`. Uma requisição fora do contrato (campo obrigatório faltando, `pageSize` acima de 100, `X-User-Id` que não é UUID) recebe 400 com o exemplo de erro do contrato. O mock avisa cedo quando o cliente se afasta do contrato.
- **Respostas:** por padrão, vem o primeiro exemplo da primeira resposta de sucesso. Para escolher outro, use o cabeçalho `Prefer`:

  ```bash
  # outro exemplo (o nome é o do exemplo da resposta no contrato)
  curl -H "Authorization: Bearer x" -H "X-Safety-Token: x" \
       -H "Prefer: example=notesUnavailable" http://localhost:4010/aggregated-data

  # outro status (simular erro)
  curl -H "Authorization: Bearer x" -H "Prefer: code=409" -X PUT http://localhost:4010/notes/6aec6fc05bd053a2e3d78b78 ...
  ```

  Exemplos úteis: `notesUnavailable` e `readinessFallback` em `/aggregated-data`; `dispatched`, `safeTest` e `triggered` em `/safety/help-requests/{id}`; `pending` e `acceptedWeb` em `/invitations/{token}`.

- **Sem estado:** o mock não guarda nada. Um `POST` responde o exemplo, mas a lista seguinte não muda. Para fluxos com estado (como acompanhar um pedido de ajuda até `dispatched`), alterne o `Prefer` nos testes ou use MSW no front.
- **Diferença conhecida:** sem `X-Safety-Token`, o mock do BFF responde 401 (é assim que o Prism trata credencial ausente). O BFF real responde 403 nesse caso, como o contrato descreve.
- Não use `Prefer: dynamic=true`: ele inventa dados aleatórios e campos extras.

## Validação dos contratos

```bash
npm run lint      # Redocly (regras recomendadas + as do projeto) e Prettier
npm test          # convenções abaixo + AsyncAPI e exemplos de eventos com ajv
```

O lint exige, em todo contrato: `operationId`, resumo e tag em cada operação; pelo menos uma resposta 4xx (as exceções estão em [`../.redocly.lint-ignore.yaml`](../.redocly.lint-ignore.yaml)); e exemplo em todo corpo de requisição e de resposta, válido contra o schema. Os testes conferem que os erros usam `application/problem+json` com o `code` certo para o status, que criações devolvem `Location`, que só as rotas públicas combinadas ficam sem autenticação e que os UUIDs dos exemplos são v7.

## Convenções

Valem para o BFF, os dois microserviços e a Function.

### Formato

- JSON em **camelCase**, UTF-8. A exceção é o corpo do webhook do Telegram e os metadados OpenID (`/.well-known/...`), que seguem o formato de quem define o padrão.
- Datas em **ISO 8601, sempre em UTC** (`2026-11-06T22:10:00Z`). A conversão para `America/Sao_Paulo` só acontece na interface e na mensagem montada pela Function.
- IDs em **UUID v7**, gerados na aplicação. As notas usam o ObjectId do MongoDB em texto (24 caracteres hexadecimais).
- Enums em inglês, minúsculos, separados por `_` (`check_in`, `published_web`).
- Campo anulável: no OpenAPI 3.0, `nullable: true`, e o `null` entra na lista do `enum` quando houver. Nos corpos de requisição, um campo opcional pode ser omitido; nas respostas, os campos aparecem sempre, com `null` quando não há valor.

### Erros (Problem Details, RFC 9457)

Toda resposta de erro usa `Content-Type: application/problem+json`:

```json
{
  "type": "/errors/validation-failed",
  "title": "Dados inválidos",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "detail": "O campo title tem mais de 200 caracteres.",
  "instance": "/notes",
  "correlationId": "01a1b2e9-6290-7765-80a9-717fa4f6dfff",
  "errors": [{ "field": "title", "message": "máximo de 200 caracteres" }]
}
```

| `code` | Status | Quando |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Corpo ou parâmetros inválidos, regra de formato violada |
| `UNAUTHENTICATED` | 401 | Token ausente ou inválido, chave interna ausente, credencial errada nos serviços internos |
| `FORBIDDEN` | 403 | No BFF: sessão segura ausente ou vencida, código secreto errado ou conta bloqueada, segredo do gateway ausente |
| `NOT_FOUND` | 404 | O recurso não existe ou não é do usuário (a resposta não diz qual dos dois) |
| `VERSION_CONFLICT` | 409 | Nota salva com versão antiga |
| `INVALID_STATE` | 409 | Transição proibida (confirmar check-in vencido, responder convite já respondido, 11º contato) |
| `EMAIL_IN_USE` | 409 | Cadastro com e-mail que já existe |
| `INVITATION_EXPIRED` | 410 | Convite vencido sem resposta |
| `RATE_LIMITED` | 429 | Limite do BFF atingido (com `Retry-After`) |
| `UPSTREAM_UNAVAILABLE` | 503 | Serviço interno fora do ar (o `/aggregated-data` não usa: responde parcial) |
| `INTERNAL_ERROR` | 500 | Erro inesperado, sem detalhes na resposta |

**401 x 403 no BFF.** Para o front, `401` sempre quer dizer "sessão inválida": o cliente renova o JWT uma vez e repete a chamada. Por isso o código secreto errado no `POST /safety/session` responde **403** (sempre igual para código errado e conta bloqueada). Se fosse 401, o cliente repetiria a chamada e contaria duas tentativas. Senha atual errada em `PUT /account/lock-code` responde 400, com o erro no campo `currentPassword`. Entre os serviços internos, credencial errada continua sendo 401.

### Paginação e ordenação

- Requisição: `?page=1&pageSize=20`, com `pageSize` de no máximo 100.
- Resposta: `{ "items": [...], "page": 1, "pageSize": 20, "total": 57 }`.
- Notas: fixadas primeiro, depois `updatedAt` decrescente. Check-ins e pedidos de ajuda: do mais novo para o mais antigo. Contatos: lista curta (até 10), sem paginação, na ordem de aviso.

### Cabeçalhos

| Cabeçalho | Caminho | Para quê |
|---|---|---|
| `Authorization: Bearer <jwt>` | front → API Management → BFF | Sessão da conta |
| `X-Safety-Token` | front → BFF | Sessão segura |
| `Ocp-Apim-Subscription-Key` | front → API Management | Produto `web-app` (chave pública) |
| `X-Correlation-Id` | todos os saltos, inclusive os eventos | Rastrear uma operação de ponta a ponta (gerado se não vier) |
| `X-Gateway-Secret` | API Management → BFF | Garantir que a entrada passou pelo gateway |
| `X-Internal-Key` e `X-User-Id` | BFF → serviços; Function → `safety-service` | Chamadas internas |
| `Idempotency-Key` | front → BFF → `safety-service` | `POST` de pedido de ajuda e de check-in |
| `x-functions-key` | BFF ou API Management → Function | Chave da função |

### Status e semântica

- Criação: `201`, com `Location`.
- `POST /help-requests`: `202`, porque o envio é assíncrono. O `Location` aponta para o recurso que o front acompanha.
- Exclusão: `204`.
- Nota: o `PUT` exige `version` e substitui a nota; o `PATCH` aceita campos parciais e confere a `version` só se ela vier.
- `Idempotency-Key`: a mesma chave, da mesma conta, em até 24 horas, devolve a mesma resposta (mesmo `id`) e não gera evento novo.

### Validação e logs

- DTOs na camada `api`, com `class-validator` e `@nestjs/swagger`, para o Swagger sair do código. As regras de negócio ficam no `domain`, sem depender dos DTOs.
- Logs em JSON (`pino`) com `correlationId`, `service`, `route`, `status` e `durationMs`.
- Campos sempre redigidos nos logs: `authorization`, `x-safety-token`, `x-internal-key`, `password`, `code`, `chatId`, `botToken`, `message` e `location`.
