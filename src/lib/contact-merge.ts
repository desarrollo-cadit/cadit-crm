import { z } from "zod";
import { esIdentidadProvisional, normalizarCorreo } from "@/lib/contact-identity";
import { fullName } from "@/lib/utils";

/**
 * 2026-10-26 — Unificar contactos: las reglas, sin base.
 *
 * El caso que lo pidió: alguien cargó a «Patricia» con solo su correo
 * (identidad provisional `sinwa:`) y, al querer agregarle el teléfono, el
 * panel respondió 409 porque el contacto que llegó por WhatsApp ya lo tenía.
 * Dos contactos, la misma persona, y ninguna manera de juntarlos.
 *
 * Unificar es IRREVERSIBLE: el absorbido se borra. Por eso todo lo que decide
 * qué queda vive acá, puro y probado (`tests/unit/contact-merge.test.ts`), y
 * la vista previa y la ejecución pasan por la MISMA función
 * (`planDeUnificacion`). La lectura y las escrituras están en
 * `src/server/contact-merge.ts`.
 *
 * Reglas (decisión del dueño):
 * - Queda el de identidad REAL (teléfono o `bsuid:`); el `sinwa:` se absorbe.
 *   Dos provisionales: elige la persona (por defecto, el más viejo). Dos
 *   reales: se bloquea — pueden ser dos personas.
 * - Datos personales: se COMPLETAN, nunca se pisan. Las notas se juntan.
 * - Correos: el principal del que queda no se toca; los del absorbido llenan
 *   el principal vacío y después el secundario vacío. Más de dos distintos:
 *   la persona elige cuáles dos quedan y los otros van a la nota.
 * - Todo lo demás se mueve; lo que no puede convivir (mismo grupo, dos
 *   cuentas del portal, dos consultas generales con datos) bloquea.
 */

export type ContactoAUnificar = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  secondaryEmail: string | null;
  phone: string | null;
  waIdentity: string;
  waUserId: string | null;
  nationalId: string | null;
  companyId: string | null;
  notes: string | null;
  source: string | null;
  utmCampaign: string | null;
  archivedAt: Date | null;
  createdAt: Date;
};

export type CodigoDeBloqueo =
  | "identidades_reales"
  | "mismo_grupo"
  | "dos_cuentas_portal"
  | "dos_consultas_generales";

export type Bloqueo = { code: CodigoDeBloqueo; mensaje: string };

/* ============================================================
 * Quién queda
 * ============================================================ */

export function tieneIdentidadReal(c: { waIdentity: string }): boolean {
  return !esIdentidadProvisional(c.waIdentity);
}

export const BLOQUEO_IDENTIDADES_REALES =
  "No se puede unificar: los dos contactos tienen su propio WhatsApp. Pueden ser personas distintas.";

export type EleccionDeQuienQueda =
  | {
      ok: true;
      survivor: ContactoAUnificar;
      absorbed: ContactoAUnificar;
      /** Solo con dos provisionales la persona puede elegir. */
      puedeElegir: boolean;
    }
  | { ok: false; bloqueo: Bloqueo };

export function elegirQuienQueda(
  a: ContactoAUnificar,
  b: ContactoAUnificar,
  pedido?: string | null
): EleccionDeQuienQueda {
  const realA = tieneIdentidadReal(a);
  const realB = tieneIdentidadReal(b);
  if (realA && realB) {
    return { ok: false, bloqueo: { code: "identidades_reales", mensaje: BLOQUEO_IDENTIDADES_REALES } };
  }
  if (realA) return { ok: true, survivor: a, absorbed: b, puedeElegir: false };
  if (realB) return { ok: true, survivor: b, absorbed: a, puedeElegir: false };
  if (pedido === a.id) return { ok: true, survivor: a, absorbed: b, puedeElegir: true };
  if (pedido === b.id) return { ok: true, survivor: b, absorbed: a, puedeElegir: true };
  const aEsMasViejo = a.createdAt.getTime() <= b.createdAt.getTime();
  return aEsMasViejo
    ? { ok: true, survivor: a, absorbed: b, puedeElegir: true }
    : { ok: true, survivor: b, absorbed: a, puedeElegir: true };
}

