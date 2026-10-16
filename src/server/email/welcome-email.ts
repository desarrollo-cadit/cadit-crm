import { etiquetaDeModulo, modulosConOrdinal } from "@/lib/program-order";
import { escapeHtml } from "@/lib/utils";
import { markSafeHtml, renderTemplate } from "@/server/email/templates";

/**
 * 036 — El correo de bienvenida a una cohorte, rehecho según el diseño que
 * aprobó el dueño (dos versiones: curso común y especialización).
 *
 * Este módulo es PURO: no lee la base. `enrollment-emails.ts` averigua los
 * hechos y acá se decide todo lo demás —qué filas aparecen, cómo se nombran
 * las licencias, en qué orden van los módulos y a quién se copia—.
 *
 * La regla madre: **un dato que falta omite su fila.** El correo de antes
 * decía "a confirmar" y "sin aula asignada", y en una especialización (donde
 * el docente y la modalidad son de cada módulo) salía lleno de huecos. Un
 * correo que no sabe algo no lo menciona.
 */

export type PersonaDeContacto = { name: string; email: string | null };

export type ModuloDeBienvenida = {
  id: string;
  position: number | null;
  startDate: Date;
  nombre: string;
};

export type HechosDeBienvenida = {
  /** Nombre de pila del alumno. */
  nombre: string;
  /** Para no copiarlo nunca a sí mismo. */
  correoDelAlumno: string | null;
  /** El título del correo. */
  curso: string;
  /** El nombre de la camada (en la especialización va en el saludo). */
  camada: string | null;
  esEspecializacion: boolean;
  inicio: Date;
  fin: Date | null;
  /** Texto libre de la cohorte ("martes y jueves de 10:00 a 12:00"). */
  horario: string | null;
  /** Ver `cantidadDeClases`. */
  clases: number | null;
  /** Ya rotulada ("Online en vivo"). */
  modalidad: string | null;
  docente: PersonaDeContacto | null;
  soporte: PersonaDeContacto[];
  coordinacion: PersonaDeContacto[];
  /** Lo que la cohorte declara usar (`cohort_software`). */
  softwareDeLaCohorte: string[];
  /** Lo que esta inscripción ya tiene asignado. */
  licenciasAsignadas: string[];
  /** Solo en la especialización. */
  modulos: ModuloDeBienvenida[];
  grupoWhatsapp: string;
};

export type FilaDeFicha = { etiqueta: string; valor: string; destacado: boolean };
type PersonaConCorreo = { name: string; email: string };

export type VistaDeBienvenida = {
  tipo: "curso" | "especializacion";
  titulo: string;
  nombre: string;
  camada: string | null;
  ficha: FilaDeFicha[];
  modulos: { rotulo: string; desde: string }[];
  equipo: { rol: string; personas: PersonaConCorreo[] }[];
  licencias: string[];
  grupoWhatsapp: string;
};

