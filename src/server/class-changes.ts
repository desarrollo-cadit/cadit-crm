import { and, eq, inArray, isNull, max } from "drizzle-orm";
import { diaCalendario, diaComoFecha } from "@/lib/access-expiry";
import {
  avisoDeExtension,
  planDeReemplazo,
  proximoDiaDeClase,
  sugerirReemplazos,
  type OpcionDeEntrega,
} from "@/lib/clase-de-reemplazo";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  diaDeClase,
  fechaEnReceso,
  recesosDeCohorte,
  validarReceso,
  validarReprogramacion,
} from "@/lib/recess";
import { hoursFromTimes } from "@/server/attendance";
import { borrarClasesSinHistoria, leerRecesos, type BorradoDeClasesDto } from "@/server/recesses";

/**
 * 034 (US3, FR-012..FR-015) — Borrar y reprogramar clases.
 *
 * Las reglas son PURAS (`src/lib/recess.ts`): qué clase se puede borrar sin
 * perder historia y cuándo se puede reprogramar. Acá se averiguan los hechos.
 */

export type ClassChangeResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 403 | 404 | 409 | 422; code: string; message: string; receso?: string };

/**
 * FR-012 — Borrar UNA clase. Con asistencia o grabación no se borra: se
 * responde 409 y la pantalla ofrece cancelarla (escenario 2), que es lo que
 * conserva la historia y la saca del cálculo de todos.
 */
export async function borrarClase(
  organizationId: string,
  classSessionId: string
): Promise<ClassChangeResult<BorradoDeClasesDto>> {
  const resultado = await borrarClasesSinHistoria(organizationId, {
    cohortId: null,
    classIds: [classSessionId],
  });
  if (resultado.deleted === 0 && resultado.kept.length === 0) {
    return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  }
  const conservada = resultado.kept[0];
  if (conservada) {
    return {
      ok: false,
      status: 409,
      code: "clase_con_historia",
      message: `${conservada.detalle} No se puede borrar sin perder esa historia: suspendela en su lugar.`,
    };
  }
  return { ok: true, data: resultado };
}

/** FR-012 — Las clases de una cohorte en un rango: se borran las que no tienen historia. */
export async function borrarClasesDeRango(
  organizationId: string,
  cohortId: string,
  fromDate: string,
  toDate: string
): Promise<ClassChangeResult<BorradoDeClasesDto>> {
  // El nombre no importa acá: se reusa la validación del rango del receso.
  const error = validarReceso({ name: "rango", fromDate, toDate });
  if (error) return { ok: false, status: 422, code: "invalid_body", message: error };
  const [cohorte] = await getDb()
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!cohorte) return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };
  return {
    ok: true,
    data: await borrarClasesSinHistoria(organizationId, { cohortId, fromDate, toDate }),
  };
}

export type ReprogramacionInput = {
  /** "YYYY-MM-DD" — el DÍA de la clase nueva (se guarda como su medianoche UTC). */
  date: string;
  startTime: string | null;
  endTime: string | null;
  /** FR-014 — confirmación explícita de dar clase en un día de receso. */
  confirmRecess: boolean;
  /** 2026-10-30 — Vio el aviso de que la clase queda después del fin del grupo. */
  confirmEndExtension: boolean;
  /** 2026-10-30 — Qué hacer con la entrega final si el fin se mueve. */
  deliveryOption: OpcionDeEntrega | null;
  /**
   * `academico.editar`: mover el fin y la entrega final es editar el grupo.
   * Hoy la ruta ya la exige; se pasa igual para que la regla no dependa de eso.
   */
  puedeMoverFechas: boolean;
};

export type ReprogramacionDto = {
  id: string;
  date: string;
  /** El fin y la entrega final nuevos del grupo, si cambiaron ("YYYY-MM-DD"). */
  endDate: string | null;
  deliveryDeadline: string | null;
};