/* ============================================================
 * Correos
 * ============================================================ */

export type EleccionDeCorreos = { primary: string; secondary: string | null };

export type PlanDeCorreos = {
  /** Todos los correos distintos de los dos, en orden: los del que queda primero. */
  opciones: string[];
  /** Más de dos distintos: no entran todos. */
  requiereEleccion: boolean;
  /** Hace falta elegir y todavía no se eligió (la ejecución lo exige). */
  faltaElegir: boolean;
  /** Una elección que no se puede aplicar (correo ajeno o repetido). */
  error: string | null;
  primary: string | null;
  secondary: string | null;
  descartados: string[];
};

export function planDeCorreos(
  s: ContactoAUnificar,
  a: ContactoAUnificar,
  eleccion?: EleccionDeCorreos | null
): PlanDeCorreos {
  const sPrimary = normalizarCorreo(s.email);
  const sSecondary = normalizarCorreo(s.secondaryEmail);
  const opciones = distintos([sPrimary, sSecondary, normalizarCorreo(a.email), normalizarCorreo(a.secondaryEmail)]);
  const propios = new Set([sPrimary, sSecondary].filter((c): c is string => c !== null));
  const delAbsorbido = opciones.filter((c) => !propios.has(c));

  // La regla: los del absorbido llenan el principal vacío y después el secundario vacío.
  const pool = [...delAbsorbido];
  const primary = sPrimary ?? pool.shift() ?? null;
  const secondary = sSecondary ?? pool.shift() ?? null;
  const sugerido = { primary, secondary, descartados: pool };

  const requiereEleccion = opciones.length > 2;
  const base = { opciones, requiereEleccion, faltaElegir: false, error: null };
  if (!requiereEleccion) return { ...base, ...sugerido };
  if (!eleccion) return { ...base, faltaElegir: true, ...sugerido };

  const elegidoPrimary = normalizarCorreo(eleccion.primary);
  const elegidoSecondary = normalizarCorreo(eleccion.secondary);
  if (!elegidoPrimary || !opciones.includes(elegidoPrimary)) {
    return { ...base, error: "Elegí el correo principal entre los de los dos contactos.", ...sugerido };
  }
  if (elegidoSecondary !== null && !opciones.includes(elegidoSecondary)) {
    return { ...base, error: "Elegí el correo secundario entre los de los dos contactos.", ...sugerido };
  }
  if (elegidoSecondary === elegidoPrimary) {
    return { ...base, error: "El correo principal y el secundario tienen que ser distintos.", ...sugerido };
  }
  return {
    ...base,
    primary: elegidoPrimary,
    secondary: elegidoSecondary,
    descartados: opciones.filter((c) => c !== elegidoPrimary && c !== elegidoSecondary),
  };
}

function distintos(valores: (string | null)[]): string[] {
  const out: string[] = [];
  for (const v of valores) if (v && !out.includes(v)) out.push(v);
  return out;
}

/* ============================================================
 * Teléfono
 * ============================================================ */

/** ¿La identidad es un teléfono (solo dígitos), no un `bsuid:` ni un `sinwa:`? */
function identidadEsTelefono(waIdentity: string): boolean {
  return /^\d+$/.test(waIdentity);
}

/**
 * El teléfono del que queda no se pisa. Si no tiene, toma el del absorbido —
 * salvo que su identidad de WhatsApp sea OTRO número: el teléfono acompaña a
 * esa identidad y cargar uno distinto mezclaría dos líneas. Si la identidad
 * era provisional, el teléfono pasa a ser la identidad (`planDeTelefono`).
 */
export function telefonoUnificado(
  s: ContactoAUnificar,
  a: ContactoAUnificar
): { phone: string | null; waIdentity: string; descartado: string | null } {
  if (s.phone) {
    return {
      phone: s.phone,
      waIdentity: s.waIdentity,
      descartado: a.phone && a.phone !== s.phone ? a.phone : null,
    };
  }
  if (!a.phone) return { phone: null, waIdentity: s.waIdentity, descartado: null };
  if (identidadEsTelefono(s.waIdentity) && s.waIdentity !== a.phone) {
    return { phone: null, waIdentity: s.waIdentity, descartado: a.phone };
  }
  return {
    phone: a.phone,
    waIdentity: esIdentidadProvisional(s.waIdentity) ? a.phone : s.waIdentity,
    descartado: null,
  };
}

