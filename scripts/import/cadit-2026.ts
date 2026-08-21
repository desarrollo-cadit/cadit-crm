/**
 * 007 — Importación de los datos REALES de CAD IT (catálogo, cohortes,
 * alumnos, inscripciones y licencias) desde los CSV que exporta la academia.
 *
 * Uso:
 *   pnpm import:cadit            -> DRY-RUN: no toca la base, imprime el informe
 *   pnpm import:cadit -- --apply -> BORRA el dominio académico y carga los CSV
 *
 * El dry-run es el modo por defecto a propósito: `--apply` es destructivo
 * (borra contactos, cursos, cohortes, inscripciones, licencias, profesores,
 * empresas y software de la organización) y no se puede deshacer sin el
 * respaldo previo.
 *
 * Fuentes (ver README de la carpeta):
 *  - cursos-cadit.csv ................. catálogo comercial de la web (UTF-8 con BOM)
 *  - LISTA CURSOS 2026.csv ............ cohortes planificadas: fechas, profesor, aula
 *  - CURSOS 2026.csv .................. cohortes + inscripciones con importes
 *  - ATC_Licenses(2025|2026).csv ...... préstamo de licencias por alumno (latin1, `;`)
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql as drizzleSql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { newId } from "@/lib/db/ids";
import { slugify } from "@/lib/utils";
import { normalizePhoneInput } from "@/lib/phone";

/* ============================================================
 * Parser CSV (RFC 4180) — sin dependencias nuevas
 * ============================================================ */

/**
 * Los CSV traen comas y saltos de línea DENTRO de campos entrecomillados
 * (observaciones de pago, frecuencias como "lunes, miércoles y viernes"),
 * así que partir por `split(",")` rompe las filas. Este parser respeta
 * comillas y comillas escapadas ("").
 */
function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Los ATC vienen en latin1 (`García` sale como `Garc�a` si se lee UTF-8). */
function readCsv(file: string, opts: { latin1?: boolean; delimiter?: string } = {}) {
  const buf = readFileSync(file);
  let text = buf.toString(opts.latin1 ? "latin1" : "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM de cursos-cadit.csv
  return parseCsv(text, opts.delimiter ?? ",");
}

const cell = (row: string[] | undefined, i: number) => (row?.[i] ?? "").trim();

/* ============================================================
 * Normalizadores
 * ============================================================ */

/** Reexport del normalizador compartido: la web y la importación deben coincidir. */
export const normalizePhone = normalizePhoneInput;

/**
 * "Maria Belen Lemos Basanta" -> { firstName: "Maria Belen", lastName: "Lemos
 * Basanta" }. Los CSV de cursos traen UN solo campo "Nombre"; los ATC sí
 * traen nombre y apellido separados y tienen prioridad cuando el alumno
 * aparece en los dos (se cruzan por correo).
 */
export function splitName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: null };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: null };
  if (parts.length >= 4) {
    const half = Math.floor(parts.length / 2);
    return { firstName: parts.slice(0, half).join(" "), lastName: parts.slice(half).join(" ") };
  }
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

/**
 * "$13,680.00" -> 13680 UYU · "10.000.000" -> 10000000 PYG · "$0.00" -> 0 UYU.
 * El `$` marca pesos uruguayos; un número suelto con miles en punto y del
 * orden del millón es guaraníes (los alumnos de Paraguay). Se redondea a
 * entero porque la columna no guarda centavos (DV-008).
 */
export function parseMoney(raw: string): { amount: number; currency: "UYU" | "PYG" } | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const hasDollar = s.includes("$");
  const digits = s.replace(/[^\d.,]/g, "");
  if (!digits) return null;
  // Formato "13,680.00": coma de miles y punto decimal. Formato "10.000.000":
  // punto de miles y sin decimales.
  let normalized: string;
  if (/,\d{3}/.test(digits) || /\.\d{2}$/.test(digits)) {
    normalized = digits.replace(/,/g, "");
  } else {
    normalized = digits.replace(/[.,]/g, "");
  }
  const value = Math.round(Number(normalized));
  if (!Number.isFinite(value)) return null;
  const currency = !hasDollar && value >= 1_000_000 ? "PYG" : "UYU";
  return { amount: value, currency };
}

/**
 * La celda de correo a veces trae VARIOS: "a@x.com, b@y.com o c@z.com" o
 * "jbalsamo@zulamian.com; juanbalsamobaez@hotmail.com". Guardar la cadena
 * entera deja un correo inválido en la base y rompe el cruce con el ATC (la
 * misma persona figura ahí con uno solo de esos correos). Vale el primero.
 */
export function parseEmail(raw: string): string | null {
  const candidates = (raw || "").split(/[,;/]| o /i);
  for (const c of candidates) {
    const m = c.trim().match(/[^\s<>()]+@[^\s<>()]+\.[a-z]{2,}/i);
    if (m) return m[0].toLowerCase();
  }
  return null;
}

/**
 * La columna "C.I." se usa a veces como casilla de control: en el Taller DOCS
 * todas las filas dicen "ok". Tomar eso como cédula hace que todos los
 * alumnos del bloque compartan documento. Solo vale algo con 6+ dígitos.
 */
