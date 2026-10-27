/**
 * Asistencia sugerida desde Zoom — qué INSTANCIA de reunión es la de una
 * clase. Pura; misma ventana y mismo criterio que `matchRecording`
 * (`src/server/zoom/matching.ts`): [inicio − tolerancia, fin (o inicio + fin
 * supuesto)], el número de reunión de la clase manda si lo tiene, y ante dos
 * candidatas NO elige ("ambigua": decide una persona). En un aula PMI el
 * número se repite entre grupos, por eso el horario es lo que separa.
 */

export type InstanciaCandidata = {
  /** null si el reporte de reuniones no lo trajo ([U]): se busca después. */
  uuid: string | null;
  meetingId: string;
  startTime: Date;
  topic: string | null;
};

export type ResultadoDeInstancia =
  | { kind: "unica"; instancia: InstanciaCandidata }
  | { kind: "ambigua"; candidatas: InstanciaCandidata[] }
  | { kind: "ninguna" };

export function elegirInstancia(input: {
  clase: { startsAt: Date; endsAt: Date | null; meetingId: string | null };
  instancias: InstanciaCandidata[];
  tolerancia: { beforeMin: number; afterFallbackMin: number };
}): ResultadoDeInstancia {
  const { clase, tolerancia } = input;
  const desde = clase.startsAt.getTime() - tolerancia.beforeMin * 60_000;
  const hasta = (clase.endsAt ?? new Date(clase.startsAt.getTime() + tolerancia.afterFallbackMin * 60_000)).getTime();
  const enHorario = input.instancias.filter((i) => {
    const t = i.startTime.getTime();
    return desde <= t && t <= hasta;
  });
  const candidatas = (clase.meetingId ? enHorario.filter((i) => i.meetingId === clase.meetingId) : enHorario)
    .slice()
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  // La misma instancia puede venir dos veces (reporte + instancias).
  const unicas = candidatas.filter(
    (c, i) => candidatas.findIndex((o) => (o.uuid ?? `${o.meetingId}@${o.startTime.getTime()}`) === (c.uuid ?? `${c.meetingId}@${c.startTime.getTime()}`)) === i
  );
  if (unicas.length === 1) return { kind: "unica", instancia: unicas[0]! };
  if (unicas.length > 1) return { kind: "ambigua", candidatas: unicas };
  return { kind: "ninguna" };
}
