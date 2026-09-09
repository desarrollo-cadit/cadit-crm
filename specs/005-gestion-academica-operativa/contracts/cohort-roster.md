# Contrato: `GET /api/cohorts/:id/roster`

Vista compartida de cohorte (US3, FR-014/FR-017): la ven tanto
ventas/coordinación como soporte, pero el DTO varía según `session.role` — es la
MISMA ruta, no dos rutas separadas, porque ambos roles necesitan ver la lista de
alumnos y su checklist (solo cambian los campos financieros).

## Request

```
GET /api/cohorts/coh_xxx/roster
```

Requiere sesión (`withAuth`, cualquier rol — a diferencia de las rutas de
finanzas que usan `requireFullAccess`).

## Response — 200

Rol `soporte`:

```jsonc
{
  "cohort": { "id": "coh_...", "courseId": "crs_...", "startDate": "...", "endDate": "..." },
  "enrollments": [
    {
      "id": "enr_...",
      "contact": { "name": "...", "phone": "...", "email": "..." },
      "checklist": {
        "licenseAssigned": true,        // leído de license.assigned (DV-004)
        "termsEmailSentAt": "2026-08-01T...",
        "softwareInstalledAt": null,
        "hadOwnLicense": false,
        "academiaOnlineAccessAt": null
      }
    }
  ]
}
```

Rol con acceso completo (ventas/coordinación): mismo shape, más estos campos por
inscripción:

```jsonc
{
  "amount": 76000,
  "installments": 12,
  "paymentNotes": "...",
  "nationalId": "...",
  "invoiceNumber": "819",
  "receiptNumber": null,
  "sellerId": "usr_...",
  "companyId": "cia_..."
}
```

**Regla dura**: si `session.role === "soporte"`, el servidor NUNCA arma esos
campos en el objeto de respuesta (no es un filtro de UI del lado del cliente) —
FR-016 exige que ni siquiera llegue al navegador.

## PATCH `/api/enrollments/:id/checklist`

```jsonc
PATCH /api/enrollments/enr_xxx/checklist
{
  "termsEmailSentAt": "now",     // o null para desmarcar
  "softwareInstalledAt": "now",
  "hadOwnLicense": true,
  "academiaOnlineAccessAt": null
}
```

Accesible por CUALQUIER rol (soporte y ventas/coordinación comparten esta
acción, FR-014). Campos omitidos no se tocan; `"now"` se resuelve a la fecha del
servidor.

## Errores

| Status | code | Cuándo |
|---|---|---|
| 404 | `not_found` | la cohorte o la inscripción no existe en la organización de la sesión |
| 403 | `forbidden` | (no aplica a esta ruta — el roster es accesible por ambos roles; ver `dashboard/finance` para el caso 403) |