/**
 * FR-013 — Reprograma una clase CANCELADA: crea la clase nueva apuntando a la
 * cancelada (`rescheduled_from_id`). La cancelada no cambia: sigue cancelada y
 * sin contar (FR-015); la nueva es una clase normal —asistencia, enlace, aula
 * heredada y matcheo de grabaciones de Zoom incluidos— y cuenta como cualquiera.
 *
 * La fecha se guarda como el DÍA (medianoche UTC), igual que el cronograma; el
 * instante real lo sigue componiendo sólo `classInstant()` a partir de día +
 * hora + zona. Sin horario propio, hereda el de la clase cancelada.
 *
 * 2026-10-30 — En pantalla la cancelada se llama SUSPENDIDA y la nueva es su
 * "clase de reemplazo". Si cae después del fin del grupo, el fin (y, según
 * `deliveryOption`, la entrega final) se mueven acá mismo, en la misma
 * transacción: la regla es `planDeReemplazo` (src/lib/clase-de-reemplazo.ts).
 *
 * La numeración: va al final del cronograma (máximo + 1). El número ordena y
 * es único por cohorte; reescribir los de las clases siguientes movería la
 * "clase 7" de todo el mundo por un cambio de fecha.
 */
export async function reprogramarClase(
  organizationId: string,
  classSessionId: string,
  input: ReprogramacionInput
): Promise<ClassChangeResult<ReprogramacionDto>> {
  const validada = await validarReprogramacionDeClase(organizationId, classSessionId, input);
  if (!validada.ok) return validada;
  return escribirReprogramacion(organizationId, validada.data, input);
}

type ReprogramacionValidada = {
  original: typeof schema.classSession.$inferSelect;
  /** El día nuevo como su medianoche UTC. */
  nuevaFecha: Date;
};

/**
 * Todo lo que puede rechazar una clase de reemplazo ANTES de escribir nada:
 * la clase existe, el día es válido, es una suspendida sin reemplazo y no cae
 * en un receso sin confirmar. Sólo LEE. La separación existe para que la
 * creación en lote pueda validar todas las filas antes de escribir la primera
 * (devolver un error después de escribir no revierte nada).
 */
async function validarReprogramacionDeClase(
  organizationId: string,
  classSessionId: string,
  input: ReprogramacionInput
): Promise<ClassChangeResult<ReprogramacionValidada>> {
  const db = getDb();
  const [original] = await db
    .select()
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.id, classSessionId)
      )
    )
    .limit(1);
  if (!original) {
    return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  }

  if (validarReceso({ name: "x", fromDate: input.date, toDate: input.date })) {
    return { ok: false, status: 422, code: "invalid_body", message: "La fecha nueva no es válida." };
  }
  const nuevaFecha = new Date(`${input.date}T00:00:00.000Z`);

  const [yaReprogramada] = await db
    .select({ id: schema.classSession.id })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.rescheduledFromId, classSessionId)
      )
    )
    .limit(1);

  const recesos = recesosDeCohorte(
    await leerRecesos(db, organizationId, [original.cohortId]),
    original.cohortId
  );
  const error = validarReprogramacion(
    { canceled: original.canceledAt !== null, yaReprogramada: Boolean(yaReprogramada) },
    nuevaFecha,
    recesos,
    input.confirmRecess
  );
  if (error) {
    return {
      ok: false,
      status: error.code === "en_receso" ? 409 : 422,
      code: error.code,
      message: error.message,
      receso: error.code === "en_receso" ? error.receso : undefined,
    };
  }

  return { ok: true, data: { original, nuevaFecha } };
}

/**
 * La escritura de `reprogramarClase`: arma el plan del grupo, crea la clase y
 * extiende el fin y la entrega. Parte de una clase YA validada.
 */
