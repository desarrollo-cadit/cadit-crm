# Contrato — Ajustes de marketing

Pestaña `/settings/marketing` (`SETTINGS_TABS`, `marketing.configurar`).

```ts
MarketingSettingsDto = {
  senderEmail: string | null;
  senderName: string | null;
  footerAddress: string | null;
  footerContact: string | null;
  verified: boolean;               // verifiedSender === senderEmail
  verifiedAt: string | null;
  lastTestAt: string | null;
  lastTestError: string | null;
  m365Configured: boolean;         // booleano: la credencial jamás viaja (I)
  operationalSender: string | null; // M365_SENDER, para mostrar "debe ser distinto de …" (es una dirección, no un secreto)
  ready: boolean;                  // se puede enviar una campaña
}
```

## GET `/api/settings/marketing`

**Capacidad**: `marketing.configurar`. **200** `MarketingSettingsDto` (todo
`null` si nunca se configuró).

## PUT `/api/settings/marketing`

**Capacidad**: `marketing.configurar`.

**Body**
```ts
{
  senderEmail: string;     // email, ≤ 200, se normaliza
  senderName: string;      // 1..80
  footerAddress: string;   // 1..200
  footerContact: string;   // 1..200
}
```
Cambiar `senderEmail` borra la verificación.

**200** `MarketingSettingsDto` · **422** `invalid_body` · **422**
`buzon_no_separado` ("El buzón de marketing tiene que ser distinto del de los
correos de los cursos (<M365_SENDER>)") · **409** `campana_enviando` si se
intenta cambiar el buzón con una campaña `enviando` (usa el buzón copiado
igual, pero se evita la confusión).

## POST `/api/settings/marketing/test`

**Capacidad**: `marketing.configurar`. Prueba el buzón (US5).

**Body**: `{}`. Manda "Prueba del buzón de marketing" DESDE `senderEmail` A la
dirección de la sesión.

| Resultado de Graph | Respuesta | Efecto |
|---|---|---|
| 202 | **200** `{ ok: true; sentTo }` | `verified_sender = sender_email`, `verified_at`, `last_test_error = NULL` |
| 403 / `ErrorAccessDenied` | **200** `{ ok: false; error: "El sistema no tiene permiso para enviar desde <buzón>. Hay que incluirlo en la ApplicationAccessPolicy de la app en Exchange." }` | No verificado; `last_test_error` |
| 404 / buzón inexistente | **200** `{ ok: false; error: "Ese buzón no existe en Microsoft 365." }` | Ídem |
| Otro | **200** `{ ok: false; error: <mensaje de Graph> }` | Ídem |

**422** `sin_buzon` (no hay `senderEmail`) · **422** `m365_no_configurado` ·
**429** (5 pruebas cada 10 min).

Una prueba fallida devuelve 200 con `ok: false` y NO lanza: la transacción
tiene que confirmar `last_test_error` (devolver un error no revierte, pero
lanzar sí).
