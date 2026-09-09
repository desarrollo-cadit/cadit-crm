# Plan técnico — 012 Identidad y permisos

## Enfoque

La fase toca los 83 endpoints y el aislamiento de la base. Se ordena para que
**cada paso sea reversible y verificable solo**, y para que el paso más
peligroso —cambiar el rol de conexión— vaya último y detrás de un test que ya
esté en verde.

Regla que gobierna todo el plan: **nada de lo que funciona hoy cambia de
comportamiento.** Las 68 rutas del staff siguen resolviendo su sesión como
siempre. Todo lo nuevo se suma al costado.

## Orden de trabajo

### Paso 1 — Capacidades, sin tocar la base

Se define la lista cerrada de capacidades en TypeScript y un helper
`requireCapability(cap)` que envuelve `withAuth`. Los roles actuales se mapean
en código: `owner`→todas, `member`→coordinación, `soporte`→las de hoy.

En este paso **no hay tabla `role` todavía**: el mapeo vive en código. Permite
migrar los 83 endpoints y probarlos sin ningún cambio de esquema. Si algo sale
mal, se revierte borrando un archivo.

**Verificable por**: un test que recorra el árbol de rutas y falle si alguna no
declara capacidad (FR-008).

### Paso 2 — Migrar los endpoints a capacidades

Ruta por ruta, `withAuth` → `requireCapability(...)`. `requireFullAccess` pasa
a ser `requireCapability("cobranza.ver")` y equivalentes.

Se hace en tandas por módulo (académico, cobranza, inbox, configuración), cada
tanda con su corrida del gate completo. **Sin cambios de comportamiento
esperados**: los tests existentes de 403 son la red.

### Paso 3 — `account_link` y sesión de portal

Se crea la tabla y `resolvePortalSession()`, separada de `requireSession()`.
Todavía no hay portal que la use: se prueba con tests directos.

Acá se resuelve el choque detectado (FR-016/017/018): la sesión de portal
obtiene organización e identidad desde `account_link`, y **no** puede
satisfacer `withAuth`.

### Paso 4 — Tabla `role` y pantalla de permisos

Los roles pasan de código a base, sembrados con el mapeo del paso 1. La
pantalla permite ver y editar qué puede cada rol.

Va después de la migración de endpoints a propósito: primero que el mecanismo
funcione con valores fijos, después que se puedan editar.

### Paso 5 — RLS, en tres subpasos

1. **Habilitar políticas** sobre las tablas de dominio. Con la aplicación
   conectada como dueño, las políticas no aplican: nada cambia todavía. Sirve
   para verificar que las políticas están bien escritas sin riesgo.
2. **Envolver los pedidos en transacción** con `SET LOCAL`. Se mide el impacto
   en latencia antes de seguir.
3. **Cambiar el rol de conexión** al que sí está sujeto a RLS. Es el momento
   de la verdad: si el `SET LOCAL` no funciona, la aplicación deja de ver
   datos. Por eso va último y detrás del test de aislamiento.

**Punto de reversa**: cada subpaso se revierte solo. El 3 se revierte
cambiando `DATABASE_URL` de vuelta.

## Riesgos y cómo se acotan

| Riesgo | Acotación |
|---|---|
| `SET LOCAL` fuera de transacción filtra entre pedidos | Test con dos pedidos concurrentes de organizaciones distintas, ANTES del paso 5.3 |
| Conectarse como dueño saltea RLS silenciosamente | El test de aislamiento corre con el rol de aplicación, no con el de migración |
| Transacción por pedido degrada la latencia | Se mide en el paso 5.2; si duele, se aplica la alternativa C de DV-002 |
| Migrar 83 endpoints rompe algo | En tandas por módulo, gate completo entre tandas |
| Dejar al dueño sin acceso | `direccion` tiene todas las capacidades por definición; hay un test que lo verifica |

## Qué NO se hace en esta fase

- Ninguna pantalla de portal (son 014 y 015).
- Quitar `scoped()`.
- Tocar la resolución de sesión del staff.
- Auditoría de acciones.

## Definición de hecho

- Gate técnico completo en verde, incluido `pnpm test:e2e`.
- Test de aislamiento con RLS activo y rol de aplicación.
- Test que verifique que ninguna ruta quedó sin capacidad declarada.
- Las 4 cuentas actuales entran y operan igual que antes.
- El dueño puede hacer todo lo que hacía, sin pantallas bloqueadas.
