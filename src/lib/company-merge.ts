import { z } from "zod";
import { condicionDePago, normalizarRut, type CompanyFields } from "@/lib/company";

/**
 * 2026-10-29 — Unificar empresas: las reglas, sin base.
 *
 * El caso: la misma empresa cargada dos veces ("Constructora del Sur S.A." y
 * "Constructora Del Sur"), con la gente y las ventas repartidas entre las
 * dos. Unificar es IRREVERSIBLE: la absorbida se borra. Por eso lo que decide
 * cómo queda vive acá, puro y probado (`tests/unit/company-merge.test.ts`), y
 * la vista previa y la ejecución pasan por la MISMA función
 * (`planDeUnificacionDeEmpresas`). La lectura y las escrituras están en
 * `src/server/company-merge.ts`. Es el gemelo de `src/lib/contact-merge.ts`.
 *
 * Reglas (decisión del dueño):
 * - Queda la empresa en la que está la persona; la otra se absorbe. El
 *   diálogo deja invertirlo.
 * - Datos: se COMPLETAN, nunca se pisan. La razón social es la de la que queda.
 * - La condición de pago viaja de a PAR (condición + días): nunca la
 *   condición de una con los días de la otra (el CHECK
 *   `company_payment_term_days_valid` lo exige además).
 * - Notas: si las dos tienen y difieren, se juntan (primero la de la que
 *   queda) con un separador que dice de dónde vino la otra.
 * - «Excluir de los reportes»: gana la que queda, pero la vista previa
 *   muestra los dos valores para que se vea.
 * - Dos RUT distintos (comparados normalizados) BLOQUEAN: pueden ser dos
 *   empresas distintas.
 */

export type EmpresaAUnificar = CompanyFields & { id: string };

export type CodigoDeBloqueoDeEmpresas = "misma_empresa" | "rut_distinto";
export type BloqueoDeEmpresas = { code: CodigoDeBloqueoDeEmpresas; mensaje: string };

export const BLOQUEO_RUT_DISTINTO =
  "No se puede unificar: las dos empresas tienen RUT y son distintos, así que pueden ser dos empresas distintas.";
export const BLOQUEO_MISMA_EMPRESA = "Elegí otra empresa: no se puede unificar una empresa consigo misma.";

/* ============================================================
 * Lo que apunta a cada empresa (leído por el servidor)
 * ============================================================ */

export type ConteosDeReferencias = {
  contactos: number;
  inscripciones: number;
  accesosOffline: number;
  cursadasHistoricas: number;
};

/** Una audiencia o una campaña en borrador cuyos filtros nombran a la absorbida. */
export type FiltroConEmpresa = {
  tabla: "marketing_audience" | "marketing_campaign";
  id: string;
  filters: Record<string, unknown>;
};

export type DatosDeUnificacionDeEmpresas = {
  /** Lo que apunta a la ABSORBIDA (lo que se va a mover). */
  conteos: ConteosDeReferencias;
  /** Filtros de marketing que nombran a la absorbida (tal como están guardados). */
  filtros: FiltroConEmpresa[];
};

export function datosDeEmpresaVacios(): DatosDeUnificacionDeEmpresas {
  return {
    conteos: { contactos: 0, inscripciones: 0, accesosOffline: 0, cursadasHistoricas: 0 },
    filtros: [],
  };
}

/**
 * Los filtros de una audiencia (`AudienceFilters`, `companyIds`) con la
 * absorbida cambiada por la que queda, sin repetir. `null` si no la nombran.
 */
export function reapuntarFiltrosDeEmpresa(
  filters: Record<string, unknown> | null | undefined,
  desde: string,
  hacia: string
): Record<string, unknown> | null {
  if (!filters) return null;
  const ids = filters.companyIds;
  if (!Array.isArray(ids) || !ids.includes(desde)) return null;
  const nuevos: unknown[] = [];
  for (const id of ids) {
    const v = id === desde ? hacia : id;
    if (!nuevos.includes(v)) nuevos.push(v);
  }
  return { ...filters, companyIds: nuevos };
}

/* ============================================================
 * El plan
 * ============================================================ */

export type CampoDeEmpresaUnificado = {
  campo: string;
  etiqueta: string;
  queda: string | null;
  absorbido: string | null;
  resultado: string | null;
};

export type ConteosDeUnificacionDeEmpresas = ConteosDeReferencias & {
  filtrosDeMarketing: number;
};

