# Testovací backend ANASTASIA (Medusa v2) mimo Medusa Cloud — jen pro neveřejný test Fázy 1.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/ ./
RUN rm -rf data-private node_modules/.cache && npx medusa build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/.medusa/server ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund
# Migrácie Medusy zapisujú aj do node_modules — celý /app patrí používateľovi node.
RUN mkdir -p /app/static && chown -R node:node /app
USER node
EXPOSE 9000
# Migrácie pri každom štarte (idempotentné), potom server.
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