async function escribirReprogramacion(
  organizationId: string,
  { original, nuevaFecha }: ReprogramacionValidada,
  input: ReprogramacionInput
): Promise<ClassChangeResult<ReprogramacionDto>> {
  const db = getDb();
  /*
    2026-10-30 — Una clase de reemplazo después del fin del grupo lo extiende.
    Las fechas se leen de la base: el fin que diga el cliente no se usa.
  */
  const [grupo] = await db
    .select({ endDate: schema.cohort.endDate, deliveryDeadline: schema.cohort.deliveryDeadline })
    .from(schema.cohort)
    .where(
      scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, original.cohortId))
    )
    .limit(1);
  const plan = planDeReemplazo({
    endDate: grupo?.endDate ? diaCalendario(grupo.endDate) : null,
    deliveryDeadline: grupo?.deliveryDeadline ? diaCalendario(grupo.deliveryDeadline) : null,
    reemplazo: input.date,
    confirmaExtension: input.confirmEndExtension,
    puedeMoverFechas: input.puedeMoverFechas,
    opcion: input.deliveryOption,
  });
  if (!plan.ok) {
    return { ok: false, status: plan.status, code: plan.code, message: plan.message };
  }

  const [ultimo] = await db
    .select({ n: max(schema.classSession.number) })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.cohortId, original.cohortId)
      )
    );

  const startTime = input.startTime ?? original.startTime;
  const endTime = input.endTime ?? original.endTime;
  const id = newId("classSession");
  await db.insert(schema.classSession).values({
    id,
    organizationId,
    cohortId: original.cohortId,
    number: (ultimo?.n ?? 0) + 1,
    date: nuevaFecha,
    startTime,
    endTime,
    hours: hoursFromTimes(startTime, endTime) ?? original.hours,
    teacherId: original.teacherId,
    topic: original.topic,
    // El enlace y el aula propios de la cancelada no se copian: la nueva
    // hereda los de la cohorte, como cualquier clase del cronograma.
    rescheduledFromId: original.id,
  });

  /*
    Misma transacción que la clase: si el grupo no se actualiza, se LANZA para
    que se revierta todo (devolver un error dejaría la clase creada).
  */
  await extenderGrupo(organizationId, original.cohortId, plan);

  return {
    ok: true,
    data: {
      id,
      date: nuevaFecha.toISOString(),
      endDate: plan.endDate,
      deliveryDeadline: plan.deliveryDeadline,
    },
  };
}

/** Escribe en el grupo lo que `planDeReemplazo` decidió. LANZA si no puede. */
async function extenderGrupo(
  organizationId: string,
  cohortId: string,
  plan: { endDate: string | null; deliveryDeadline: string | null }
): Promise<void> {
  if (!plan.endDate) return;
  const actualizado = await getDb()
    .update(schema.cohort)
    .set({
      endDate: diaComoFecha(plan.endDate),
      ...(plan.deliveryDeadline ? { deliveryDeadline: diaComoFecha(plan.deliveryDeadline) } : {}),
      updatedAt: new Date(),
    })
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .returning({ id: schema.cohort.id });
  if (actualizado.length !== 1) {
    throw new Error("No se pudo extender el fin del grupo");
  }
}

export type ReemplazoAutomaticoDto = ReprogramacionDto & {
  /** "El fin del curso pasa a ser 25/11 y la entrega final a 02/12." — null si no se movió nada. */
  aviso: string | null;
};

/**
 * 2026-11-04 — Suspender una clase crea SOLA su clase de reemplazo: el próximo
 * día de cursada del grupo después de su última clase vigente, salteando
 * recesos y feriados, con el horario de la suspendida. Si cae después del fin
 * del grupo, el fin se estira y la entrega final se corre los mismos días
 * (opción `correr`), sin pedir confirmación: lo que pasó se DICE en `aviso`.
 *
 * Pasa por `reprogramarClase`, el único camino que crea la clase de
 * reemplazo, así que el vínculo, la numeración y las reglas de las fechas del
 * grupo son las de siempre. Hay que llamarla con la clase YA suspendida.
 * `ok: true` con `data: null` = no se pudo calcular el día (el grupo no
 * declara días de cursada): la clase queda suspendida y se reemplaza a mano.
 */