export type CambiosDeEmpresa = Partial<Omit<CompanyFields, "legalName">>;

export type PlanDeUnificacionDeEmpresas = {
  keptId: string;
  absorbedId: string;
  bloqueos: BloqueoDeEmpresas[];
  campos: CampoDeEmpresaUnificado[];
  /** Lo que cambia en la que queda (solo lo que cambia). */
  empresa: CambiosDeEmpresa;
  /** Los filtros de marketing ya reapuntados, para escribir tal cual. */
  filtros: FiltroConEmpresa[];
  conteos: ConteosDeUnificacionDeEmpresas;
  keptNombre: string;
  absorbidoNombre: string;
};

/** Los textos que se completan uno a uno (la razón social, el par de pago y las notas van aparte). */
const TEXTOS: readonly { campo: string; etiqueta: string; col: keyof CompanyFields }[] = [
  { campo: "nombre_comercial", etiqueta: "Nombre comercial", col: "tradeName" },
  { campo: "rut", etiqueta: "RUT", col: "taxId" },
  { campo: "calle", etiqueta: "Dirección fiscal", col: "addressStreet" },
  { campo: "ciudad", etiqueta: "Ciudad", col: "addressCity" },
  { campo: "departamento", etiqueta: "Departamento", col: "addressState" },
  { campo: "pais", etiqueta: "País", col: "addressCountry" },
  { campo: "contacto", etiqueta: "A quién se le factura", col: "billingContactName" },
  { campo: "correo", etiqueta: "Correo de facturación", col: "billingEmail" },
  { campo: "telefono", etiqueta: "Teléfono", col: "billingPhone" },
];

const lleno = (v: string | null | undefined): string | null => (v && v.trim() !== "" ? v : null);

/** El separador entre las notas de las dos (exportado para los tests). */
export const NOTAS_SEPARADOR = (absorbida: string) =>
  `\n\n— Notas de «${absorbida}» (empresa unificada) —\n`;

function juntarNotas(propia: string | null, otra: string | null, absorbida: string): string | null {
  const p = lleno(propia);
  const o = lleno(otra);
  if (!p) return o;
  if (!o || o.trim() === p.trim()) return p;
  return `${p}${NOTAS_SEPARADOR(absorbida)}${o}`;
}

/**
 * `kept` QUEDA y `absorbed` se absorbe. La vista previa y la ejecución
 * llaman a esta misma función; la ejecución, sobre las dos filas bloqueadas.
 */
export function planDeUnificacionDeEmpresas(
  kept: EmpresaAUnificar,
  absorbed: EmpresaAUnificar,
  datos: DatosDeUnificacionDeEmpresas
): PlanDeUnificacionDeEmpresas {
  const s = kept;
  const x = absorbed;
  const bloqueos: BloqueoDeEmpresas[] = [];
  if (s.id === x.id) bloqueos.push({ code: "misma_empresa", mensaje: BLOQUEO_MISMA_EMPRESA });
  const rutS = lleno(s.taxId);
  const rutX = lleno(x.taxId);
  if (s.id !== x.id && rutS && rutX && normalizarRut(rutS) !== normalizarRut(rutX)) {
    bloqueos.push({ code: "rut_distinto", mensaje: BLOQUEO_RUT_DISTINTO });
  }

  const empresa: CambiosDeEmpresa = {};
  const campos: CampoDeEmpresaUnificado[] = [
    { campo: "razon_social", etiqueta: "Razón social", queda: s.legalName, absorbido: x.legalName, resultado: s.legalName },
  ];

  // ── Textos: completar, nunca pisar ────────────────────────────────────
  for (const t of TEXTOS) {
    const propio = lleno(s[t.col] as string | null);
    const otro = lleno(x[t.col] as string | null);
    if (!propio && otro) (empresa as Record<string, unknown>)[t.col] = otro;
    campos.push({ campo: t.campo, etiqueta: t.etiqueta, queda: propio, absorbido: otro, resultado: propio ?? otro });
  }

  // ── Condición de pago: de a PAR ───────────────────────────────────────
  const parS = { terms: s.paymentTerms, days: s.paymentTerms === "credito" ? s.paymentTermDays : null };
  const parX = { terms: x.paymentTerms, days: x.paymentTerms === "credito" ? x.paymentTermDays : null };
  const par = parS.terms !== null ? parS : parX;
  if (parS.terms === null && parX.terms !== null) {
    empresa.paymentTerms = parX.terms;
    empresa.paymentTermDays = parX.days;
  }
  campos.push({
    campo: "condicion_de_pago",
    etiqueta: "Condición de pago",
    queda: condicionDePago(parS.terms, parS.days),
    absorbido: condicionDePago(parX.terms, parX.days),
    resultado: condicionDePago(par.terms, par.days),
  });

  // ── Notas: se juntan ──────────────────────────────────────────────────
  const notas = juntarNotas(s.notes, x.notes, x.legalName);
  if (notas !== lleno(s.notes)) empresa.notes = notas;
  campos.push({ campo: "notas", etiqueta: "Notas", queda: lleno(s.notes), absorbido: lleno(x.notes), resultado: notas });

  // ── Excluir de los reportes: gana la que queda, se muestran los dos ───
  const siNo = (b: boolean) => (b ? "Sí" : "No");
  campos.push({
    campo: "excluir_de_reportes",
    etiqueta: "Excluir de los reportes",
    queda: siNo(s.excludeFromReports),
    absorbido: siNo(x.excludeFromReports),
    resultado: siNo(s.excludeFromReports),
  });

  // ── Filtros de marketing que nombran a la absorbida ───────────────────
  const filtros: FiltroConEmpresa[] = [];
  for (const f of datos.filtros) {
    const nuevos = reapuntarFiltrosDeEmpresa(f.filters, x.id, s.id);
    if (nuevos) filtros.push({ ...f, filters: nuevos });
  }

  return {
    keptId: s.id,
    absorbedId: x.id,
    bloqueos,
    campos,
    empresa,
    filtros,
    conteos: { ...datos.conteos, filtrosDeMarketing: filtros.length },
    keptNombre: s.legalName,
    absorbidoNombre: x.legalName,
  };
}

