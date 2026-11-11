# Implantação na Azure

[`deploy.sh`](deploy.sh) cria e configura o ambiente inteiro com o Azure CLI, em passos que podem rodar de novo (o que já existe é mantido e as configurações são reaplicadas). Os segredos são gerados direto no Key Vault: nenhum valor aparece no terminal nem em arquivo.

## Antes de começar

| O quê | Onde |
|---|---|
| Azure CLI com login (`az login`) e `jq`, `curl`, `openssl`, `zip`, Node.js 24 | Na máquina de quem implanta |
| Assinatura Azure for Students ativa (de preferência a oferta com crédito) | Portal da Azure |
| Imagens `v1` no Docker Hub (`ghosty-bff`, `ghosty-notes-service`, `ghosty-safety-service`) | Workflow [`docker.yml`](../../.github/workflows/docker.yml): `git tag v1 && git push origin v1`, com os secrets `DOCKERHUB_USERNAME` e `DOCKERHUB_TOKEN` no repositório |
| Access token do Docker Hub só de leitura (para o pull no Container Apps) | Docker Hub → Account settings → Personal access tokens |
| Cluster Free do MongoDB Atlas em região Azure, usuário `readWrite` no banco `notes` e acesso de rede `0.0.0.0/0` | Atlas (as saídas do Container Apps não têm IP fixo) |
| Bot do Telegram da nuvem (opcional; sem ele, nada sai pelo Telegram) | @BotFather → `/newbot` |

```bash
cp ghosty-docs/infra/azure.env.example ghosty-docs/infra/azure.env   # e preencha (nunca vai para o Git)
bash ghosty-docs/infra/deploy.sh check                                # assinatura, oferta, regiões, ferramentas e imagens
bash ghosty-docs/infra/deploy.sh all
```

## Passos

| Passo | O que faz |
|---|---|
| `check` | Mostra a assinatura e a oferta (avisa se for a Starter), as regiões permitidas pela policy, registra os providers e confere o Flex Consumption na região e as imagens no Docker Hub |
| `base` | Resource group e Log Analytics |
| `keyvault` | Key Vault (RBAC) e os segredos: chave interna, segredo do gateway, chave de cifra, chave RSA do JWT, segredo do webhook, senhas do SQL, URI do Atlas e token do bot |
| `sql` | Servidor e banco `safety` no free tier (serverless, pausa automática), firewall, usuário `app_safety` só com leitura e escrita ([`sql-setup.mjs`](sql-setup.mjs)) e as migrações com o usuário admin |
| `storage` | Storage account e as filas `help-requests`, `check-in-deadlines` e `alert-dispatches` |
| `functions` | Function App (Flex Consumption ou o plano B), identidade com acesso ao cofre, configurações por referência ao Key Vault, deploy do pacote e a function key no cofre |
| `containerapps` | Ambiente e os 3 apps (`app-web-api`, `app-notes`, `app-core`), com os segredos por referência ao Key Vault e escala a zero |
| `swa` | Os 4 Static Web Apps (`web-main`, `web-n`, `web-s`, `web-docs`) |
| `apim` | API Management Consumption: named values (3 do cofre), as 4 APIs importadas do OpenAPI de cada serviço, as políticas de [`../apim`](../apim) e os produtos `web-app` e `internal` com uma assinatura cada |
| `cross` | As URLs que só existem agora (convite, remote, Function) e o webhook do bot |
| `web` | Build do front apontando para o APIM, `staticwebapp.config.json` com CSP e CORS e o deploy dos 3 apps |
| `docs` | Página de documentação: links (com o vídeo, se `VIDEO_URL` estiver no `azure.env`), Swagger UI dos contratos e das APIs exportadas do APIM e o HTML do AsyncAPI |
| `seed` | Conta de demonstração "Maria Exemplo" no Azure SQL e as 8 notas no Atlas |
| `smoke` | Testes de fumaça (health pelo APIM, 401 sem a chave, 403 no BFF direto, Swaggers, front) e o fluxo de ponta a ponta pelo APIM |
| `status` | Os links da entrega |
| `teardown` | Apaga o resource group (pede confirmação) |

## Decisões e planos B

- **Uma região para tudo** (`LOC`), exceto os Static Web Apps (`SWA_LOCATION`), que só existem em algumas regiões. Se a policy bloquear todas elas, o plano B é o site estático do Storage na região permitida.
- **Function:** `FUNCTIONS_PLAN=consumption` cria o plano Consumption (Windows) se o Flex Consumption não estiver disponível na assinatura.
- **APIM:** sufixo vazio na API do BFF por padrão; `APIM_API_PATH=app` se o portal recusar.
- **Sem RBAC:** se a conta não puder criar atribuições de papel, crie o cofre com `--enable-rbac-authorization false` e use `az keyvault set-policy` para cada identidade.
- **Custos:** tudo dentro das franquias gratuitas: APIM Consumption (1 milhão de chamadas por mês), Container Apps com escala a zero (180 mil vCPU-segundos por mês), Function Flex Consumption (100 mil GB-segundos por mês), Azure SQL no free tier com pausa automática ao esgotar a franquia e Static Web Apps Free. O workspace de logs tem teto de 0,1 GB por dia (abaixo dos 5 GB gratuitos por mês), e o Application Insights da Function fica nele. Storage e Key Vault cobram por operação: centavos por mês. O passo `base` cria o orçamento `orcamento-notas`, com alerta por e-mail (`PUBLISHER_EMAIL`) acima de US$ 1 gasto no mês, e o `check` avisa se algum plano pago do Defender for Cloud estiver ligado. Depois da entrega, `deploy.sh teardown` apaga tudo.
- **Antes de apresentar:** abra o front e chame o painel para acordar os serviços (escala a zero) e confira a métrica "Free amount remaining" do Azure SQL.