/* ============================================================
 * Lo que cuelga de cada contacto (leído por el servidor)
 * ============================================================ */

/** Tablas que solo cambian `contact_id` (sin unicidad por contacto). */
export const TABLAS_SIMPLES = [
  "activity_log",
  "contact_activity",
  "contact_form_submission",
  "marketing_campaign_recipient",
  "marketing_unsubscribe",
  "area_handoff",
  "staff_notice",
] as const;
export type TablaSimple = (typeof TABLAS_SIMPLES)[number];

export type DatosDeUnificacion = {
  /** De los dos. `dependientes`: filas que cuelgan de la inscripción (cuotas, pagos, notas…). */
  inscripciones: {
    id: string;
    contactId: string;
    cohortId: string | null;
    grupo: string | null;
    dependientes: number;
  }[];
  conversaciones: {
    id: string;
    contactId: string;
    isTest: boolean;
    lastInboundAt: Date | null;
    lastMessageAt: Date | null;
    unreadCount: number;
    mensajes: number;
  }[];
  cuentasDelPortal: { id: string; contactId: string }[];
  accesosOffline: {
    id: string;
    contactId: string;
    offlineCourseId: string;
    accessUntil: Date;
    activo: boolean;
  }[];
  progreso: {
    id: string;
    contactId: string;
    topicId: string;
    watchedRatio: number;
    completedAt: Date | null;
  }[];
  intentos: { id: string; contactId: string; quizId: string; attemptNumber: number }[];
  reconocimientos: {
    id: string;
    contactId: string;
    courseId: string;
    lessonId: string | null;
    activo: boolean;
  }[];
  historial: { id: string; contactId: string; dedupKey: string }[];
  /** Por contacto, cuántas filas tiene en cada tabla simple. */
  simples: Record<string, Partial<Record<TablaSimple, number>>>;
  /** id → razón social, para mostrar y anotar empresas. */
  empresas: Record<string, string>;
};

export function datosVacios(): DatosDeUnificacion {
  return {
    inscripciones: [],
    conversaciones: [],
    cuentasDelPortal: [],
    accesosOffline: [],
    progreso: [],
    intentos: [],
    reconocimientos: [],
    historial: [],
    simples: {},
    empresas: {},
  };
}

/* ============================================================
 * El plan
 * ============================================================ */

export type CampoUnificado = {
  campo: string;
  etiqueta: string;
  queda: string | null;
  absorbido: string | null;
  resultado: string | null;
};

export type ConteosDeUnificacion = {
  inscripciones: number;
  conversaciones: number;
  mensajes: number;
  cuentaDelPortal: number;
  accesosOffline: number;
  progreso: number;
  intentos: number;
  reconocimientos: number;
  historial: number;
  seguimiento: number;
  campanas: number;
  bajas: number;
  avisos: number;
  derivaciones: number;
  registro: number;
};

export type CambiosDelContacto = Partial<{
  firstName: string;
  lastName: string | null;
  email: string | null;
  secondaryEmail: string | null;
  phone: string | null;
  waIdentity: string;
  waUserId: string | null;
  nationalId: string | null;
  notes: string | null;
  source: string | null;
  utmCampaign: string | null;
  archivedAt: Date | null;
}>;

