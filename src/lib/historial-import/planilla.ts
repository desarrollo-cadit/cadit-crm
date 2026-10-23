import { z } from "zod";
import { normalizarCorreo } from "@/lib/contact-identity";
import { leerCsv } from "@/lib/historial-import/csv";
import { normalizePhoneInput } from "@/lib/phone";

/**
 * 046 US6 (FR-014) — La planilla histórica de cursadas, fila por fila. Puro.
 *
 * Una fila válida tiene nombre, curso, una fecha que existe y al menos un
 * correo o un teléfono para reconocer a la persona. Lo que no cumple queda
 * como PROBLEMA con su número de fila: se muestra en la vista previa y no se
 * importa, pero no frena al resto.
 */

export const COLUMNAS_PLANILLA = [
  "nombre",
  "apellido",
  "correo",
  "telefono",
  "empresa",
  "curso",
  "curso_original",
  "estudiante",
  "edicion",
  "fecha",
  "vendedor",
  "nota",
  "fila_planilla",
] as const;

export type FilaHistorica = {
  /** El número de fila de la planilla original (o de este archivo). */
  fila: number;
  nombre: string;
  apellido: string | null;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
  curso: string;
  cursoOriginal: string | null;
  estudiante: boolean;
  edicion: string | null;
  /** AAAA-MM-DD */
  fecha: string;
  /** Tal como viene ("CP", "Sofía"); `""` = sin vendedor en la planilla. */
  vendedor: string;
  nota: string | null;
};

export type ProblemaDeFila = { fila: number; motivo: string };

export type PlanillaLeida =
  | { ok: true; total: number; filas: FilaHistorica[]; problemas: ProblemaDeFila[]; avisos: ProblemaDeFila[] }
  | { ok: false; message: string };

const esCorreo = z.string().email();

function esDia(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const texto = (v: string | undefined): string | null => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

export function leerPlanilla(contenido: string): PlanillaLeida {
  const filas = leerCsv(contenido);
  const encabezado = filas[0]?.map((c) => c.trim().toLowerCase());
  if (!encabezado || encabezado.join(",") !== COLUMNAS_PLANILLA.join(",")) {
    return {
      ok: false,
      message: `El archivo tiene que empezar con el encabezado: ${COLUMNAS_PLANILLA.join(",")}`,
    };
  }

  const validas: FilaHistorica[] = [];
  const problemas: ProblemaDeFila[] = [];
  /** Filas que SÍ se importan, pero con algo descartado (p. ej. un correo mal escrito). */
  const avisos: ProblemaDeFila[] = [];
  const datos = filas.slice(1).filter((f) => f.some((c) => c.trim() !== ""));

  datos.forEach((celdas, i) => {
    const filaPlanilla = Number.parseInt((celdas[12] ?? "").trim(), 10);
    const fila = Number.isInteger(filaPlanilla) && filaPlanilla > 0 ? filaPlanilla : i + 2;
    const problema = (motivo: string) => problemas.push({ fila, motivo });

    if (celdas.length !== COLUMNAS_PLANILLA.length) {
      problema(`La fila tiene ${celdas.length} columnas; se esperaban ${COLUMNAS_PLANILLA.length}.`);
      return;
    }
    const [nombre, apellido, correoRaw, telefonoRaw, empresa, curso, cursoOriginal, estudiante, edicion, fecha, vendedor, nota] =
      celdas.map((c) => c.trim());

    if (!nombre) return void problema("Falta el nombre.");
    const telefono = telefonoRaw ? normalizePhoneInput(telefonoRaw) : null;
    if (telefonoRaw && !telefono) return void problema("El teléfono no es válido.");
    /**
     * Un correo mal escrito no se adivina. Con teléfono, la persona se
     * reconoce igual: se importa SIN correo y se avisa. Sin teléfono no hay
     * con qué reconocerla.
     */
    const correoLeido = normalizarCorreo(correoRaw);
    const correoValido = !correoLeido || esCorreo.safeParse(correoLeido).success;
    if (!correoValido && !telefono) {
      return void problema("El correo no es válido y no hay teléfono: no se puede reconocer a la persona.");
    }
    const correo = correoValido ? correoLeido : null;
    if (!correo && !telefono) {
      return void problema("Falta el correo y el teléfono: no se puede reconocer a la persona.");
    }
    if (!curso) return void problema("Falta el curso.");
    if (!fecha || !esDia(fecha)) return void problema("La fecha no es un día válido (AAAA-MM-DD).");
    if (!correoValido) avisos.push({ fila, motivo: "El correo no es válido: se importa sin correo, por el teléfono." });

    validas.push({
      fila,
      nombre,
      apellido: texto(apellido),
      correo,
      telefono,
      empresa: texto(empresa),
      curso,
      cursoOriginal: texto(cursoOriginal),
      estudiante: (estudiante ?? "").toLowerCase() === "si" || (estudiante ?? "").toLowerCase() === "sí",
      edicion: texto(edicion),
      fecha,
      vendedor: vendedor ?? "",
      nota: texto(nota),
    });
  });

  return { ok: true, total: datos.length, filas: validas, problemas, avisos };
}
