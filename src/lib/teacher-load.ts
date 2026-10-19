/**
 * 044 — Calendario por profesor: el filtro y la carga semanal (puro).
 *
 * El profesor de una clase es el de la CLASE si tiene uno (suplencia) y si no
 * el de la cohorte: la misma regla de alcance que el portal del profesor
 * (`cohort.teacher_id ∪ class_session.teacher_id`).
 *
 * Acá no hay dinero y no lo va a haber: la tarifa por hora del profesor está
 * restringida desde 040 y la carga se mide en clases y horas, nada más.
 */

/** Valor del filtro que selecciona las clases sin profesor. */
export const SIN_PROFESOR = "sin-profesor";

/** "a, b,a,," → ["a", "b"]. Vacío o ausente = sin filtro (todos). */
export function parseTeacherFilter(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const parte of raw.split(",")) {
    const id = parte.trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function serializeTeacherFilter(ids: readonly string[]): string {
  return ids.join(",");
}

/** La suplencia (profesor de la clase) manda sobre el titular de la cohorte. */
export function effectiveTeacherId(
  sessionTeacherId: string | null,
  cohortTeacherId: string | null
): string | null {
  return sessionTeacherId ?? cohortTeacherId ?? null;
}

export function matchesTeacherFilter(
  teacherId: string | null,
  filter: readonly string[]
): boolean {
  if (filter.length === 0) return true;
  return filter.includes(teacherId ?? SIN_PROFESOR);
}

function minutesOfDay(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Duración de una clase en minutos. `null` si falta un horario o si el fin no
 * es posterior al inicio: no se inventa una duración.
 */
export function classMinutes(startTime: string | null, endTime: string | null): number | null {
  const ini = minutesOfDay(startTime);
  const fin = minutesOfDay(endTime);
  if (ini === null || fin === null || fin <= ini) return null;
  return fin - ini;
}

/** 150 → "2 h 30 min"; 180 → "3 h". */
export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Lo mínimo de una clase del calendario que la carga necesita. */
export type LoadClass = {
  teacherId: string | null;
  teacherName: string | null;
  /** Día de la clase, ISO (medianoche UTC, convención de `classInstant`). */
  date: string;
  startTime: string | null;
  endTime: string | null;
  canceled: boolean;
  projected: boolean;
};

export type TeacherLoadRow = {
  /** `null` = clases sin profesor. */
  teacherId: string | null;
  teacherName: string;
  /** Sin canceladas. */
  classes: number;
  minutes: number;
  realClasses: number;
  realMinutes: number;
  projectedClasses: number;
  projectedMinutes: number;
  canceledClasses: number;
  /** Clases sin horario (o con fin ≤ inicio): cuentan como clase, 0 h. */
  untimedClasses: number;
  /** Clases que se pisan con otra del MISMO profesor el mismo día. */
  overlappingClasses: number;
};

/**
 * La carga de la semana por profesor. Cada clase suma sus propias horas,
 * aunque se pise con otra: el profesor igual las tiene asignadas, y la
 * superposición se señala aparte para que alguien la mire.
 */
export function weeklyTeacherLoad(classes: readonly LoadClass[]): TeacherLoadRow[] {
  const filas = new Map<string, TeacherLoadRow>();
  const tramos = new Map<string, { dia: string; ini: number; fin: number; i: number }[]>();

  classes.forEach((c, i) => {
    const clave = c.teacherId ?? SIN_PROFESOR;
    let fila = filas.get(clave);
    if (!fila) {
      fila = {
        teacherId: c.teacherId,
        teacherName: c.teacherId === null ? "Sin profesor" : (c.teacherName ?? "Profesor"),
        classes: 0,
        minutes: 0,
        realClasses: 0,
        realMinutes: 0,
        projectedClasses: 0,
        projectedMinutes: 0,
        canceledClasses: 0,
        untimedClasses: 0,
        overlappingClasses: 0,
      };
      filas.set(clave, fila);
    }

    if (c.canceled) {
      fila.canceledClasses++;
      return;
    }

    const min = classMinutes(c.startTime, c.endTime);
    fila.classes++;
    fila.minutes += min ?? 0;
    if (c.projected) {
      fila.projectedClasses++;
      fila.projectedMinutes += min ?? 0;
    } else {
      fila.realClasses++;
      fila.realMinutes += min ?? 0;
    }
    if (min === null) {
      fila.untimedClasses++;
      return;
    }
    const ini = minutesOfDay(c.startTime)!;
    const lista = tramos.get(clave) ?? [];
    lista.push({ dia: c.date.slice(0, 10), ini, fin: ini + min, i });
    tramos.set(clave, lista);
  });

  for (const [clave, lista] of tramos) {
    const pisadas = new Set<number>();
    for (let a = 0; a < lista.length; a++) {
      for (let b = a + 1; b < lista.length; b++) {
        const x = lista[a]!;
        const y = lista[b]!;
        if (x.dia === y.dia && x.ini < y.fin && y.ini < x.fin) {
          pisadas.add(x.i);
          pisadas.add(y.i);
        }
      }
    }
    filas.get(clave)!.overlappingClasses = pisadas.size;
  }

  return [...filas.values()].sort((a, b) => {
    if ((a.teacherId === null) !== (b.teacherId === null)) return a.teacherId === null ? 1 : -1;
    return (
      b.minutes - a.minutes ||
      b.classes - a.classes ||
      a.teacherName.localeCompare(b.teacherName, "es")
    );
  });
}