export type PlanDeUnificacion = {
  survivorId: string;
  absorbedId: string;
  puedeElegir: boolean;
  bloqueos: Bloqueo[];
  correos: PlanDeCorreos;
  campos: CampoUnificado[];
  /** Lo que cambia en el que queda (solo lo que cambia). La empresa va aparte. */
  contacto: CambiosDelContacto;
  /** La empresa del absorbido, para completar con `completarEmpresaDelContacto`. */
  empresaDelAbsorbido: string | null;
  /** Empresa distinta del absorbido que NO queda (va a la nota). */
  empresaDescartada: string | null;
  telefonoDescartado: string | null;
  /** Consulta general (sin grupo) que sobra: la vacía de las dos. */
  inscripcionABorrar: string | null;
  /** Inscripciones del absorbido que pasan al que queda. */
  inscripcionesMovidas: string[];
  /** Las dos conversaciones reales se unen en la del que queda. */
  conversacion: {
    destinoId: string;
    origenId: string;
    lastInboundAt: Date | null;
    lastMessageAt: Date | null;
    unreadCount: number;
  } | null;
  accesosARevocar: string[];
  progresoABorrar: string[];
  intentosARenumerar: { id: string; attemptNumber: number }[];
  reconocimientosARevocar: string[];
  historialABorrar: string[];
  historialAReclavar: { id: string; dedupKey: string }[];
  conteos: ConteosDeUnificacion;
  /** La nota que queda en el seguimiento del que queda. */
  nota: string;
  /** Nombre del absorbido, para los mensajes. */
  absorbidoNombre: string;
  survivorNombre: string;
};

export type OpcionesDeUnificacion = {
  /** Con dos provisionales: el id del que queda. */
  quienQueda?: string | null;
  correos?: EleccionDeCorreos | null;
};

