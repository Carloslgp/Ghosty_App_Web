#!/usr/bin/env bash
# Implantação do Ghosty na Azure, passo a passo, com o Azure CLI. Cada passo pode rodar de novo: o que
# já existe é mantido (e as configurações são reaplicadas).
#
#   cp ghosty-docs/infra/azure.env.example ghosty-docs/infra/azure.env   # e preencha
#   az login
#   bash ghosty-docs/infra/deploy.sh check        # confere assinatura, oferta, regiões e ferramentas
#   bash ghosty-docs/infra/deploy.sh all          # tudo, na ordem
#   bash ghosty-docs/infra/deploy.sh <passo>      # um passo só (lista: bash deploy.sh help)
#
# Nomes neutros de propósito: nada com "ghosty", "safety" ou "segurança" em domínios e recursos visíveis.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ENV_FILE="${AZURE_ENV_FILE:-$HERE/azure.env}"
APIM_API_VERSION=2022-08-01
# Primeira versão da API do Container Apps com o campo environmentMode.
ACA_API_VERSION=2025-10-02-preview
SWA_CLI="@azure/static-web-apps-cli@2"

bold() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\033[33m    aviso: %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31merro: %s\033[0m\n' "$*" >&2; exit 1; }

need() { for name in "$@"; do [ -n "${!name:-}" ] || die "Falta $name em $(basename "$ENV_FILE")."; done; }

# Lê o azure.env e deriva os nomes dos recursos (todos neutros).
load_env() {
  [ -f "$ENV_FILE" ] || die "Falta $ENV_FILE (copie o azure.env.example e preencha)."
  # Sem o \r das quebras de linha do Windows: o arquivo pode ter sido editado no VS Code ou no Bloco de Notas.
  # As variáveis não são exportadas: cada comando recebe só o que precisa (um valor vazio no azure.env não
  # pode apagar o padrão de um serviço, e a URI do Atlas e os tokens não vazam para o npm ci).
  # shellcheck disable=SC1090
  source <(tr -d '\r' <"$ENV_FILE")

  need SUBSCRIPTION_ID LOC SUF
  [[ "$SUF" =~ ^[a-z]{4}$ ]] || die "SUF precisa ter 4 letras minúsculas."

  RG="${RG:-rg-notas}"
  SWA_LOCATION="${SWA_LOCATION:-eastus2}"
  FUNCTIONS_PLAN="${FUNCTIONS_PLAN:-flex}"
  APIM_API_PATH="${APIM_API_PATH:-}"
  IMAGE_TAG="${IMAGE_TAG:-v1.1}"
  VIDEO_URL="${VIDEO_URL:-}"
  TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
  TELEGRAM_BOT_USERNAME="${TELEGRAM_BOT_USERNAME:-}"

  KV="kv-notas-$SUF"
  LAW="log-notas-$SUF"
  AI="appi-notas-$SUF"
  SQL="sql-notas-$SUF"
  SQL_DB=safety
  SQL_ADMIN=sqladmin
  SQL_APP_USER=app_safety
  ST="stnotas$SUF"
  FN="func-notas-$SUF"
  CAE="cae-notas-$SUF"
  APIM="apim-notas-$SUF"
  APP_BFF=app-web-api
  APP_NOTES=app-notes
  APP_CORE=app-core
  SWA_MAIN=web-main
  SWA_NOTES=web-n
  SWA_SAFETY=web-s
  SWA_DOCS=web-docs
  QUEUES=(help-requests check-in-deadlines alert-dispatches)
}

# ---------------------------------------------------------------- utilitários

exists() { "$@" --only-show-errors >/dev/null 2>&1; }

# Tenta de novo (a propagação de papéis do RBAC leva alguns minutos).
retry() {
  local attempt=1
  until "$@"; do
    [ "$attempt" -ge 8 ] && return 1
    warn "falhou; nova tentativa em 30 s ($attempt/7)"
    sleep 30
    attempt=$((attempt + 1))
  done
}

# Senha só com letras e dígitos (entra num comando T-SQL), com maiúscula, minúscula e dígito.
gen_password() { printf '%sA%s9' "$(openssl rand -hex 12)" "$(openssl rand -hex 6 | tr 'a-f' 'A-F')"; }

kv_id() { az keyvault show -n "$KV" --query id -o tsv; }
kv_uri() { printf 'https://%s.vault.azure.net/secrets/%s' "$KV" "$1"; }
kv_has() { exists az keyvault secret show --vault-name "$KV" -n "$1"; }
kv_get() { az keyvault secret show --vault-name "$KV" -n "$1" --query value -o tsv; }
kv_set() { az keyvault secret set --vault-name "$KV" -n "$1" --value "$2" --only-show-errors --output none; }
kv_ensure() { kv_has "$1" || { kv_set "$1" "$2"; info "segredo $1 criado"; }; }

my_object_id() {
  az ad signed-in-user show --query id -o tsv 2>/dev/null && return 0
  # Sem acesso ao Microsoft Graph: o "oid" do token de acesso.
  az account get-access-token --query accessToken -o tsv | cut -d. -f2 | tr '_-' '/+' |
    awk '{ n = length($0) % 4; if (n == 2) $0 = $0 "=="; else if (n == 3) $0 = $0 "="; print }' |
    base64 -d 2>/dev/null | jq -r .oid
}

assign_role() { # papel principal escopo [tipo]
  az role assignment create --role "$1" --assignee-object-id "$2" --assignee-principal-type "${4:-ServicePrincipal}" \
    --scope "$3" --only-show-errors --output none 2>/dev/null || true
}

fqdn() { az containerapp show -g "$RG" -n "$1" --query properties.configuration.ingress.fqdn -o tsv; }
# Em versões novas do CLI, o functionapp show de uma Flex Consumption traz os campos dentro de "properties".
fn_host() { az functionapp show -g "$RG" -n "$FN" --query "properties.defaultHostName || defaultHostName" -o tsv; }
swa_url() { printf 'https://%s' "$(az staticwebapp show -g "$RG" -n "$1" --query defaultHostname -o tsv)"; }
swa_token() { az staticwebapp secrets list -g "$RG" -n "$1" --query properties.apiKey -o tsv; }
apim_gateway() { az apim show -g "$RG" -n "$APIM" --query gatewayUrl -o tsv; }
api_base_url() { printf '%s%s' "$(apim_gateway)" "${APIM_API_PATH:+/$APIM_API_PATH}"; }

apim_id() { az apim show -g "$RG" -n "$APIM" --query id -o tsv; }
apim_url() { printf 'https://management.azure.com%s/%s?api-version=%s' "$(apim_id)" "$1" "$APIM_API_VERSION"; }
apim_get() { az rest --method get --url "$(apim_url "$1")" --only-show-errors --output none 2>/dev/null; }
# Cria ou atualiza (no APIM, a atualização exige If-Match).
apim_put() { # caminho corpo
  local url headers=()
  url="$(apim_url "$1")"
  if apim_get "$1"; then headers=(--headers "If-Match=*"); fi
  az rest --method put --url "$url" --body "$2" "${headers[@]}" --only-show-errors --output none
}
apim_wait() {
  for _ in $(seq 1 30); do apim_get "$1" && return 0; sleep 10; done
  die "O APIM não terminou de criar $1."
}
apim_policy_body() { jq -n --rawfile xml "$1" '{properties: {format: "rawxml", value: $xml}}'; }
apim_key() { # assinatura
  az rest --method post --url "$(apim_url "subscriptions/$1/listSecrets")" --query primaryKey -o tsv --only-show-errors
}

docker_image_exists() {
  curl -sf "https://hub.docker.com/v2/namespaces/${DOCKERHUB_USER}/repositories/$1/tags/${IMAGE_TAG}" >/dev/null
}

delivery_mode() { if [ -n "$TELEGRAM_BOT_TOKEN" ]; then echo telegram; else echo simulated; fi; }
bot_username() { if [ -n "$TELEGRAM_BOT_USERNAME" ]; then echo "$TELEGRAM_BOT_USERNAME"; else echo notas_dev_bot; fi; }

# ---------------------------------------------------------------- 1. checagens

step_check() {
  bold "1. Checagens da assinatura e das ferramentas"
  for tool in az jq curl openssl node npm zip; do command -v "$tool" >/dev/null || die "Falta a ferramenta $tool."; done
  az account set --subscription "$SUBSCRIPTION_ID"
  az account show --query "{assinatura: name, id: id, conta: user.name}" -o table
  local quota
  quota="$(az rest --method get --url "https://management.azure.com/subscriptions/$SUBSCRIPTION_ID?api-version=2022-12-01" \
    --query subscriptionPolicies.quotaId -o tsv 2>/dev/null || true)"
  info "Oferta (quotaId): ${quota:-desconhecida}"
  [[ "$quota" == *Starter* ]] && warn "Oferta Starter: o free tier do Azure SQL não funciona nela."
  info "Regiões permitidas pela policy (vazio: sem restrição):"
  az policy assignment list --query "[].parameters.listOfAllowedLocations.value" -o tsv 2>/dev/null | tr '\t' '\n' | sort -u | sed 's/^/      /'
  # Planos pagos do Defender for Cloud cobram por recurso. Os dois que vêm ligados em toda assinatura são gratuitos.
  local paid
  paid="$(az security pricing list --query "value[?pricingTier=='Standard' && name!='FoundationalCspm' && name!='Discovery'].name" \
    -o tsv 2>/dev/null | tr '\n' ' ')"
  if [ -n "$paid" ]; then
    warn "Planos pagos do Defender for Cloud ligados: $paid(desligue em Defender for Cloud → Environment settings)."
  else
    info "Defender for Cloud: nenhum plano pago ligado"
  fi
  # Os comandos az containerapp do próprio CLI bastam. A extensão containerapp só tem versões de prévia para o
  # CLI atual, e elas criam ambientes "Express", que não aceitam segredos do Key Vault: fica de fora.
  az extension remove --name containerapp --only-show-errors 2>/dev/null || true
  az extension add --name application-insights --upgrade --allow-preview false --only-show-errors
  for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.Web Microsoft.Sql Microsoft.Storage \
    Microsoft.KeyVault Microsoft.ApiManagement; do
    az provider register --namespace "$ns" --only-show-errors --output none
  done
  if [ "$FUNCTIONS_PLAN" = flex ] &&
    ! az functionapp list-flexconsumption-locations --query "[].name" -o tsv 2>/dev/null | grep -qix "$LOC"; then
    warn "Flex Consumption indisponível em $LOC: use FUNCTIONS_PLAN=consumption."
  fi
  if [ -n "${DOCKERHUB_USER:-}" ]; then
    for image in ghosty-bff ghosty-notes-service ghosty-safety-service; do
      docker_image_exists "$image" && info "imagem $DOCKERHUB_USER/$image:$IMAGE_TAG encontrada" ||
        warn "imagem $DOCKERHUB_USER/$image:$IMAGE_TAG não encontrada (rode o workflow docker.yml)"
    done
  fi
}

# ---------------------------------------------------------------- 2. base

step_base() {
  bold "2. Resource group e Log Analytics"
  az group create -n "$RG" -l "$LOC" --only-show-errors --output none
  exists az monitor log-analytics workspace show -g "$RG" -n "$LAW" ||
    az monitor log-analytics workspace create -g "$RG" -n "$LAW" -l "$LOC" --only-show-errors --output none
  # Teto diário de 0,1 GB: no máximo ~3 GB por mês, abaixo dos 5 GB gratuitos. Retenção de 30 dias (gratuita).
  az monitor log-analytics workspace update -g "$RG" -n "$LAW" --quota 0.1 --retention-time 30 \
    --only-show-errors --output none
  info "$RG e $LAW prontos em $LOC (logs limitados a 0,1 GB por dia)"
  budget_ensure
}

# Orçamento da assinatura com alerta por e-mail (o orçamento não custa nada e não desliga recursos):
# avisa quando o gasto real passa de US$ 1 e quando a previsão do mês passa de US$ 5.
budget_ensure() {
  if [ -z "${PUBLISHER_EMAIL:-}" ]; then
    warn "sem PUBLISHER_EMAIL: orçamento com alerta não criado"
    return 0
  fi
  local body
  body="$(jq -n --arg start "$(date -u +%Y-%m-01)T00:00:00Z" --arg email "$PUBLISHER_EMAIL" '{properties: {
    category: "Cost", amount: 5, timeGrain: "Monthly", timePeriod: {startDate: $start},
    notifications: {
      real: {enabled: true, operator: "GreaterThan", threshold: 20, thresholdType: "Actual", contactEmails: [$email]},
      previsto: {enabled: true, operator: "GreaterThan", threshold: 100, thresholdType: "Forecasted", contactEmails: [$email]}
    }}}')"
  if az rest --method put --only-show-errors --output none --body "$body" \
    --url "https://management.azure.com/subscriptions/$SUBSCRIPTION_ID/providers/Microsoft.Consumption/budgets/orcamento-notas?api-version=2023-05-01"; then
    info "orçamento orcamento-notas: alerta por e-mail acima de US\$ 1 gasto (ou US\$ 5 previstos) no mês"
  else
    warn "não foi possível criar o orçamento (a oferta pode não permitir); acompanhe em Cost Management"
  fi
}

