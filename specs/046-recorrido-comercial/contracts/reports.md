# Contrato — Reportes del inicio (US8)

## GET `/api/dashboard/reportes?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`

**Capacidad**: `reportes.ver`. Fechas opcionales (sin ellas = todo el
historial); inválidas o invertidas → **422** `invalid_query`.

**200**
```ts
{
  periodo: { desde: string | null; hasta: string | null };
  empresasExcluidas: number;                   // cuántas empresas están marcadas
  cursosMasCursados: {                         // top 10 + "Otros"
    conGratuitos: { label: string; cursadas: number }[];
    sinGratuitos: { label: string; cursadas: number }[];
  };
  alumnosPorPeriodo: {
    porAnio: { periodo: string; alumnos: number }[];        // "2024"
    porTrimestre: { periodo: string; alumnos: number }[];   // "2024-T3"
  };
  empresasQueMasCapacitan: { companyId: string; nombre: string; cursadas: number }[];  // top 10
  embudoPorOrigen: { origen: string; leads: number; inscriptos: number; conversion: number }[];
  recompra: { tasa: number; personas: number; recompraron: number;
              pares: { fromName: string; toName: string; personas: number }[] };       // top 5
  ventasPorAnio: { anio: string; ventas: number }[];                                    // sin gratuitos
  ventasPorVendedor: { vendedor: string; porAnio: Record<string, number>; total: number }[]; // "Sin vendedor" incluido
  empresasVsParticulares: { anio: string; empresa: number; particular: number }[];
  evolucionPorCurso: {
    anios: string[];
    cursos: { courseId: string; label: string; total: number; porAnio: Record<string, number> }[];
    top: string[];                                                                       // los 5 más cursados
  };
  ingresosPorCurso?: { currency: string; cursos: { label: string; cobrado: number }[] }[]; // SOLO con cobranza.ver
}
```

Sin nombres de personas. `ingresosPorCurso` no existe como clave sin
`cobranza.ver` (no se consulta).
