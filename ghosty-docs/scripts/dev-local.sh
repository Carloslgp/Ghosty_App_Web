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

# O concurrently roda cada comando no shell do sistema. No Windows (Git Bash) esse shell é o cmd.exe, que
# não entende caminhos /c/... nem aspas simples: lá vão caminhos do Windows, aspas duplas e `cd /d`.
if command -v cygpath >/dev/null 2>&1; then
  at() { printf 'cd /d "%s" && %s' "$(cygpath -w "$1")" "$2"; }
  AZURITE="\"$(cygpath -w "$ROOT/ghosty-safety-service/node_modules/.bin/azurite.cmd")\" --location \"$(cygpath -w "$HOME/.azurite")\""
else
  at() { printf "cd '%s' && %s" "$1" "$2"; }
  AZURITE="'$ROOT/ghosty-safety-service/node_modules/.bin/azurite' --location '$HOME/.azurite'"
fi

if command -v func >/dev/null; then
  FUNCTIONS="$(at "$ROOT/ghosty-functions" 'npm start')"
else
  echo "Azure Functions Core Tools não encontrado: as Functions sobem com o host local de testes."
  FUNCTIONS="$(at "$ROOT/ghosty-functions" 'npm run start:local-host')"
fi

mkdir -p "$HOME/.azurite"
cd "$ROOT/ghosty-docs"
exec npx concurrently --names filas,safety,notes,functions,bff,web --prefix-colors auto --kill-others-on-fail \
  "$AZURITE --silent --skipApiVersionCheck" \
  "$(at "$ROOT/ghosty-safety-service" 'npm run start:dev')" \
  "$(at "$ROOT/ghosty-notes-service" 'npm run start:dev')" \
  "$FUNCTIONS" \
  "$(at "$ROOT/ghosty-bff" 'npm run start:dev')" \
  "$(at "$ROOT/ghosty-web" 'npm run dev')"
