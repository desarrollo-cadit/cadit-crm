/**
 * 034 (US1, FR-001..FR-005a) — Qué inscripciones a módulos se crean SOLAS.
 *
 * 028 dejó el modelo: una inscripción madre en la especialización y una hija
 * por módulo cursado. Lo que faltaba era que las hijas aparecieran sin que
 * alguien las cargara de a una. Hay tres puertas que crean hijas
 * automáticamente, y las tres pasan por esta función:
 *
 * - **Crear un módulo** (FR-001): todas las madres activas × ese módulo.
 * - **Inscribir en la especialización** (FR-002): esa madre × todos los
 *   módulos que ya existen.
 * - **La regularización** (FR-005): todas × todos, con vista previa.
 *
 * Una sola regla para las tres es lo que impide que la vista previa prometa
 * algo distinto de lo que después hace el botón.
 *
 * PURA y en `lib/`: la pantalla de la regularización necesita el mismo plan
 * que el servidor ejecuta, y un test sin base es la convención de
 * `tests/unit/`.
 *
 * ============================================================
 * Qué NO se crea, y por qué
 * ============================================================
 * - **Quien está de baja** de la especialización (el contacto archivado, el
 *   mismo criterio que el roster y los envíos masivos): sus módulos futuros
 *   no se crean; los que ya tenía siguen la regla de 028.
 * - **Quien ya cursa ese módulo** en esta camada (es idempotente) o en otra
 *   (la recursada de 028, FR-008). "El mismo módulo" se reconoce como lo hace
 *   028 (`buildModuleLicenseLines`, `lugaresDelPrograma`): primero por la
 *   cohorte, después por el curso, y cada hija cubre UN solo módulo.
 * - **Quien fue sacado de ese módulo** (FR-004). Sin este registro, la
 *   regularización —que es idempotente— volvería a meter a la persona que la
 *   coordinación acaba de sacar.
 * - **Quien ya tiene cualquier inscripción en esa cohorte.** El índice único
 *   (contacto, cohorte) rechazaría el INSERT y tumbaría la operación entera;
 *   se dice antes, como una exclusión con nombre.
 *
 * Y nunca se generan cuotas ni se pide vendedor: la venta es la madre
 * (FR-003). Eso no lo decide esta función —acá no hay plata—, lo garantiza
 * que el servidor inserte las hijas sin monto ni plan.
 */

export type MadreParaModulos = {
  enrollmentId: string;
  contactId: string;
  contactName: string;
  /** El contacto está archivado: dado de baja de la especialización. */
  enBaja: boolean;
};

export type ModuloParaInscribir = {
  cohortId: string;
  courseId: string;
  /** "Módulo 2 — Navisworks", para que la vista previa lo pueda decir. */
  label: string;
};

export type HijaExistente = {
  id: string;
  parentEnrollmentId: string | null;
  cohortId: string | null;
  courseId: string | null;
};

export type MotivoDeExclusion =
  | "baja"
  | "recursada_otra_camada"
  | "sacado_del_modulo"
  | "inscripto_en_la_cohorte";

export type HechosDeInscripcionAModulos = {
  madres: readonly MadreParaModulos[];
  modulos: readonly ModuloParaInscribir[];
  /** Las hijas que ya cuelgan de ESTAS madres. */
  hijas: readonly HijaExistente[];
  /** Cualquier inscripción de estos contactos en las cohortes de los módulos. */
  inscripcionesEnModulos: readonly { contactId: string; cohortId: string }[];
  /** FR-004 — "esta persona no cursa este módulo", decidido por alguien. */
  exclusiones: readonly { parentEnrollmentId: string; cohortId: string }[];
};

export type InscripcionACrear = {
  parentEnrollmentId: string;
  contactId: string;
  cohortId: string;
};

export type InscripcionExcluida = {
  parentEnrollmentId: string;
  contactId: string;
  contactName: string;
  /** `null` cuando el motivo es de la persona y no de un módulo (la baja). */
  cohortId: string | null;
  moduleLabel: string | null;
  motivo: MotivoDeExclusion;
  /** En palabras, para la vista previa. */
  detalle: string;
};

export type PlanDeInscripcionAModulos = {
  aCrear: InscripcionACrear[];
  existentes: { parentEnrollmentId: string; cohortId: string; enrollmentId: string }[];
  excluidas: InscripcionExcluida[];
};

const DETALLE: Record<MotivoDeExclusion, string> = {
  baja: "Está dado de baja de la especialización.",
  recursada_otra_camada: "Cursa este módulo con otra camada.",
  sacado_del_modulo: "La coordinación lo sacó de este módulo.",
  inscripto_en_la_cohorte: "Ya tiene una inscripción en la cohorte de este módulo.",
};

