# Correo transaccional con Microsoft 365

Guía operativa para habilitar el envío de correo a alumnos. Sin esta
configuración la aplicación **arranca igual** y las acciones de correo
responden "no configurado" en vez de romperse (`src/lib/env.ts:46-55`).

## Qué habilita

Tres correos que ya están escritos (`docs/email-templates/`):

| Plantilla | Cuándo se manda |
|---|---|
| `acceso-portal.html` | Se le da acceso al portal a un alumno (`src/server/access.ts`) |
| `bienvenida-cohorte.html` | Bienvenida a la camada |
| `licencia-atc.html` | Términos de la licencia ATC |

El envío vive en `POST /api/enrollments/[id]/emails` con capacidad
`inscripciones.ver` — a propósito accesible para soporte y ventas por igual,
porque mandar los términos no es una tarea comercial.

## Por qué M365 y no un servicio de correo

El Principio II de la constitución tiene una **lista cerrada** de dependencias
de runtime: WhatsApp Cloud API, el proveedor LLM vía OpenRouter, y Microsoft
Graph. La versión 1.3.0 de la constitución agregó M365 exactamente para esto.
Cualquier otro servicio de correo exigiría enmendarla.

Por eso todo Graph vive detrás de `src/lib/m365/client.ts`: nada fuera de ese
módulo sabe qué es un token de Entra ID.

## Las cinco variables

```bash
M365_TENANT_ID=      # id del directorio (tenant) de Entra ID
M365_CLIENT_ID=      # id de la aplicación registrada
M365_CLIENT_SECRET=  # el secreto de esa aplicación
M365_SENDER=         # el buzón desde el que se envía (debe ser un email válido)
M365_BCC=            # opcional: copia oculta de CADA correo, para registro del equipo
```

Las cuatro primeras son obligatorias: si falta una, `getM365Config()` devuelve
`null` y la app reporta "no configurado". `M365_BCC` es opcional y conviene
ponerla — te deja el rastro de todo lo enviado sin depender del buzón emisor.

## Paso 1 — Registrar la aplicación en Entra ID

1. Portal de Azure → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Nombre: algo reconocible, por ejemplo `CadIT CRM — correo transaccional`.
3. Tipo de cuenta: **Single tenant**. No hace falta redirect URI: el flujo es
   `client_credentials`, sin usuario.
4. Al crearla, copiá de la pantalla de **Overview**:
   - **Directory (tenant) ID** → `M365_TENANT_ID`
   - **Application (client) ID** → `M365_CLIENT_ID`

## Paso 2 — El secreto

1. En la app → **Certificates & secrets** → **New client secret**.
2. Elegí la duración y **anotá la fecha de vencimiento en el calendario**: el
   día que vence, los correos dejan de salir sin más aviso que un 401.
3. Copiá el **Value** (no el Secret ID) → `M365_CLIENT_SECRET`.
   Se muestra **una sola vez**.

## Paso 3 — El permiso

1. En la app → **API permissions** → **Add a permission** → **Microsoft Graph**.
2. Elegí **Application permissions** (NO "Delegated": no hay un usuario
   conectado, la app envía sola).
3. Buscá y marcá **`Mail.Send`**.
4. Volvé a la lista y hacé **Grant admin consent**. Sin ese consentimiento el
   permiso figura pero no funciona.

## Paso 4 — Acotar el buzón (NO ES OPCIONAL)

**Este es el paso que la mayoría saltea y es el más importante.**

El permiso de aplicación `Mail.Send` **sin acotar habilita enviar como
CUALQUIER buzón del tenant**. Es decir: una filtración del secreto permite
mandar correo haciéndose pasar por cualquier persona de la empresa —
dirección, contabilidad, quien sea.

Lo dice la constitución (Principio II) y lo repite el propio adaptador en
`src/lib/m365/client.ts:11-20`.

Se acota con una **Application Access Policy** en Exchange Online:

```powershell
# 1. Conectarse a Exchange Online
Connect-ExchangeOnline

# 2. Un grupo de seguridad habilitado para correo que contenga SOLO el buzón emisor
New-DistributionGroup -Name "CadIT CRM Remitentes" -Type Security `
  -Members cursos@tudominio.com

# 3. Restringir la app a ese grupo
New-ApplicationAccessPolicy -AppId <M365_CLIENT_ID> `
  -PolicyScopeGroupId "CadIT CRM Remitentes" -AccessRight RestrictAccess `
  -Description "CadIT CRM: solo el buzón de cursos"

# 4. Verificar: debe decir AccessCheckResult = Granted para el buzón emisor
Test-ApplicationAccessPolicy -Identity cursos@tudominio.com -AppId <M365_CLIENT_ID>

# 5. Y DENIED para cualquier otro. Probalo de verdad:
Test-ApplicationAccessPolicy -Identity direccion@tudominio.com -AppId <M365_CLIENT_ID>
```

El paso 5 es el que prueba que la política sirve. Si devuelve `Granted` para
un buzón que no es el emisor, la política no está aplicada.

> **Nota**: Microsoft está migrando este mecanismo a *RBAC for Applications*.
> `New-ApplicationAccessPolicy` sigue funcionando, pero verificá cuál soporta
> tu tenant — el objetivo es el mismo: que la app solo pueda enviar desde un
> buzón.

La política puede tardar hasta una hora en propagarse.

## Paso 5 — Cargar y probar

1. Poné las variables en `.env`.
2. Reiniciá la aplicación: `getEnv()` se lee al arrancar.
3. Probá con una inscripción real desde la pantalla de la camada, o:

```bash
curl -X POST http://localhost:3000/api/enrollments/<id>/emails \
  -H "content-type: application/json" \
  -d '{"kind":"terms"}'
```

`kind` acepta `terms` (licencia ATC) o `welcome` (bienvenida). Con
`{"force":true}` se reenvía aunque ya conste como enviado.

## Si algo falla

| Síntoma | Causa más probable |
|---|---|
| "no configurado" | Falta alguna de las cuatro variables obligatorias |
| 401 al pedir el token | `M365_CLIENT_SECRET` vencido o mal copiado (¿copiaste el *Value* y no el *Secret ID*?) |
| 403 `ErrorAccessDenied` al enviar | Falta el **Grant admin consent** del paso 3, o la Application Access Policy no incluye el buzón emisor |
| Manda pero desde otro buzón | `M365_SENDER` no coincide con el buzón de la política |

## Rotar el secreto

El secreto vence. Cuando lo renueves: creá el nuevo **antes** de borrar el
viejo (Entra ID admite dos a la vez), cambiá `M365_CLIENT_SECRET`, reiniciá,
verificá que un correo sale, y recién ahí borrá el anterior.
