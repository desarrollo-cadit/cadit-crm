import { wallClockInZone } from "@/lib/schedule-time";
import { documento, e, tabla, type SujetoDeAviso } from "@/lib/staff-notices";
import { fechaDeRecordatorio, hoyEnZona } from "@/lib/recordatorios";

/**
 * El correo del día de un recordatorio de seguimiento — reglas puras (sin base
 * ni correo). Sale a las 08:00 de la zona de la organización del día que vence
 * y SOLO a quien lo creó. Mismo motor que los demás avisos internos
 * (`staff_notice`, `src/server/recordatorios-aviso.ts`): una llave por
 * recordatorio y día, reclamada antes de mandar.
 */

export const HORA_DEL_AVISO = "08:00";

/** `<id del recordatorio>:<YYYY-MM-DD>`: el día va en la llave, así mover la fecha reabre el aviso. */
export function sujetoDeRecordatorio(
  contactId: string,
  recordatorioId: string,
  dueDate: string
): Extract<SujetoDeAviso, { kind: "recordatorio_contacto" }> {
  return { kind: "recordatorio_contacto", contactId, recordatorio: `${recordatorioId}:${dueDate}` };
}

/** La inversa: el id del recordatorio dentro de la llave del sujeto. */
export function recordatorioIdDe(sujeto: { recordatorio: string }): string | null {
  const i = sujeto.recordatorio.lastIndexOf(":");
  return i > 0 ? sujeto.recordatorio.slice(0, i) : null;
}

export type RecordatorioParaAvisar = {
  dueDate: string;
  doneAt: Date | null;
  createdAt: Date;
};

/**
 * ¿Toca mandar el correo AHORA? Solo el día que vence, desde las 08:00 de la
 * zona de la organización (un servidor apagado a las 8 se pone al día durante
 * el día), mientras siga pendiente. Si lo agendó el mismo día que vence, ya
 * pasadas las 08:00, no se manda: quien lo acaba de crear no necesita el aviso.
 */
export function recordatorioQueToca(r: RecordatorioParaAvisar, now: Date, timeZone: string): boolean {
  if (r.doneAt) return false;
  if (r.dueDate !== hoyEnZona(now, timeZone)) return false;
  const ahora = wallClockInZone(now, timeZone);
  if (!ahora || ahora.hora < HORA_DEL_AVISO) return false;
  const creado = wallClockInZone(r.createdAt, timeZone);
  if (creado && creado.fecha === r.dueDate && creado.hora >= HORA_DEL_AVISO) return false;
  return true;
}

export type DatosDelAvisoDeRecordatorio = {
  contacto: string;
  contactId: string;
  motivo: string;
  dueDate: string;
  baseUrl: string;
};

export function armarAvisoRecordatorio(d: DatosDelAvisoDeRecordatorio): { subject: string; html: string } {
  const quien = d.contacto.trim() || "Sin nombre";
  const subject = `Recordatorio para hoy: ${quien}`;
  const enlace = `${d.baseUrl.replace(/\/+$/, "")}/contacts/${encodeURIComponent(d.contactId)}/legajo?tab=seguimiento`;
  const filas: [string, string][] = [
    ["Contacto", e(quien)],
    ["Motivo", e(d.motivo.trim()).replace(/\r?\n/g, "<br>")],
    ["Fecha", e(fechaDeRecordatorio(d.dueDate))],
  ];
  const html = documento(
    `Recordatorio para hoy: ${quien}`,
    `<p>Agendaste este recordatorio de seguimiento para hoy.</p>` +
      tabla(
        ["Dato", "Valor"],
        filas.map(([k, v]) => [e(k), v])
      ) +
      `<p style="margin-top:16px;"><a href="${e(enlace)}">Abrir el seguimiento en el CRM</a><br>` +
      `<span style="font-size:12px;color:#6b7280;">${e(enlace)}</span></p>`
  );
  return { subject, html };
}
