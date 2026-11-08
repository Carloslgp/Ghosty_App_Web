# Eventos (AsyncAPI 3.0)

[`asyncapi.yaml`](asyncapi.yaml) descreve as 3 filas do Azure Storage (Azurite na máquina local), as 3 mensagens e quem publica e quem consome cada uma. É a "documentação Swagger" dos eventos.

| Evento (`type`) | Fila | Publica | Consome |
|---|---|---|---|
| `ghosty.safety.help-request.triggered.v1` | `help-requests` | `safety-service` (outbox) | Function `dispatch-alert` |
| `ghosty.safety.check-in.deadline-scheduled.v1` | `check-in-deadlines` | `safety-service` (outbox, com atraso até o prazo) | Function `check-in-deadline` |
| `ghosty.functions.alert.dispatched.v1` | `alert-dispatches` | Function `dispatch-alert` | `safety-service` (`RecordAlertDispatch`) |

## Arquivos

```text
asyncapi.yaml                    canais, operações e mensagens
schemas/*.v1.schema.json         JSON Schema (draft-07) de cada mensagem, envelope incluído
examples/*.json                  mensagens de exemplo (o nome começa com o nome do schema)
```

Os schemas ficam em arquivos próprios para os dois lados validarem com `ajv` sem converter nada:

```ts
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import schema from '../../ghosty-docs/asyncapi/schemas/help-request-triggered.v1.schema.json' with { type: 'json' };

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

if (!validate(envelope)) throw new Error(ajv.errorsText(validate.errors));
```

- O `safety-service` valida cada mensagem **antes de publicar**.
- A Function valida, nos testes, as mensagens de `examples/` que ela consome. Assim, uma mudança no schema que quebre o consumidor aparece no CI dos dois projetos.

## Regras das mensagens

- **Envelope:** `specversion` (`1.0`), `id` (UUID v7), `type`, `source`, `time`, `correlationId` e `data`. Nenhum campo extra é aceito, nem no envelope nem em `data`.
- **Codificação na fila:** o corpo é o JSON do envelope em UTF-8, **codificado em Base64**, nas 3 filas. É o formato que o gatilho de fila da Function espera por padrão. Quem lê a fila com o SDK (`@azure/storage-queue`) decodifica o Base64 antes do `JSON.parse`.
- **Pelo menos uma entrega:** o consumidor descarta repetições pelo `id` do envelope.
- **Ordem não garantida:** o prazo de check-in carrega a `version`; um prazo de versão antiga é ignorado.
- **Fila poison:** depois de 5 falhas, a mensagem vai para `<fila>-poison`.
- **Minimização de dados:** nenhum evento leva destino de entrega. O chat do Telegram fica só no banco, cifrado, e a Function o busca em `GET /internal/help-requests/{id}/delivery-targets` na hora de enviar. A localização só vai no evento quando a pessoa permitiu.
- **Status do resultado:** `AlertDispatched.data.status` é `failed` quando nenhum passo alcançou alguém (todos falharam ou não havia contato confirmado), e `dispatched` nos outros casos.

## Validar e gerar o HTML

```bash
npm test     # o documento é válido, cada exemplo segue o schema e mensagens fora do contrato são recusadas
```

O HTML navegável (para publicar junto da documentação) é gerado com o gerador oficial, que é baixado na hora pelo `npx`:

```bash
npx @asyncapi/cli generate fromTemplate asyncapi/asyncapi.yaml @asyncapi/html-template -o site/events
```

Outra opção é abrir o arquivo no [AsyncAPI Studio](https://studio.asyncapi.com/).
