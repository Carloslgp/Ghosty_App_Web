#!/usr/bin/env bash
# Sobe o Ghosty inteiro na máquina local, sem Docker e sem Azure, num terminal só (concurrently):
# filas (Azurite), safety-service (SQLite), notes-service (MongoDB em memória, ou o Atlas do .env),
# Functions, BFF e o front (shell + 2 remotes). Ctrl+C derruba tudo.
#
#   bash ghosty-docs/scripts/dev-local.sh             # usa as dependências já instaladas
#   bash ghosty-docs/scripts/dev-local.sh --install   # roda npm ci nos 6 projetos antes
#
# Na primeira vez, cria os .env e o local.settings.json a partir dos exemplos (valores de desenvolvimento).
# As Functions sobem com o `func start` se o Azure Functions Core Tools estiver instalado; sem ele, com o
# host local de testes (scripts/local-host.mjs), que roda o mesmo código compilado.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECTS=(ghosty-safety-service ghosty-notes-service ghosty-functions ghosty-bff ghosty-web ghosty-docs)

copy_if_missing() {
  if [ ! -f "$2" ]; then
    cp "$1" "$2"
    echo "criado ${2#"$ROOT"/} a partir do exemplo"
  fi
}
for dir in ghosty-safety-service ghosty-notes-service ghosty-bff; do
  copy_if_missing "$ROOT/$dir/.env.example" "$ROOT/$dir/.env"
done
copy_if_missing "$ROOT/ghosty-functions/local.settings.example.json" "$ROOT/ghosty-functions/local.settings.json"

if [ "${1:-}" = "--install" ]; then
  for dir in "${PROJECTS[@]}"; do (cd "$ROOT/$dir" && echo "npm ci em $dir" && npm ci --no-audit --no-fund); done
fi
for dir in "${PROJECTS[@]}"; do
  [ -d "$ROOT/$dir/node_modules" ] || { echo "Falta npm ci em $dir (ou rode com --install)."; exit 1; }
done

if command -v func >/dev/null; then
  FUNCTIONS="cd '$ROOT/ghosty-functions' && npm start"
else
  echo "Azure Functions Core Tools não encontrado: as Functions sobem com o host local de testes."
  FUNCTIONS="cd '$ROOT/ghosty-functions' && npm run start:local-host"
fi

mkdir -p "$HOME/.azurite"
cd "$ROOT/ghosty-docs"
exec npx concurrently --names filas,safety,notes,functions,bff,web --prefix-colors auto --kill-others-on-fail \
  "'$ROOT/ghosty-safety-service/node_modules/.bin/azurite' --silent --skipApiVersionCheck --location '$HOME/.azurite'" \
  "cd '$ROOT/ghosty-safety-service' && npm run start:dev" \
  "cd '$ROOT/ghosty-notes-service' && npm run start:dev" \
  "$FUNCTIONS" \
  "cd '$ROOT/ghosty-bff' && npm run start:dev" \
  "cd '$ROOT/ghosty-web' && npm run dev"
