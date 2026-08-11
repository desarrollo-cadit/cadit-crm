# Contrato: endpoint público de cursos

Sin autenticación (US7, FR-020/021/022). Pensado para que el sitio web externo
del negocio (WordPress hoy, Astro después) lo consuma vía `fetch`. Resuelve la
única organización de la instancia (DV-010) — no recibe ni acepta
`organizationId` en la URL ni en query params.

## `GET /api/public/courses`

```jsonc
// Response — 200
{
  "courses": [
    {
      "id": "crs_...",
      "name": "Revit Arquitectura",
      "description": "Curso introductorio de modelado BIM en Revit...",
      "nextCohorts": [
        { "id": "coh_...", "startDate": "2026-09-15" }
      ]
    }
  ]
}
```

`nextCohorts` incluye solo camadas con `start_date > now()` — nunca camadas ya
iniciadas o finalizadas (FR-021).

## `GET /api/public/courses/:id`

```jsonc
// Response — 200
{
  "course": {
    "id": "crs_...",
    "name": "Revit Arquitectura",
    "description": "...",
    "syllabusUrl": "https://.../temario-revit.pdf",  // de la/s camada/s futuras; null si ninguna declara temario
    "nextCohorts": [
      { "id": "coh_...", "startDate": "2026-09-15" }
    ]
  }
}
// 404 si el curso no existe o no pertenece a la organización de la instancia
```

## Garantías (FR-022)

- Nunca incluye: nombre/email/teléfono de alumnos, montos, checklist de
  soporte, profesor, aula, costo, ni ningún identificador interno de
  `contact`/`enrollment`/`license`.
- No requiere cookie de sesión ni header de autenticación; responde igual con o
  sin ellos.
- `Cache-Control` público de corta duración (a definir en tasks — no bloquea el
  contrato); el dato cambia poco (altas de camadas nuevas, no en tiempo real).

## Errores

| Status | code | Cuándo |
|---|---|---|
| 404 | `not_found` | `:id` no corresponde a un curso de la organización de la instancia |
