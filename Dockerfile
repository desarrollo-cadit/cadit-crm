# ============================================================
# CadIT CRM — imagen multi-etapa (Next.js standalone + Node 22)
# Los secretos NO se necesitan en build: llegan en runtime.
# ============================================================

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
# migrate.mjs autocontenido (drizzle-orm + postgres bundleados)
RUN pnpm exec esbuild scripts/migrate.mjs --bundle --platform=node \
    --format=esm --outfile=migrate.bundle.mjs \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
RUN pnpm exec esbuild scripts/seed/demo.ts --bundle --platform=node \
    --format=esm --outfile=seed-demo.bundle.mjs --alias:@=./src \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S vocero && adduser -S vocero -G vocero
# 008: punto de montaje del volumen de adjuntos, propiedad del usuario de la
# app — el volumen nombrado hereda este dueño al montarse vacío (sin esto,
# monta como root y el guardado de adjuntos falla con EACCES).
RUN mkdir -p /data/media && chown -R vocero:vocero /data
# Sin esto la app cae al default de desarrollo (./.dev-media, ADENTRO del
# contenedor) y cada deploy borra fotos y adjuntos. Persistir de verdad exige
# además montar un volumen en /data/media (Coolify: Storages; compose: abajo).
ENV MEDIA_DIR=/data/media

COPY --from=builder --chown=vocero:vocero /app/.next/standalone ./
COPY --from=builder --chown=vocero:vocero /app/.next/static ./.next/static
COPY --from=builder --chown=vocero:vocero /app/public ./public
COPY --from=builder --chown=vocero:vocero /app/migrate.bundle.mjs ./migrate.mjs
COPY --from=builder --chown=vocero:vocero /app/seed-demo.bundle.mjs ./seed-demo.mjs
COPY --from=builder --chown=vocero:vocero /app/drizzle ./drizzle
# Las plantillas de correo se leen con readFileSync en runtime y el trazado de
# standalone no las detecta: sin esta línea, todo correo falla con ENOENT.
# Ver tests/unit/imagen-docker.test.ts.
COPY --from=builder --chown=vocero:vocero /app/docs/email-templates ./docs/email-templates

USER vocero
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# start-period amplio: cubre las migraciones del arranque
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

# Migrar al BOOT del contenedor nuevo y arrancar el server standalone
CMD ["sh", "-c", "DATABASE_URL=\"${MIGRATION_DATABASE_URL:-$DATABASE_URL}\" node migrate.mjs && node server.js"]
