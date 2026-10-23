# Página de mantenimiento (Cloudflare Worker)

Un Worker delante de `campus.cadit.com.uy`. Pasa cada pedido al VPS tal cual;
si el VPS no responde (Cloudflare 520–530) o devuelve 502/503/504, muestra la
página "Estamos en obra" en vez de la pantalla de error de Cloudflare. Las rutas
`/api/*` (incluido el webhook de WhatsApp) reciben un 503 en JSON, para que Meta
reintente.

- `worker.js`: la decisión (pasar o mostrar mantenimiento).
- `pagina.js`: la página, con la ilustración en SVG.
- `assets.js`: la fuente Geist y el logo embebidos (generado; la página no
  puede pedirle nada al VPS caído).

## Publicar

Requisito: el registro DNS de `campus` con la nube naranja (proxied).

```bash
cd ops/cloudflare-maintenance
npx wrangler login
npx wrangler deploy
```

## Probar

Parar el contenedor un minuto desde Coolify y abrir el sitio: tiene que
aparecer la página. Al levantarlo, el sitio vuelve solo.
