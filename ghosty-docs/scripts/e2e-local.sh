#!/usr/bin/env bash
# Teste de ponta a ponta na máquina local, sem Docker e sem Azure: sobe o Azurite, o safety-service
# (SQLite), o notes-service (MongoDB em memória), as Functions (host local, sem o Core Tools) e o BFF,
# roda o scripts/e2e-flow.mjs e derruba tudo. Pré-requisito: `npm ci` e `npm run build` nos 4 projetos.
#
#   bash ghosty-docs/scripts/e2e-local.sh
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
LOGS="$WORK/logs"
mkdir -p "$LOGS"
for p in 3000 3001 3002 7071 10001; do
  if (echo > "/dev/tcp/127.0.0.1/$p") 2>/dev/null; then echo "A porta $p está ocupada. Pare o que estiver nela e tente de novo."; exit 1; fi
done
for dir in ghosty-safety-service ghosty-notes-service ghosty-functions ghosty-bff; do
  [ -d "$ROOT/$dir/dist" ] || { echo "Falta o build de $dir: rode npm ci && npm run build nele."; exit 1; }
done

PIDS=()
cleanup() {
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null; done
  sleep 1
  for pid in "${PIDS[@]}"; do kill -9 "$pid" 2>/dev/null; done
  if [ "${CODE:-1}" -ne 0 ]; then echo "Logs em $LOGS"; else rm -rf "${WORK:?}"; fi
}
trap cleanup EXIT
export INTERNAL_API_KEY=e2e-internal-key LOG_LEVEL=warn NODE_ENV=development
WEBHOOK=e2e-webhook-secret-0123456789abcdef

( cd "$ROOT/ghosty-safety-service" && exec node_modules/.bin/azurite-queue --inMemoryPersistence --skipApiVersionCheck --silent ) >"$LOGS/azurite.log" 2>&1 &
PIDS+=($!)
sleep 2
( cd "$ROOT/ghosty-safety-service" && PORT=3002 DB_PROVIDER=sqlite SQLITE_PATH="$WORK/safety.sqlite" \
  DATA_ENCRYPTION_KEY=Y2hhdmUtbG9jYWwtZGUtZGVzZW52b2x2aW1lbnRvISE= MESSAGING_ENABLED=true \
  exec node dist/api/main.js ) >"$LOGS/safety.log" 2>&1 &
PIDS+=($!)
( cd "$ROOT/ghosty-notes-service" && PORT=3001 MONGODB_URI= exec node dist/api/main.js --memory ) >"$LOGS/notes.log" 2>&1 &
PIDS+=($!)
( cd "$ROOT/ghosty-functions" && SAFETY_SERVICE_URL=http://localhost:3002 QueueConnection=UseDevelopmentStorage=true \
  DELIVERY_MODE=simulated TELEGRAM_WEBHOOK_SECRET=$WEBHOOK exec node scripts/local-host.mjs ) >"$LOGS/functions.log" 2>&1 &
PIDS+=($!)
( cd "$ROOT/ghosty-bff" && PORT=3000 NOTES_SERVICE_URL=http://localhost:3001 SAFETY_SERVICE_URL=http://localhost:3002 \
  FUNCTIONS_BASE_URL=http://localhost:7071 RATE_LIMIT_LOGIN_PER_MINUTE=50 RATE_LIMIT_USER_PER_MINUTE=1000 \
  exec node dist/api/main.js ) >"$LOGS/bff.log" 2>&1 &
PIDS+=($!)

for url in http://localhost:3002/health http://localhost:3001/health http://localhost:3000/health; do
  for _ in $(seq 1 90); do curl -sf "$url" >/dev/null && break; sleep 1; done
  curl -sf "$url" >/dev/null || { echo "Não subiu: $url"; tail -n 20 "$LOGS"/*.log; CODE=1; exit 1; }
done
for _ in $(seq 1 20); do grep -q "porta 7071" "$LOGS/functions.log" && break; sleep 1; done
echo "Serviços no ar. Rodando o fluxo..."
E2E_BASE_URL=http://localhost:3000 E2E_FUNCTIONS_URL=http://localhost:7071 TELEGRAM_WEBHOOK_SECRET=$WEBHOOK \
  node "$ROOT/ghosty-docs/scripts/e2e-flow.mjs"
CODE=$?
exit $CODE
