# Cómo escribir un guion de la guía en video

Cada video de `catalogo.mjs` necesita UN guion: `scripts/demos/guia/guiones/<id>.mjs`.
Un guion graba la app REAL (clon anonimizado `cadit_demo`) y deja el material
crudo; los gráficos (zoom, resaltado, cursor, subtítulos, intro, cierre) los
agrega Remotion después. Modelo ya hecho y aprobado: `guiones/inicio-dashboard.mjs`.

## Entorno (ya está levantado, NO lo toque)

- App compilada en producción: `http://localhost:3006` (health: `/api/health`).
  No la reinicie, no recompile, no toque `.next-demo`, `.env.demo` ni el esquema de la base.
  Si está caída, avise en su informe y detenga el trabajo.
- Base `cadit_demo` en Postgres `localhost:5433` (postgres/postgres). Es un clon
  anonimizado con 2.642 contactos, 123 empresas, 46 grupos y 40 cursos. Solo lectura
  desde psql: `PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d cadit_demo -Atc "…"`.
- Cuentas: `demo.<rol>@demo.test`, contraseña `Demo-Guia-2026`, roles `direccion`,
  `coordinacion`, `soporte`, `administracion`, `ventas`; más `alumno` y `profesor`
  (sus correos están en `demos-output/guia/cuentas.json`).
- En Git Bash los argumentos que empiezan con `/` se rompen: anteponga `MSYS_NO_PATHCONV=1`.
- No use `rg`/`fd` si no están; use las herramientas Grep/Glob/Read. No use `cat/grep/find/sed`.

## Qué puede y qué NO puede tocar

Puede crear SOLO: `scripts/demos/guia/guiones/<id>.mjs` de sus videos, y archivos
bajo `demos-output/guia/` (los genera el grabador).
NO modifique: `src/`, `tests/`, `grabador.mjs`, `catalogo.mjs`, `datos.mjs`,
`revisar.mjs`, `sonda.mjs`, `usuarios.mjs`, `anonimizar.sql`, `scripts/demos/lib.mjs`,
`tools/guia-video/`, ni nada del repositorio fuera de lo anterior. Si necesita una
capacidad que el grabador no tiene, resuélvala con `g.page` (Playwright) dentro del
guion y repórtelo. No haga commits. Hay otros agentes grabando a la vez sobre la
misma app y la misma base: **grabe sus videos de a uno, nunca en paralelo**.

## API del guion

```js
import { apiComo, exigir, sufijo } from "../datos.mjs";   // solo si necesita crear datos de apoyo

export const rol = "coordinacion";   // quién lo hace: ver "Qué rol usar"
export const ruta = "/contacts";     // pantalla donde arranca (ya cargada al empezar)

export async function guion(g) {
  const { page } = g;                               // Playwright
  await g.paso("Texto del subtítulo", locator, { accion: "ver" | "clic", sostener: 3.2, despues });
  await g.escribir(locator, "texto");               // escribe como una persona
  await g.pausa(1);                                  // respira
  await g.captura("nombre");                         // PNG de depuración en demos-output/guia/revision/
}
```

- `g.paso(texto, locator, …)`: resalta esa zona (el `locator` define la caja que se
  resalta y a la que se hace zoom). Con `accion: "clic"` hace el clic real después de
  que el cursor llega. Sin locator: plano general, sin resaltado. `despues` es una
  función async que corre tras el clic (por ejemplo esperar el diálogo).
- Un paso dura `sostener` segundos (por defecto, según el largo del texto). Lo que ocurra
  durante el paso queda en el video, así que haga las acciones DENTRO del paso (en
  `despues` o con `g.escribir` antes del siguiente `g.paso`).
- Ejecutar: `MSYS_NO_PATHCONV=1 node scripts/demos/guia/grabar-guion.mjs <id>`. Si falla,
  deja una captura en `demos-output/guia/fallos/<id>.png` y no deja video.
- Revisar sin mirar el video: `node scripts/demos/guia/revisar.mjs <id>` extrae un
  fotograma por paso con la zona resaltada dibujada en `demos-output/guia/revision/`; abra
  los PNG con la herramienta Read y compruebe que la caja resalta lo que el texto dice.
- Explorar una pantalla antes de escribir: `MSYS_NO_PATHCONV=1 node scripts/demos/guia/sonda.mjs <rol> <ruta>`
  lista títulos, pestañas, botones y campos, y guarda una captura.

## Trampas conocidas

- **Nunca** `waitUntil: "networkidle"` (el SSE de `/api/events` deja la red abierta).
  Espere un elemento concreto.
- Las pestañas se abren con `?tab=<clave>` (`src/lib/pestanas.ts`); puede arrancar
  directamente en una pestaña con `ruta = "/cohorts/<id>?tab=asistencia"`.