# ---------------------------------------------------------------- 3. Key Vault

step_keyvault() {
  bold "3. Key Vault e segredos"
  need MONGODB_URI
  exists az keyvault show -n "$KV" ||
    az keyvault create -g "$RG" -n "$KV" -l "$LOC" --enable-rbac-authorization true --only-show-errors --output none
  assign_role "Key Vault Secrets Officer" "$(my_object_id)" "$(kv_id)" User
  info "aguardando a permissão no cofre (RBAC)..."
  retry az keyvault secret list --vault-name "$KV" --only-show-errors --output none
  kv_ensure internal-api-key "$(openssl rand -hex 32)"
  kv_ensure gateway-secret "$(openssl rand -hex 32)"
  kv_ensure data-encryption-key "$(openssl rand -base64 32)"
  kv_ensure telegram-webhook-secret "$(openssl rand -hex 32)"
  kv_ensure sql-admin-password "$(gen_password)"
  kv_ensure mssql-password "$(gen_password)"
  if ! kv_has jwt-private-key; then
    local pem
    pem="$(mktemp)"
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$pem" 2>/dev/null
    kv_set jwt-private-key "$(base64 -w0 "$pem")"
    rm -f "$pem"
    info "segredo jwt-private-key criado"
  fi
  kv_set mongodb-uri "$MONGODB_URI"
  if [ -n "$TELEGRAM_BOT_TOKEN" ]; then kv_set telegram-bot-token "$TELEGRAM_BOT_TOKEN"; fi
  info "segredos no $KV (nenhum valor é mostrado)"
}

