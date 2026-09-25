/**
 * 028 — El ORDEN de los módulos de una especialización, sin base de datos.
 *
 * Vive en `lib/` y no en `server/program-modules.ts` porque la pantalla del
 * staff también lo necesita: el listado académico agrupa los módulos bajo su
 * madre y los rotula con el mismo ordinal que la grilla. Importar
 * `program-modules.ts` desde un componente cliente arrastraría el driver de
 * Postgres al navegador, y copiar la regla es cómo dos pantallas terminan
 * diciendo "Módulo 2" de módulos distintos. `program-modules.ts` las
 * reexporta, así que el servidor las sigue encontrando donde siempre.
 */

/**
 * 028 (FR-002) — Cómo se ROTULA un módulo de programa.
 *
 * **`position` es una clave de ORDEN, no una etiqueta**, y la diferencia no es
 * cosmética. Alguien va a cargar 10, 20 y 30 para poder insertar un módulo en
 * el medio sin renumerar los que ya están: es una decisión legítima y es la
 * primera que se le ocurre a cualquiera. Si la pantalla imprimiera el número
 * guardado, ese día la especialización pasaría a tener "Módulo 10, Módulo 20 y
 * Módulo 30" y nadie entendería qué se rompió.
 *
 * Entonces:
 *
 * - se ORDENA por `position`;
 * - se ROTULA con el nombre propio de la cohorte de módulo;
 * - y el ordinal, cuando hace falta, sale del LUGAR en la lista ya ordenada.
 *
 * `ordinal` en `null` es "no hay orden que declarar": se muestra el nombre
 * pelado, porque inventar un número sería afirmar algo que nadie cargó.
 */
export function etiquetaDeModulo(ordinal: number | null, nombre: string): string {
  return ordinal === null ? nombre : `Módulo ${ordinal} — ${nombre}`;
}

/** Lo mínimo que hace falta para ubicar un módulo en el orden del programa. */
export type ModuloOrdenable = {
  id: string;
  position: number | null;
  startDate: Date | null;
};

/**
 * El orden que decidió la academia, en una sola función.
 *
 * Ordena por `position` y desempata por `start_date`; un módulo SIN `position`
 * cargada es un dato a medias y va al final, no al principio. El id desempata
 * lo que quede, para que dos módulos mal cargados no salgan en orden aleatorio
 * entre una pantalla y otra.
 */
export function ordenarModulosDelPrograma<T extends ModuloOrdenable>(
  modulos: readonly T[]
): T[] {
  return [...modulos].sort((a, b) => {
    if (a.position === null && b.position === null) return a.id.localeCompare(b.id);
    if (a.position === null) return 1;
    if (b.position === null) return -1;
    if (a.position !== b.position) return a.position - b.position;
    const fa = a.startDate?.getTime() ?? 0;
    const fb = b.startDate?.getTime() ?? 0;
    return fa - fb || a.id.localeCompare(b.id);
  });
}

/**
 * Los módulos del programa, ordenados y con su ORDINAL ya derivado del lugar.
 *
 * El ordinal se calcula acá y en ningún otro lado. Cada pantalla que lo
 * recalcule por su cuenta es una oportunidad de contar sobre la lista
 * equivocada, que es exactamente el defecto que esta función viene a cerrar:
 * el módulo 2 del programa es "Módulo 2" para todo el mundo, también para el
 * alumno que nunca cursó el 1.
 */
export function modulosConOrdinal<T extends ModuloOrdenable>(
  modulos: readonly T[]
): (T & { ordinal: number | null })[] {
  return ordenarModulosDelPrograma(modulos).map((m, i) => ({
    ...m,
    // Sin `position` no hay orden que declarar: inventar un número sería
    // afirmar algo que nadie cargó.
    ordinal: m.position === null ? null : i + 1,
  }));
}

/* ============================================================
 * Armar el programa desde la pestaña
 * ============================================================ */

/** El hueco que se deja entre módulos, para poder insertar uno en el medio. */
const PASO = 10;

/**
 * El lugar de un módulo NUEVO: al final, dejando el hueco de siempre.
 *
 * Nadie vuelve a tipear 10/20/30: el número se deduce de los hermanos. Los
 * módulos sin orden no cuentan — no tienen lugar que superar.
 */
export function siguientePosicion(posiciones: readonly (number | null)[]): number {
  const conOrden = posiciones.filter((p): p is number => p !== null);
  return conOrden.length === 0 ? PASO : Math.max(...conOrden) + PASO;
}

export type PlanDeReorden =
  | { ok: true; positions: { id: string; position: number }[] }
  | { ok: false; message: string };

