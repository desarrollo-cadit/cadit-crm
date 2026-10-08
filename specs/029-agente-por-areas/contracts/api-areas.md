# Contrato — rutas HTTP (029)

Todas las rutas de staff declaran capacidad (`requireCapability`):
`tests/unit/route-capabilities.test.ts` falla si una no lo hace. Cuerpos con
Zod (`parseBody`). Errores con `apiError(status, code, message)`.

## `GET /api/settings/areas` — `areas.configurar`

```jsonc
{
  "routingEnabled": false,
  "m365Configured": true,          // getM365Config() !== null — nunca el secreto
  "areas": [
    {
      "area": "ventas",
      "enabled": true,
      "mailbox": "comercial@empresa.com",
      "ccEmails": ["gerencia@empresa.com"],
      "ccSellerIds": ["sl_…"],
      "contactText": "Te va a contactar el equipo comercial…",
      "officeHours": { "days": [0,1,2,3,4], "from": "09:00", "to": "18:00" },
      "updatedAt": "2026-10-08T…"
    },
    { "area": "soporte", "enabled": false, "mailbox": null, "ccEmails": [], "ccSellerIds": [], "contactText": null, "officeHours": null, "updatedAt": null }
  ],
  // Vendedores ACTIVOS, bajo esta misma capacidad (no se pide /api/sellers,
  // que exige inscripciones.editar). Sin correo → la UI lo marca y no se elige.
  "sellers": [{ "id": "sl_…", "name": "Ana", "email": "ana@empresa.com" }],
  "timezone": "America/Montevideo"
}
```

Las dos áreas siempre vienen (fila ausente = valores por defecto).

## `PUT /api/settings/areas/[area]` — `areas.configurar`

`[area]` ∈ `ventas | soporte` (otro valor → 404).

```ts
z.object({
  enabled: z.boolean(),
  mailbox: z.string().trim().email().max(200).nullable(),
  ccEmails: z.array(z.string().trim().email().max(200)).max(10),
  ccSellerIds: z.array(z.string().min(1)).max(20),   // 422 si area = soporte y no vacío
  contactText: z.string().trim().max(600).nullable(),
  officeHours: z.object({
    days: z.array(z.number().int().min(0).max(6)).min(1),   // 0 = lunes
    from: z.string().regex(/^\d{2}:\d{2}$/),
    to: z.string().regex(/^\d{2}:\d{2}$/),
  }).refine(h => h.from < h.to).nullable(),
}).refine(b => !b.enabled || b.mailbox !== null, "Para encender el área hace falta la casilla")
```

- Cada `ccSellerIds[i]` debe existir en la organización y estar activo → si
  no, 422 con el nombre del faltante.
- Upsert por `(organization_id, area)`; `updated_by = session.userId`.
- 200 `{ area: AreaConfigDto }`.

## `PATCH /api/settings/areas` — `areas.configurar`

`{ routingEnabled: boolean }` → actualiza `agent_profile.area_routing_enabled`.
422 si no existe `agent_profile` (el agente no está configurado).

## `GET /api/conversations/[id]/area-handoffs` — `inbox.ver`

Conversación ajena u otra organización → 404 (RLS + `scoped()`).

```jsonc
{
  "handoffs": [
    {
      "id": "ah_…", "caseRef": "AH-7K3Q2M", "area": "soporte",
      "summary": "No activa la licencia de Revit 2025",
      "status": "fallido",                    // del último correo
      "missing": ["since"],
      "createdAt": "…", "lastActivityAt": "…",
      "emails": [
        { "kind": "apertura", "status": "fallido", "error": "M365 rechazó el envío (403)",
          "to": ["soporte@…"], "cc": [], "replyTo": "cliente@…", "sentAt": null, "createdAt": "…" }
      ]
    }
  ]
}
```

Visible para quien ve el inbox: el staff de la academia es quien tiene que
enterarse de que una derivación falló (FR-008/FR-010). No incluye el HTML.

## `GET /api/conversations` (modificada) — `inbox.ver`

Cada conversación suma `lastAreaHandoff: { area, status } | null` (una
subconsulta lateral por la última fila) para el chip de la lista.

## Teacher (modificada)

`PATCH /api/teachers/[id]` (capacidad actual de la ruta, sin cambio) acepta
`waPhone: string | null` → normalizado con `normalizeMx` a `wa_identity`.
409 si otro profesor ya tiene esa identidad.

## Mocks (solo con `mockGuard()`; 404 en producción)

| Ruta | Qué hace |
|---|---|
| `POST /api/dev/m365-mock/{tenant}/oauth2/v2.0/token` | Devuelve `{access_token:"mock", expires_in:3600}` |
| `POST /api/dev/m365-mock/v1.0/users/{sender}/sendMail` | Guarda `{from, message}` en el outbox; 202. Si el modo falla está activo → 500 `{error:{message:"mock: fallo forzado"}}` |
| `GET /api/dev/m365-mock/outbox` / `DELETE` | Lee / limpia el outbox y apaga el modo falla |
| `POST /api/dev/m365-mock/fail` | `{fail: boolean}` — fuerza el camino infeliz |