# ---------------------------------------------------------------- 4. Azure SQL

step_sql() {
  bold "4. Azure SQL (free tier), usuário da aplicação e migrações"
  local admin_pw app_pw host my_ip
  admin_pw="$(kv_get sql-admin-password)"
  app_pw="$(kv_get mssql-password)"
  host="$SQL.database.windows.net"
  exists az sql server show -g "$RG" -n "$SQL" ||
    az sql server create -g "$RG" -n "$SQL" -l "$LOC" --admin-user "$SQL_ADMIN" --admin-password "$admin_pw" \
      --minimal-tls-version 1.2 --only-show-errors --output none
  exists az sql db show -g "$RG" -s "$SQL" -n "$SQL_DB" ||
    az sql db create -g "$RG" -s "$SQL" -n "$SQL_DB" --edition GeneralPurpose --compute-model Serverless \
      --family Gen5 --capacity 2 --use-free-limit --free-limit-exhaustion-behavior AutoPause \
      --auto-pause-delay 60 --backup-storage-redundancy Local --only-show-errors --output none
  az sql server firewall-rule create -g "$RG" -s "$SQL" -n azure-services \
    --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 --only-show-errors --output none
  my_ip="$(curl -sf https://api.ipify.org)"
  az sql server firewall-rule create -g "$RG" -s "$SQL" -n admin-local \
    --start-ip-address "$my_ip" --end-ip-address "$my_ip" --only-show-errors --output none
  info "firewall: serviços da Azure e o IP desta máquina ($my_ip)"

  (cd "$ROOT/ghosty-safety-service" && npm ci --silent && npm run build --silent)
  MSSQL_HOST="$host" MSSQL_ADMIN_USER="$SQL_ADMIN" MSSQL_ADMIN_PASSWORD="$admin_pw" \
    APP_USER="$SQL_APP_USER" APP_PASSWORD="$app_pw" node "$HERE/sql-setup.mjs"
  # A aplicação não roda DDL: as migrações saem daqui, com o admin.
  (cd "$ROOT/ghosty-safety-service" &&
    DB_PROVIDER=mssql MSSQL_HOST="$host" MSSQL_DATABASE="$SQL_DB" MSSQL_USER="$SQL_ADMIN" MSSQL_PASSWORD="$admin_pw" \
      INTERNAL_API_KEY=somente-migracao DATA_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
      node dist/infrastructure/persistence/migrate.js)
  info "lembrete: feche editores de consulta abertos no banco (impedem a pausa automática)"
}

# ---------------------------------------------------------------- 5. Storage e filas

