# Contrato: endpoint público de cursos

Sin autenticación (US7, FR-020/021/022). Pensado para que el sitio web externo
del negocio (WordPress hoy, Astro después) lo consuma vía `fetch`. Resuelve la
única organización de la instancia (DV-010) — no recibe ni acepta
`organizationId` en la URL ni en query params.

**006** amplía el DTO con la ficha comercial del curso (portada, categoría,
nivel, modalidad, duración, objetivos, destinatarios y temario estructurado)
para que el sitio pueda armar una página de curso completa. Las garantías de
FR-022 no cambian.

## `GET /api/public/courses`

Query params opcionales:

| Param | Qué hace |
|---|---|
| `categoria` | Filtra por el `slug` de la categoría. Un slug inexistente devuelve catálogo vacío, no 404. |

```jsonc
// Response — 200
{
  "courses": [
    {
      "id": "crs_...",
      "slug": "ia-automation",          // 006 — el sitio arma /cursos/<slug>
      "name": "IA Automation",
      "tagline": "Automatizá tu negocio con agentes de IA",  // corto, para tarjetas
      "imageUrl": "https://.../portada.jpg",
      "category": { "id": "cat_...", "name": "Inteligencia Artificial", "slug": "inteligencia-artificial" },
      "level": "inicial",               // inicial | intermedio | avanzado | null
      "modality": "en_vivo",            // en_vivo | asincronico | presencial | null
      "durationWeeks": 12,
      "hoursPerWeek": 4,
      "nextCohorts": [
        { "id": "coh_...", "startDate": "2026-09-15T00:00:00.000Z" }
      ]
    }
  ],
  // 006 — para dibujar el filtro del catálogo sin una segunda llamada.
  "categories": [
    { "id": "cat_...", "name": "Inteligencia Artificial", "slug": "inteligencia-artificial" }
  ]
}
```

`nextCohorts` incluye solo cohortes con `start_date > now()` — nunca cohortes ya
iniciadas o finalizadas (FR-021).

## `GET /api/public/courses/:idOrSlug`

El segmento acepta el **slug público** (`/api/public/courses/ia-automation`) o
el id interno; los enlaces ya publicados con id siguen resolviendo.

```jsonc
// Response — 200
{
  "course": {
    // … todos los campos del listado, más:
    "description": "Cuerpo largo de la página del curso…",
    "learningObjectives": ["Construir agentes", "Conectar APIs"],  // [] si no se cargaron
    "targetAudience": "Emprendedores sin experiencia previa en programación.",
    "syllabusUrl": "https://.../temario.pdf",   // 006 — del CURSO, ya no de la cohorte
    "modules": [                                 // temario estructurado, en orden
      { "title": "Fundamentos de IA", "topics": ["Qué es un LLM", "Prompting"] },
      { "title": "Automatización", "topics": ["Webhooks", "Integraciones"] }
    ]
  }
}
// 404 si el curso no existe o no pertenece a la organización de la instancia
```

### Cambio respecto de 005

Hasta 005 `syllabusUrl` se leía de la primera cohorte futura que lo declarara,
porque la columna vivía en `cohort`. En 006 el temario es del **curso** (la
migración 0014 lo trasladó y 0015 borró la columna de `cohort`): se devuelve
siempre el del curso, y la cohorte lo hereda en su propio DTO interno.

## Garantías (FR-022)

- Nunca incluye: nombre/email/teléfono de alumnos, montos, checklist de
  soporte, profesor, aula, costo, ni ningún identificador interno de
  `contact`/`enrollment`/`license`. Verificado en
  `tests/unit/public-catalog.test.ts` (el DTO serializado no contiene ninguna
  de esas claves) y en la verificación en vivo.
- No requiere cookie de sesión ni header de autenticación; responde igual con o
  sin ellos.
- `Cache-Control: public, max-age=60`; el dato cambia poco (altas de cohortes
  nuevas, ediciones de contenido, no en tiempo real).

## Errores

| Status | code | Cuándo |
|---|---|---|
| 404 | `not_found` | `:idOrSlug` no corresponde a un curso de la organización de la instancia |
| 422 | `invalid_query` | `categoria` presente pero vacío |
