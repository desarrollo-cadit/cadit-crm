import { estadoDeModulo, type DispensaDeAsistencia, type ModuleState } from "@/lib/approval";
import { programaConfirmado, type ResultadoFinal } from "@/lib/resultado-final";
import type { Scale } from "@/lib/grading-template";
import { escapeHtml } from "@/lib/utils";

/**
 * 031 (T037, US5, DV-011) — La escolaridad: armado y documento, PUROS.
 *
 * Ninguna lectura de base acá: `src/server/transcript.ts` trae filas planas y
 * este módulo decide. Así la regla se prueba sin base y las dos puertas (staff
 * y alumno) imprimen EXACTAMENTE el mismo documento.
 *
 * Es un documento sobre una PERSONA, así que valen las trampas de los
 * defaults optimistas (CLAUDE.md): una evaluación sin resultado oficial es
 * "Pendiente" —nunca "No aprobada"— y una cursada sin un solo dato es "Sin
 * datos" —nunca "Aprobado"—. Por eso el estado sale de `estadoDeModulo` (la
 * regla del legajo y del Recorrido) y no de `approvalState`, cuyo default
 * optimista está bien en la planilla y es falso acá.
 *
 * Nunca hay nota final ponderada (FR-028): cada evaluación dice la suya.
 */

export type EvaluacionInput = {
  nombre: string;
  obligatoria: boolean;
  escala: Scale;
  /** Solo numérica y con resultado oficial publicado. */
  nota: number | null;
  /** El resultado OFICIAL; `null` = pendiente. */
  aprobada: boolean | null;
};

export type CursadaInput = {
  enrollmentId: string;
  /** 028 — la inscripción madre si esta cursada es un módulo de especialización. */
  parentEnrollmentId: string | null;
  curso: string;
  cohorte: string;
  desde: Date | null;
  hasta: Date | null;
  /** `null` = nadie pasó lista. **0% porque nadie pasó lista no es 0% porque no vino.** */
  asistenciaPct: number | null;
  minAsistenciaPct: number | null;
  dispensa: DispensaDeAsistencia | null;
  /** Orden del módulo dentro de su programa (028); `null` en una cursada suelta. */
  posicion: number | null;
  evaluaciones: EvaluacionInput[];
  /**
   * 0086 — El resultado final CONFIRMADO por el profesor; `null` = sin
   * confirmar. Es lo ÚNICO que la escolaridad afirma como Aprobado / No
   * aprobado: el cálculo de notas + asistencia es una sugerencia y acá solo
   * decide "Sin datos".
   */
  resultadoConfirmado: ResultadoFinal | null;
  /**
   * 2026-10-29 — El grupo TERMINÓ sin la asistencia completa
   * (`grupoSinResultado`): no hay resultado, se dice "Sin datos".
   */
  grupoSinResultado: boolean;
};

export type EscolaridadInput = {
  academia: string;
  alumno: { nombre: string; documento: string | null };
  emitidaEl: Date;
  cursadas: CursadaInput[];
};

export type FilaDeCursada = {
  curso: string;
  cohorte: string;
  desde: Date | null;
  hasta: Date | null;
  estado: ModuleState;
  /** 0086 — Ya terminó (al emitir): un `pendiente` es una espera de confirmación. */
  terminada: boolean;
  asistenciaPct: number | null;
  dispensada: boolean;
  evaluaciones: EvaluacionInput[];
  /** Solo en especializaciones: cada módulo con la misma forma. */
  modulos?: FilaDeCursada[];
};

export type Escolaridad = {
  academia: string;
  alumno: { nombre: string; documento: string | null };
  emitidaEl: Date;
  cursadas: FilaDeCursada[];
};

/** Sin fecha va al final: "no sabemos cuándo empezó" no es "empezó primero". */
function porInicio(a: { desde: Date | null }, b: { desde: Date | null }): number {
  const x = a.desde?.getTime() ?? Number.POSITIVE_INFINITY;
  const y = b.desde?.getTime() ?? Number.POSITIVE_INFINITY;
  return x - y;
}

const DIA_MS = 86_400_000;

/** El fin es un DÍA (medianoche UTC): terminó cuando ese día ya pasó entero. */
function termino(hasta: Date | null, emitidaEl: Date): boolean {
  return hasta !== null && hasta.getTime() + DIA_MS <= emitidaEl.getTime();
}

