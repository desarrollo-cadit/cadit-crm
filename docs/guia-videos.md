# Tutoriales en video de la guía

Los mini-videos de `/guia` (panel) y `/portal/guia` (alumno y profesor) **no están
en la imagen de Docker ni en git**: viven en un volumen del servidor. Actualizar
un video es copiar un archivo; no hace falta redeployar.

## Cómo funciona

- Cada video es `<id>.mp4` y su portada `<id>.jpg`, dentro de `GUIA_VIDEOS_DIR`. Si esa variable no
  está, se usa `<MEDIA_DIR>/guia-videos`: el volumen persistente de la app (el de los adjuntos, ya
  montado en producción en `/data/media`). En desarrollo sin ninguna de las dos, `./data/guia-videos`.
- La guía ofrece **solo los videos que están en esa carpeta**. Sin carpeta o sin
  archivos, la sección «Tutoriales en video» no aparece.
- Cada audiencia entra por su puerta: `/api/guia/videos/<id>` (staff, exige sesión
  y TODAS las capacidades que el video enseña), `/api/portal/guia/alumno/<id>` y
  `/api/portal/guia/profesor/<id>`. Quien no corresponde recibe 404.
- Los ids salen de `scripts/demos/guia/catalogo.mjs`, y el manifiesto de la app
  (`src/lib/guia-videos.data.ts`) se genera con
  `node scripts/demos/guia/generar-manifiesto.mjs`.

## Publicar (en la PC donde se graba)

```bash
node scripts/demos/guia/publicar.mjs            # todos los renders de demos-output/guia/final
node scripts/demos/guia/publicar.mjs inicio-dashboard   # uno solo
```

Deja `demos-output/guia/publicar/<id>.mp4` (comprimido, ~3-5 MB) y `<id>.jpg`.

## Subir al servidor (Coolify)

**Camino más simple (el que se usó):** copiar los archivos a `guia-videos/` dentro del volumen que ya
está montado en `/data/media`, con dueño `100:101` (el usuario `vocero` de la app). No hace falta
configurar nada en Coolify ni redeployar para actualizar un video. Lo hace
`scripts/ops/subir-videos-guia.sh` (ver su encabezado: indica cómo encontrar el volumen).

**Alternativa, con un volumen aparte:**

1. En el servicio de la app, agregar un **volumen persistente** montado en
   `/data/guia-videos`.
2. Variable de entorno de runtime: `GUIA_VIDEOS_DIR=/data/guia-videos`.
3. Copiar el contenido de `demos-output/guia/publicar/` a ese volumen (terminal del
   contenedor, `scp` al host o el explorador de archivos de Coolify).
4. Recargar `/guia`: los videos aparecen sin redeploy.

Con `docker compose` (Ruta B): montar `./guia-videos:/data/guia-videos:ro` en el
servicio de la app y poner `GUIA_VIDEOS_DIR=/data/guia-videos`.

## Cambiar la intro de todos los videos

La intro se renderiza aparte (`node tools/guia-video/render-intros.mjs --todos`, ~66
fotogramas por video) y `publicar.mjs` la empalma delante del cuerpo ya renderizado: no hace
falta volver a renderizar los videos enteros.

## Cuando cambia la interfaz

Los videos se graban sobre la app real, así que se vuelven a grabar cuando una
pantalla cambia: `node scripts/demos/guia/grabar-guion.mjs <id>`, luego
`node render.mjs <id>` (en `tools/guia-video`) y `publicar.mjs <id>`.
Ver `scripts/demos/guia/LEEME-AGENTES.md` para escribir un guion nuevo.