export function planDeInscripcionAModulos(
  hechos: HechosDeInscripcionAModulos
): PlanDeInscripcionAModulos {
  const plan: PlanDeInscripcionAModulos = { aCrear: [], existentes: [], excluidas: [] };

  const excluido = new Set(hechos.exclusiones.map((e) => `${e.parentEnrollmentId}|${e.cohortId}`));
  // Lo que la base ya tiene, más lo que este mismo plan va creando: dos madres
  // de la misma persona no pueden caer en la misma cohorte.
  const ocupado = new Set(hechos.inscripcionesEnModulos.map((i) => `${i.contactId}|${i.cohortId}`));

  for (const madre of hechos.madres) {
    if (madre.enBaja) {
      plan.excluidas.push({
        parentEnrollmentId: madre.enrollmentId,
        contactId: madre.contactId,
        contactName: madre.contactName,
        cohortId: null,
        moduleLabel: null,
        motivo: "baja",
        detalle: DETALLE.baja,
      });
      continue;
    }

    const suyas = hechos.hijas.filter((h) => h.parentEnrollmentId === madre.enrollmentId);
    const usadas = new Set<string>();

    // Primero las coincidencias EXACTAS (la hija de esta cohorte), y recién
    // después por curso: si no, una recursada podría "tapar" el módulo que la
    // persona tiene cursando acá y dejar sin cubrir a su gemelo.
    const exacta = new Map<string, HijaExistente>();
    for (const m of hechos.modulos) {
      const h = suyas.find((x) => !usadas.has(x.id) && x.cohortId === m.cohortId);
      if (h) {
        usadas.add(h.id);
        exacta.set(m.cohortId, h);
      }
    }

    for (const m of hechos.modulos) {
      const excluir = (motivo: MotivoDeExclusion) =>
        plan.excluidas.push({
          parentEnrollmentId: madre.enrollmentId,
          contactId: madre.contactId,
          contactName: madre.contactName,
          cohortId: m.cohortId,
          moduleLabel: m.label,
          motivo,
          detalle: DETALLE[motivo],
        });

      const propia = exacta.get(m.cohortId);
      if (propia) {
        plan.existentes.push({
          parentEnrollmentId: madre.enrollmentId,
          cohortId: m.cohortId,
          enrollmentId: propia.id,
        });
        continue;
      }

      const otraCamada = suyas.find((x) => !usadas.has(x.id) && x.courseId === m.courseId);
      if (otraCamada) {
        usadas.add(otraCamada.id);
        excluir("recursada_otra_camada");
        continue;
      }

      if (excluido.has(`${madre.enrollmentId}|${m.cohortId}`)) {
        excluir("sacado_del_modulo");
        continue;
      }

      const clave = `${madre.contactId}|${m.cohortId}`;
      if (ocupado.has(clave)) {
        excluir("inscripto_en_la_cohorte");
        continue;
      }

      ocupado.add(clave);
      plan.aCrear.push({
        parentEnrollmentId: madre.enrollmentId,
        contactId: madre.contactId,
        cohortId: m.cohortId,
      });
    }
  }

  return plan;
}

/**
 * FR-005a — El faltante dicho en números: "9 alumnos sin inscribir en 4
 * módulos" (faltan 36). Cuenta lo que el plan CREARÍA, así que el aviso y la
 * vista previa no pueden discrepar.
 */
export function resumenDelFaltante(plan: PlanDeInscripcionAModulos): {
  inscripciones: number;
  alumnos: number;
  modulos: number;
} {
  return {
    inscripciones: plan.aCrear.length,
    alumnos: new Set(plan.aCrear.map((c) => c.parentEnrollmentId)).size,
    modulos: new Set(plan.aCrear.map((c) => c.cohortId)).size,
  };
}

/* ============================================================
 * FR-004 — Sacar a una persona de UN módulo
 * ============================================================ */

export type HistoriaDeLaHija = {
  /** ¿Es de verdad una inscripción hija (tiene madre)? */
  esHija: boolean;
  asistencias: number;
  resultados: number;
  entregas: number;
  certificados: number;
  cuotas: number;
  /** No frena: se liberan y vuelven al stock. */
  licencias: number;
};

export type SalidaDeModulo =
  | { ok: true; licenciasLiberadas: number }
  | { ok: false; code: "no_es_una_cursada_de_modulo" | "modulo_con_historia"; message: string };

function contar(n: number, uno: string, varios: string): string | null {
  return n > 0 ? `${n} ${n === 1 ? uno : varios}` : null;
}

/**
 * ¿Se puede sacar a la persona de este módulo? PURA.
 *
 * La inscripción hija se BORRA: la madre y las otras hijas no se tocan, y un
 * registro de exclusión impide que la regularización la vuelva a crear. Pero
 * un borrado se lleva en cascada todo lo que cuelga de la inscripción, así que
 * sólo se permite cuando no cuelga nada: nadie pasó lista, no hay notas,
 * entregas, certificado ni cuotas (una recursada paga es plata, y la plata no
 * se borra).
 *
 * Con historia, la persona YA cursó parte del módulo: lo que corresponde es la
 * baja voluntaria de 028 —mudar la cursada a otra camada— o dejarla como está.
 * El mensaje dice qué hay, con números, para que se entienda por qué no.
 */
export function decidirSalidaDeModulo(h: HistoriaDeLaHija): SalidaDeModulo {
  if (!h.esHija) {
    return {
      ok: false,
      code: "no_es_una_cursada_de_modulo",
      message: "Esta inscripción no es la cursada de un módulo: sólo se saca de un módulo a una inscripción hija.",
    };
  }
  const partes = [
    contar(h.asistencias, "asistencia", "asistencias"),
    contar(h.resultados, "nota", "notas"),
    contar(h.entregas, "entrega", "entregas"),
    contar(h.certificados, "certificado", "certificados"),
    contar(h.cuotas, "cuota", "cuotas"),
  ].filter((p): p is string => p !== null);
  if (partes.length > 0) {
    return {
      ok: false,
      code: "modulo_con_historia",
      message:
        `Ya tiene ${partes.join(", ")} en este módulo: sacarlo borraría esa historia. ` +
        "Si no lo va a terminar, mudá la cursada a otra camada desde el Recorrido de la especialización.",
    };
  }
  return { ok: true, licenciasLiberadas: h.licencias };
}