function fila(c: CursadaInput, emitidaEl: Date): FilaDeCursada {
  const { state: sugerido } = estadoDeModulo(
    // Solo las obligatorias deciden (010): una opcional informa, no aprueba ni reprueba.
    c.evaluaciones.filter((e) => e.obligatoria).map((e) => e.aprobada),
    c.asistenciaPct,
    c.minAsistenciaPct,
    c.dispensa
  );
  // 0086 — Solo lo CONFIRMADO es un hecho; sin confirmar, "Sin datos" o pendiente.
  const estado: ModuleState = c.grupoSinResultado
    ? "sin_datos"
    : (c.resultadoConfirmado ?? (sugerido === "sin_datos" ? "sin_datos" : "pendiente"));
  return {
    curso: c.curso,
    cohorte: c.cohorte,
    desde: c.desde,
    hasta: c.hasta,
    estado,
    terminada: termino(c.hasta, emitidaEl),
    asistenciaPct: c.asistenciaPct,
    dispensada: c.dispensa !== null,
    evaluaciones: c.evaluaciones,
  };
}

export function armarEscolaridad(input: EscolaridadInput): Escolaridad {
  const hijas = new Map<string, CursadaInput[]>();
  for (const c of input.cursadas) {
    if (!c.parentEnrollmentId) continue;
    hijas.set(c.parentEnrollmentId, [...(hijas.get(c.parentEnrollmentId) ?? []), c]);
  }

  const cursadas = input.cursadas
    // Las hijas no aparecen sueltas: una especialización es UNA fila (028, FR-031).
    .filter((c) => !c.parentEnrollmentId)
    .sort(porInicio)
    .map((c): FilaDeCursada => {
      const modulos = hijas.get(c.enrollmentId);
      if (!modulos || modulos.length === 0) return fila(c, input.emitidaEl);

      const filas = [...modulos]
        .sort((a, b) =>
          a.posicion !== null && b.posicion !== null && a.posicion !== b.posicion
            ? a.posicion - b.posicion
            : porInicio(a, b)
        )
        .map((m) => fila(m, input.emitidaEl));
      // El estado de la madre se COMPONE: su cohorte no tiene evaluaciones ni
      // clases propias, y preguntarle a la regla daría un default sobre nada.
      // 0086 — Sobre los resultados CONFIRMADOS de los módulos.
      const { state } = programaConfirmado(
        modulos.map((m) => (m.grupoSinResultado ? null : m.resultadoConfirmado))
      );
      const propia = fila(c, input.emitidaEl);
      return {
        ...propia,
        estado: state,
        terminada: propia.terminada || filas.every((m) => m.terminada),
        // No existe "la asistencia de la especialización": cada módulo la suya.
        asistenciaPct: null,
        dispensada: false,
        evaluaciones: [],
        modulos: filas,
      };
    });

  return {
    academia: input.academia,
    alumno: input.alumno,
    emitidaEl: input.emitidaEl,
    cursadas,
  };
}

/* ============================================================
 * El documento
 * ============================================================ */

export const ESTADO: Record<ModuleState, string> = {
  aprobado: "Aprobado",
  reprobado: "No aprobado",
  pendiente: "En curso",
  sin_datos: "Sin datos",
};

/**
 * 0086 — La palabra que se imprime: una cursada TERMINADA sin resultado
 * confirmado no está "En curso", espera la confirmación del profesor.
 */
export function textoDeEstado(c: Pick<FilaDeCursada, "estado" | "terminada">): string {
  if (c.estado === "pendiente" && c.terminada) return "Resultado pendiente";
  return ESTADO[c.estado];
}

/**
 * Las fechas de una cohorte son DÍAS (medianoche UTC, como las guarda el
 * formulario): se dicen en UTC o un día de Montevideo se corre al anterior.
 */
