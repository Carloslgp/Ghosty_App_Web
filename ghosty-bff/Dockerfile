# syntax=docker/dockerfile:1
# Imagem do ghosty-bff: build em duas etapas, execução sem root.
# Build, dentro desta pasta:  docker build --platform linux/amd64 -t <usuario>/ghosty-bff:v1 .
# Teste rápido:               docker run --rm -p 3000:3000 --env-file .env <usuario>/ghosty-bff:v1

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: nenhuma dependência de produção precisa de script de instalação, e assim as
# devDependencies (mongodb-memory-server, better-sqlite3) não baixam nem compilam nada na imagem.
RUN npm ci --ignore-scripts
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1
CMD ["node", "dist/api/main.js"]
