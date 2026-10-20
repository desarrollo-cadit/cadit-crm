import { wallClockInZone } from "@/lib/schedule-time";
import {
  destinatariosDeArea,
  diaCorto,
  documento,
  e,
  fechaDeInicio,
  nombreDeCohorte,
  tabla,
  type Destinatarios,
  type SujetoDeAviso,
} from "@/lib/staff-notices";

/**
 * Avisos de nuevos interesados — las reglas, sin base ni correo.
 *
 * Cada vez que alguien deja sus datos en un formulario PÚBLICO (la página de
 * un curso, un formulario de campaña de /settings/forms o la inscripción a un
 * taller) sale un correo interno a quien la organización configure en
 * Ajustes › Áreas › Nuevos interesados: un interesado que entra no se olvida.
 *
 * Mismo motor que los avisos de cobranza (041): se ENCOLA en `staff_notice`
 * dentro de la transacción del envío del formulario y se manda después del
 * commit (`src/server/lead-notices.ts`). Lo que el correo dice se congela al
 * encolar (`staff_notice.payload`): el mensaje que escribió una persona que
 * ya existía en el CRM no se guarda en el contacto, y "nuevo o ya existía"
 * solo se sabe en ese momento.
 *
 * Las altas internas (a mano, importaciones, guiones) NO pasan por acá: el
 * aviso cuelga solo de las puertas públicas.
 */

export type InteresDelInteresado = {
  /** `general`: un formulario de campaña sin curso atado. */
  tipo: "curso" | "taller" | "general";
  /** Nombre del curso o del taller; `null` en `general`. */
  nombre: string | null;
  /** El nombre de la edición (cohorte) del taller, si tiene. */
  cohorte: string | null;
  /** El día de inicio de la edición (ISO, medianoche UTC, como `cohort.start_date`). */
  inicio: string | null;
  /** "19:00", la hora de pared de la edición. */
  horario: string | null;
};

/** Lo que se congela al encolar (`staff_notice.payload`). */
export type InteresadoNuevo = {
  contactId: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
  email: string | null;
  mensaje: string | null;
  interes: InteresDelInteresado;
  /** El `source` de la captación: "formulario:<nombre>". */
  origen: string;
  /** `true` si el contacto se creó con este envío; `false` si ya existía. */
  contactoNuevo: boolean;
  /** Cuándo llegó (ISO). */
  recibidoEn: string;
  /**
   * Solo talleres: "anotado" si quedó inscripto, o el motivo por el que no
   * (lleno, cerrado). El contacto queda igual: es alguien interesado.
   */
  resultado?: string | null;
};

/**
 * La parte de la llave que distingue un envío de otro de la misma persona:
 * QUÉ le interesa (`curso:<id>`, `form:<id>`, `taller:<cohortId>`) y el DÍA
 * (UTC). El mismo formulario mandado dos veces el mismo día (doble clic, un
 * reintento del navegador) es un solo aviso; otro curso u otro día, otro.
 */
export function claveDeInteresado(d: { contactId: string; ref: string; recibidoEn: Date }): string {
  return `${d.ref}:${d.recibidoEn.toISOString().slice(0, 10)}`;
}

export function sujetoDeInteresado(contactId: string, envio: string): Extract<SujetoDeAviso, { kind: "interesado_nuevo" }> {
  return { kind: "interesado_nuevo", contactId, envio };
}

/**
 * To = la casilla del área; CC = sus copias ∪ los correos de los vendedores
 * elegidos que siguen activos — sin repetidos (sin distinguir mayúsculas) ni
 * la casilla. Mismo criterio que `resolveRecipients` de las derivaciones.
 * Área sin fila, apagada o sin casilla → `null`: el aviso se omite.
 */