export function planDeUnificacion(
  a: ContactoAUnificar,
  b: ContactoAUnificar,
  datos: DatosDeUnificacion,
  opciones: OpcionesDeUnificacion = {}
): PlanDeUnificacion {
  const eleccion = elegirQuienQueda(a, b, opciones.quienQueda);
  const bloqueos: Bloqueo[] = [];
  // Con dos identidades reales igual se arma el resto (para mostrar qué hay),
  // con `a` como el que queda; el bloqueo impide ejecutarlo.
  const s = eleccion.ok ? eleccion.survivor : a;
  const x = eleccion.ok ? eleccion.absorbed : b;
  if (!eleccion.ok) bloqueos.push(eleccion.bloqueo);

  const de = <T extends { contactId: string }>(filas: T[], id: string) =>
    filas.filter((f) => f.contactId === id);

  // ── Datos personales ──────────────────────────────────────────────────
  const correos = planDeCorreos(s, x, opciones.correos);
  const tel = telefonoUnificado(s, x);
  const contacto: CambiosDelContacto = {};
  const completar = <K extends keyof CambiosDelContacto>(
    k: K,
    actual: CambiosDelContacto[K] | null,
    otro: CambiosDelContacto[K] | null
  ) => {
    if ((actual === null || actual === "") && otro !== null && otro !== "") contacto[k] = otro as CambiosDelContacto[K];
  };
  completar("firstName", s.firstName.trim() || null, x.firstName.trim() || null);
  completar("lastName", s.lastName, x.lastName);
  completar("nationalId", s.nationalId, x.nationalId);
  completar("waUserId", s.waUserId, x.waUserId);
  completar("source", s.source, x.source);
  completar("utmCampaign", s.utmCampaign, x.utmCampaign);
  if (correos.primary !== s.email) contacto.email = correos.primary;
  if (correos.secondary !== s.secondaryEmail) contacto.secondaryEmail = correos.secondary;
  if (tel.phone !== s.phone) contacto.phone = tel.phone;
  if (tel.waIdentity !== s.waIdentity) contacto.waIdentity = tel.waIdentity;
  const notas = juntarNotas(s.notes, x.notes);
  if (notas !== s.notes) contacto.notes = notas;
  // Archivado: si uno de los dos está activo, la persona está activa.
  if (s.archivedAt && !x.archivedAt) contacto.archivedAt = null;

  const empresaFinal = s.companyId ?? x.companyId;
  const empresaDescartada =
    s.companyId && x.companyId && s.companyId !== x.companyId ? x.companyId : null;
  const nombreEmpresa = (id: string | null) => (id ? datos.empresas[id] ?? id : null);

  const final = <K extends keyof CambiosDelContacto>(k: K, actual: CambiosDelContacto[K]) =>
    k in contacto ? contacto[k] : actual;
  const texto = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
  const campos: CampoUnificado[] = [
    { campo: "nombre", etiqueta: "Nombre", queda: s.firstName, absorbido: x.firstName, resultado: texto(final("firstName", s.firstName)) },
    { campo: "apellido", etiqueta: "Apellido", queda: s.lastName, absorbido: x.lastName, resultado: texto(final("lastName", s.lastName)) },
    { campo: "correo", etiqueta: "Correo", queda: s.email, absorbido: x.email, resultado: correos.primary },
    { campo: "correo_secundario", etiqueta: "Correo secundario", queda: s.secondaryEmail, absorbido: x.secondaryEmail, resultado: correos.secondary },
    { campo: "telefono", etiqueta: "Teléfono", queda: s.phone, absorbido: x.phone, resultado: tel.phone },
    { campo: "cedula", etiqueta: "Cédula", queda: s.nationalId, absorbido: x.nationalId, resultado: texto(final("nationalId", s.nationalId)) },
    { campo: "empresa", etiqueta: "Empresa", queda: nombreEmpresa(s.companyId), absorbido: nombreEmpresa(x.companyId), resultado: nombreEmpresa(empresaFinal) },
    { campo: "origen", etiqueta: "Origen", queda: s.source, absorbido: x.source, resultado: texto(final("source", s.source)) },
    { campo: "utm", etiqueta: "Campaña (UTM)", queda: s.utmCampaign, absorbido: x.utmCampaign, resultado: texto(final("utmCampaign", s.utmCampaign)) },
    { campo: "notas", etiqueta: "Notas", queda: s.notes, absorbido: x.notes, resultado: texto(final("notes", s.notes)) },
    {
      campo: "estado",
      etiqueta: "Estado",
      queda: s.archivedAt ? "Archivado" : "Activo",
      absorbido: x.archivedAt ? "Archivado" : "Activo",
      resultado: final("archivedAt", s.archivedAt) ? "Archivado" : "Activo",
    },
  ];

  // ── Inscripciones ─────────────────────────────────────────────────────
  const inscS = de(datos.inscripciones, s.id);
  const inscX = de(datos.inscripciones, x.id);
  const gruposS = new Map(inscS.filter((i) => i.cohortId).map((i) => [i.cohortId!, i]));
  for (const i of inscX) {
    if (!i.cohortId || !gruposS.has(i.cohortId)) continue;
    bloqueos.push({
      code: "mismo_grupo",
      mensaje: `No se puede unificar: los dos están inscriptos en el grupo ${i.grupo ?? i.cohortId}. Primero dá de baja o corregí una de las inscripciones.`,
    });
  }
  let inscripcionABorrar: string | null = null;
  const generalS = inscS.find((i) => i.cohortId === null);
  const generalX = inscX.find((i) => i.cohortId === null);
  if (generalS && generalX) {
    if (generalX.dependientes === 0) inscripcionABorrar = generalX.id;
    else if (generalS.dependientes === 0) inscripcionABorrar = generalS.id;
    else
      bloqueos.push({
        code: "dos_consultas_generales",
        mensaje:
          "No se puede unificar: los dos tienen una consulta general (sin grupo) con cuotas, pagos u otros datos. Primero asigná un grupo a una de las dos o corregila.",
      });
  }
  const inscripcionesMovidas = inscX.filter((i) => i.id !== inscripcionABorrar).map((i) => i.id);

  // ── Conversaciones ────────────────────────────────────────────────────
  const convX = de(datos.conversaciones, x.id);
  const realS = de(datos.conversaciones, s.id).find((c) => !c.isTest);
  const realX = convX.find((c) => !c.isTest);
  const conversacion =
    realS && realX
      ? {
          destinoId: realS.id,
          origenId: realX.id,
          lastInboundAt: masTarde(realS.lastInboundAt, realX.lastInboundAt),
          lastMessageAt: masTarde(realS.lastMessageAt, realX.lastMessageAt),
          unreadCount: realS.unreadCount + realX.unreadCount,
        }
      : null;

  // ── Cuenta del portal ─────────────────────────────────────────────────
  const portalS = de(datos.cuentasDelPortal, s.id);
  const portalX = de(datos.cuentasDelPortal, x.id);
  if (portalS.length > 0 && portalX.length > 0) {
    bloqueos.push({
      code: "dos_cuentas_portal",
      mensaje:
        "No se puede unificar: los dos tienen cuenta en el portal. Primero quitale el acceso al portal a uno de los dos.",
    });
  }

  // ── Cursos offline ────────────────────────────────────────────────────
  const accesosARevocar: string[] = [];
  const accesosS = de(datos.accesosOffline, s.id).filter((g) => g.activo);
  for (const gx of de(datos.accesosOffline, x.id).filter((g) => g.activo)) {
    const gs = accesosS.find((g) => g.offlineCourseId === gx.offlineCourseId);
    if (!gs) continue;
    accesosARevocar.push(gx.accessUntil.getTime() > gs.accessUntil.getTime() ? gs.id : gx.id);
  }

  const progresoABorrar: string[] = [];
  const progresoS = de(datos.progreso, s.id);
  for (const px of de(datos.progreso, x.id)) {
    const ps = progresoS.find((p) => p.topicId === px.topicId);
    if (!ps) continue;
    progresoABorrar.push(ganaProgreso(px, ps) ? ps.id : px.id);
  }

  const intentosARenumerar: { id: string; attemptNumber: number }[] = [];
  const maxPorQuiz = new Map<string, number>();
  for (const i of de(datos.intentos, s.id)) {
    maxPorQuiz.set(i.quizId, Math.max(maxPorQuiz.get(i.quizId) ?? 0, i.attemptNumber));
  }
  const intentosX = [...de(datos.intentos, x.id)].sort(
    (p, q) => p.quizId.localeCompare(q.quizId) || p.attemptNumber - q.attemptNumber
  );
  for (const i of intentosX) {
    const max = maxPorQuiz.get(i.quizId);
    if (max === undefined) continue;
    maxPorQuiz.set(i.quizId, max + 1);
    intentosARenumerar.push({ id: i.id, attemptNumber: max + 1 });
  }

  const reconocimientosARevocar: string[] = [];
  const recS = de(datos.reconocimientos, s.id).filter((r) => r.activo);
  for (const rx of de(datos.reconocimientos, x.id).filter((r) => r.activo)) {
    const choca = recS.some((r) => r.courseId === rx.courseId && r.lessonId === rx.lessonId);
    if (choca) reconocimientosARevocar.push(rx.id);
  }

  // ── Historial importado ───────────────────────────────────────────────
  const llavesS = new Set(de(datos.historial, s.id).map((h) => h.dedupKey));
  const historialABorrar: string[] = [];
  const historialAReclavar: { id: string; dedupKey: string }[] = [];
  for (const h of de(datos.historial, x.id)) {
    const llave = reclavar(h.dedupKey, x.id, s.id);
    if (llavesS.has(llave)) historialABorrar.push(h.id);
    else {
      llavesS.add(llave);
      historialAReclavar.push({ id: h.id, dedupKey: llave });
    }
  }

  // ── Conteos y nota ────────────────────────────────────────────────────
  const sx = datos.simples[x.id] ?? {};
  const n = (t: TablaSimple) => sx[t] ?? 0;
  const conteos: ConteosDeUnificacion = {
    inscripciones: inscripcionesMovidas.length,
    conversaciones: convX.length,
    mensajes: conversacion ? realX!.mensajes : 0,
    cuentaDelPortal: portalX.length,
    accesosOffline: de(datos.accesosOffline, x.id).length,
    progreso: de(datos.progreso, x.id).filter((p) => !progresoABorrar.includes(p.id)).length,
    intentos: de(datos.intentos, x.id).length,
    reconocimientos: de(datos.reconocimientos, x.id).length,
    historial: historialAReclavar.length,
    seguimiento: n("contact_activity") + n("contact_form_submission"),
    campanas: n("marketing_campaign_recipient"),
    bajas: n("marketing_unsubscribe"),
    avisos: n("staff_notice"),
    derivaciones: n("area_handoff"),
    registro: n("activity_log"),
  };

  const absorbidoNombre = fullName(x);
  const nota = notaDeUnificacion({
    absorbido: x,
    conteos,
    correosDescartados: correos.descartados,
    empresaDescartada: nombreEmpresa(empresaDescartada),
    telefonoDescartado: tel.descartado,
  });

  return {
    survivorId: s.id,
    absorbedId: x.id,
    puedeElegir: eleccion.ok ? eleccion.puedeElegir : false,
    bloqueos,
    correos,
    campos,
    contacto,
    empresaDelAbsorbido: s.companyId ? null : x.companyId,
    empresaDescartada,
    telefonoDescartado: tel.descartado,
    inscripcionABorrar,
    inscripcionesMovidas,
    conversacion,
    accesosARevocar,
    progresoABorrar,
    intentosARenumerar,
    reconocimientosARevocar,
    historialABorrar,
    historialAReclavar,
    conteos,
    nota,
    absorbidoNombre,
    survivorNombre: fullName(s),
  };
}