const dia = new Intl.DateTimeFormat("es-UY", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export function periodo(c: FilaDeCursada): string {
  if (!c.desde) return "Sin fecha de inicio";
  return `${dia.format(c.desde)} – ${c.hasta ? dia.format(c.hasta) : "en curso"}`;
}

export function resultado(e: EvaluacionInput): string {
  if (e.aprobada === null) return "Pendiente";
  if (e.escala === "numeric" && e.nota !== null) return `${e.nota}/100`;
  return e.aprobada ? "Aprobada" : "No aprobada";
}

function bloqueDeCursada(c: FilaDeCursada, modulo = false): string {
  const asistencia =
    c.asistenciaPct === null
      ? c.modulos
        ? ""
        : "Asistencia: sin registro"
      : `Asistencia: ${c.asistenciaPct}%${c.dispensada ? " (con dispensa)" : ""}`;

  const tabla =
    c.evaluaciones.length === 0
      ? c.modulos
        ? ""
        : '<p class="vacio">Sin evaluaciones cargadas.</p>'
      : `<table>
  <thead><tr><th>Evaluación</th><th>Tipo</th><th class="num">Resultado</th></tr></thead>
  <tbody>
${c.evaluaciones
  .map(
    (e) =>
      `    <tr><td>${escapeHtml(e.nombre)}</td><td>${e.obligatoria ? "Obligatoria" : "Opcional"}</td><td class="num">${escapeHtml(resultado(e))}</td></tr>`
  )
  .join("\n")}
  </tbody>
</table>`;

  const modulos = c.modulos
    ? `<div class="modulos">${c.modulos.map((m) => bloqueDeCursada(m, true)).join("\n")}</div>`
    : "";

  return `<section class="${modulo ? "cursada modulo" : "cursada"}">
  <div class="cabecera">
    <div>
      <h${modulo ? 3 : 2}>${escapeHtml(c.curso)}</h${modulo ? 3 : 2}>
      <p class="sub">${escapeHtml(c.cohorte)} · ${escapeHtml(periodo(c))}</p>
    </div>
    <p class="estado estado-${c.estado}">${textoDeEstado(c)}</p>
  </div>
  ${asistencia ? `<p class="sub">${escapeHtml(asistencia)}</p>` : ""}
  ${tabla}
  ${modulos}
</section>`;
}

/**
 * El documento A4 vertical. Mismo patrón que el certificado: HTML para
 * "Imprimir → Guardar como PDF" del navegador, sin generadores externos
 * (constitución II). Todo texto interpolado pasa por `escapeHtml`.
 *
 * Los colores van escritos: es papel, no pantalla, y no sigue el tema.
 */
export function renderEscolaridadHtml(e: Escolaridad, tz: string): string {
  const emitida = new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: tz,
  }).format(e.emitidaEl);

  const cuerpo =
    e.cursadas.length === 0
      ? '<p class="vacio">Todavía no tenés cursadas registradas.</p>'
      : e.cursadas.map((c) => bloqueDeCursada(c)).join("\n");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Escolaridad — ${escapeHtml(e.alumno.nombre)}</title>
<style>
  @page { size: A4 portrait; margin: 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1a1a1a; background: #fff; font-size: 10.5pt; }
  header.doc { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 0.4mm solid #18181b; padding-bottom: 4mm; margin-bottom: 6mm; }
  .academia { font-size: 9pt; letter-spacing: 1.5px; text-transform: uppercase; margin: 0; color: #52525b; }
  h1 { font-size: 18pt; margin: 1mm 0 0; }
  .emitida { font-size: 9pt; color: #52525b; margin: 0; text-align: right; }
  .alumno { margin: 0 0 6mm; }
  .alumno strong { font-size: 13pt; }
  .cursada { break-inside: avoid; border: 0.3mm solid #d4d4d8; border-radius: 2mm; padding: 4mm 5mm; margin-bottom: 4mm; }
  .modulo { border-style: dashed; margin: 3mm 0 0; }
  .modulos { margin-top: 2mm; }
  .cabecera { display: flex; justify-content: space-between; gap: 4mm; align-items: flex-start; }
  h2 { font-size: 12pt; margin: 0; }
  h3 { font-size: 10.5pt; margin: 0; }
  .sub { margin: 1mm 0 0; color: #52525b; font-size: 9pt; }
  .estado { margin: 0; font-weight: 600; white-space: nowrap; }
  .estado-aprobado { color: #166534; }
  .estado-reprobado { color: #991b1b; }
  .estado-pendiente, .estado-sin_datos { color: #52525b; }
  table { width: 100%; border-collapse: collapse; margin-top: 3mm; font-size: 9.5pt; }
  th, td { text-align: left; padding: 1.2mm 1.5mm; border-bottom: 0.2mm solid #e4e4e7; }
  th { font-weight: 600; color: #52525b; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.4px; }
  .num { text-align: right; white-space: nowrap; }
  .vacio { color: #71717a; font-style: italic; margin: 3mm 0 0; }
  footer.doc { margin-top: 8mm; padding-top: 3mm; border-top: 0.2mm solid #d4d4d8; font-size: 8.5pt; color: #52525b; }
  .noprint { text-align: center; padding: 6mm; font-size: 9pt; color: #71717a; }
  @media print { .noprint { display: none; } }
</style></head><body>
<header class="doc">
  <div>
    <p class="academia">${escapeHtml(e.academia)}</p>
    <h1>Escolaridad</h1>
  </div>
  <p class="emitida">Emitida el ${escapeHtml(emitida)}</p>
</header>
<p class="alumno"><strong>${escapeHtml(e.alumno.nombre)}</strong>${
    e.alumno.documento ? ` · Documento ${escapeHtml(e.alumno.documento)}` : ""
  }</p>
${cuerpo}
<footer class="doc">Documento informativo emitido por ${escapeHtml(e.academia)}. No reemplaza al certificado.</footer>
<p class="noprint">Usá Imprimir → Guardar como PDF para descargarla. Elegí A4 vertical y desactivá encabezados y pies de página.</p>
</body></html>`;
}
