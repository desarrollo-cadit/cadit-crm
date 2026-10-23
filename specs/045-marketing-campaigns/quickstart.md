# Quickstart — probar 045 en local con mocks (sin Microsoft 365 real)

Requisito de la Definición de Hecho reforzada: el self-test de COMPORTAMIENTO
corre verde —camino feliz e infeliz— sin delegar la prueba al dueño. Ningún
paso de esta guía toca un tenant real de Microsoft 365.

## 1. Entorno

`.env` local (nunca producción). Lo de 029 más lo nuevo:

```bash
WA_MOCK_ENABLED=true
META_GRAPH_BASE_URL=http://localhost:3000/api/dev/wa-mock/graph
OPENROUTER_BASE_URL=http://localhost:3000/api/dev/ai-mock
OPENROUTER_API_TOKEN=mock
OPENROUTER_MODEL=mock
# Correo contra el m365-mock (credenciales ficticias; el mock no las valida)
M365_TENANT_ID=mock-tenant
M365_CLIENT_ID=mock-client
M365_CLIENT_SECRET=mock-secret
M365_SENDER=cursos@academia.test          # buzón OPERATIVO
M365_GRAPH_BASE_URL=http://localhost:3000/api/dev/m365-mock/v1.0
M365_LOGIN_BASE_URL=http://localhost:3000/api/dev/m365-mock
# 045 — envío rápido en pruebas (en producción: dejar el default, 2000)
MARKETING_SEND_PAUSE_MS=200
MARKETING_TICK_SEC=5
```

`APP_BASE_URL=http://localhost:3000` (los enlaces de baja, clic e imágenes son
absolutos). `MEDIA_DIR` apunta a una carpeta local escribible.

```bash
pnpm db:migrate          # aplica 0071_campanas_de_marketing
pnpm dev
```

Con el dev server corriendo, el build va a otro directorio:
`NEXT_DIST_DIR=.next-build pnpm build`.

## 2. Gate técnico

```bash
pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-build pnpm build && pnpm test
```

## 3. Recorrido a mano

1. **Ajustes → Marketing** (con un usuario de Dirección). Buzón
   `novedades@academia.test`, remitente "CadIT Novedades", dirección y
   contacto. Guardar → **Probar el buzón** → "Se envió un correo de control a
   <tu correo>". Ver el correo en el mock:
   `GET http://localhost:3000/api/dev/m365-mock/outbox` (`from` =
   `novedades@academia.test`).
   - Probar con `cursos@academia.test` como buzón → "tiene que ser distinto del
     de los correos de los cursos".
2. **Marketing → Audiencias → Nueva**. Origen = un formulario de la base de
   prueba, Etapa = Perdido. Ver la cantidad, la lista y "N excluidos: … dado de
   baja, … sin correo, … archivado". Guardar como "Perdidos Landing".
3. **Marketing → Campañas → Nueva**. Elegir la audiencia. Asunto
   `Hola {{nombre}}, nueva edición`. Bloques: título, párrafo con
   `{{curso_de_interes|nuestros cursos}}`, imagen (subir un JPG < 5 MB), botón
   a `https://cadit.uy/cursos`.
   - Pegar `<b>hola</b><script>alert(1)</script>` en un párrafo: queda como
     texto y la vista previa lo muestra escapado.
   - Escribir `{{telefono}}` → no deja guardar ("variable desconocida").
   - Un botón a `http://…` o `javascript:…` → no deja guardar.
4. **Vista previa** con dos contactos distintos: cada uno ve su nombre; uno sin
   curso de interés ve "nuestros cursos", nunca `{{…}}`.
5. **Enviar prueba** → llega solo a tu correo, con `[PRUEBA]`; la campaña sigue
   en borrador y sin métricas.
6. **Enviar** → "Se enviará a N personas" → Confirmar. La campaña pasa a
   "Enviando" y la tabla avanza; se puede navegar a otra pantalla mientras
   tanto. Al terminar: "Enviada". El outbox tiene N correos, uno por dirección.
