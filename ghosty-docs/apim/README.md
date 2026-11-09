# API Management: políticas

As políticas do Azure API Management (tier Consumption) ficam aqui, em arquivo, e são aplicadas pelo [`infra/deploy.sh`](../infra/deploy.sh) (passo `apim`).

| Arquivo | Escopo | O que faz |
|---|---|---|
| [`web-bff.xml`](web-bff.xml) | API `web-bff` (o BFF) | CORS só para o front, `validate-jwt` (JWKS do BFF) fora das rotas públicas, `X-Gateway-Secret` e `X-Correlation-Id` |
| [`internal-service.xml`](internal-service.xml) | APIs `notes-service` e `safety-service` | Injeta o `X-Internal-Key` |
| [`functions.xml`](functions.xml) | API `functions` | Injeta o `x-functions-key` |
| [`product-web-app.xml`](product-web-app.xml) | Produto `web-app` | `rate-limit` de 300 chamadas por 60 s por chave |
| [`product-internal.xml`](product-internal.xml) | Produto `internal` | `rate-limit` de 60 chamadas por 60 s por chave |

## Named values

| Nome | Tipo | Valor |
|---|---|---|
| `gateway-secret` | Key Vault | segredo `gateway-secret` |
| `internal-api-key` | Key Vault | segredo `internal-api-key` |
| `functions-key` | Key Vault | segredo `functions-key` |
| `bff-host` | Texto | FQDN do `app-web-api`, sem `https://` |
| `shell-origin` | Texto | origem do front, com `https://` |

## Decisões

- **Entrada centralizada.** O BFF recusa (403) qualquer chamada sem o `X-Gateway-Secret`, que só o gateway conhece. Ficam livres só o `/health` e o `/.well-known/` (usado pelo próprio `validate-jwt`).
- **CORS só no gateway.** Na nuvem, o BFF roda com `CORS_ORIGINS` vazio: o APIM responde o preflight e põe os cabeçalhos, sem duplicar `Access-Control-Allow-Origin`.
- **Limites.** O tier Consumption não tem `rate-limit-by-key`. Por isso o limite por chave fica nos produtos, e o limite por usuário e por IP fica no BFF (`@nestjs/throttler`).
- **Sufixo.** A API `web-bff` usa o sufixo vazio quando o portal aceita. Com o sufixo `app`, o front usa `https://<apim>.azure-api.net/app` como base, e o cliente da API compara as rotas sem o prefixo.
