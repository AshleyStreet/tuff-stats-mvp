FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
COPY client/package.json client/package-lock.json ./client/
RUN npm ci --include=dev --prefix server && npm ci --include=dev --prefix client

COPY server ./server
COPY client ./client
RUN npm run build --prefix server && npm run build --prefix client

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    CACHE_DIR=/app/server/.cache \
    TENANTS_DIR=/app/server/.tenants

COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server \
    && mkdir -p /app/server/.cache /app/server/.tenants

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