step_storage() {
  bold "5. Storage account e filas"
  exists az storage account show -g "$RG" -n "$ST" ||
    az storage account create -g "$RG" -n "$ST" -l "$LOC" --sku Standard_LRS --kind StorageV2 \
      --min-tls-version TLS1_2 --allow-blob-public-access false --only-show-errors --output none
  local conn
  conn="$(az storage account show-connection-string -g "$RG" -n "$ST" -o tsv)"
  for queue in "${QUEUES[@]}"; do
    az storage queue create -n "$queue" --connection-string "$conn" --only-show-errors --output none
  done
  kv_set storage-connection-string "$conn"
  info "filas: ${QUEUES[*]} (as -poison são criadas pelo host da Function)"
}

# ---------------------------------------------------------------- 6. Function App

functions_package() {
  local stage zipfile
  stage="$(mktemp -d)"
  zipfile="$(mktemp -u).zip"
  # Tudo o que o npm escreve vai para o stderr: a saída desta função é só o caminho do zip.
  (cd "$ROOT/ghosty-functions" && npm ci --silent && npm run build --silent) >&2
  cp -r "$ROOT/ghosty-functions/dist" "$ROOT/ghosty-functions/host.json" \
    "$ROOT/ghosty-functions/package.json" "$ROOT/ghosty-functions/package-lock.json" "$stage/"
  (cd "$stage" && npm ci --omit=dev --ignore-scripts --silent && zip -qr "$zipfile" .) >&2
  rm -rf "${stage:?}"
  printf '%s' "$zipfile"
}

step_functions() {
  bold "6. Function App ($FUNCTIONS_PLAN)"
  # Application Insights no mesmo workspace (com o teto diário). Sem --app-insights, o functionapp create
  # criaria um por conta própria, com um workspace sem teto fora do resource group.
  exists az monitor app-insights component show -g "$RG" -a "$AI" ||
    az monitor app-insights component create -g "$RG" -a "$AI" -l "$LOC" --kind web --application-type web \
      --workspace "$(az monitor log-analytics workspace show -g "$RG" -n "$LAW" --query id -o tsv)" \
      --only-show-errors --output none
  if ! exists az functionapp show -g "$RG" -n "$FN"; then
    if [ "$FUNCTIONS_PLAN" = flex ]; then
      az functionapp create -g "$RG" -n "$FN" --storage-account "$ST" --flexconsumption-location "$LOC" \
        --runtime node --runtime-version 22 --instance-memory 512 --app-insights "$AI" --only-show-errors --output none
    else
      az functionapp create -g "$RG" -n "$FN" --storage-account "$ST" --consumption-plan-location "$LOC" \
        --os-type Windows --runtime node --runtime-version 22 --functions-version 4 --app-insights "$AI" \
        --only-show-errors --output none
    fi
  fi
  az functionapp identity assign -g "$RG" -n "$FN" --only-show-errors --output none
  assign_role "Key Vault Secrets User" "$(az functionapp identity show -g "$RG" -n "$FN" --query principalId -o tsv)" "$(kv_id)"

  local settings=(
    "QueueConnection=@Microsoft.KeyVault(SecretUri=$(kv_uri storage-connection-string))"
    "INTERNAL_API_KEY=@Microsoft.KeyVault(SecretUri=$(kv_uri internal-api-key))"
    "TELEGRAM_WEBHOOK_SECRET=@Microsoft.KeyVault(SecretUri=$(kv_uri telegram-webhook-secret))"
    "APP_TIMEZONE=America/Sao_Paulo"
    "DELIVERY_MODE=$(delivery_mode)"
    "TELEGRAM_BOT_USERNAME=$(bot_username)"
    "QUEUE_ALERT_DISPATCHES=alert-dispatches"
    "OPENAPI_SERVER_URL=https://$(fn_host)"
  )
  if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    settings+=("TELEGRAM_BOT_TOKEN=@Microsoft.KeyVault(SecretUri=$(kv_uri telegram-bot-token))")
  fi
  if exists az containerapp show -g "$RG" -n "$APP_CORE"; then
    settings+=("SAFETY_SERVICE_URL=https://$(fqdn "$APP_CORE")")
  fi
  az functionapp config appsettings set -g "$RG" -n "$FN" --settings "${settings[@]}" --only-show-errors --output none

  local zipfile
  zipfile="$(functions_package)"
  retry az functionapp deployment source config-zip -g "$RG" -n "$FN" --src "$zipfile" --only-show-errors --output none
  rm -f "$zipfile"
  local key
  key="$(retry az functionapp keys list -g "$RG" -n "$FN" --query functionKeys.default -o tsv)"
  [ -n "$key" ] || die "Não consegui ler a function key."
  kv_set functions-key "$key"
  info "https://$(fn_host)/api/docs (Swagger da Function)"
}

# ---------------------------------------------------------------- 7. Container Apps

ca_create() { # app imagem porta
  local app="$1" image="docker.io/${DOCKERHUB_USER}/$2:${IMAGE_TAG}" port="$3"
  if ! exists az containerapp show -g "$RG" -n "$app"; then
    az containerapp create -g "$RG" -n "$app" --environment "$CAE" --image "$image" \
      --registry-server docker.io --registry-username "$DOCKERHUB_USER" --registry-password "$DOCKERHUB_TOKEN" \
      --target-port "$port" --ingress external --min-replicas 0 --max-replicas 1 --cpu 0.25 --memory 0.5Gi \
      --env-vars "PORT=$port" --only-show-errors --output none
  fi
  # A identidade vem depois da criação: criada junto, a Azure às vezes responde 500 ("managed identity
  # bootstrap failed"), sobretudo ao recriar um app com o mesmo nome.
  retry az containerapp identity assign -g "$RG" -n "$app" --system-assigned --only-show-errors --output none
  assign_role "Key Vault Secrets User" "$(az containerapp show -g "$RG" -n "$app" --query identity.principalId -o tsv)" "$(kv_id)"
}

ca_secrets() { # app segredo...
  local app="$1" specs=()
  shift
  for secret in "$@"; do specs+=("$secret=keyvaultref:$(kv_uri "$secret"),identityref:system"); done
  retry az containerapp secret set -g "$RG" -n "$app" --secrets "${specs[@]}" --only-show-errors --output none
}