/* ============================================================
 * Fechas
 * ============================================================ */

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/*
  En UTC y armado a mano: las fechas de cohorte son la medianoche UTC del día
  (como `buildClassSchedule`), y `toLocaleDateString` cambia de forma entre
  versiones de ICU ("martes, 20 de octubre" vs "martes 20 de octubre").
*/
function diaYMes(d: Date): string {
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

/** "martes 20 de octubre". */
export function fechaConDia(d: Date): string {
  return `${DIAS[d.getUTCDay()]} ${diaYMes(d)}`;
}

/* ============================================================
 * Hechos → vista
 * ============================================================ */

/**
 * Cuántas clases tiene la cursada.
 *
 * Con cronograma generado, las reales sin las canceladas. Sin cronograma, lo
 * que daría el plan (`buildClassSchedule`), si se puede calcular. Cero o nada
 * que contar = `null`, y la fila no aparece: "0 clases" sería una afirmación
 * falsa sobre una cohorte que simplemente no tiene el cronograma cargado.
 */
export function cantidadDeClases(
  reales: readonly { canceled: boolean }[],
  planificadas: number | null
): number | null {
  const n = reales.length > 0 ? reales.filter((c) => !c.canceled).length : (planificadas ?? 0);
  return n > 0 ? n : null;
}

function conCorreo(personas: readonly (PersonaDeContacto | null)[]): PersonaConCorreo[] {
  return personas.flatMap((p) => {
    const email = p?.email?.trim();
    return p && email ? [{ name: p.name, email }] : [];
  });
}

function sinRepetir(nombres: readonly string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const n of nombres) {
    const t = n.trim();
    if (!t || vistos.has(t.toLowerCase())) continue;
    vistos.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

export function armarBienvenida(h: HechosDeBienvenida): VistaDeBienvenida {
  const ficha: FilaDeFicha[] = [];
  const fila = (etiqueta: string, valor: string | null, destacado = false) => {
    if (valor?.trim()) ficha.push({ etiqueta, valor: valor.trim(), destacado });
  };

  const modulos = h.esEspecializacion
    ? modulosConOrdinal(h.modulos).map((m) => ({
        rotulo: etiquetaDeModulo(m.ordinal, m.nombre),
        desde: `desde el ${diaYMes(m.startDate)}`,
      }))
    : [];

  fila("Inicio", fechaConDia(h.inicio), true);
  if (h.esEspecializacion) {
    // Horario, docente y modalidad son de cada módulo: el programa no los tiene.
    fila("Finalización", h.fin ? fechaConDia(h.fin) : null, true);
    fila("Módulos", modulos.length > 0 ? String(modulos.length) : null);
  } else {
    fila("Días y horario", h.horario);
    fila("Clases", h.clases ? String(h.clases) : null);
    fila("Finalización", h.fin ? fechaConDia(h.fin) : null, true);
    fila("Modalidad", h.modalidad);
  }

  const equipo = [
    { rol: "Docente", personas: h.esEspecializacion ? [] : conCorreo([h.docente]) },
    { rol: "Soporte técnico", personas: conCorreo(h.soporte) },
    { rol: "Coordinación", personas: conCorreo(h.coordinacion) },
  ].filter((r) => r.personas.length > 0);

  return {
    tipo: h.esEspecializacion ? "especializacion" : "curso",
    titulo: h.curso,
    nombre: h.nombre,
    camada: h.camada?.trim() || null,
    ficha,
    modulos,
    equipo,
    licencias: sinRepetir([...h.softwareDeLaCohorte, ...h.licenciasAsignadas]),
    grupoWhatsapp: h.grupoWhatsapp,
  };
}

/**
 * A quién va en copia: el docente (solo en un curso común: en una
 * especialización es de cada módulo) y el soporte técnico. Coordinación no:
 * se la nombra en el correo, pero no recibe una copia por alumno.
 *
 * Sin correo no se copia, no se repite, y NUNCA va el alumno —que ya es el
 * destinatario—.
 */
export function copiaDeBienvenida(h: HechosDeBienvenida): string[] {
  const alumno = h.correoDelAlumno?.trim().toLowerCase() ?? null;
  const vistos = new Set<string>();
  const out: string[] = [];
  const candidatos = conCorreo([...(h.esEspecializacion ? [] : [h.docente]), ...h.soporte]);
  for (const { email } of candidatos) {
    const llave = email.toLowerCase();
    if (llave === alumno || vistos.has(llave)) continue;
    vistos.add(llave);
    out.push(email);
  }
  return out;
}

/* ============================================================
 * El equipo elegido en Configuración
 * ============================================================ */

/** Lo que se guarda en `organization.metadata.equipoBienvenida`: ids de `user`. */
export type EquipoGuardado = { soporte: string[]; coordinacion: string[] };

/** Lee lo guardado sin confiar en su forma: metadata es JSON libre. */
export function normalizarEquipoGuardado(raw: unknown): EquipoGuardado {
  const lista = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : [];
  const o = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return { soporte: lista(o.soporte), coordinacion: lista(o.coordinacion) };
}

/**
 * Resuelve los ids guardados contra el equipo de HOY, en el orden elegido.
 * Quien dejó el equipo desaparece solo: el correo no puede invitar a
 * escribirle a alguien que ya no está.
 */
export function equipoDeBienvenida(
  guardado: EquipoGuardado,
  miembros: readonly { userId: string; name: string; email: string | null }[]
): { soporte: PersonaDeContacto[]; coordinacion: PersonaDeContacto[] } {
  const porId = new Map(miembros.map((m) => [m.userId, m]));
  const resolver = (ids: string[]) =>
    ids.flatMap((id) => {
      const m = porId.get(id);
      return m ? [{ name: m.name, email: m.email }] : [];
    });
  return { soporte: resolver(guardado.soporte), coordinacion: resolver(guardado.coordinacion) };
}

/* ============================================================
 * Render
 * ============================================================
 * Mismas reglas que la plantilla: tablas, CSS en línea, sin clases. Cada
 * valor que viene de la base pasa por `escapeHtml` ANTES de `markSafeHtml`:
 * los bloques `{{{x}}}` se insertan sin escapar.
 */

const FUENTE = "font-family:Arial,Helvetica,sans-serif;";
const TABLA =
  'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;border:1px solid #e4e4e7;border-radius:6px;"';
const SUAVE = "background-color:#fafafa;";

function titulo(texto: string): string {
  return `<p style="margin:26px 0 10px;${FUENTE}font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#71717a;font-weight:bold;">${escapeHtml(texto)}</p>`;
}

function tablaDeFilas(filas: { etiqueta: string; html: string; destacado?: boolean }[]): string {
  const trs = filas
    .map((f, i) => {
      const fondo = i % 2 === 1 ? SUAVE : "";
      const peso = f.destacado ? "font-weight:bold;" : "";
      return `<tr><td style="padding:8px 16px;${FUENTE}font-size:14px;color:#71717a;width:130px;vertical-align:top;${fondo}">${escapeHtml(f.etiqueta)}</td><td style="padding:8px 16px;${FUENTE}font-size:14px;color:#18181b;vertical-align:top;${fondo}${peso}">${f.html}</td></tr>`;
    })
    .join("");
  return `<table ${TABLA}>${trs}</table>`;
}

function negritas(nombres: readonly string[]): string {
  const b = nombres.map((n) => `<b style="font-weight:bold;">${escapeHtml(n)}</b>`);
  if (b.length <= 1) return b.join("");
  return `${b.slice(0, -1).join(", ")} y ${b[b.length - 1]}`;
}

function bloqueSaludo(v: VistaDeBienvenida): string {
  const nombre = escapeHtml(v.nombre);
  if (v.tipo === "curso") {
    return `<p style="margin:0 0 18px;">Hola ${nombre}, ya está confirmada tu inscripción. Estos son los datos de la cursada.</p>`;
  }
  const camada = v.camada ? ` <b style="font-weight:bold;">${escapeHtml(v.camada)}</b>` : "";
  return `<p style="margin:0 0 18px;">Hola ${nombre}, ya está confirmada tu inscripción a la especialización${camada}. Estos son los datos del programa.</p>`;
}

function bloqueFicha(v: VistaDeBienvenida): string {
  let html = "";
  if (v.ficha.length > 0) {
    html += titulo(v.tipo === "curso" ? "Agenda" : "El programa");
    html += tablaDeFilas(
      v.ficha.map((f) => ({ etiqueta: f.etiqueta, html: escapeHtml(f.valor), destacado: f.destacado }))
    );
  }
  if (v.modulos.length > 0) {
    html += titulo("Módulos");
    const trs = v.modulos
      .map((m, i) => {
        const borde = i > 0 ? "border-top:1px solid #e4e4e7;" : "";
        return `<tr><td style="padding:8px 16px;${FUENTE}font-size:14px;color:#18181b;${borde}">${escapeHtml(m.rotulo)}</td><td align="right" style="padding:8px 16px;${FUENTE}font-size:14px;color:#71717a;white-space:nowrap;text-align:right;${borde}">${escapeHtml(m.desde)}</td></tr>`;
      })
      .join("");
    html += `<table ${TABLA}>${trs}</table>`;
    html += `<p style="margin:0 0 6px;${FUENTE}font-size:12px;line-height:18px;color:#71717a;">Cada módulo tiene su propio cronograma, docente y modalidad. Los vas a ver en tu Campus a medida que se acerquen.</p>`;
  }
  return html;
}

function bloqueEquipo(v: VistaDeBienvenida, academia: string, acento: string): string {
  if (v.equipo.length === 0) return "";
  const enlace = (email: string) =>
    `<a href="mailto:${escapeHtml(email)}" style="color:${escapeHtml(acento)};font-weight:bold;text-decoration:underline;">Escribirle</a>`;
  return (
    titulo(`Equipo ${academia}`) +
    tablaDeFilas(
      v.equipo.map((r) => ({
        etiqueta: r.rol,
        html: r.personas.map((p) => `${escapeHtml(p.name)} · ${enlace(p.email)}`).join("<br />"),
      }))
    )
  );
}

function bloqueCampus(v: VistaDeBienvenida): string {
  const texto =
    v.tipo === "curso"
      ? 'En tu Campus vas a encontrar el enlace para entrar a cada clase en vivo, las <b style="font-weight:bold;">grabaciones</b> (disponibles al día siguiente de cada clase), los materiales y tu asistencia. El acceso te llega en un correo aparte.'
      : 'En tu Campus vas a encontrar cada módulo con sus clases, el enlace para entrar en vivo, las <b style="font-weight:bold;">grabaciones</b>, los materiales y tu avance. El acceso te llega en un correo aparte.';
  return `<p style="margin:0 0 18px;">${texto}</p>`;
}

function bloqueLicencias(v: VistaDeBienvenida): string {
  if (v.licencias.length === 0) return "";
  const una = v.licencias.length === 1;
  const que = una ? "una licencia de" : "licencias de";
  const propia = una ? "si no contás con una propia." : "si no contás con licencias propias.";
  const parrafos =
    v.tipo === "curso"
      ? [
          `Durante el curso te asignamos ${que} ${negritas(v.licencias)} registrando tu correo personal, ${propia}`,
          "Para la instalación o cualquier consulta, escribile directamente al equipo de soporte.",
        ]
      : [
          `Para la especialización te asignamos ${que} ${negritas(v.licencias)} registrando tu correo personal, ${propia}`,
          "Algunos módulos pueden sumar licencias propias; te avisamos al empezar cada uno.",
        ];
  const ps = parrafos
    .map((p, i) => `<p style="margin:${i === parrafos.length - 1 ? "0" : "0 0 8px"};">${p}</p>`)
    .join("");
  return (
    titulo("Licencias de software") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;"><tr><td style="padding:14px 16px;border:1px solid #e4e4e7;border-radius:6px;${SUAVE}${FUENTE}font-size:14px;line-height:22px;color:#27272a;">${ps}</td></tr></table>`
  );
}

/**
 * 036 — El nombre tal como entra en una frase ("por tu inscripción en …", "Te
 * damos la bienvenida a …"): la especialización lleva artículo; un curso se
 * nombra solo.
 */
export function nombreEnFrase(v: Pick<VistaDeBienvenida, "tipo" | "titulo">): string {
  if (v.tipo !== "especializacion" || /^la\s/i.test(v.titulo)) return v.titulo;
  return `la ${v.titulo}`;
}

export function renderBienvenida(
  v: VistaDeBienvenida,
  marca: { academia: string; acento: string; logoUrl: string }
): string {
  return renderTemplate(
    "bienvenida-cohorte",
    {
      curso: v.titulo,
      cursoEnFrase: nombreEnFrase(v),
      tituloComunidad:
        v.tipo === "curso" ? "Comunidad del curso" : "Comunidad de la especialización",
      grupoWhatsapp: v.grupoWhatsapp,
      academia: marca.academia,
      acento: marca.acento,
      logoUrl: marca.logoUrl,
    },
    {
      saludo: markSafeHtml(bloqueSaludo(v)),
      ficha: markSafeHtml(bloqueFicha(v)),
      equipo: markSafeHtml(bloqueEquipo(v, marca.academia, marca.acento)),
      campus: markSafeHtml(bloqueCampus(v)),
      licencias: markSafeHtml(bloqueLicencias(v)),
    }
  );
}
