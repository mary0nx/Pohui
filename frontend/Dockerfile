# Build the Mini App and serve it with Caddy (static files + reverse proxy + HTTPS).
# Build context: repository root (needs infra/caddy/Caddyfile).
FROM node:22.22.0-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM caddy:2.11.7-alpine
COPY --from=build /app/dist /srv
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