export async function reemplazarClaseSuspendida(
  organizationId: string,
  classSessionId: string,
  puedeMoverFechas: boolean
): Promise<ClassChangeResult<ReemplazoAutomaticoDto | null>> {
  const db = getDb();
  const [original] = await db
    .select({ cohortId: schema.classSession.cohortId, date: schema.classSession.date })
    .from(schema.classSession)
    .where(
      scoped(schema.classSession.organizationId, organizationId, eq(schema.classSession.id, classSessionId))
    )
    .limit(1);
  if (!original) return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };

  const [grupo] = await db
    .select({ daysOfWeek: schema.cohort.daysOfWeek })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, original.cohortId)))
    .limit(1);
  const [ultima] = await db
    .select({ fecha: max(schema.classSession.date) })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        and(eq(schema.classSession.cohortId, original.cohortId), isNull(schema.classSession.canceledAt))
      )
    );
  const base = ultima?.fecha && ultima.fecha > original.date ? ultima.fecha : original.date;
  const recesos = recesosDeCohorte(
    await leerRecesos(db, organizationId, [original.cohortId]),
    original.cohortId
  );
  const fecha = proximoDiaDeClase({
    despuesDe: diaDeClase(base),
    daysOfWeek: grupo?.daysOfWeek ?? null,
    recesos,
  });
  if (!fecha) return { ok: true, data: null };

  const creada = await reprogramarClase(organizationId, classSessionId, {
    date: fecha,
    startTime: null,
    endTime: null,
    confirmRecess: false,
    confirmEndExtension: true,
    deliveryOption: { tipo: "correr" },
    puedeMoverFechas,
  });
  if (!creada.ok) return creada;
  return {
    ok: true,
    data: { ...creada.data, aviso: avisoDeExtension(creada.data) },
  };
}

export type MovimientoDeClaseInput = {
  /** "YYYY-MM-DD" — el día nuevo de la clase. */
  date: string;
  startTime: string | null;
  endTime: string | null;
  /** Dar clase en un día de receso o feriado exige decirlo explícitamente. */
  confirmRecess: boolean;
  /** `academico.editar`: estirar el fin y la entrega final es editar el grupo. */
  puedeMoverFechas: boolean;
};

export type MovimientoDeClaseDto = ReprogramacionDto & { aviso: string | null };

/**
 * 2026-11-04 — Cambia la FECHA (y, si se manda, el horario) de una clase viva.
 * La clase conserva su número, su enlace y su aula; no se mueve una suspendida
 * (se le crea su reemplazo) ni una con asistencia o grabación (moverla
 * reescribiría la historia: se suspende y se repone).
 *
 * Si el día nuevo queda después del fin del grupo, el fin se estira y la
 * entrega final se corre los mismos días en la misma transacción
 * (`planDeReemplazo`, opción `correr`); el `aviso` lo dice.
 */