- Los ids reales de grupos, contactos, etc. se obtienen de la base (psql) o de la API
  (`apiComo`). Elija datos con contenido rico (por ejemplo un grupo con alumnos, clases y
  notas). Los ids de grupos/contactos de esta base cambian si se reconstruye: búsquelos
  en el guion (consulta a la API o a la lista) en vez de dejarlos fijos cuando pueda.
- Un `locator` que coincide con varios elementos usa el primero; sea específico.
  Prefiera `getByRole`, `getByText`, `getByPlaceholder`. Para una tarjeta, use el
  ancestro redondeado: `loc.locator("xpath=ancestor::*[contains(@class,'rounded')][1]")`.
- Un diálogo: la caja debe ser el diálogo entero (`page.getByRole("dialog")` o el
  contenedor del modal, ver `src/components/ui/modal.tsx`).
- `scrollIntoView` lo hace el grabador; no arrastre la pantalla a mano salvo que sea el tema.
- Los `confirm()` nativos: registre `page.once("dialog", d => d.accept())` antes de la acción.

## Datos: reglas para que se pueda volver a grabar

- Todo lo que el guion CREE lleva un sufijo único (`sufijo()`), y se crea por la API
  (`apiComo`) ANTES de abrir el paso que lo muestra, salvo que el tema del video sea
  justamente crearlo: ahí se crea EN pantalla, con datos ficticios y ese sufijo.
- Las acciones irreversibles o destructivas (unificar, dar de baja, anular, borrar,
  confirmar un resultado, emitir certificados, enviar una campaña, mandar correos) se
  muestran SOLO sobre datos que el propio guion creó. Jamás sobre los datos sembrados.
- No hay correo, WhatsApp, Zoom ni Graph reales: los mocks están encendidos. Aun así,
  no dispare envíos masivos.
- Si el guion deja datos nuevos, no los limpie: el sufijo evita choques.

## Qué rol usar (`export const rol`)

Elija el rol cuya vista es la natural para el video Y que tenga todas las capacidades
de `requiere` en el catálogo (verifíquelo en `SYSTEM_ROLES` de `src/lib/capabilities.ts`).
Si varias lo tienen, el de menor privilegio que lo hace en la práctica. Capacidades solo de
Dirección (`configuracion.editar`, `areas.configurar`, `marketing.configurar`,
`historial.importar`, `alumnos.auditoria`, `accesos.gestionar`…) → `direccion`.
Para portales: `profesor` o `alumno`. Pantallas públicas: `publico` (sin sesión).

## Qué debe mostrar cada video (criterio de calidad)

Es un mini-tutorial tipo TikTok para alguien que nunca usó la plataforma:

1. **De 5 a 8 pasos; 25 a 40 s de video útil.** Un solo tema por video. Si el catálogo
   (`cubre`) enumera más de lo que cabe, priorice lo que alguien necesita para empezar y
   encadene lo demás con pasos cortos; nunca deje fuera una función de `cubre` sin
   decirlo en su informe.
2. **Muestre la acción real y su resultado**: escribir una búsqueda y ver los resultados,
   abrir el diálogo, completar un campo, guardar y ver el cambio. No se limite a señalar
   pantallas.
3. **Resalte lo importante**: el botón, el campo, el estado, el aviso, el permiso que
   condiciona. Mencione qué pasa si algo falla o qué permiso hace falta cuando sea relevante.
4. **Subtítulos**: español formal e impersonal o de «usted» (nunca voseo, sin
   exclamaciones ni emojis), UNA idea por subtítulo, máximo ~14 palabras, en infinitivo o
   presente («Seleccione…», «Desde aquí se registra…»). Use el vocabulario visible de la
   app («grupo», no «cohorte»; los rótulos exactos de botones y pestañas).
5. **Todo lo que afirme debe ser verdad**: verifique en el código (`src/`) el
   comportamiento que describe el subtítulo, sobre todo reglas y permisos. No invente.
6. Sin datos reales: los nombres que ve son ficticios. No muestre credenciales ni
   contraseñas distintas de las de demostración.

## Entrega

Para cada video: el guion, una grabación exitosa (`demos-output/guia/raw/<id>.mp4` y
`timeline/<id>.json`), y haber revisado los fotogramas con `revisar.mjs` (las cajas
resaltan lo correcto, los textos son legibles, no hay pantallas de error ni vacías).
Si algo no se puede mostrar (falta de datos, función que no responde, pantalla rota), no
lo falsee: grabe lo posible y repórtelo.

Informe final (máximo 250 palabras, en español): por cada id → `OK` / `OK con salvedad: …`
/ `NO: motivo`; cosas del producto que parezcan errores; y cualquier punto del catálogo
(`cubre`) que no pudo cubrir.