7. **Baja**: copiar del outbox el enlace "No quiero recibir más correos" de un
   destinatario, abrirlo en una ventana privada → página de confirmación →
   **Confirmar la baja**. En **Contactos → la persona → Seguimiento** se ve la
   baja con fecha y campaña. Volver a la audiencia: figura en "dado de baja".
   - Alterar un carácter de la firma → "Este enlace no es válido."
   - A esa persona, desde su grupo, mandarle la bienvenida: le llega igual.
8. **Clic**: abrir el enlace del botón de un destinatario → redirige a
   `https://cadit.uy/cursos`; en la campaña, Clics = 1 y la fila dice "Hizo
   clic". Cambiar el `linkId` por el de otra campaña → 404.

## 4. Caminos infelices (mock)

```bash
# Fallo de un envío: el próximo sendMail responde 500
curl -X POST localhost:3000/api/dev/m365-mock/fail -H 'content-type: application/json' -d '{"fail":true}'
# Límite del proveedor: los próximos 3 sendMail responden 429 con Retry-After: 1
curl -X POST localhost:3000/api/dev/m365-mock/fail -H 'content-type: application/json' -d '{"throttle":3}'
# Buzón sin permiso: sendMail responde 403 ErrorAccessDenied hasta apagarlo
curl -X POST localhost:3000/api/dev/m365-mock/fail -H 'content-type: application/json' -d '{"deny":true}'
# Limpiar outbox y apagar todo modo de falla
curl -X DELETE localhost:3000/api/dev/m365-mock/outbox
```

- **Falla de uno**: ese destinatario queda "Falló" con el motivo; el resto sale.
- **429**: la campaña muestra "En pausa por el límite del buzón" y sigue sola;
  nadie aparece dos veces en el outbox.
- **403**: "Probar el buzón" informa el error y no lo marca como válido; una
  campaña en curso queda detenida con el motivo y se retoma al apagar `deny`.
- **Reinicio a mitad**: con `MARKETING_SEND_PAUSE_MS=3000`, confirmar una
  campaña de ~20, cortar `pnpm dev` a mitad y volver a levantarlo. La campaña
  sigue sola; ninguna dirección se repite en el outbox (a lo sumo una fila
  queda "Falló: se interrumpió durante el envío").
- **Cancelar** a mitad: los pendientes quedan "Cancelado" y no llegan al outbox.
- **Baja durante el envío**: con una campaña enviándose, dar de baja (por el
  enlace de una campaña anterior) a alguien que todavía no recibió esta → queda
  "Omitido: se había dado de baja".
- **Tope**: una audiencia de más de 500 no deja enviar y sugiere acotar.
- **Sin buzón**: con los ajustes vacíos, el botón Enviar dice qué falta y lleva
  a Ajustes → Marketing.
- **Laboratorio**: correr una prueba del Laboratorio y comprobar que sus
  contactos nunca aparecen en ninguna audiencia (excluidos "prueba").

## 5. Self-test automatizado

Sección nueva `marketing` en `scripts/e2e/marketing.mjs`, registrada en
`scripts/e2e-selftest.mjs`:

```bash
E2E_SECCIONES=marketing node --env-file=.env scripts/e2e-selftest.mjs
```

Recorre los pasos 1-8 y los caminos infelices de §4 contra la app viva y el
outbox del mock; sale distinto de cero si algo falla.

## 6. Antes de producción (pendiente de verificación humana)

- Crear el buzón compartido de marketing en Microsoft 365 y **sumarlo al grupo
  de la `ApplicationAccessPolicy`** de la app del CRM (si no, "Probar el buzón"
  da "sin permiso").
- Ponerle al buzón el mismo nombre para mostrar que se cargue como remitente
  (Exchange suele usar ese nombre).
- Enviar una campaña real a una audiencia chica del propio equipo y revisar
  cómo se ve en Outlook, Gmail y el celular (juicio visual).