export async function moverClase(
  organizationId: string,
  classSessionId: string,
  input: MovimientoDeClaseInput
): Promise<ClassChangeResult<MovimientoDeClaseDto>> {
  const db = getDb();
  const [clase] = await db
    .select()
    .from(schema.classSession)
    .where(
      scoped(schema.classSession.organizationId, organizationId, eq(schema.classSession.id, classSessionId))
    )
    .limit(1);
  if (!clase) return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  if (clase.canceledAt) {
    return {
      ok: false,
      status: 409,
      code: "clase_suspendida",
      message: "La clase está suspendida: creá su clase de reemplazo en lugar de moverla.",
    };
  }
  if (validarReceso({ name: "x", fromDate: input.date, toDate: input.date })) {
    return { ok: false, status: 422, code: "invalid_body", message: "La fecha nueva no es válida." };
  }
  const nuevaFecha = new Date(`${input.date}T00:00:00.000Z`);

  const [conAsistencia] = await db
    .select({ id: schema.attendance.id })
    .from(schema.attendance)
    .where(
      scoped(schema.attendance.organizationId, organizationId, eq(schema.attendance.classSessionId, clase.id))
    )
    .limit(1);
  if (conAsistencia || clase.recordingUrl) {
    return {
      ok: false,
      status: 409,
      code: "clase_con_historia",
      message:
        "La clase tiene asistencia o grabación y moverla cambiaría esa historia: suspendela y creá su clase de reemplazo.",
    };
  }

  const recesos = recesosDeCohorte(
    await leerRecesos(db, organizationId, [clase.cohortId]),
    clase.cohortId
  );
  const receso = fechaEnReceso(nuevaFecha, recesos);
  if (receso && !input.confirmRecess && diaDeClase(clase.date) !== input.date) {
    return {
      ok: false,
      status: 409,
      code: "en_receso",
      message: `La fecha elegida cae en "${receso.name}". Confirmá que querés dar clase igual ese día.`,
      receso: receso.name,
    };
  }

  const [grupo] = await db
    .select({ endDate: schema.cohort.endDate, deliveryDeadline: schema.cohort.deliveryDeadline })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, clase.cohortId)))
    .limit(1);
  const plan = planDeReemplazo({
    endDate: grupo?.endDate ? diaCalendario(grupo.endDate) : null,
    deliveryDeadline: grupo?.deliveryDeadline ? diaCalendario(grupo.deliveryDeadline) : null,
    reemplazo: input.date,
    confirmaExtension: true,
    puedeMoverFechas: input.puedeMoverFechas,
    opcion: { tipo: "correr" },
  });
  if (!plan.ok) return { ok: false, status: plan.status, code: plan.code, message: plan.message };

  const startTime = input.startTime ?? clase.startTime;
  const endTime = input.endTime ?? clase.endTime;
  await db
    .update(schema.classSession)
    .set({
      date: nuevaFecha,
      startTime,
      endTime,
      hours: hoursFromTimes(startTime, endTime) ?? clase.hours,
      updatedAt: new Date(),
    })
    .where(
      scoped(schema.classSession.organizationId, organizationId, eq(schema.classSession.id, clase.id))
    );
  await extenderGrupo(organizationId, clase.cohortId, plan);

  return {
    ok: true,
    data: {
      id: clase.id,
      date: nuevaFecha.toISOString(),
      endDate: plan.endDate,
      deliveryDeadline: plan.deliveryDeadline,
      aviso: avisoDeExtension(plan),
    },
  };
}

export type SugerenciaDeReemplazoDto = {
  /** El fin y la entrega final del grupo hoy ("YYYY-MM-DD"), para avisar qué se estira. */
  endDate: string | null;
  deliveryDeadline: string | null;
  classes: {
    id: string;
    number: number;
    /** El día de la suspendida ("YYYY-MM-DD"). */
    date: string;
    startTime: string | null;
    endTime: string | null;
    cancelReason: string | null;
    /** El día sugerido para su reemplazo; `null` = el grupo no declara días de cursada. */
    suggested: string | null;
  }[];
};

/**
 * 2026-11-05 — Las suspendidas de un grupo que todavía no tienen su clase de
 * reemplazo, cada una con el día que se sugiere (`sugerirReemplazos`: en fila,
 * salteando recesos y feriados). Con `classId` devuelve SOLO esa: la sugerencia
 * es la misma que le habría puesto suspender con "crear sola".
 */
