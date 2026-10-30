import { z } from "zod";
import { diaComoFecha, diaCalendario, esDiaValido } from "@/lib/access-expiry";
import { classInstant, wallClockInZone } from "@/lib/schedule-time";
import { HORA_DE_ENTREGA_FINAL, entregaFinalValida } from "@/lib/entrega-final";

/**
 * "Clonar grupo": un grupo NUEVO a partir de otro, con su configuración, su
 * material y sus evaluaciones, sin alumnos y sin fechas. Las reglas de
 * FECHAS, puras.
 *
 * Todo es día de calendario (`YYYY-MM-DD`, medianoche UTC como `start_date`):
 * correr un día no depende de la zona ni del cambio de hora. La única fecha
 * que es un INSTANTE es el plazo de una evaluación (`assessment.due_at`), y se
 * corre en la zona de la academia: se lee su día y su hora con
 * `wallClockInZone` y se vuelve a componer con `classInstant`, nunca sumando
 * milisegundos (eso movería la hora en una semana de cambio de horario).
 *
 * El corrimiento es el MISMO para todo un grupo: la distancia entre el inicio
 * viejo y el nuevo. En una especialización, cada módulo usa la SUYA (sus
 * fechas se eligen una por una en el diálogo).
 */

const DIA_MS = 86_400_000;

export const diaSchema = z
  .string()
  .refine(esDiaValido, { message: "Fecha inválida (AAAA-MM-DD)" });

/** Días de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((diaComoFecha(hasta).getTime() - diaComoFecha(desde).getTime()) / DIA_MS);
}

/** El día `n` días después (o antes, con `n` negativo). */
export function sumarDias(ymd: string, n: number): string {
  return diaCalendario(new Date(diaComoFecha(ymd).getTime() + n * DIA_MS));
}

/**
 * El nombre que se sugiere: el mismo, con el año del nuevo inicio en lugar
 * del viejo ("Revit 2025" → "Revit 2026"). Sin año en el nombre, se le
 * agrega. Es una sugerencia: la persona lo edita.
 */
export function nombreSugerido(nombre: string, nuevoInicio: string): string {
  const anio = nuevoInicio.slice(0, 4);
  const base = nombre.trim();
  if (/\b(19|20)\d{2}\b/.test(base)) return base.replace(/\b(19|20)\d{2}\b/g, anio);
  return base ? `${base} ${anio}` : anio;
}

/** El nombre de un módulo: solo se cambia el año si lo tiene ("Módulo 1" queda igual). */
export function nombreDeModuloSugerido(nombre: string, nuevoInicio: string): string {
  const anio = nuevoInicio.slice(0, 4);
  return nombre.trim().replace(/\b(19|20)\d{2}\b/g, anio);
}

export type FechasDeGrupo = { startDate: string; endDate: string | null };

/**
 * Inicio elegido; fin y entrega final sugeridos (los viejos corridos lo mismo
 * que el inicio). Una entrega final que no quedaría después del fin no se
 * sugiere.
 */
export function fechasSugeridas(
  origen: FechasDeGrupo & { deliveryDeadline?: string | null },
  nuevoInicio: string
): FechasDeGrupo & { deliveryDeadline: string | null } {
  const offset = diasEntre(origen.startDate, nuevoInicio);
  const endDate = origen.endDate ? sumarDias(origen.endDate, offset) : null;
  const entrega = origen.deliveryDeadline ? sumarDias(origen.deliveryDeadline, offset) : null;
  const valida =
    entrega !== null &&
    entregaFinalValida(endDate ? diaComoFecha(endDate) : null, diaComoFecha(entrega));
  return { startDate: nuevoInicio, endDate, deliveryDeadline: valida ? entrega : null };
}

/**
 * La etiqueta con la que el material de una clase del grupo original recuerda
 * de dónde venía: "Clase 3 · 12/03 · Muros".
 */
export function etiquetaDeClaseDeOrigen(clase: {
  number: number;
  date: string;
  topic: string | null;
}): string {
  const [, mes, dia] = clase.date.split("-");
  const tema = clase.topic?.trim();
  return [`Clase ${clase.number}`, `${dia}/${mes}`, ...(tema ? [tema] : [])].join(" · ");
}

