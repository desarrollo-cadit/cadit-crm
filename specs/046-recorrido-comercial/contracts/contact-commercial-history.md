# Contrato — Historial comercial y "Le podría interesar" del contacto

Puerta: `requireCapability` (staff). Errores con la forma de `apiError`:
`{ error: { code, message } }`.

## GET `/api/contacts/[id]/recorrido-comercial`

**Capacidad**: `contactos.ver` (la misma del legajo y de Seguimiento).
Contacto ajeno o inexistente → **404** `not_found`.

**200**
```ts
{
  historial: {
    courseId: string;
    courseName: string;
    estado: "aprobo" | "curso_sin_aprobar" | "en_curso" | "por_empezar";
    sinResultado: boolean;
    cohortId: string;
    cohortName: string;
    startDate: string;            // ISO
    endDate: string | null;       // ISO
    veces: number;
    especializacion: { modulosAprobados: number; modulosTotal: number } | null;
  }[];                            // más reciente primero; [] si no cursó nada
  sugerencias: {
    courseId: string;
    courseName: string;
    porCursos: string[];
    proximoGrupo: { cohortId: string; name: string; startDate: string } | null;
  }[];                            // [] si no hay rutas o no cursó nada
}
```

- Grupos que nunca se dictaron y talleres no aparecen (FR-002, FR-003).
- Contactos archivados o dados de baja de marketing aparecen igual (spec,
  Edge Cases): es información para quien atiende.
- Sin montos, cuotas ni pagos.
