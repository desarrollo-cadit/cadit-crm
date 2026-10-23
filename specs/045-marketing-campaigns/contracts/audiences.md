# Contrato — Audiencias

Puerta: `requireCapability` (staff). Errores con la forma de `apiError`
(`src/lib/api.ts:11`): `{ error: { code, message, fields? } }`. Todo cuerpo se
valida con Zod `.strict()`; 422 `invalid_body` con `fields` si no pasa. Un id
de otra organización responde 404 (RLS + `scoped()`).

Tipos compartidos: `AudienceFilters` (ver [data-model.md §2](../data-model.md)).

```ts
ExclusionCounts = { prueba: number; baja: number; archivado: number; sin_correo: number; duplicado: number }
AudienceRecipientDto = { contactId: string; name: string; email: string }
AudiencePreviewDto = {
  count: number;                 // destinatarios finales (tras exclusiones y deduplicación)
  overCap: boolean;              // count > 500
  excluded: ExclusionCounts;     // FR-003: cuántos por motivo
  recipients: AudienceRecipientDto[];  // página pedida, orden por nombre
  page: number; pageSize: number;
}
AudienceDto = { id: string; name: string; filters: AudienceFilters; createdAt: string; createdByName: string | null }
```

---

## GET `/api/marketing/audiences/options`

**Capacidad**: `marketing.ver`. Los valores con que se arman los filtros.

**200**
```ts
{
  sources: { value: string; label: string; count: number }[];   // incluye { value: "whatsapp", label: "WhatsApp" }
  stages: { id: string; name: string; kind: "open" | "won" | "lost" }[];
  cohorts: { id: string; name: string; courseName: string; startDate: string | null }[];
  courses: { id: string; name: string }[];
  companies: { id: string; name: string }[];
}
```
Sin formularios, grupos o empresas → listas vacías, nunca error (Edge).

## POST `/api/marketing/audiences/preview`

**Capacidad**: `marketing.ver`. Evalúa filtros sin guardarlos (FR-002, FR-003).

**Body**: `{ filters: AudienceFilters; page?: number (>=1, default 1); pageSize?: 25|50|100 }`

**200** `AudiencePreviewDto` · **422** `invalid_body` (filtro desconocido, rango invertido).

## GET `/api/marketing/audiences`

**Capacidad**: `marketing.ver`. **200** `{ audiences: AudienceDto[] }` (sin conteo: se evalúa al abrirla).

## POST `/api/marketing/audiences`

**Capacidad**: `marketing.enviar`. **Body**: `{ name: string (1..120); filters: AudienceFilters }`

**201** `AudienceDto` · **409** `duplicate` (nombre repetido, sin distinguir mayúsculas) · **422** `invalid_body`.

## GET `/api/marketing/audiences/[id]`

**Capacidad**: `marketing.ver`. **200** `AudienceDto & { preview: AudiencePreviewDto }` (primera página). **404** `not_found`.

## PATCH `/api/marketing/audiences/[id]`

**Capacidad**: `marketing.enviar`. **Body**: `{ name?: string; filters?: AudienceFilters }` (al menos uno).

**200** `AudienceDto` · **404** · **409** `duplicate` · **422**. Cambiar una audiencia
no altera campañas ya confirmadas (FR-006); un borrador que la usa toma los
filtros nuevos al volver a abrirse.

## DELETE `/api/marketing/audiences/[id]`

**Capacidad**: `marketing.enviar`. **204**. Las campañas que la usaban quedan
con `audience_id = NULL` y conservan su copia de los filtros. **404**.