/**
 * La clase del grupo nuevo que se SUGIERE para un material de la clase N del
 * original: la del mismo número, si existe y no está cancelada. Es solo una
 * sugerencia: la persona confirma.
 */
export function claseSugerida(
  numeroDeOrigen: number | null,
  clases: readonly { id: string; number: number; canceled: boolean }[]
): string | null {
  if (numeroDeOrigen === null) return null;
  return clases.find((c) => c.number === numeroDeOrigen && !c.canceled)?.id ?? null;
}

export type ModuloDeOrigen = FechasDeGrupo & { id: string; name: string };

export type FechasDeModulo = FechasDeGrupo & { sourceCohortId: string; name: string };

/**
 * Las fechas sugeridas de cada módulo: corridas lo mismo que el inicio del
 * PROGRAMA. Son solo un punto de partida: el diálogo las deja editar una por
 * una antes de confirmar.
 */
export function modulosSugeridos(
  programaOrigenInicio: string,
  modulos: readonly ModuloDeOrigen[],
  nuevoInicio: string
): FechasDeModulo[] {
  const offset = diasEntre(programaOrigenInicio, nuevoInicio);
  return modulos.map((m) => ({
    sourceCohortId: m.id,
    name: nombreDeModuloSugerido(m.name, nuevoInicio),
    startDate: sumarDias(m.startDate, offset),
    endDate: m.endDate ? sumarDias(m.endDate, offset) : null,
  }));
}

export type PedidoDeFechas = FechasDeGrupo & {
  modules: readonly (FechasDeGrupo & { sourceCohortId: string })[];
};

export type ValidacionDeFechas =
  | { ok: true; avisos: string[] }
  | { ok: false; message: string };

/**
 * Las fechas que manda el diálogo. Bloquea lo que no tiene sentido (fin antes
 * del inicio, un módulo que falta o sobra); un módulo fuera del rango del
 * programa es solo un AVISO, porque el sistema tampoco lo exige al editar.
 */
export function validarFechasDelClon(
  pedido: PedidoDeFechas,
  modulos: readonly { id: string; name: string }[]
): ValidacionDeFechas {
  if (pedido.endDate && pedido.endDate < pedido.startDate) {
    return { ok: false, message: "La fecha de fin tiene que ser igual o posterior al inicio." };
  }

  const pedidos = new Map(pedido.modules.map((m) => [m.sourceCohortId, m]));
  if (pedidos.size !== pedido.modules.length) {
    return { ok: false, message: "Un módulo aparece dos veces." };
  }
  const esperados = new Set(modulos.map((m) => m.id));
  if (pedido.modules.some((m) => !esperados.has(m.sourceCohortId))) {
    return { ok: false, message: "Un módulo no es de este grupo." };
  }

  const avisos: string[] = [];
  for (const m of modulos) {
    const p = pedidos.get(m.id);
    if (!p) return { ok: false, message: `Faltan las fechas del módulo «${m.name}».` };
    if (p.endDate && p.endDate < p.startDate) {
      return {
        ok: false,
        message: `En «${m.name}», la fecha de fin tiene que ser igual o posterior al inicio.`,
      };
    }
    const antes = p.startDate < pedido.startDate;
    const despues = pedido.endDate !== null && (p.endDate ?? p.startDate) > pedido.endDate;
    if (antes || despues) {
      avisos.push(`El módulo «${m.name}» queda fuera de las fechas del programa.`);
    }
  }
  return { ok: true, avisos };
}

export type EvaluacionDeOrigen = { id: string; name: string; dueAt: string | null };

export type PlanDeFechasDeGrupo = {
  /** La entrega final corrida; `null` si no tenía o si dejó de ser válida. */
  deliveryDeadline: string | null;
  /** El plazo nuevo de cada evaluación de origen (instante ISO), por su id. */
  plazos: Map<string, string | null>;
  avisos: string[];
};