function juntarNotas(propia: string | null, otra: string | null): string | null {
  const p = propia?.trim() ? propia : null;
  const o = otra?.trim() ? otra : null;
  if (!p) return o;
  if (!o || o.trim() === p.trim()) return p;
  return `${p}\n\n${o}`;
}

function masTarde(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/** ¿El progreso `p` le gana a `q`? Terminado primero; después, más avance. */
function ganaProgreso(
  p: { watchedRatio: number; completedAt: Date | null },
  q: { watchedRatio: number; completedAt: Date | null }
): boolean {
  if (Boolean(p.completedAt) !== Boolean(q.completedAt)) return Boolean(p.completedAt);
  return p.watchedRatio > q.watchedRatio;
}

/**
 * `dedup_key` del historial importado empieza con el id del contacto
 * (`dedupKey` de `src/lib/historial-import/plan.ts`: `<contacto>|<curso>|<fecha>`).
 */
export function reclavar(llave: string, desde: string, hacia: string): string {
  return llave.startsWith(`${desde}|`) ? `${hacia}${llave.slice(desde.length)}` : llave;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function notaDeUnificacion(d: {
  absorbido: ContactoAUnificar;
  conteos: ConteosDeUnificacion;
  correosDescartados: string[];
  empresaDescartada: string | null;
  telefonoDescartado: string | null;
}): string {
  const c = d.conteos;
  const ident = d.absorbido.email ?? d.absorbido.phone ?? d.absorbido.secondaryEmail ?? "sin correo ni teléfono";
  const movido = [
    c.inscripciones && plural(c.inscripciones, "inscripción", "inscripciones"),
    c.conversaciones && plural(c.conversaciones, "conversación", "conversaciones"),
    c.cuentaDelPortal && "la cuenta del portal",
    c.accesosOffline && plural(c.accesosOffline, "acceso a cursos offline", "accesos a cursos offline"),
    c.progreso && plural(c.progreso, "avance de curso offline", "avances de cursos offline"),
    c.intentos && plural(c.intentos, "intento de cuestionario", "intentos de cuestionario"),
    c.reconocimientos && plural(c.reconocimientos, "reconocimiento", "reconocimientos"),
    c.historial && plural(c.historial, "cursada histórica", "cursadas históricas"),
    c.seguimiento && plural(c.seguimiento, "registro de seguimiento", "registros de seguimiento"),
    c.campanas && plural(c.campanas, "envío de campaña", "envíos de campañas"),
    c.bajas && plural(c.bajas, "baja de marketing", "bajas de marketing"),
    c.avisos && plural(c.avisos, "aviso interno", "avisos internos"),
    c.derivaciones && plural(c.derivaciones, "derivación", "derivaciones"),
  ].filter((v): v is string => typeof v === "string");
  const partes = [movido.length > 0 ? `se movieron ${movido.join(", ")}` : "no había nada más que mover"];
  if (d.correosDescartados.length > 0) partes.push(`correos descartados: ${d.correosDescartados.join(", ")}`);
  if (d.empresaDescartada) partes.push(`empresa descartada: ${d.empresaDescartada}`);
  if (d.telefonoDescartado) partes.push(`teléfono descartado: ${d.telefonoDescartado}`);
  return `Unificado con ${fullName(d.absorbido)} (${ident}): ${partes.join("; ")}.`;
}

/* ============================================================
 * Lo que viaja: pedidos y vista previa
 * ============================================================ */

const idDeContacto = z.string().trim().min(1).max(100);
const correoElegido = z.string().trim().toLowerCase().email().max(200);

/** `GET /api/contacts/[id]/merge-preview?with=…&keep=…&primary=…&secondary=…` */
export const vistaPreviaQuerySchema = z.object({
  with: idDeContacto,
  keep: idDeContacto.optional(),
  primary: correoElegido.optional(),
  secondary: correoElegido.optional(),
});

/** `POST /api/contacts/[id]/merge` */
export const unificarBodySchema = z.object({
  withId: idDeContacto,
  keepId: idDeContacto.nullable().optional(),
  emails: z
    .object({ primary: correoElegido, secondary: correoElegido.nullable() })
    .nullable()
    .optional(),
  confirm: z.literal(true, { errorMap: () => ({ message: "Confirmá la unificación." }) }),
});

export type PersonaDeUnificacion = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  identidadReal: boolean;
};

export type VistaPreviaDeUnificacion = {
  survivor: PersonaDeUnificacion;
  absorbed: PersonaDeUnificacion;
  puedeElegir: boolean;
  campos: CampoUnificado[];
  conteos: ConteosDeUnificacion;
  bloqueos: Bloqueo[];
  correos: PlanDeCorreos;
  nota: string;
};

export function vistaPrevia(
  a: ContactoAUnificar,
  b: ContactoAUnificar,
  plan: PlanDeUnificacion
): VistaPreviaDeUnificacion {
  const persona = (c: ContactoAUnificar): PersonaDeUnificacion => ({
    id: c.id,
    name: fullName(c),
    email: c.email,
    phone: c.phone,
    identidadReal: tieneIdentidadReal(c),
  });
  const s = plan.survivorId === a.id ? a : b;
  const x = s === a ? b : a;
  return {
    survivor: persona(s),
    absorbed: persona(x),
    puedeElegir: plan.puedeElegir,
    campos: plan.campos,
    conteos: plan.conteos,
    bloqueos: plan.bloqueos,
    correos: plan.correos,
    nota: plan.nota,
  };
}

/** Las líneas de "Se van a mover…", para la pantalla. */
export function lineasDeConteos(c: ConteosDeUnificacion): string[] {
  return [
    c.inscripciones && plural(c.inscripciones, "inscripción", "inscripciones"),
    c.conversaciones &&
      `${plural(c.conversaciones, "conversación", "conversaciones")}${c.mensajes ? ` (${plural(c.mensajes, "mensaje se une", "mensajes se unen")} a la conversación del que queda)` : ""}`,
    c.cuentaDelPortal && "la cuenta del portal",
    c.accesosOffline && plural(c.accesosOffline, "acceso a cursos offline", "accesos a cursos offline"),
    c.progreso && plural(c.progreso, "avance de curso offline", "avances de cursos offline"),
    c.intentos && plural(c.intentos, "intento de cuestionario", "intentos de cuestionario"),
    c.reconocimientos && plural(c.reconocimientos, "reconocimiento", "reconocimientos"),
    c.historial && plural(c.historial, "cursada histórica", "cursadas históricas"),
    c.seguimiento && plural(c.seguimiento, "registro de seguimiento", "registros de seguimiento"),
    c.campanas && plural(c.campanas, "envío de campaña", "envíos de campañas"),
    c.bajas && plural(c.bajas, "baja de marketing", "bajas de marketing"),
    c.avisos && plural(c.avisos, "aviso interno", "avisos internos"),
    c.derivaciones && plural(c.derivaciones, "derivación", "derivaciones"),
    c.registro && plural(c.registro, "registro de actividad", "registros de actividad"),
  ].filter((v): v is string => typeof v === "string");
}