export function destinatariosDeInteresados(
  config: { enabled: boolean; mailbox: string | null; ccEmails: string[]; ccSellerIds: string[] } | null,
  sellers: readonly { id: string; email: string | null; archivedAt: Date | null }[]
): Destinatarios | null {
  const base = destinatariosDeArea(config);
  if (!base || !config) return null;
  const vistos = new Set([...base.to, ...base.cc].map((x) => x.toLowerCase()));
  const cc = [...base.cc];
  for (const id of config.ccSellerIds) {
    const s = sellers.find((x) => x.id === id);
    if (!s || s.archivedAt || !s.email) continue;
    const key = s.email.toLowerCase();
    if (vistos.has(key)) continue;
    vistos.add(key);
    cc.push(s.email);
  }
  return { to: base.to, cc };
}

const nombreCompleto = (d: InteresadoNuevo) => [d.nombre, d.apellido].filter(Boolean).join(" ").trim();

/** "formulario:Revit" → "Revit"; cualquier otro texto, tal cual. */
function nombreDelOrigen(origen: string): string {
  return origen.startsWith("formulario:") ? origen.slice("formulario:".length).trim() : origen.trim();
}

function queLeInteresa(i: InteresDelInteresado): string | null {
  if (!i.nombre) return null;
  return i.tipo === "taller" ? nombreDeCohorte(i.nombre, i.cohorte) : i.nombre;
}

function cuando(recibidoEn: string, timeZone: string): string {
  const pared = wallClockInZone(new Date(recibidoEn), timeZone);
  if (!pared) return recibidoEn;
  return `${diaCorto(new Date(`${pared.fecha}T00:00:00.000Z`))} ${pared.hora} (hora de ${timeZone})`;
}

export function armarAvisoInteresado(
  d: InteresadoNuevo,
  opts: { baseUrl: string; timeZone: string }
): { subject: string; html: string } {
  const quien = nombreCompleto(d) || "Sin nombre";
  const interes = queLeInteresa(d.interes);
  const subject = `Nuevo interesado: ${quien} — ${interes ?? (nombreDelOrigen(d.origen) || "Formulario")}`;

  const enlace = `${opts.baseUrl.replace(/\/+$/, "")}/contacts/${encodeURIComponent(d.contactId)}`;

  let interesHtml = interes ? e(interes) : "Sin curso indicado";
  if (d.interes.tipo === "taller") interesHtml = `Taller: ${interesHtml}`;
  if (d.interes.tipo === "taller" && d.interes.inicio) {
    interesHtml += `<br>Edición: ${e(fechaDeInicio(new Date(d.interes.inicio), d.interes.horario, opts.timeZone))}`;
  }

  const filas: [string, string][] = [
    ["Nombre", e(quien)],
    ["Teléfono", d.telefono ? e(d.telefono) : "—"],
    ["Correo", d.email ? e(d.email) : "—"],
    ["Le interesa", interesHtml],
  ];
  if (d.interes.tipo === "taller" && d.resultado) {
    filas.push([
      "Inscripción",
      d.resultado === "anotado" ? "Quedó anotado al taller." : `No quedó anotado: ${e(d.resultado)}`,
    ]);
  }
  filas.push(
    ["Mensaje", d.mensaje?.trim() ? e(d.mensaje.trim()).replace(/\r?\n/g, "<br>") : "—"],
    ["Origen", `Formulario «${e(nombreDelOrigen(d.origen))}»`],
    ["Cuándo", e(cuando(d.recibidoEn, opts.timeZone))],
    [
      "En el CRM",
      d.contactoNuevo
        ? "Contacto nuevo: se creó con este formulario."
        : "La persona ya existía en el CRM (mismo teléfono): no se creó otro contacto.",
    ]
  );

  const html = documento(
    `Nuevo interesado: ${quien}`,
    `<p>Alguien dejó sus datos en un formulario de la web.</p>` +
      tabla(
        ["Dato", "Valor"],
        filas.map(([k, v]) => [e(k), v])
      ) +
      `<p style="margin-top:16px;"><a href="${e(enlace)}">Abrir el contacto en el CRM</a><br>` +
      `<span style="font-size:12px;color:#6b7280;">${e(enlace)}</span></p>`
  );
  return { subject, html };
}
