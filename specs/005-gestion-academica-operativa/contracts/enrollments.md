# Contrato: `POST /api/enrollments`

Alta comercial de una inscripción (US2). Reemplaza el flujo de la planilla de
ventas: crea (o reutiliza) el contacto y la inscripción en una sola llamada.

## Request

```jsonc
POST /api/enrollments
{
  "cohortId": "coh_...",
  // Contacto: o bien uno existente, o los datos para crear uno nuevo.
  "contactId": "ct_...",           // opcional — si viene, se ignora el bloque "contact"
  "contact": {                      // requerido si no viene contactId
    "name": "Diego Fernández",
    "phone": "59899123456",
    "email": "diego@example.com",  // opcional
    "nationalId": "1.234.567-8"     // opcional
  },
  "amount": 76000,                  // opcional
  "installments": 12,               // opcional
  "paymentNotes": "pagó $20.000 el 26/2, resto en cuotas", // opcional
  "invoiceNumber": "819",           // opcional
  "receiptNumber": null,            // opcional
  "sellerId": "usr_...",            // opcional — debe ser miembro de la org
  "companyId": "cia_..."            // opcional
}
```

## Comportamiento

1. Si viene `contact` (sin `contactId`): crea el contacto con `waIdentity =
   normalizeMx(phone)`, igual que `POST /api/contacts` hoy.
2. Si el `email` o el `phone` del contacto ya existen en la organización (en
   OTRO contacto), responde 409 antes de crear nada — no crea un contacto
   parcial.
3. Crea la `enrollment` con `cohortId`, la primera etapa abierta de esa
   organización, y los campos comerciales recibidos.
4. Si `sellerId` no es miembro de `session.organizationId`, responde 422.

## Response — 201

```jsonc
{
  "enrollment": {
    "id": "enr_...",
    "contactId": "ct_...",
    "cohortId": "coh_...",
    "stageId": "stg_...",
    "amount": 76000,
    "installments": 12,
    "paymentNotes": "...",
    "nationalId": "1.234.567-8",
    "invoiceNumber": "819",
    "receiptNumber": null,
    "sellerId": "usr_...",
    "companyId": "cia_...",
    "createdAt": "..."
  }
}
```

## Errores

| Status | code | Cuándo |
|---|---|---|
| 409 | `duplicate` | email o celular ya usado por otro contacto de la organización (DV-002/DV-003) |
| 409 | `duplicate` | ya existe una inscripción de ese contacto en esa cohorte (`enrollment_contact_cohort_uq`, Fase 1) |
| 422 | `invalid_body` | `cohortId` inexistente, `sellerId` no es miembro de la org, ni `contactId` ni `contact` presentes |