export function parseNationalId(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 6 ? s : null;
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, setiembre: 9, septiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

/**
 * Fechas del control de cursos: "22/4", "07/04", "1/4/2027", "30 de junio",
 * "18/8 - 15/9" (dos fechas: vale la última, es la real de cierre).
 * Sin año explícito se asume 2026, que es el año de todo el material.
 */
export function parseDate(raw: string, defaultYear = 2026): Date | null {
  let s = (raw || "").trim();
  if (!s) return null;
  if (s.includes("-")) s = s.split("-").pop()!.trim(); // "18/8 - 15/9" -> "15/9"

  const textual = s.toLowerCase().match(/^(\d{1,2})\s+de\s+([a-záéíóú]+)/);
  if (textual) {
    const month = MESES[textual[2]!.normalize("NFD").replace(/[̀-ͯ]/g, "")];
    if (!month) return null;
    return new Date(Date.UTC(defaultYear, month - 1, Number(textual[1])));
  }

  const numeric = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!numeric) return null;
  const [, d, m, y] = numeric;
  const year = y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : defaultYear;
  return new Date(Date.UTC(year, Number(m) - 1, Number(d)));
}

/** "lunes, miércoles y viernes" -> "0,2,4" (0=lunes..6=domingo, formato del calendario). */
export function parseWeekdays(raw: string): string | null {
  const s = (raw || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const names = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
  const found = names.map((n, i) => (s.includes(n) ? i : -1)).filter((i) => i >= 0);
  return found.length ? found.join(",") : null;
}

/** "16:00 a 18:00" / "de 18:30 a 20:30" -> { start: "16:00", end: "18:00" }. */
export function parseTimeRange(raw: string): { start: string | null; end: string | null } {
  const times = (raw || "").match(/(\d{1,2})[:.]?(\d{2})/g);
  if (!times || times.length < 2) return { start: null, end: null };
  const fmt = (t: string) => {
    const m = t.match(/(\d{1,2})[:.]?(\d{2})/)!;
    return `${m[1]!.padStart(2, "0")}:${m[2]}`;
  };
  return { start: fmt(times[0]!), end: fmt(times[1]!) };
}

/** "Online." -> en_vivo · "Presencial" -> presencial. */
function parseModality(raw: string): "en_vivo" | "asincronico" | "presencial" | null {
  const s = (raw || "").toLowerCase();
  if (s.includes("presencial")) return "presencial";
  if (s.includes("online") || s.includes("en vivo")) return "en_vivo";
  return null;
}

/* ============================================================
 * Mapeo cohorte -> curso del catálogo
 * ============================================================
 * Los nombres de cohorte del control interno NO coinciden con los del
 * catálogo comercial ("EBIM 13" es "Especialización en Proyectos BIM",
 * "Revit FAMILIA" es "Revit Familias"). El mapeo es EXPLÍCITO y no difuso:
 * un match aproximado que se equivoque manda alumnos al curso incorrecto y
 * eso no se nota hasta que alguien lo mira a mano.
 *
 * `null` = curso que NO está en el catálogo web (taller a medida,
 * capacitación in-company, edición combinada): se crea con published=false.
 */
const COHORT_TO_COURSE: Record<string, string | null> = {
  ebim13: "Especialización en Proyectos BIM",
  ebim14: "Especialización en Proyectos BIM",
  "2025ebimv12": "Especialización en Proyectos BIM",
  ebim: "Especialización en Proyectos BIM",
  revitarquitectura: "Revit Arquitectura Profesionales",
  revitarquitectura1: "Revit Arquitectura Profesionales",
  revitarquitectura2: "Revit Arquitectura Profesionales",
  revitarquitectura3: "Revit Arquitectura Profesionales",
  revitarquitectura4: "Revit Arquitectura Profesionales",
  revitarquitectura5: "Revit Arquitectura Profesionales",
  autocad2d: "AutoCAD 2D Profesionales",
  autocad2d1: "AutoCAD 2D Profesionales",
  autocad2d2: "AutoCAD 2D Profesionales",
  autocad2d3: "AutoCAD 2D Profesionales",
  autocad2d4: "AutoCAD 2D Profesionales",
  autocadplant: "AutoCAD Plant",
  autocadplant3d1: "AutoCAD Plant",
  autocadplant3d2: "AutoCAD Plant",
  autocadplant3d3: "AutoCAD Plant",
  civil3d: "Civil 3D",
  civil3d2: "Civil 3D",
  revitestructura: "Revit Estructura",
  revitmep: "Revit MEP",
  revitmep1: "Revit MEP",
  revitmep2: "Revit MEP",
  revitfamilias: "Revit Familias",
  revitfamilia: "Revit Familias",
  revitavanzado: "REVIT Avanzado",
  inventor: "Inventor Essentials",
  inventoressentials: "Inventor Essentials",
  twinmotion: "Twinmotion para Revit",
  proyectoejecutivoconrevit: "Especialización Proyecto Ejecutivo con Revit",
  // Fuera del catálogo web (published=false):
  revitelectrical: null,
  tallerrevitelectrical: null,
  tallerbonitabeach1: null,
  tallerbonitabeach2: null,
  tallerdocs: null,
  tallerdocsbimcoll1: null,
  tallerdocsbimcoll2: null,
  tallermiprimerbim: null,
  capacitacionap3dnubedepuntos: null,
  revitarqrevitestructurarevitmep: null,
  fusion: null,
  buildhandsonpy: null,
  revitzulamian: null,
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Clave canónica de cohorte: la MISMA edición aparece escrita de formas
 * distintas según la planilla ("Revit Arquitectura - 4", "Revit Arquitectura
 * -4", "Revit Arquitectura 4", "Revit  MEP 1"). Sacando todo lo que no sea
 * letra o número, las tres colapsan en una sola clave y dejan de duplicarse.
 */
const cohortKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/* ============================================================
 * Modelo en memoria
 * ============================================================ */

type CourseDraft = {
  name: string;
  slug: string;
  published: boolean;
  tagline: string | null;
  description: string | null;
  modality: "en_vivo" | "asincronico" | "presencial" | null;
  targetAudience: string | null;
};

type CohortDraft = {
  key: string;
  label: string;
  courseName: string;
  startDate: Date | null;
  endDate: Date | null;
  frequency: string | null;
  startTime: string | null;
  endTime: string | null;
  daysOfWeek: string | null;
  teacher: string | null;
  classroom: string | null;
};

type StudentDraft = {
  identity: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  nationalId: string | null;
  company: string | null;
};

type EnrollmentDraft = {
  studentIdentity: string;
  cohortKey: string;
  amount: number | null;
  currency: "UYU" | "PYG";
  paymentNotes: string | null;
  invoiceNumber: string | null;
  receiptNumber: string | null;
  seller: string | null;
  company: string | null;
  software: string | null;
  licenseAssigned: boolean;
};

const DOWNLOADS = process.env.CADIT_CSV_DIR ?? path.join(process.env.USERPROFILE ?? ".", "Downloads");
const F = {
  catalog: path.join(DOWNLOADS, "cursos-cadit.csv"),
  lista: path.join(DOWNLOADS, "Formulario de Control de cursos .xlsx - LISTA CURSOS 2026.csv"),
  cursos: path.join(DOWNLOADS, "Formulario de Control de cursos .xlsx - CURSOS 2026.csv"),
  atc25: path.join(DOWNLOADS, "ATC_Licenses(2025).csv"),
  atc26: path.join(DOWNLOADS, "ATC_Licenses(2026).csv"),
};

const warnings: string[] = [];
const warn = (m: string) => warnings.push(m);

/* ---------- 1. Catálogo ---------- */

function loadCatalog(): Map<string, CourseDraft> {
  const rows = readCsv(F.catalog);
  const out = new Map<string, CourseDraft>();
  for (const r of rows.slice(1)) {
    const name = cell(r, 0);
    if (!name) continue;
    const url = cell(r, 19);
    const slugFromUrl = url.replace(/\/+$/, "").split("/").pop() ?? "";
    const audience = [cell(r, 6), cell(r, 7)].filter(Boolean).join(" — ");
    out.set(norm(name), {
      name,
      slug: slugFromUrl || slugify(name),
      published: true,
      tagline: cell(r, 1) || null,
      description: cell(r, 2) || cell(r, 3) || null,
      modality: parseModality(cell(r, 4)),
      targetAudience: audience || null,
    });
  }
  return out;
}

/* ---------- 2. LISTA CURSOS: fechas, profesor, aula ---------- */

function loadLista(): Map<string, CohortDraft> {
  const rows = readCsv(F.lista);
  const out = new Map<string, CohortDraft>();
  for (const r of rows.slice(1)) {
    const label = cell(r, 0);
    if (!label) continue;
    const times = parseTimeRange(cell(r, 5));
    out.set(cohortKey(label), {
      key: cohortKey(label),
      label,
      courseName: "",
      startDate: parseDate(cell(r, 2)),
      endDate: parseDate(cell(r, 3)),
      frequency: [cell(r, 4), cell(r, 5)].filter(Boolean).join(" ") || null,
      startTime: times.start,
      endTime: times.end,
      daysOfWeek: parseWeekdays(cell(r, 4)),
      teacher: cell(r, 7) || null,
      classroom: cell(r, 8) || null,
    });
  }
  return out;
}

/* ---------- 3. CURSOS 2026: bloques de cohorte + inscripciones ---------- */

/**
 * Etiquetas de la ficha de cohorte. Se necesitan para saber dónde TERMINA el
 * valor de una etiqueta: la fila `DOCENTE,,CARGA HORARIA ,30/44` tiene el
 * docente vacío, y sin esta lista "CARGA HORARIA" se lee como el nombre del
 * profesor (y termina creado como tal en la base).
 */
const BLOCK_LABELS = new Set([
  "curso",
  "frecuencia",
  "inicio",
  "final",
  "docente",
  "carga horaria",
  "version software",
  "id",
  "aula",
  "monto",
  "nombre",
  "email",
  "celular",
]);

/** Busca una etiqueta ("FRECUENCIA") y devuelve su valor, o null si está vacía. */
function labelValue(row: string[], label: string): string | null {
  const i = row.findIndex((c) => norm(c) === norm(label));
  if (i < 0) return null;
  for (let j = i + 1; j < row.length; j++) {
    const v = cell(row, j);
    if (!v) continue;
    // Si lo próximo es otra etiqueta, esta venía sin valor.
    return BLOCK_LABELS.has(norm(v)) ? null : v;
  }
  return null;
}

/**
 * "Ovidio" y "Ovidio Santos" son la misma persona: el control de cursos
 * anota el nombre de pila y la lista de cursos el nombre completo. Se
 * unifican al nombre más completo cuando el corto es prefijo de UNO solo
 * (si fuera prefijo de dos, no hay forma de saber de cuál y se deja como
 * está en vez de adivinar).
 */
export function canonicalTeacherNames(names: string[]): Map<string, string> {
  const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const map = new Map<string, string>();
  for (const n of uniq) {
    const longer = uniq.filter((o) => o !== n && norm(o).startsWith(`${norm(n)} `));
    map.set(n, longer.length === 1 ? longer[0]! : n);
  }
  return map;
}

function loadCursos(lista: Map<string, CohortDraft>) {
  const rows = readCsv(F.cursos);
  const cohorts: CohortDraft[] = [];
  const enrollments: EnrollmentDraft[] = [];
  const students = new Map<string, StudentDraft>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (norm(cell(row, 0)) !== "curso") continue;

    // El nombre es la primera celda no vacía después de "CURSO" y antes de
    // la etiqueta FRECUENCIA (la columna varía entre bloques).
    let label = "";
    for (let j = 1; j < row.length; j++) {
      const v = cell(row, j);
      if (!v) continue;
      if (norm(v) === "frecuencia") break;
      label = v;
      break;
    }
    if (!label) {
      warn(`Bloque sin nombre de curso en la fila ${i + 1} de CURSOS 2026 — omitido`);
      continue;
    }

    const head2 = rows[i + 1] ?? [];
    const head3 = rows[i + 2] ?? [];
    const frequency = labelValue(row, "FRECUENCIA");
    const inicio = labelValue(row, "INICIO");
    const final = labelValue(head2, "FINAL");
    const docente = labelValue(head2, "DOCENTE");
    const aula = labelValue(head3, "Aula");

    const baseKey = cohortKey(label);
    const fromLista = lista.get(baseKey);
    const times = parseTimeRange(frequency ?? "");
    const startDate = parseDate(inicio ?? "") ?? fromLista?.startDate ?? null;
    /**
     * "Civil 3D", "AutoCAD PLANT" e "Inventor" aparecen DOS veces con el
     * mismo nombre y fechas distintas: son ediciones diferentes, no la misma
     * cohorte repetida. Sin desambiguar la clave, las inscripciones de las
     * dos caen en la misma bolsa.
     */
    let key = baseKey;
    for (let n = 2; cohorts.some((c) => c.key === key); n++) {
      key = `${baseKey}#${n}`;
    }
    const cohort: CohortDraft = {
      key,
      label,
      courseName: "",
      startDate,
      endDate: parseDate(final ?? "") ?? fromLista?.endDate ?? null,
      frequency: frequency ?? fromLista?.frequency ?? null,
      startTime: times.start ?? fromLista?.startTime ?? null,
      endTime: times.end ?? fromLista?.endTime ?? null,
      daysOfWeek: parseWeekdays(frequency ?? "") ?? fromLista?.daysOfWeek ?? null,
      teacher: docente ?? fromLista?.teacher ?? null,
      classroom: aula ?? fromLista?.classroom ?? null,
    };
    cohorts.push(cohort);

    // Fila de encabezado de inscripciones ("Monto,Nombre,Email,...") y luego
    // las filas de alumnos hasta la próxima fila vacía o el próximo bloque.
    let h = i + 1;
    while (h < rows.length && norm(cell(rows[h]!, 0)) !== "monto") {
      if (norm(cell(rows[h]!, 0)) === "curso") break;
      h++;
    }
    if (h >= rows.length || norm(cell(rows[h]!, 0)) !== "monto") continue;
    const header = rows[h]!.map((c) => norm(c));
    const col = (name: string) => header.indexOf(norm(name));

    for (let r = h + 1; r < rows.length; r++) {
      const line = rows[r]!;
      if (norm(cell(line, 0)) === "curso") break;
      const name = cell(line, col("Nombre") >= 0 ? col("Nombre") : 1);
      if (!name) {
        // Una fila totalmente vacía cierra el bloque; una sin nombre pero con
        // datos es basura de la planilla y se ignora.
        if (line.every((c) => !c.trim())) break;
        continue;
      }
      const email = parseEmail(cell(line, col("Email")));
      const phoneRaw = cell(line, col("Celular"));
      const phone = normalizePhone(phoneRaw);
      const ci = parseNationalId(cell(line, col("C.I.")));
      if (!phone && phoneRaw) {
        warn(`Teléfono no reconocido "${phoneRaw}" (${name}, ${label}) — se guarda sin teléfono`);
      }
      const identity = phone ?? (email ? `import:${email}` : ci ? `import-ci:${ci}` : "");
      if (!identity) {
        warn(`Alumno sin teléfono, correo ni C.I.: "${name}" (${label}) — OMITIDO`);
        continue;
      }
      const split = splitName(name);
      if (!students.has(identity)) {
        students.set(identity, {
          identity,
          firstName: split.firstName,
          lastName: split.lastName,
          phone,
          email,
          nationalId: ci,
          company: null,
        });
      }
      const money = parseMoney(cell(line, col("Monto")));
      enrollments.push({
        studentIdentity: identity,
        cohortKey: key,
        amount: money?.amount ?? null,
        currency: money?.currency ?? "UYU",
        paymentNotes: cell(line, col("Observaciones")) || null,
        invoiceNumber: cell(line, col("Factura")) || null,
        receiptNumber: cell(line, col("Recibo")) || null,
        seller: cell(line, col("Vendedor")) || null,
        company: null,
        software: null,
        licenseAssigned: /tiene licencia|\d/.test(cell(line, col("Licencia"))),
      });
    }
  }

  return { cohorts, enrollments, students };
}

/* ---------- 4. ATC: alumnos con nombre/apellido separados + licencias ---------- */

function loadAtc(file: string) {
  const rows = readCsv(file, { latin1: true, delimiter: ";" });
  const header = rows[0]!.map((c) => norm(c));
  const col = (n: string) => header.indexOf(norm(n));
  const out: {
    student: StudentDraft;
    cohortLabel: string;
    software: string | null;
    installed: boolean;
    /** Período del préstamo de licencia: sirve de fecha de la cohorte cuando no hay otra. */
    start: Date | null;
    end: Date | null;
  }[] = [];

  for (const line of rows.slice(1)) {
    const first = cell(line, col("Nombre"));
    if (!first) continue; // filas vacías de relleno de la planilla
    const last = cell(line, col("Apellido")) || null;
    const email = parseEmail(cell(line, col("Correo")));
    const phoneRaw = cell(line, col("Celular"));
    const phone = normalizePhone(phoneRaw);
    const identity = phone ?? (email ? `import:${email}` : "");
    if (!identity) {
      warn(`ATC: alumno sin teléfono ni correo: "${first} ${last ?? ""}" — OMITIDO`);
      continue;
    }
    out.push({
      student: {
        identity,
        firstName: first,
        lastName: last,
        phone,
        email,
        nationalId: null,
        company: cell(line, col("Empresa")) || null,
      },
      cohortLabel: cell(line, col("Curso")),
      software: cell(line, col("Software")) || null,
      installed: cell(line, col("Instalado")).toUpperCase() === "VERDADERO",
      start: parseDate(cell(line, col("Inicio"))),
      end: parseDate(cell(line, col("Fin"))),
    });
  }
  return out;
}

/**
 * `contact` es único por correo, por teléfono Y por identidad (tres índices
 * distintos). La misma persona aparece en las planillas con el teléfono
 * escrito de dos formas, o con dos correos y el mismo celular: si se insertan
 * como contactos separados, la carga entera se cae contra uno de esos índices.
 *
 * Se fusionan por CUALQUIER dato compartido (correo, teléfono o cédula) con
 * un union-find: dos fichas que comparten aunque sea uno de los tres son la
 * misma persona. Los datos que quedan afuera de la fusión se reportan, porque
 * pueden ser una carga mal hecha en el origen.
 */
function dedupeStudents(students: Map<string, StudentDraft>, enrollments: EnrollmentDraft[]) {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let r = parent.get(x)!;
    while (r !== parent.get(r)!) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  for (const s of students.values()) {
    const node = `id:${s.identity}`;
    find(node);
    // Solo correo y teléfono fusionan. La cédula NO: en el origen hay filas
    // con la cédula copiada de otra persona (Ana Laura y Cecilia comparten
    // "4.527.213 -5"), y fusionar por ahí junta a dos alumnos distintos.
    if (s.email) union(node, `mail:${s.email}`);
    if (s.phone) union(node, `tel:${s.phone}`);
  }

  const groups = new Map<string, StudentDraft[]>();
  for (const s of students.values()) {
    const root = find(`id:${s.identity}`);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(s);
  }

  const canonicalOf = new Map<string, string>();
  const merged = new Map<string, StudentDraft>();

  for (const group of groups.values()) {
    // Gana la ficha con teléfono: `wa_identity` es la llave de WhatsApp y
    // conviene que sea un número real y no una identidad sintética.
    const head = group.find((s) => s.phone) ?? group[0]!;
    const canonical: StudentDraft = { ...head };
    for (const s of group) {
      if (s === head) continue;
      canonical.lastName ??= s.lastName;
      canonical.company ??= s.company;
      canonical.nationalId ??= s.nationalId;
      if (!canonical.email) canonical.email = s.email;
      else if (s.email && s.email !== canonical.email) {
        warn(`"${canonical.firstName} ${canonical.lastName ?? ""}": dos correos (${canonical.email} / ${s.email}) — se guarda el primero`);
      }
      if (!canonical.phone) canonical.phone = s.phone;
      else if (s.phone && s.phone !== canonical.phone) {
        warn(`"${canonical.firstName} ${canonical.lastName ?? ""}": dos teléfonos (${canonical.phone} / ${s.phone}) — se guarda el primero`);
      }
    }
    canonical.identity =
      canonical.phone ??
      (canonical.email ? `import:${canonical.email}` : `import-ci:${canonical.nationalId}`);
    merged.set(canonical.identity, canonical);
    for (const s of group) canonicalOf.set(s.identity, canonical.identity);
  }

  // Reapuntar las inscripciones y sacar las que quedaron repetidas
  // (misma persona + misma cohorte tras la fusión).
  const seen = new Set<string>();
  const deduped: EnrollmentDraft[] = [];
  for (const e of enrollments) {
    const identity = canonicalOf.get(e.studentIdentity) ?? e.studentIdentity;
    const k = `${identity}|${e.cohortKey}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push({ ...e, studentIdentity: identity });
  }

  return { students: merged, enrollments: deduped };
}

/* ============================================================
 * Construcción del modelo completo
 * ============================================================ */

function build() {
  const catalog = loadCatalog();
  const lista = loadLista();
  const { cohorts, enrollments, students } = loadCursos(lista);

  // Cohortes que solo existen en LISTA CURSOS (sin bloque de inscripciones).
  for (const [key, c] of lista) {
    if (!cohorts.some((x) => x.key === key)) cohorts.push({ ...c });
  }

  // ATC: mejora nombre/apellido (vienen separados de origen) y suma alumnos
  // y cohortes que no aparecen en el control de cursos.
  const atc = [...loadAtc(F.atc25), ...loadAtc(F.atc26)];
  const licenses = new Map<string, { software: string | null; installed: boolean }>();

  for (const row of atc) {
    const baseKey = cohortKey(row.cohortLabel);
    let key = baseKey;
    if (baseKey) {
      // El ATC nombra la cohorte sin distinguir ediciones ("Civil 3D" a
      // secas). Cuando hay varias con ese nombre, gana la que arranca más
      // cerca del préstamo de la licencia.
      const candidates = cohorts.filter(
        (c) => c.key === baseKey || c.key.startsWith(`${baseKey}#`)
      );
      if (candidates.length === 0) {
        // Cohorte que solo existe en el ATC: no tiene ficha en el control de
        // cursos, así que el período del préstamo de licencia es la mejor
        // aproximación disponible a sus fechas.
        cohorts.push({
          key: baseKey,
          label: row.cohortLabel,
          courseName: "",
          startDate: row.start,
          endDate: row.end,
          frequency: null,
          startTime: null,
          endTime: null,
          daysOfWeek: null,
          teacher: null,
          classroom: null,
        });
      } else if (candidates.length === 1) {
        key = candidates[0]!.key;
      } else {
        const ref = row.start?.getTime();
        const best = ref
          ? candidates.reduce((a, b) =>
              Math.abs((a.startDate?.getTime() ?? 0) - ref) <=
              Math.abs((b.startDate?.getTime() ?? 0) - ref)
                ? a
                : b
            )
          : candidates[0]!;
        key = best.key;
      }
    }

    const existing = students.get(row.student.identity);
    if (existing) {
      // El ATC trae nombre y apellido de campos separados: gana sobre el
      // corte heurístico de un "Nombre" completo del control de cursos.
      existing.firstName = row.student.firstName;
      existing.lastName = row.student.lastName ?? existing.lastName;
      existing.email ??= row.student.email;
      existing.phone ??= row.student.phone;
      existing.company ??= row.student.company;
    } else {
      students.set(row.student.identity, row.student);
    }

    if (key) {
      const ek = `${row.student.identity}|${key}`;
      licenses.set(ek, { software: row.software, installed: row.installed });
      if (!enrollments.some((e) => `${e.studentIdentity}|${e.cohortKey}` === ek)) {
        enrollments.push({
          studentIdentity: row.student.identity,
          cohortKey: key,
          amount: null,
          currency: "UYU",
          paymentNotes: null,
          invoiceNumber: null,
          receiptNumber: null,
          seller: null,
          company: row.student.company,
          software: row.software,
          licenseAssigned: true,
        });
      }
    }
  }

  // Resolución cohorte -> curso, y cursos fuera de catálogo.
  const extraCourses = new Map<string, CourseDraft>();
  for (const c of cohorts) {
    // El sufijo "#2" distingue ediciones del mismo nombre, pero el mapeo al
    // catálogo es por nombre: se busca siempre con la clave base.
    const mapped = COHORT_TO_COURSE[c.key.split("#")[0]!];
    if (mapped === undefined) {
      warn(`Cohorte "${c.label}" sin mapeo a curso — se crea como curso propio SIN publicar`);
    }
    if (mapped) {
      c.courseName = mapped;
      if (!catalog.has(norm(mapped))) {
        warn(`El curso "${mapped}" no está en cursos-cadit.csv — revisar el mapeo`);
      }
    } else {
      c.courseName = c.label;
      if (!extraCourses.has(norm(c.label))) {
        extraCourses.set(norm(c.label), {
          name: c.label,
          slug: slugify(c.label),
          published: false,
          tagline: null,
          description: null,
          modality: null,
          targetAudience: null,
        });
      }
    }
  }

  // Enriquecer licencias en las inscripciones que vinieron del control de cursos.
  for (const e of enrollments) {
    const lic = licenses.get(`${e.studentIdentity}|${e.cohortKey}`);
    if (lic) {
      e.software ??= lic.software;
      e.licenseAssigned = e.licenseAssigned || lic.installed || Boolean(lic.software);
    }
  }

  // Unificar "Ovidio" con "Ovidio Santos" ANTES de crear los profesores: si
  // no, quedan dos fichas y las cohortes repartidas entre las dos.
  const teacherNames = canonicalTeacherNames(
    cohorts.map((c) => c.teacher).filter(Boolean) as string[]
  );
  for (const c of cohorts) {
    if (!c.teacher) continue;
    const canonical = teacherNames.get(c.teacher.trim());
    if (canonical && canonical !== c.teacher.trim()) {
      warn(`Profesor unificado: "${c.teacher}" -> "${canonical}"`);
      c.teacher = canonical;
    }
  }

  const cohortsWithoutStart = cohorts.filter((c) => !c.startDate);
  for (const c of cohortsWithoutStart) {
    warn(`Cohorte "${c.label}" sin fecha de inicio — OMITIDA (start_date es obligatorio)`);
  }
  let live = cohorts.filter((c) => c.startDate);

  /**
   * La MISMA edición está en las dos planillas con nombres distintos: LISTA
   * dice "AutoCAD 2D" y el control de cursos "AutoCAD 2D - 1", con la misma
   * fecha de inicio. Sin este pase quedan dos cohortes, una con todos los
   * alumnos y otra vacía. Se fusionan por curso + inicio cercano (7 días),
   * y gana la que tiene inscripciones.
   */
  const DAY = 86_400_000;
  const merged: CohortDraft[] = [];
  const enrollCount = (key: string) => enrollments.filter((e) => e.cohortKey === key).length;
  for (const c of [...live].sort((a, b) => enrollCount(b.key) - enrollCount(a.key))) {
    const twin = merged.find(
      (m) =>
        m.courseName === c.courseName &&
        m.startDate &&
        c.startDate &&
        Math.abs(m.startDate.getTime() - c.startDate.getTime()) <= 7 * DAY
    );
    if (twin) {
      warn(`Cohortes fusionadas: "${c.label}" -> "${twin.label}" (mismo curso, inicio a menos de 7 días)`);
      // Las inscripciones de la descartada pasan a la que queda.
      for (const e of enrollments) if (e.cohortKey === c.key) e.cohortKey = twin.key;
      twin.endDate ??= c.endDate;
      twin.teacher ??= c.teacher;
      twin.classroom ??= c.classroom;
      twin.frequency ??= c.frequency;
      continue;
    }
    merged.push(c);
  }
  live = merged;

  const deduped = dedupeStudents(students, enrollments);

  return {
    courses: [...catalog.values(), ...extraCourses.values()],
    cohorts: live,
    students: [...deduped.students.values()],
    enrollments: deduped.enrollments,
  };
}

