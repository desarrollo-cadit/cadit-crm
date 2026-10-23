# Contrato — Recompra

## GET `/api/marketing/recompra?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`

**Capacidad**: `marketing.ver` (FR-012). Ambos parámetros opcionales (sin
ellos = todo el historial). `desde` > `hasta` o fecha inválida → **422**
`invalid_query`.

**200** `MetricasDeRecompra` ([data-model §5](../data-model.md)):

```ts
{
  periodo: { desde: string | null; hasta: string | null };
  personas: number;
  recompraron: number;
  tasa: number;                     // porcentaje, un decimal
  diasPromedioEntreCursos: number | null;
  paresMedidos: number;
  pares: { fromCourseId: string; fromName: string; toCourseId: string; toName: string; personas: number }[];
}
```

Sin montos ni nombres de personas: solo cifras y nombres de cursos.