ca_env() { # app imagem VAR=valor...
  local app="$1" image="docker.io/${DOCKERHUB_USER}/$2:${IMAGE_TAG}"
  shift 2
  retry az containerapp update -g "$RG" -n "$app" --image "$image" --set-env-vars "$@" --only-show-errors --output none
}

step_containerapps() {
  bold "7. Container Apps (BFF e microserviços)"
  need DOCKERHUB_USER DOCKERHUB_TOKEN
  for image in ghosty-bff ghosty-notes-service ghosty-safety-service; do
    docker_image_exists "$image" || die "Falta a imagem $DOCKERHUB_USER/$image:$IMAGE_TAG no Docker Hub."
  done
  # O modo do ambiente vai explícito, pela API: sem ele, a Azure cria o ambiente "Express", que não aceita
  # segredos por referência ao Key Vault (e o modo não muda depois de criado).
  local cae_url
  cae_url="https://management.azure.com/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG/providers/Microsoft.App/managedEnvironments/$CAE?api-version=$ACA_API_VERSION"
  if ! exists az containerapp env show -g "$RG" -n "$CAE"; then
    local law_id law_key
    law_id="$(az monitor log-analytics workspace show -g "$RG" -n "$LAW" --query customerId -o tsv)"
    law_key="$(az monitor log-analytics workspace get-shared-keys -g "$RG" -n "$LAW" --query primarySharedKey -o tsv)"
    az rest --method put --url "$cae_url" --only-show-errors --output none \
      --body "$(jq -n --arg loc "$LOC" --arg id "$law_id" --arg key "$law_key" '{location: $loc, properties: {
        environmentMode: "WorkloadProfiles",
        workloadProfiles: [{name: "Consumption", workloadProfileType: "Consumption"}],
        appLogsConfiguration: {destination: "log-analytics", logAnalyticsConfiguration: {customerId: $id, sharedKey: $key}}}}')"
    info "criando o ambiente $CAE (alguns minutos)..."
    for _ in $(seq 1 60); do
      [ "$(az containerapp env show -g "$RG" -n "$CAE" --query properties.provisioningState -o tsv 2>/dev/null)" = Succeeded ] && break
      sleep 10
    done
  fi
  [ "$(az rest --method get --url "$cae_url" --query properties.environmentMode -o tsv)" != Express ] ||
    die "O ambiente $CAE está no modo Express, que não aceita segredos do Key Vault. Apague os apps e o ambiente (az containerapp env delete) e rode este passo de novo."

  ca_create "$APP_NOTES" ghosty-notes-service 3001
  ca_create "$APP_CORE" ghosty-safety-service 3002
  ca_create "$APP_BFF" ghosty-bff 3000
  info "aguardando as permissões das identidades no cofre..."

  ca_secrets "$APP_NOTES" mongodb-uri internal-api-key
  ca_env "$APP_NOTES" ghosty-notes-service NODE_ENV=production PORT=3001 LOG_LEVEL=info MONGODB_DB=notes \
    MONGODB_URI=secretref:mongodb-uri INTERNAL_API_KEY=secretref:internal-api-key \
    OPENAPI_SERVER_URL="https://$(fqdn "$APP_NOTES")"

  local invite_base="https://example.invalid/c"
  if exists az staticwebapp show -g "$RG" -n "$SWA_MAIN"; then invite_base="$(swa_url "$SWA_MAIN")/c"; fi
  ca_secrets "$APP_CORE" mssql-password data-encryption-key internal-api-key storage-connection-string
  ca_env "$APP_CORE" ghosty-safety-service NODE_ENV=production PORT=3002 LOG_LEVEL=info \
    DB_PROVIDER=mssql MSSQL_HOST="$SQL.database.windows.net" MSSQL_DATABASE="$SQL_DB" MSSQL_USER="$SQL_APP_USER" \
    MSSQL_PASSWORD=secretref:mssql-password DATA_ENCRYPTION_KEY=secretref:data-encryption-key \
    INTERNAL_API_KEY=secretref:internal-api-key QUEUE_CONNECTION_STRING=secretref:storage-connection-string \
    MESSAGING_ENABLED=true INVITE_BASE_URL="$invite_base" TELEGRAM_BOT_USERNAME="$(bot_username)" \
    APP_TIMEZONE=America/Sao_Paulo OPENAPI_SERVER_URL="https://$(fqdn "$APP_CORE")"

  local remote="https://example.invalid/remoteEntry.js" docs_server="https://$(fqdn "$APP_BFF")"
  if exists az staticwebapp show -g "$RG" -n "$SWA_SAFETY"; then remote="$(swa_url "$SWA_SAFETY")/remoteEntry.js"; fi
  # O Swagger do BFF aponta para o API Gateway, que é por onde o front chama (o passo cross acerta depois).
  if exists az apim show -g "$RG" -n "$APIM"; then docs_server="$(api_base_url)"; fi
  ca_secrets "$APP_BFF" gateway-secret jwt-private-key internal-api-key functions-key
  ca_env "$APP_BFF" ghosty-bff NODE_ENV=production PORT=3000 LOG_LEVEL=info \
    PUBLIC_BASE_URL="https://$(fqdn "$APP_BFF")" CORS_ORIGINS=none TRUST_PROXY_HOPS=2 \
    GATEWAY_SECRET=secretref:gateway-secret JWT_PRIVATE_KEY_PEM_B64=secretref:jwt-private-key JWT_KEY_ID=nuvem-1 \
    NOTES_SERVICE_URL="http://$APP_NOTES" SAFETY_SERVICE_URL="http://$APP_CORE" \
    INTERNAL_API_KEY=secretref:internal-api-key FUNCTIONS_BASE_URL="https://$(fn_host)" \
    FUNCTIONS_KEY=secretref:functions-key SAFETY_REMOTE_URL="$remote" APP_TIMEZONE=America/Sao_Paulo \
    OPENAPI_SERVER_URL="$docs_server"

  for app in "$APP_BFF" "$APP_NOTES" "$APP_CORE"; do info "https://$(fqdn "$app")/docs"; done
}