export async function sugerenciasDeReemplazo(
  organizationId: string,
  cohortId: string,
  classId: string | null
): Promise<ClassChangeResult<SugerenciaDeReemplazoDto>> {
  const db = getDb();
  const [grupo] = await db
    .select({
      daysOfWeek: schema.cohort.daysOfWeek,
      endDate: schema.cohort.endDate,
      deliveryDeadline: schema.cohort.deliveryDeadline,
    })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!grupo) return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };

  const clases = await db
    .select({
      id: schema.classSession.id,
      number: schema.classSession.number,
      date: schema.classSession.date,
      startTime: schema.classSession.startTime,
      endTime: schema.classSession.endTime,
      canceledAt: schema.classSession.canceledAt,
      cancelReason: schema.classSession.cancelReason,
      rescheduledFromId: schema.classSession.rescheduledFromId,
    })
    .from(schema.classSession)
    .where(
      scoped(schema.classSession.organizationId, organizationId, eq(schema.classSession.cohortId, cohortId))
    );

  const conReemplazo = new Set(clases.flatMap((c) => (c.rescheduledFromId ? [c.rescheduledFromId] : [])));
  const suspendidas = clases.filter(
    (c) => c.canceledAt !== null && !conReemplazo.has(c.id) && (classId === null || c.id === classId)
  );
  if (classId !== null && suspendidas.length === 0) {
    return {
      ok: false,
      status: 404,
      code: "not_found",
      message: "No hay una clase suspendida sin reemplazo con ese id.",
    };
  }
  const ultimaClase = clases
    .filter((c) => c.canceledAt === null)
    .reduce<string | null>((max, c) => {
      const dia = diaDeClase(c.date);
      return max === null || dia > max ? dia : max;
    }, null);

  const sugeridas = new Map(
    sugerirReemplazos({
      suspendidas: suspendidas.map((c) => ({ id: c.id, date: diaDeClase(c.date) })),
      ultimaClase,
      daysOfWeek: grupo.daysOfWeek,
      recesos: recesosDeCohorte(await leerRecesos(db, organizationId, [cohortId]), cohortId),
    }).map((s) => [s.id, s.fecha] as const)
  );
  return {
    ok: true,
    data: {
      endDate: grupo.endDate ? diaCalendario(grupo.endDate) : null,
      deliveryDeadline: grupo.deliveryDeadline ? diaCalendario(grupo.deliveryDeadline) : null,
      classes: suspendidas
        .sort((a, b) => a.date.getTime() - b.date.getTime() || a.number - b.number)
        .map((c) => ({
          id: c.id,
          number: c.number,
          date: diaDeClase(c.date),
          startTime: c.startTime,
          endTime: c.endTime,
          cancelReason: c.cancelReason,
          suggested: sugeridas.get(c.id) ?? null,
        })),
    },
  };
}

export type ReemplazoDeLote = {
  classId: string;
  /** "YYYY-MM-DD"; `null` = ignorar esa suspendida (no se le crea reemplazo). */
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  /** Dar clase en un día de receso o feriado exige decirlo explícitamente. */
  confirmRecess: boolean;
};

export type FilaDeLoteConProblema = {
  classId: string;
  code: string;
  message: string;
  receso?: string;
};

export type LoteDeReemplazosDto = {
  created: { classId: string; id: string; date: string }[];
  ignored: number;
  /** El fin y la entrega final nuevos del grupo, si cambiaron ("YYYY-MM-DD"). */
  endDate: string | null;
  deliveryDeadline: string | null;
  /** "El fin del curso pasa a ser 25/11 y la entrega final a 02/12." — `null` si no se movió nada. */
  aviso: string | null;
};

export type LoteDeReemplazosResult =
  | { ok: true; data: LoteDeReemplazosDto }
  | {
      ok: false;
      status: 403 | 404 | 409 | 422;
      code: string;
      message: string;
      /** Qué filas impidieron crear el lote (no se creó ninguna). */
      filas: FilaDeLoteConProblema[];
    };

/**
 * 2026-11-05 — Crea VARIOS reemplazos juntos (todo o nada).
 *
 * Pasa por el mismo camino que uno solo: primero se VALIDAN todas las filas
 * (`validarReprogramacionDeClase`, que sólo lee) y recién si ninguna tiene
 * problema se escribe, de la fecha más temprana a la más tardía, con
 * `escribirReprogramacion`. Cada una estira el fin hasta su día y corre la
 * entrega final esa diferencia (opción `correr`, sin confirmación), así que al
 * final el grupo queda como lo deja la clase más tardía. Un día de receso sin
 * `confirmRecess` se informa por fila (`en_receso`), no se crea en silencio.
 *
 * Si algo falla DESPUÉS de empezar a escribir (no debería: lo que puede
 * fallar ya se validó) se LANZA, para que el pedido revierta todo.
 */
