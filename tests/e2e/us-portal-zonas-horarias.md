# Portal del alumno en otra zona horaria

Automatizado en `scripts/e2e/portal-zonas-horarias.mjs` (sección
`portal-zonas-horarias` de `scripts/e2e-selftest.mjs`, también al final de la
corrida completa). Solo:

```bash
E2E_SECCIONES=portal-zonas-horarias node --env-file=.env.e2e scripts/e2e-selftest.mjs
```

Necesita la app E2E con los mocks (`WA_MOCK_ENABLED=true`) y Playwright con
Chromium instalado. La academia tiene que estar en `America/Montevideo` (el
default de la organización) y con la ventana del enlace por defecto (15 min
antes del inicio).

## Por qué

87 alumnos están fuera de Uruguay. La hora de una clase se pinta con la zona
del navegador (`useViewerTimeZone`, `formatHour`, `ClassTime`, la tarjeta de
"Próxima clase"), pero el botón "Ingresar a la clase" lo decide el servidor con
instantes absolutos (`meetingLinkVisible`). Una prueba hecha desde Montevideo no
ve ninguno de los dos errores posibles: una hora sin convertir o un botón que
se abre según el reloj de quien mira.

## Preparación (por la API del staff)

1. Un curso y tres grupos de UNA clase cada uno, con enlace de reunión:
   - **lejos**: la clase empieza ~30 min después de "ahora" (hora de Montevideo,
     redondeada al minuto hacia abajo) → fuera de la ventana de 15 min.
   - **cerca**: empieza ~10 min después → dentro de la ventana.
   - **fija**: 15:00–17:00 de Montevideo, dentro de una semana.
   El servidor no permite mover su reloj: por eso las dos primeras se arman
   relativas a "ahora". "Lejos" usa 30 min y no 20 para dejar margen a la
   primera compilación de la página en el dev server; el check falla con un
   motivo explícito si la corrida tarda tanto que la clase entra en la ventana.
2. Una alumna inscripta en los tres grupos, con acceso al portal; entra una vez
   y su sesión se reusa en las tres zonas.

## Pasos y resultado esperado

**API (lo decide el servidor):**

- `GET /api/portal/me/cursadas/:id` informa `timezone: America/Montevideo`.
- La clase fija empieza a las 15:00 de Montevideo de ese día (instante absoluto).
- La próxima clase de "lejos" llega con `meetingUrl: null`; la de "cerca", con
  el enlace.

**Navegador**, un contexto de Playwright por zona (`timezoneId`):
`America/Montevideo`, `America/Santo_Domingo`, `Europe/Madrid`.

- `/portal/cursadas/<fija>`: la tarjeta "Próxima clase" muestra el rango en la
  hora local — 15:00 – 17:00 en Montevideo, 14:00 – 16:00 en Santo Domingo y
  en Madrid lo que diga `Intl` para esa fecha (20:00 o 19:00 según el horario de
  verano de España; no se escribe a mano).
- Fuera de Montevideo aparece "Hora local. En Montevideo: 15:00." en la tarjeta
  y "hora local · 15:00 en Montevideo" en la fila de la clase; en Montevideo, no.
  La UI pinta primero la hora de la academia y cambia cuando el efecto lee la
  zona del navegador: el guion espera esa pista antes de leer la hora.
- `/portal/cursadas/<lejos>`: no hay "Ingresar a la clase"; se ve "El enlace de
  acceso se habilita 15 minutos antes del inicio."
- `/portal/cursadas/<cerca>`: hay "Ingresar a la clase" y apunta al enlace del
  grupo.
- El par (lejos, cerca) de visibilidad del botón es idéntico en las tres zonas.

## Camino infeliz

- Si Playwright no está o el navegador falla, la sección deja un check en rojo
  con el error (no se cuelga ni se saltea en silencio).
- Si la corrida tarda más de ~15 min entre preparar y mirar "lejos", ese check
  falla diciendo que la clase ya entró en la ventana, en vez de dar un falso
  verde o un falso rojo sobre el botón.