/* ============================================================
 * Informe (dry-run) y carga (--apply)
 * ============================================================ */

function report(model: ReturnType<typeof build>) {
  const { courses, cohorts, students, enrollments } = model;
  const validCohortKeys = new Set(cohorts.map((c) => c.key));
  const usable = enrollments.filter((e) => validCohortKeys.has(e.cohortKey));
  const pyg = usable.filter((e) => e.currency === "PYG");
  const withAmount = usable.filter((e) => e.amount !== null);

  console.log("\n================ INFORME DE IMPORTACIÓN ================\n");
  console.log(`Cursos ................. ${courses.length}`);
  console.log(`  publicados en la web . ${courses.filter((c) => c.published).length}`);
  console.log(`  internos (sin web) ... ${courses.filter((c) => !c.published).length}`);
  console.log(`Cohortes ............... ${cohorts.length}`);
  console.log(`Alumnos (contactos) .... ${students.length}`);
  console.log(`  con teléfono ......... ${students.filter((s) => s.phone).length}`);
  console.log(`  con correo ........... ${students.filter((s) => s.email).length}`);
  console.log(`  con apellido ......... ${students.filter((s) => s.lastName).length}`);
  console.log(`Inscripciones .......... ${usable.length}`);
  console.log(`  con importe cargado .. ${withAmount.length}`);
  console.log(`  en guaraníes (PYG) ... ${pyg.length}`);
  console.log(`  con licencia ......... ${usable.filter((e) => e.licenseAssigned).length}`);
  console.log(`Inscripciones sin cohorte válida (descartadas): ${enrollments.length - usable.length}`);

  const teachers = [...new Set(cohorts.map((c) => c.teacher).filter(Boolean))];
  console.log(`Profesores ............. ${teachers.length}`);
  console.log(`  ${teachers.join(" · ")}`);

  console.log("\n---- Cursos internos (published=false) ----");
  for (const c of courses.filter((x) => !x.published)) console.log(`  · ${c.name}`);

  console.log("\n---- Cohortes ----");
  for (const c of cohorts) {
    const n = usable.filter((e) => e.cohortKey === c.key).length;
    const f = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
    console.log(
      `  · ${c.label.padEnd(42)} ${c.courseName.padEnd(46)} ${f(c.startDate)} → ${f(c.endDate)}  ${String(n).padStart(3)} alumnos`
    );
  }

  if (warnings.length) {
    console.log(`\n---- Avisos (${warnings.length}) ----`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }
  console.log("\n========================================================\n");
}

async function apply(model: ReturnType<typeof build>, db: ReturnType<typeof drizzle>, orgId: string) {
  const { courses, cohorts, students, enrollments } = model;

  await db.transaction(async (tx) => {
    // BORRADO: orden inverso a las FK. `license` y `enrollment` caen por
    // cascada al borrar contactos, pero se borran explícitamente para que el
    // conteo del informe sea real y no dependa de la cascada.
    await tx.execute(drizzleSql`delete from license where organization_id = ${orgId}`);
    await tx.execute(drizzleSql`delete from enrollment where organization_id = ${orgId}`);
    // Tabla puente pura (cohort_id, software_id): no tiene organization_id,
    // así que se acota por sus cohortes.
    await tx.execute(
      drizzleSql`delete from cohort_software where cohort_id in (select id from cohort where organization_id = ${orgId})`
    );
    await tx.execute(drizzleSql`delete from cohort where organization_id = ${orgId}`);
    await tx.execute(drizzleSql`delete from course_module where organization_id = ${orgId}`);
    await tx.execute(drizzleSql`delete from teacher_course where teacher_id in (select id from teacher where organization_id = ${orgId})`);
    await tx.execute(drizzleSql`delete from course where organization_id = ${orgId}`);
    await tx.execute(drizzleSql`delete from contact where organization_id = ${orgId}`);
    await tx.execute(drizzleSql`delete from teacher where organization_id = ${orgId}`);
    await tx.execute(drizzleSql`delete from company where organization_id = ${orgId}`);
    await tx.execute(drizzleSql`delete from software where organization_id = ${orgId}`);

    // Etapa destino de las inscripciones: la primera abierta del pipeline.
    const stages = await tx
      .select({ id: schema.pipelineStage.id })
      .from(schema.pipelineStage)
      .where(drizzleSql`organization_id = ${orgId} and kind = 'open'`)
      .orderBy(schema.pipelineStage.position);
    const stageId = stages[0]?.id;
    if (!stageId) throw new Error("La organización no tiene etapas abiertas en el pipeline");

    const courseIds = new Map<string, string>();
    for (const c of courses) {
      const id = newId("course");
      courseIds.set(norm(c.name), id);
      await tx.insert(schema.course).values({
        id,
        organizationId: orgId,
        name: c.name,
        slug: c.slug,
        published: c.published,
        tagline: c.tagline,
        description: c.description,
        modality: c.modality,
        targetAudience: c.targetAudience,
      });
    }

    const teacherIds = new Map<string, string>();
    for (const name of new Set(cohorts.map((c) => c.teacher).filter(Boolean) as string[])) {
      const id = newId("teacher");
      teacherIds.set(norm(name), id);
      await tx.insert(schema.teacher).values({ id, organizationId: orgId, name });
    }

    const companyIds = new Map<string, string>();
    for (const name of new Set(students.map((s) => s.company).filter(Boolean) as string[])) {
      const id = newId("company");
      companyIds.set(norm(name), id);
      await tx.insert(schema.company).values({ id, organizationId: orgId, legalName: name });
    }

    const cohortIds = new Map<string, string>();
    for (const c of cohorts) {
      const courseId = courseIds.get(norm(c.courseName));
      if (!courseId) {
        warn(`Cohorte "${c.label}": curso "${c.courseName}" no creado — OMITIDA`);
        continue;
      }
      const id = newId("cohort");
      cohortIds.set(c.key, id);
      await tx.insert(schema.cohort).values({
        id,
        organizationId: orgId,
        courseId,
        name: c.label,
        startDate: c.startDate!,
        endDate: c.endDate,
        teacherId: c.teacher ? (teacherIds.get(norm(c.teacher)) ?? null) : null,
        frequency: c.frequency,
        startTime: c.startTime,
        endTime: c.endTime,
        daysOfWeek: c.daysOfWeek,
        classroom: c.classroom,
      });
    }

    const contactIds = new Map<string, string>();
    for (const s of students) {
      const id = newId("contact");
      contactIds.set(s.identity, id);
      await tx.insert(schema.contact).values({
        id,
        organizationId: orgId,
        firstName: s.firstName,
        lastName: s.lastName,
        phone: s.phone,
        waIdentity: s.identity,
        email: s.email,
        nationalId: s.nationalId,
        source: "importación:CSV 2026",
      });
    }

    let created = 0;
    for (const e of enrollments) {
      const cohortId = cohortIds.get(e.cohortKey);
      const contactId = contactIds.get(e.studentIdentity);
      if (!cohortId || !contactId) continue;
      await tx.insert(schema.enrollment).values({
        id: newId("enrollment"),
        organizationId: orgId,
        contactId,
        cohortId,
        stageId,
        enrolledAt: new Date(),
        amount: e.amount,
        currency: e.currency,
        paymentNotes: e.paymentNotes,
        invoiceNumber: e.invoiceNumber,
        receiptNumber: e.receiptNumber,
        companyId: e.company ? (companyIds.get(norm(e.company)) ?? null) : null,
      }).onConflictDoNothing();
      created++;
    }

    console.log(
      `\n[import] Cargado: ${courses.length} cursos, ${cohortIds.size} cohortes, ${contactIds.size} alumnos, ${created} inscripciones.\n`
    );
  });
}

/* ============================================================
 * Entrada
 * ============================================================ */

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[import] Falta DATABASE_URL");
  process.exit(1);
}

const model = build();
report(model);

if (!process.argv.includes("--apply")) {
  console.log("Dry-run: no se tocó la base. Corré con --apply para cargar.\n");
  process.exit(0);
}

const sqlClient = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sqlClient, { schema });
const orgs = await db.select().from(schema.organization).limit(1);
const org = orgs[0];
if (!org) {
  console.error("[import] No hay organización en la base");
  await sqlClient.end();
  process.exit(1);
}

await apply(model, db, org.id);
await sqlClient.end();
process.exit(0);
