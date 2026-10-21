# Videos de demostración

Guiones de Playwright que graban recorridos de capacitación por cada rol.
Corren **solo contra el entorno de pruebas** (base `vocero_e2e`, puerto 3005)
y con **datos ficticios** que el propio guion crea por la API del staff antes
de grabar. Nunca se apuntan a producción: el guion se detiene si
`APP_BASE_URL` no es local o si `DATABASE_URL` no es `vocero_e2e`.

## Cómo generar el video del portal del profesor

1. Levantar la app de pruebas en modo **producción**, contra la base de
   pruebas y con su propio directorio de compilación (no pisa `.next` ni
   `.next-e2e`):

   ```bash
   NODE_ENV=production NEXT_DIST_DIR=.next-demo node --env-file=.env.e2e node_modules/next/dist/bin/next build
   NODE_ENV=production NEXT_DIST_DIR=.next-demo node --env-file=.env.e2e node_modules/next/dist/bin/next start -p 3005
   ```

   Por qué no `next dev`: compila cada pantalla al primer pedido (de 5 a 80
   segundos en esta máquina), descarta de memoria las que no se usan hace un
   minuto y, en una grabación larga, llegó a quedarse sin memoria. El video
   mostraría esperas o se cortaría. Con `next dev` el guion igual funciona
   (precalienta y mantiene calientes las rutas), pero es más lento.

   Comprobar que responde: `curl http://localhost:3005/api/health`.

   Si el 3005 ya está ocupado (por ejemplo, por el `next dev` del self-test),
   se puede levantar en otro puerto anteponiendo `APP_BASE_URL` a los dos
   comandos de `start` y de grabación, ya que la variable de la terminal
   tiene prioridad sobre `--env-file`:

   ```bash
   APP_BASE_URL=http://localhost:3006 NODE_ENV=production NEXT_DIST_DIR=.next-demo node --env-file=.env.e2e node_modules/next/dist/bin/next start -p 3006
   APP_BASE_URL=http://localhost:3006 pnpm demo:profesor
   ```

   `next build` modifica `tsconfig.json` y `next-env.d.ts` para incluir
   `.next-demo`; esos cambios no deben confirmarse en el repositorio.
   Si la base `vocero_e2e` no existe o no está migrada, ver el encabezado de
   `scripts/e2e-selftest.mjs`. Hay que volver a compilar cuando cambia el
   código de la app.

2. Grabar:

   ```bash
   pnpm demo:profesor
   ```

   La primera corrida tarda más: `next dev` compila cada pantalla al primer
   pedido, y el guion las pide antes de grabar para que el video no muestre
   esperas.

## Qué se obtiene

En `demos-output/` (ignorada por git):

| Archivo | Contenido |
|---|---|
| `portal-profesor.webm` | El video, 1440×900. |
| `portal-profesor.mp4` | El mismo video en H.264 (yuv420p), si se encuentra ffmpeg. |
| `portal-profesor-frames/` | Una captura PNG por subtítulo y por tarjeta, para revisar sin ver el video. |
| `portal-profesor-timeline.json` | `[{ step, section, text, startMs }]`: cuándo empieza cada subtítulo, en ms desde el inicio del video. Sirve para sincronizar una narración. |

ffmpeg se busca en este orden: la variable `FFMPEG_PATH`, `ffmpeg` en el
`PATH` y la carpeta de paquetes de WinGet. Sin ffmpeg se entrega solo el
`.webm`.

## Cómo agregar el video de otro rol

1. Crear `scripts/demos/<rol>.mjs` tomando como modelo `portal-profesor.mjs`:
   - **Armado de datos** con `crearCliente`, `entrarComoStaff`, `exigir` e
     `isoDia`. Usar sufijos únicos (por ejemplo `Date.now().toString(36)`)
     para que el guion pueda repetirse.
   - **Precalentar** con `precalentar(BASE, rutas)` las pantallas y APIs que
     se van a mostrar.
   - **Grabar** en un contexto de navegador propio con `recordVideo` y crear
     el director con `crearDirector(context, page, { framesDir, totalPasos })`.
2. Narrar con el director:
   - `tarjeta({ titulo, subtitulo })`: tarjeta a pantalla completa.
   - `seccion(titulo, subtitulo)`: avanza el indicador "Paso N de M" y muestra
     la tarjeta de la sección.
   - `decir(texto, { duracion })`: subtítulo; se sostiene palabras / 2,5
     segundos (mínimo 3 s) o `duracion` en ms, si se indica.
   - `clic(locator, { hasta })`, `escribir`, `elegir`, `resaltar`: mueven el
     cursor visible, resaltan el elemento y actúan. `hasta` es la señal de que
     el clic surtió efecto (se reintenta mientras la página hidrata).
3. Agregar el script en `package.json` (`"demo:<rol>"`) y una fila en este
   archivo.

## Criterios de redacción de los subtítulos

- Español formal: "usted" o formas impersonales ("Seleccione…", "Desde esta
  sección se registra…"). Sin voseo, sin exclamaciones, sin emojis.
- Una idea por subtítulo, oraciones cortas, y el porqué cuando ayuda.
- Todo lo que el subtítulo afirma sobre el comportamiento del sistema se
  verifica antes en el código.