/**
 * El orden nuevo, pedido como la LISTA COMPLETA de módulos.
 *
 * Se pide la lista y no "subí éste": el servidor renumera 10, 20, 30… y de
 * paso ordena lo que estuviera mal cargado (dos módulos con la misma
 * posición, uno sin posición). Pero la lista tiene que ser EXACTAMENTE la de
 * los módulos de esta especialización: con uno ajeno se estaría moviendo un
 * módulo de otro programa, y con uno de menos ese quedaría con su posición
 * vieja, compitiendo con las nuevas.
 */
export function planDeReorden(
  actuales: readonly string[],
  pedido: readonly string[]
): PlanDeReorden {
  const actualesSet = new Set(actuales);
  const pedidoSet = new Set(pedido);
  if (pedidoSet.size !== pedido.length) {
    return { ok: false, message: "El orden pedido repite un módulo" };
  }
  if (pedido.some((id) => !actualesSet.has(id))) {
    return { ok: false, message: "El orden pedido incluye un módulo que no es de esta especialización" };
  }
  if (pedido.length !== actuales.length) {
    return { ok: false, message: "El orden pedido no incluye todos los módulos de la especialización" };
  }
  return {
    ok: true,
    positions: pedido.map((id, i) => ({ id, position: (i + 1) * PASO })),
  };
}

/* ============================================================
 * El listado académico: los módulos bajo su madre
 * ============================================================ */

type EstadoDeCohorte = "planificada" | "en_curso" | "finalizada";

/** Lo que el listado necesita de cada cohorte para poder agruparla. */
export type CohorteAgrupable = {
  id: string;
  name: string | null;
  courseName: string;
  isSpecialization: boolean;
  parentCohortId: string | null;
  position: number | null;
  startDate: string;
  status: EstadoDeCohorte;
};

export type GrupoDelListado<T extends CohorteAgrupable> = {
  cohort: T;
  /** Vacío en una cohorte común, y también en una especialización todavía sin armar. */
  modules: { cohort: T; ordinal: number | null; label: string }[];
  /** En qué sección de estado se dibuja la fila. */
  seccion: EstadoDeCohorte;
};

const ORDEN_DE_SECCION: EstadoDeCohorte[] = ["en_curso", "planificada", "finalizada"];

/**
 * Agrupa el listado: cada módulo bajo su madre y NUNCA como fila suelta.
 *
 * Con el filtro de estado, una madre se muestra si ELLA o alguno de sus
 * módulos coincide — la especialización planificada cuyo módulo 1 ya empezó
 * es justamente la que hay que ver al filtrar "en curso". En ese caso va en
 * la sección de lo que coincidió: dibujarla bajo un estado que el filtro
 * esconde sería mostrarla en una sección que no existe.
 *
 * Los módulos adentro se muestran TODOS, coincidan o no: son la estructura
 * del programa, no resultados de una búsqueda.
 *
 * Un módulo cuya madre no vino en el listado se muestra suelto: esconderlo
 * sería perder una cohorte por un dato que falta.
 */
export function agruparEspecializaciones<T extends CohorteAgrupable>(
  cohorts: readonly T[],
  filtro: ReadonlySet<EstadoDeCohorte>
): GrupoDelListado<T>[] {
  const ids = new Set(cohorts.map((c) => c.id));
  const hijos = new Map<string, T[]>();
  for (const c of cohorts) {
    if (c.parentCohortId !== null && ids.has(c.parentCohortId)) {
      const lista = hijos.get(c.parentCohortId) ?? [];
      lista.push(c);
      hijos.set(c.parentCohortId, lista);
    }
  }

  const grupos: GrupoDelListado<T>[] = [];
  for (const c of cohorts) {
    // Un módulo con su madre presente se dibuja adentro de ella.
    if (c.parentCohortId !== null && ids.has(c.parentCohortId)) continue;

    const propios = hijos.get(c.id) ?? [];
    const coincide = filtro.has(c.status);
    const estadosDeModulos = new Set(propios.map((m) => m.status));
    const seccion = coincide
      ? c.status
      : ORDEN_DE_SECCION.find((s) => filtro.has(s) && estadosDeModulos.has(s));
    if (!seccion) continue;

    const modules = modulosConOrdinal(
      propios.map((m) => ({
        id: m.id,
        position: m.position,
        startDate: new Date(m.startDate),
        cohort: m,
      }))
    ).map((m) => ({
      cohort: m.cohort,
      ordinal: m.ordinal,
      label: etiquetaDeModulo(m.ordinal, m.cohort.name ?? m.cohort.courseName),
    }));

    grupos.push({ cohort: c, modules, seccion });
  }
  return grupos;
}
