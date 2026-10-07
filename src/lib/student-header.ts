/** La misma forma que `BreadcrumbItem` (`components/ui/breadcrumb.tsx`). */
export type MigaDelLegajo = { label: string; href: string | null };

/**
 * 2026-10-07 — Las migas del legajo, según desde dónde se llegó.
 *
 * El contexto viaja EXPLÍCITO (`?cohort=<id>` en el enlace del roster) y la
 * cohorte la resuelve el servidor dentro de la organización: si el id no
 * existe o es de otra, llega `null` y la miga cae a «Alumnos» sin decir nada
 * — un id ajeno no merece ni un error que confirme que existe.
 *
 * Los rótulos son los del MENÚ (`nav.ts`): la lista de contactos se llama
 * «Alumnos» y las cohortes cuelgan de «Académico», igual que la miga de la
 * propia cohorte (`lib/cohort-header.ts`). Una miga que nombra distinto que el
 * menú obliga a traducir.
 */
export function migasDelLegajo(
  studentName: string,
  cohort: { id: string; name: string } | null
): MigaDelLegajo[] {
  if (!cohort) {
    return [
      { label: "Alumnos", href: "/contacts" },
      { label: studentName, href: null },
    ];
  }
  return [
    { label: "Académico", href: "/academico" },
    { label: cohort.name, href: `/cohorts/${cohort.id}` },
    { label: studentName, href: null },
  ];
}
