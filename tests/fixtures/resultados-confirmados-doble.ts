import type { ResultadoFinal } from "@/lib/resultado-final";

/**
 * 0086 — Doble de `@/server/resultados-confirmados` para los tests con cola
 * posicional de `getDb()`: el resultado final confirmado se lee de un `Map`
 * que cada test llena, sin consumir la cola.
 *
 * Uso:
 *   const confirmados = vi.hoisted(() => new Map<string, "aprobado" | "reprobado">());
 *   vi.mock("@/server/resultados-confirmados", async () =>
 *     (await import("../fixtures/resultados-confirmados-doble")).dobleDeResultados(confirmados));
 *
 * `sinResultado` (opcional): inscripciones cuyo grupo terminó sin la
 * asistencia completa. `estadosAfirmados` no compone madres: el test que lo
 * necesite pone el estado de la madre en el mismo `Map`.
 */
export function dobleDeResultados(
  confirmados: Map<string, ResultadoFinal>,
  sinResultado: Set<string> = new Set()
) {
  const dto = (result: ResultadoFinal) => ({
    result,
    suggestedResult: "pendiente" as const,
    note: null,
    confirmedAt: "2026-01-31T12:00:00.000Z",
    confirmedByName: "Profesora",
  });
  const presentes = (ids: readonly string[]) => ids.filter((id) => confirmados.has(id));
  return {
    resultadosConfirmados: async (_org: string, ids: readonly string[]) =>
      new Map(presentes(ids).map((id) => [id, dto(confirmados.get(id)!)])),
    resultadoConfirmadoPorInscripcion: async (_org: string, ids: readonly string[]) =>
      new Map(presentes(ids).map((id) => [id, confirmados.get(id)!])),
    estadosAfirmados: async (_org: string, ids: readonly string[]) =>
      new Map(
        ids.map((id) => [
          id,
          sinResultado.has(id)
            ? { state: "pendiente" as const, sinResultado: true }
            : { state: confirmados.get(id) ?? ("pendiente" as const), sinResultado: false },
        ])
      ),
    gruposSinResultado: async () => new Set<string>(),
  };
}