# ---------------------------------------------------------------- 8. Static Web Apps

step_swa() {
  bold "8. Static Web Apps (shell, remotes e documentação)"
  for app in "$SWA_MAIN" "$SWA_NOTES" "$SWA_SAFETY" "$SWA_DOCS"; do
    exists az staticwebapp show -g "$RG" -n "$app" ||
      az staticwebapp create -g "$RG" -n "$app" -l "$SWA_LOCATION" --sku Free --only-show-errors --output none
    info "$app: $(swa_url "$app")"
  done
}

# ---------------------------------------------------------------- 9. API Management

# A criação dos named values é assíncrona: as políticas que os usam só podem ser gravadas depois.
apim_named_value_kv() { # nome segredo
  apim_put "namedValues/$1" "$(jq -n --arg name "$1" --arg uri "$(kv_uri "$2")" \
    '{properties: {displayName: $name, secret: true, keyVault: {secretIdentifier: $uri}}}')"
  apim_wait "namedValues/$1"
}

apim_named_value() { # nome valor
  apim_put "namedValues/$1" "$(jq -n --arg name "$1" --arg value "$2" \
    '{properties: {displayName: $name, value: $value, secret: false}}')"
  apim_wait "namedValues/$1"
}

apim_import() { # id nome sufixo spec backend
  apim_put "apis/$1" "$(jq -n --arg name "$2" --arg path "$3" --arg spec "$4" --arg backend "$5" \
    '{properties: {displayName: $name, path: $path, format: "openapi+json-link", value: $spec,
      serviceUrl: $backend, protocols: ["https"], subscriptionRequired: true}}')"
  apim_wait "apis/$1"
  info "API $1 importada ($4)"
}

apim_product() { # id nome política api...
  local id="$1" name="$2" policy="$3"
  shift 3
  apim_put "products/$id" "$(jq -n --arg name "$name" \
    '{properties: {displayName: $name, subscriptionRequired: true, approvalRequired: false, state: "published"}}')"
  apim_wait "products/$id"
  for api in "$@"; do
    az rest --method put --url "$(apim_url "products/$id/apis/$api")" --only-show-errors --output none
  done
  apim_put "products/$id/policies/policy" "$(apim_policy_body "$HERE/../apim/$policy")"
  apim_put "subscriptions/$id-1" "$(jq -n --arg scope "/products/$id" --arg name "$name" \
    '{properties: {scope: $scope, displayName: $name, state: "active"}}')"
}

step_apim() {
  bold "9. API Management (Consumption)"
  need PUBLISHER_EMAIL
  if ! exists az apim show -g "$RG" -n "$APIM"; then
    info "criando o APIM (alguns minutos)..."
    az apim create -g "$RG" -n "$APIM" -l "$LOC" --sku-name Consumption --publisher-name Notas \
      --publisher-email "$PUBLISHER_EMAIL" --enable-managed-identity true --only-show-errors --output none
  fi
  assign_role "Key Vault Secrets User" "$(az apim show -g "$RG" -n "$APIM" --query identity.principalId -o tsv)" "$(kv_id)"

  local bff notes core fnh
  bff="$(fqdn "$APP_BFF")"
  notes="$(fqdn "$APP_NOTES")"
  core="$(fqdn "$APP_CORE")"
  fnh="$(fn_host)"
  info "named values (os do Key Vault esperam a permissão da identidade do APIM)..."
  retry apim_named_value_kv gateway-secret gateway-secret
  retry apim_named_value_kv internal-api-key internal-api-key
  retry apim_named_value_kv functions-key functions-key
  apim_named_value bff-host "$bff"
  apim_named_value shell-origin "$(swa_url "$SWA_MAIN")"

  # Os serviços escalam a zero: a primeira chamada acorda cada um antes da importação.
  for url in "https://$bff/health" "https://$notes/health" "https://$core/health"; do
    curl -s -o /dev/null --retry 6 --retry-delay 10 --retry-all-errors "$url" || true
  done
  apim_import web-bff "web-bff" "$APIM_API_PATH" "https://$bff/docs-json" "https://$bff"
  apim_import notes-service "notes-service" "svc/notes" "https://$notes/docs-json" "https://$notes"
  apim_import safety-service "safety-service" "svc/safety" "https://$core/docs-json" "https://$core"
  apim_import functions "functions" "fn" "https://$fnh/api/openapi.json" "https://$fnh"

  apim_put "apis/web-bff/policies/policy" "$(apim_policy_body "$HERE/../apim/web-bff.xml")"
  apim_put "apis/notes-service/policies/policy" "$(apim_policy_body "$HERE/../apim/internal-service.xml")"
  apim_put "apis/safety-service/policies/policy" "$(apim_policy_body "$HERE/../apim/internal-service.xml")"
  apim_put "apis/functions/policies/policy" "$(apim_policy_body "$HERE/../apim/functions.xml")"

  apim_product web-app "web-app" product-web-app.xml web-bff
  apim_product internal "internal" product-internal.xml notes-service safety-service functions
  info "gateway: $(api_base_url)"
}

# ---------------------------------------------------------------- 10. ajustes cruzados

