# Quickstart — Cobranza y cuotas

## Regla número uno

**Nunca corras el self-test E2E contra la base de desarrollo.** El contenedor
`vocero-dev-postgres-1` (puerto 5433, base `vocero`) tiene el catálogo y el
alumnado REAL de CAD IT importados. El harness crea cursos, cohortes y alumnos
de prueba; sobre datos reales eso es basura difícil de limpiar, y como
`course.published` viene en `true` por defecto, un curso de prueba llega al
catálogo público de cadit.com.uy.

## Base efímera para probar

Receta verificada (ver el commit `17e4844`):

```bash
# 1. Postgres descartable — SIN volumen: los datos mueren con el contenedor
docker run --rm -d --name vocero-e2e-pg -p 5434:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=vocero_e2e postgres:16-alpine

# 2. Migraciones contra ella
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/vocero_e2e" \
  npx drizzle-kit migrate
```

Env efímero (fuera del repo, con secretos generados al momento):

```bash
APP_BASE_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/vocero_e2e
BETTER_AUTH_SECRET=<random 32 bytes hex>
ENCRYPTION_KEY=<random 32 bytes base64>
META_WEBHOOK_VERIFY_TOKEN=<random>
META_GRAPH_BASE_URL=http://localhost:3000/api/dev/wa-mock/graph
OPENROUTER_BASE_URL=http://localhost:3000/api/dev/ai-mock
WA_MOCK_ENABLED=true
BOT_API_KEY=<random 24 bytes hex>
ALLOW_SIGNUP=true
```

Después:

```bash
node --env-file=<ruta>/.env.e2e node_modules/next/dist/bin/next dev
node --env-file=<ruta>/.env.e2e scripts/e2e-selftest.mjs
docker stop vocero-e2e-pg     # --rm borra todo
```

### Dos trampas que ya nos costaron tiempo

1. **`next start` NO sirve.** Los mocks están gateados por
   `NODE_ENV !== "production"` (`src/lib/env.ts`, `isMockEnabled`), así que en
   modo producción responden 404 y el harness se cae entero. Tiene que ser
   `next dev`.
2. **Dos `next dev` del mismo directorio pelean por `.next`.** Hay que parar
   el dev server existente y reusar el puerto 3000, no levantar un segundo en
   otro puerto.

## Probar la migración con datos ya cargados

Una migración que solo se probó contra una base vacía no está probada. Para
las que agregan restricciones, la receta que usamos en la 0020:

```bash
# 1. base efímera aparte, migrada al día
docker run --rm -d --name vocero-mig-test -p 5435:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=migtest postgres:16-alpine
DATABASE_URL="postgresql://postgres:postgres@localhost:5435/migtest" npx drizzle-kit migrate

# 2. volver al estado anterior a la migración, cargar filas de DOS
#    organizaciones distintas, y recién ahí correr el SQL a mano
docker exec -i vocero-mig-test psql -U postgres -d migtest < drizzle/00NN_*.sql

# 3. verificar el resultado, no asumirlo
```

Dos organizaciones y no una: es lo único que demuestra que la migración no
mezcla tenants.

## Guion manual de la feature

1. Crear una cohorte y inscribir un alumno por 120.000 UYU.
2. Generar un plan de 6 cuotas desde el 10 de marzo, mensual.
   → deben quedar 6 cuotas de 20.000 sumando 120.000 exactos.
3. Registrar un pago de 20.000 sobre la cuota 1.
   → la cuota queda saldada, el saldo de la inscripción baja a 100.000.
4. Adelantar el reloj (o generar una cuota con vencimiento pasado) y abrir la
   vista de morosidad.
   → el alumno aparece con sus días de atraso.
5. Registrar el pago de esa cuota.
   → desaparece de morosidad sin recargar ni correr ningún proceso.
6. Anular ese pago con motivo.
   → vuelve a aparecer, y el pago anulado sigue visible en el historial.
7. Intentar registrar un pago en USD sobre una cuota en UYU.
   → rechazo explícito. **Nunca conversión.**
8. Entrar con un usuario de rol `soporte`.
   → 403 en toda la superficie de cobranza.