export async function crearReemplazosEnLote(
  organizationId: string,
  cohortId: string,
  items: ReemplazoDeLote[],
  puedeMoverFechas: boolean
): Promise<LoteDeReemplazosResult> {
  const error = (
    status: 403 | 404 | 409 | 422,
    code: string,
    message: string,
    filas: FilaDeLoteConProblema[] = []
  ): LoteDeReemplazosResult => ({ ok: false, status, code, message, filas });

  const ids = items.map((i) => i.classId);
  if (new Set(ids).size !== ids.length) {
    return error(422, "invalid_body", "Una clase figura más de una vez en el pedido.");
  }
  const aCrear = items
    .flatMap((i) => (i.date === null ? [] : [{ ...i, date: i.date }]))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const ignoradas = items.length - aCrear.length;
  if (aCrear.length === 0) {
    return {
      ok: true,
      data: { created: [], ignored: ignoradas, endDate: null, deliveryDeadline: null, aviso: null },
    };
  }
  if (new Set(aCrear.map((i) => i.date)).size !== aCrear.length) {
    return error(422, "fechas_repetidas", "Dos clases de reemplazo caen el mismo día: elegí días distintos.");
  }

  const db = getDb();
  const delGrupo = await db
    .select({ id: schema.classSession.id })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.cohortId, cohortId),
        inArray(schema.classSession.id, ids)
      )
    );
  if (delGrupo.length !== ids.length) {
    return error(404, "not_found", "Alguna de las clases no existe en este grupo.");
  }

  const entrada = (i: (typeof aCrear)[number]): ReprogramacionInput => ({
    date: i.date,
    startTime: i.startTime,
    endTime: i.endTime,
    confirmRecess: i.confirmRecess,
    confirmEndExtension: true,
    deliveryOption: { tipo: "correr" },
    puedeMoverFechas,
  });

  const validadas: ReprogramacionValidada[] = [];
  const filas: FilaDeLoteConProblema[] = [];
  for (const item of aCrear) {
    const v = await validarReprogramacionDeClase(organizationId, item.classId, entrada(item));
    if (v.ok) validadas.push(v.data);
    else filas.push({ classId: item.classId, code: v.code, message: v.message, receso: v.receso });
  }
  if (filas.length > 0) {
    const enReceso = filas.some((f) => f.code === "en_receso");
    return error(
      enReceso ? 409 : 422,
      enReceso ? "en_receso" : "reemplazos_con_problemas",
      filas.length === 1
        ? (filas[0]?.message ?? "No se pudo crear el reemplazo.")
        : `${filas.length} clases no se pudieron reponer. No se creó ninguna.`,
      filas
    );
  }

  const created: LoteDeReemplazosDto["created"] = [];
  let endDate: string | null = null;
  let deliveryDeadline: string | null = null;
  for (const [indice, validada] of validadas.entries()) {
    const item = aCrear[indice];
    if (!item) continue;
    const creada = await escribirReprogramacion(organizationId, validada, entrada(item));
    if (!creada.ok) throw new Error(`No se pudo crear el reemplazo de ${item.classId}: ${creada.code}`);
    created.push({ classId: item.classId, id: creada.data.id, date: item.date });
    endDate = creada.data.endDate ?? endDate;
    deliveryDeadline = creada.data.deliveryDeadline ?? deliveryDeadline;
  }
  return {
    ok: true,
    data: {
      created,
      ignored: ignoradas,
      endDate,
      deliveryDeadline,
      aviso: avisoDeExtension({ endDate, deliveryDeadline }),
    },
  };
}