step_cross() {
  bold "10. Ajustes cruzados (URLs que só existem agora) e webhook do Telegram"
  local main safety_remote
  main="$(swa_url "$SWA_MAIN")"
  safety_remote="$(swa_url "$SWA_SAFETY")/remoteEntry.js"
  retry az containerapp update -g "$RG" -n "$APP_CORE" --set-env-vars "INVITE_BASE_URL=$main/c" --only-show-errors --output none
  retry az containerapp update -g "$RG" -n "$APP_BFF" --set-env-vars \
    "PUBLIC_BASE_URL=https://$(fqdn "$APP_BFF")" "SAFETY_REMOTE_URL=$safety_remote" \
    "FUNCTIONS_BASE_URL=https://$(fn_host)" "OPENAPI_SERVER_URL=$(api_base_url)" --only-show-errors --output none
  az functionapp config appsettings set -g "$RG" -n "$FN" \
    --settings "SAFETY_SERVICE_URL=https://$(fqdn "$APP_CORE")" --only-show-errors --output none

  if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
    (cd "$ROOT/ghosty-functions" && npm ci --silent && npm run build --silent &&
      TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" TELEGRAM_WEBHOOK_SECRET="$(kv_get telegram-webhook-secret)" \
        INTERNAL_API_KEY=somente-webhook node dist/cli/telegram.js webhook set \
        "https://$(fn_host)/api/telegram/webhook?code=$(kv_get functions-key)")
  else
    warn "sem TELEGRAM_BOT_TOKEN: webhook não registrado (DELIVERY_MODE=simulated)"
  fi
}

# ---------------------------------------------------------------- 11. front

swa_deploy() { # pasta recurso
  # A partir da pasta de cima e com a configuração da própria pasta: sem --swa-config-location, o SWA CLI
  # usa o primeiro staticwebapp.config.json que encontrar (o do shell valia para os remotes), e ele não
  # aceita rodar de dentro da pasta publicada.
  local token dir
  token="$(swa_token "$2")"
  dir="$(basename "$1")"
  (cd "$(dirname "$1")" &&
    npx --yes "$SWA_CLI" deploy "$dir" --swa-config-location "$dir" --deployment-token "$token" --env production)
}

step_web() {
  bold "11. Build e deploy do front (shell e remotes)"
  local gateway main notes safety key
  gateway="$(apim_gateway)"
  main="$(swa_url "$SWA_MAIN")"
  notes="$(swa_url "$SWA_NOTES")"
  safety="$(swa_url "$SWA_SAFETY")"
  key="$(apim_key web-app-1)"
  (cd "$ROOT/ghosty-web" && npm ci --silent &&
    VITE_API_BASE_URL="$(api_base_url)" VITE_APIM_SUBSCRIPTION_KEY="$key" \
      VITE_NOTES_REMOTE_URL="$notes/remoteEntry.js" npm run build &&
    SHELL_ORIGIN="$main" NOTES_ORIGIN="$notes" SAFETY_ORIGIN="$safety" API_ORIGIN="$gateway" npm run swa:config)
  swa_deploy "$ROOT/ghosty-web/apps/notes/dist" "$SWA_NOTES"
  swa_deploy "$ROOT/ghosty-web/apps/safety/dist" "$SWA_SAFETY"
  swa_deploy "$ROOT/ghosty-web/apps/shell/dist" "$SWA_MAIN"
  info "front: $main"
}

# ---------------------------------------------------------------- 12. documentação

step_docs() {
  bold "12. Página de documentação (Swaggers, AsyncAPI e links)"
  local out
  out="$(mktemp -d)"
  # O export vem com o documento direto no corpo ou dentro de "value" (como objeto ou texto), conforme a
  # versão da API. Só fica o arquivo que tiver um OpenAPI de verdade.
  for api in web-bff notes-service safety-service functions; do
    if ! az rest --method get --url "$(apim_url "apis/$api")&format=openapi%2Bjson&export=true" \
      -o json --only-show-errors >"$out/raw.json" 2>/dev/null ||
      ! jq -e 'if has("openapi") or has("swagger") then . else .value end
        | if type == "string" then fromjson else . end | select(type == "object" and has("paths"))' \
        "$out/raw.json" >"$out/apim-$api.json"; then
      rm -f "$out/apim-$api.json"
      warn "não consegui exportar a API $api do APIM"
    fi
  done
  rm -f "$out/raw.json"
  (cd "$ROOT/ghosty-docs" && npm ci --silent &&
    { SITE_DIR="$ROOT/ghosty-docs/site" npm run asyncapi:html || echo "aviso: sem o HTML do AsyncAPI (fica o link do Studio)" >&2; } &&
    SITE_DIR="$ROOT/ghosty-docs/site" APIM_EXPORTS="$out" REPO_URL="$(git -C "$ROOT" remote get-url origin 2>/dev/null | sed 's#git@github.com:#https://github.com/#; s#\.git$##')" \
      FRONT_URL="$(swa_url "$SWA_MAIN")" GATEWAY_URL="$(api_base_url)" \
      BFF_URL="https://$(fqdn "$APP_BFF")" NOTES_URL="https://$(fqdn "$APP_NOTES")" \
      SAFETY_URL="https://$(fqdn "$APP_CORE")" FUNCTIONS_URL="https://$(fn_host)" \
      DOCKERHUB_USER="${DOCKERHUB_USER:-}" VIDEO_URL="$VIDEO_URL" node scripts/build-site.mjs)
  rm -rf "${out:?}"
  swa_deploy "$ROOT/ghosty-docs/site" "$SWA_DOCS"
  info "documentação: $(swa_url "$SWA_DOCS")"
}

# ---------------------------------------------------------------- 13. seed

step_seed() {
  bold "13. Dados de demonstração (conta Maria Exemplo)"
  need DEMO_ACCOUNT_ID DEMO_PASSWORD DEMO_LOCK_CODE
  (cd "$ROOT/ghosty-safety-service" && npm ci --silent && npm run build --silent &&
    DB_PROVIDER=mssql MSSQL_HOST="$SQL.database.windows.net" MSSQL_DATABASE="$SQL_DB" MSSQL_USER="$SQL_APP_USER" \
      MSSQL_PASSWORD="$(kv_get mssql-password)" DATA_ENCRYPTION_KEY="$(kv_get data-encryption-key)" \
      INTERNAL_API_KEY="$(kv_get internal-api-key)" INVITE_BASE_URL="$(swa_url "$SWA_MAIN")/c" \
      TELEGRAM_BOT_USERNAME="$(bot_username)" DEMO_ACCOUNT_ID="$DEMO_ACCOUNT_ID" DEMO_PASSWORD="$DEMO_PASSWORD" \
      DEMO_LOCK_CODE="$DEMO_LOCK_CODE" DEMO_TELEGRAM_CHAT_ID="${DEMO_TELEGRAM_CHAT_ID:-}" node dist/seed/main.js demo)
  (cd "$ROOT/ghosty-notes-service" && npm ci --silent && npm run build --silent &&
    MONGODB_URI="$(kv_get mongodb-uri)" MONGODB_DB=notes INTERNAL_API_KEY=somente-seed \
      DEMO_ACCOUNT_ID="$DEMO_ACCOUNT_ID" node dist/seed/main.js demo)
}

# ---------------------------------------------------------------- 14. testes de fumaça

check_status() { # descrição esperado url [curl...]
  local label="$1" expected="$2" url="$3" got
  shift 3
  got="$(curl -s -o /dev/null -w '%{http_code}' --retry 3 --retry-delay 10 "$@" "$url" || true)"
  if [ "$got" = "$expected" ]; then info "ok    $label ($got)"; else warn "FALHA $label: esperado $expected, veio $got ($url)"; SMOKE_FAILED=1; fi
}

step_smoke() {
  bold "14. Testes de fumaça"
  SMOKE_FAILED=0
  local key base bff
  key="$(apim_key web-app-1)"
  base="$(api_base_url)"
  bff="https://$(fqdn "$APP_BFF")"
  check_status "health pelo APIM" 200 "$base/health" -H "Ocp-Apim-Subscription-Key: $key"
  check_status "APIM sem a chave de assinatura" 401 "$base/health"
  check_status "BFF direto, sem o X-Gateway-Secret" 403 "$bff/notes"
  check_status "Swagger do BFF" 200 "$bff/docs"
  check_status "Swagger do notes-service" 200 "https://$(fqdn "$APP_NOTES")/docs"
  check_status "Swagger do safety-service" 200 "https://$(fqdn "$APP_CORE")/docs"
  check_status "Swagger da Function" 200 "https://$(fn_host)/api/docs"
  check_status "front" 200 "$(swa_url "$SWA_MAIN")"
  check_status "remoteEntry do remote notes" 200 "$(swa_url "$SWA_NOTES")/remoteEntry.js"
  check_status "documentação" 200 "$(swa_url "$SWA_DOCS")"
  info "fluxo de ponta a ponta pelo APIM..."
  E2E_BASE_URL="$base" E2E_SUBSCRIPTION_KEY="$key" E2E_SKIP_SLOW="${E2E_SKIP_SLOW:-false}" \
    node "$ROOT/ghosty-docs/scripts/e2e-flow.mjs" || SMOKE_FAILED=1
  [ "$SMOKE_FAILED" = 0 ] || die "Algum teste de fumaça falhou (veja acima)."
}

# ---------------------------------------------------------------- utilidades

step_status() {
  bold "Links"
  info "Frontend:                 $(swa_url "$SWA_MAIN")"
  info "API Gateway (APIM):       $(api_base_url)"
  info "Swagger do BFF:           https://$(fqdn "$APP_BFF")/docs"
  info "Swagger do notes-service: https://$(fqdn "$APP_NOTES")/docs"
  info "Swagger do safety-service: https://$(fqdn "$APP_CORE")/docs"
  info "Swagger da Function:      https://$(fn_host)/api/docs"
  info "Documentação (APIM, AsyncAPI e links): $(swa_url "$SWA_DOCS")"
  [ -n "${DOCKERHUB_USER:-}" ] && info "Docker Hub:               https://hub.docker.com/u/$DOCKERHUB_USER"
  info "Chave web-app (pública, vai no front): $(apim_key web-app-1 | cut -c1-6)…"
}

step_teardown() {
  bold "Apagar tudo: az group delete -n $RG"
  read -r -p "Digite o nome do resource group ($RG) para confirmar: " answer
  [ "$answer" = "$RG" ] || die "Cancelado."
  az group delete -n "$RG" --yes --no-wait
  info "Exclusão iniciada. O Key Vault fica em soft-delete: az keyvault purge -n $KV (opcional)."
}

usage() {
  cat <<'EOF'
Uso: bash ghosty-docs/infra/deploy.sh <passo>

  check         assinatura, oferta, regiões, ferramentas e imagens
  base          resource group e Log Analytics
  keyvault      Key Vault e segredos gerados
  sql           Azure SQL (free tier), usuário da aplicação e migrações
  storage       Storage account e filas
  functions     Function App, configurações, deploy e function key
  containerapps ambiente e os 3 Container Apps (BFF, notes, core)
  swa           os 4 Static Web Apps
  apim          API Management: named values, APIs, políticas, produtos e chaves
  cross         URLs cruzadas e webhook do Telegram
  web           build e deploy do front
  docs          página de documentação (Swaggers, AsyncAPI e links)
  seed          dados de demonstração
  smoke         testes de fumaça e fluxo de ponta a ponta pelo APIM
  status        links da entrega
  all           check → base → keyvault → sql → storage → functions → containerapps → swa → apim → cross → web → docs → smoke
  teardown      apaga o resource group inteiro (pede confirmação)
EOF
}

main() {
  local step="${1:-help}"
  case "$step" in
    help | -h | --help) usage ;;
    all)
      load_env
      for s in check base keyvault sql storage functions containerapps swa apim cross web docs smoke status; do
        "step_$s"
      done
      ;;
    check | base | keyvault | sql | storage | functions | containerapps | swa | apim | cross | web | docs | seed | smoke | status | teardown)
      load_env
      [ "$step" = check ] || az account set --subscription "$SUBSCRIPTION_ID"
      "step_$step"
      ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