/* ============================================================
 * Lo que viaja: pedidos y vista previa
 * ============================================================ */

const idDeEmpresa = z.string().trim().min(1).max(100);

/** `GET /api/companies/[id]/merge-preview?with=…` — `[id]` es la que QUEDA. */
export const vistaPreviaEmpresasQuerySchema = z.object({ with: idDeEmpresa });

/** `POST /api/companies/[id]/merge` — `[id]` es la que QUEDA. */
export const unificarEmpresasBodySchema = z.object({
  absorbedId: idDeEmpresa,
  confirm: z.literal(true, { errorMap: () => ({ message: "Confirmá la unificación." }) }),
});

export type EmpresaDeUnificacion = { id: string; legalName: string; taxId: string | null };

export type VistaPreviaDeUnificacionDeEmpresas = {
  queda: EmpresaDeUnificacion;
  absorbida: EmpresaDeUnificacion;
  campos: CampoDeEmpresaUnificado[];
  conteos: ConteosDeUnificacionDeEmpresas;
  bloqueos: BloqueoDeEmpresas[];
};

export function vistaPreviaDeEmpresas(
  kept: EmpresaAUnificar,
  absorbed: EmpresaAUnificar,
  plan: PlanDeUnificacionDeEmpresas
): VistaPreviaDeUnificacionDeEmpresas {
  const resumen = (c: EmpresaAUnificar): EmpresaDeUnificacion => ({ id: c.id, legalName: c.legalName, taxId: c.taxId });
  return {
    queda: resumen(kept),
    absorbida: resumen(absorbed),
    campos: plan.campos,
    conteos: plan.conteos,
    bloqueos: plan.bloqueos,
  };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Las líneas de "Se van a mover…", para la pantalla. */
export function lineasDeConteosDeEmpresas(c: ConteosDeUnificacionDeEmpresas): string[] {
  return [
    c.contactos && plural(c.contactos, "contacto", "contactos"),
    c.inscripciones && plural(c.inscripciones, "inscripción", "inscripciones"),
    c.accesosOffline && plural(c.accesosOffline, "acceso a cursos offline", "accesos a cursos offline"),
    c.cursadasHistoricas && plural(c.cursadasHistoricas, "cursada histórica", "cursadas históricas"),
    c.filtrosDeMarketing &&
      plural(
        c.filtrosDeMarketing,
        "audiencia o campaña en borrador que filtra por la empresa",
        "audiencias o campañas en borrador que filtran por la empresa"
      ),
  ].filter((v): v is string => typeof v === "string");
}