/** Corre un instante `n` días en la zona de la academia, conservando la hora local. */
export function correrInstante(iso: string, dias: number, timeZone: string): string | null {
  const local = wallClockInZone(new Date(iso), timeZone);
  if (!local) return null;
  const instante = classInstant(diaComoFecha(sumarDias(local.fecha, dias)), local.hora, timeZone);
  return instante ? instante.toISOString() : null;
}

/**
 * La entrega final y los plazos de las evaluaciones del grupo nuevo: corridos
 * lo mismo que el inicio. Lo que deja de ser válido queda VACÍO, con un aviso:
 *
 * - la entrega final tiene que ser posterior al fin (`entregaFinalValida`);
 * - un plazo no puede pasar la entrega final (`plazoSuperaEntregaFinal`).
 *
 * Con `destino.deliveryDeadline` presente (el grupo nuevo, que la eligió en
 * el formulario), esa es la entrega final y no se corre la vieja: la valida
 * `createCohort`. Ausente (un módulo), se corre la del origen.
 */
export function planDeFechasDeGrupo(
  origen: {
    startDate: string;
    deliveryDeadline: string | null;
    assessments: readonly EvaluacionDeOrigen[];
  },
  destino: FechasDeGrupo & { deliveryDeadline?: string | null },
  timeZone: string,
  etiqueta?: string
): PlanDeFechasDeGrupo {
  const offset = diasEntre(origen.startDate, destino.startDate);
  const avisos: string[] = [];
  const en = etiqueta ? ` (${etiqueta})` : "";

  const elegida = destino.deliveryDeadline !== undefined;
  let deliveryDeadline = elegida
    ? (destino.deliveryDeadline ?? null)
    : origen.deliveryDeadline
      ? sumarDias(origen.deliveryDeadline, offset)
      : null;
  if (
    !elegida &&
    deliveryDeadline &&
    !entregaFinalValida(
      destino.endDate ? diaComoFecha(destino.endDate) : null,
      diaComoFecha(deliveryDeadline)
    )
  ) {
    avisos.push(
      `La entrega final${en} quedaba antes del fin del grupo: quedó sin fecha. Cargala desde Editar grupo.`
    );
    deliveryDeadline = null;
  }
  const limite = deliveryDeadline
    ? classInstant(diaComoFecha(deliveryDeadline), HORA_DE_ENTREGA_FINAL, timeZone)
    : null;

  const plazos = new Map<string, string | null>();
  for (const a of origen.assessments) {
    if (!a.dueAt) {
      plazos.set(a.id, null);
      continue;
    }
    const nuevo = correrInstante(a.dueAt, offset, timeZone);
    if (!nuevo) {
      avisos.push(`El plazo de «${a.name}»${en} quedó sin fecha: no se pudo correr.`);
      plazos.set(a.id, null);
      continue;
    }
    if (limite && new Date(nuevo).getTime() > limite.getTime()) {
      avisos.push(`El plazo de «${a.name}»${en} quedó sin fecha: pasaba la entrega final.`);
      plazos.set(a.id, null);
      continue;
    }
    plazos.set(a.id, nuevo);
  }
  return { deliveryDeadline, plazos, avisos };
}

export type ModuloDelClonDto = {
  id: string;
  name: string;
  position: number | null;
  startDate: string;
  endDate: string | null;
  materialCount: number;
  classMaterialCount: number;
  assessmentCount: number;
};

/** Lo que el formulario recibe de `GET /api/cohorts/[id]/clone-preview`. */
export type VistaPreviaDelClonDto = {
  source: {
    id: string;
    name: string;
    courseName: string;
    startDate: string;
    endDate: string | null;
    deliveryDeadline: string | null;
    isSpecialization: boolean;
  };
  materialCount: number;
  /** Material de las clases: se copia como material del grupo, para asignar a mano. */
  classMaterialCount: number;
  assessmentCount: number;
  softwareCount: number;
  /** El aula está dada de baja: el clon nace sin aula. */
  roomArchived: boolean;
  modules: ModuloDelClonDto[];
};
