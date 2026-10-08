import { escapeHtml } from "@/lib/utils";
import { sendMail, type SendMailResult } from "@/lib/m365/client";
import {
  AREA_LABELS,
  COLLECTED_FIELDS,
  COLLECTED_FIELD_LABELS,
  type Area,
  type Collected,
  type HandoffEmailKind,
  type HandoffRecipients,
} from "@/lib/areas";
import { markSafeHtml, renderTemplate, type SafeHtml } from "@/server/email/templates";

/**
 * 029 — El correo de derivación a un área (`contracts/correo-derivacion.md`).
 *
 * Este es el ÚNICO archivo de `src/server/areas/` que llama a `sendMail`
 * (`tests/unit/areas-sandbox.test.ts`), y `sendHandoffEmail` solo lo invoca
 * la tarea post-commit de `handoff.ts`, que nunca corre para `is_test`.
 *
 * Todo lo que escribe el cliente es entrada hostil: cada celda se escapa en
 * `htmlRows()`, la única fábrica de `SafeHtml`.
 */

const SUBJECT_SUMMARY_MAX = 80;

/** Sin saltos ni caracteres de control: el asunto se ve en clientes de correo. */
function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Apertura: `[<Área>] <resumen> — <nombre> (<empresa>)`. */
export function buildHandoffSubject(input: {
  area: Area;
  summary: string;
  collected: Collected;
  contactName: string;
}): string {
  const summary = truncate(oneLine(input.summary), SUBJECT_SUMMARY_MAX);
  const name =
    oneLine(input.collected.name ?? "") || oneLine(input.contactName) || "Contacto de WhatsApp";
  const company = oneLine(input.collected.company ?? "");
  return oneLine(
    `[${AREA_LABELS[input.area]}] ${summary} — ${name}${company ? ` (${company})` : ""}`
  );
}

const CELL = "padding:4px 8px 4px 0;vertical-align:top;";

/**
 * Filas de tabla con cada celda ESCAPADA. Es la única fuente de `SafeHtml`
 * del módulo: lo que sale de acá se puede insertar con `{{{x}}}`.
 *
 * Con `heading`, envuelve las filas en una sección propia (`<tr>` de la tabla
 * principal) con ese título — así una sección opcional, como «Qué hay de
 * nuevo», no deja un título huérfano cuando no aplica.
 */
export function htmlRows(rows: string[][], opts: { heading?: string } = {}): SafeHtml {
  const body = rows
    .map(
      (cells) =>
        `<tr>${cells.map((c, i) => `<td style="${CELL}${i === 0 && cells.length > 1 ? "color:#52525b;white-space:nowrap;" : ""}">${escapeHtml(c)}</td>`).join("")}</tr>`
    )
    .join("");
  if (!opts.heading) return markSafeHtml(body);
  return markSafeHtml(
    `<tr><td style="padding:16px 28px 0;"><h2 style="margin:0 0 6px;font-size:15px;color:#001b5e;">${escapeHtml(opts.heading)}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;">${body}</table></td></tr>`
  );
}

export type TranscriptLine = {
  direction: "in" | "out";
  origin: "ai" | "operator" | "manual" | "template";
  type: string;
  text: string | null;
  at: Date;
};

export type HandoffEmailInput = {
  kind: HandoffEmailKind;
  area: Area;
  caseRef: string;
  /** Asunto de APERTURA del caso (el seguimiento le antepone `RE: `). */
  subject: string;
  summary: string;
  collected: Collected;
  collectedDelta: Collected;
  missing: string[];
  replyTo: string | null;
  contact: {
    firstName: string;
    lastName: string | null;
    phone: string | null;
    waIdentity: string;
  };
  organizationName: string;
  timeZone: string;
  createdAt: Date;
  transcript: TranscriptLine[];
};

const TRANSCRIPT_MAX = 100;

const ATTACHMENT_LABELS: Record<string, string> = {
  image: "imagen",
  video: "video",
  audio: "audio",
  document: "documento",
  sticker: "sticker",
  location: "ubicación",
  contacts: "contacto",
};

function author(line: TranscriptLine): string {
  if (line.direction === "in") return "Cliente";
  return line.origin === "ai" ? "Asistente" : "Operador";
}

function lineText(line: TranscriptLine): string {
  if (line.type !== "text") {
    const label = `[adjunto: ${ATTACHMENT_LABELS[line.type] ?? line.type}]`;
    return line.text ? `${label} ${line.text}` : label;
  }
  return line.text ?? "";
}

function fieldLabel(key: string): string {
  return (COLLECTED_FIELD_LABELS as Record<string, string>)[key] ?? key;
}

function collectedRows(collected: Collected): string[][] {
  return COLLECTED_FIELDS.filter((f) => collected[f]).map((f) => [
    fieldLabel(f),
    f === "email"
      ? `${collected[f]} (declarado por el cliente, no verificado)`
      : (collected[f] as string),
  ]);
}

export function buildHandoffEmail(input: HandoffEmailInput): { subject: string; html: string } {
  const tz = input.timeZone;
  const fmtDate = new Intl.DateTimeFormat("es-UY", {
    timeZone: tz,
    dateStyle: "long",
    timeStyle: "short",
  });
  const fmtLine = new Intl.DateTimeFormat("es-UY", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const isBsuid = !input.contact.phone;
  // El correo del cliente es el Reply-To del caso aunque el modelo no lo haya
  // repetido en `collected` en este turno.
  const withEmail: Collected =
    input.replyTo && !input.collected.email
      ? { ...input.collected, email: input.replyTo }
      : input.collected;
  const dataRows = [
    ...collectedRows(withEmail),
    [
      "Teléfono de WhatsApp",
      input.contact.phone ??
        "Contacto sin número visible — responder por WhatsApp desde la academia",
    ],
  ];

  const missingLabels = input.missing.map(fieldLabel);

  const lines = [...input.transcript].sort((a, b) => a.at.getTime() - b.at.getTime());
  const omitted = Math.max(0, lines.length - TRANSCRIPT_MAX);
  const shown = lines.slice(omitted);
  const transcriptRows = [
    ...(omitted > 0 ? [[`(se omiten ${omitted} mensajes anteriores)`]] : []),
    ...shown.map((l) => [fmtLine.format(l.at), author(l), lineText(l)]),
  ];

  const deltaRows = collectedRows(input.collectedDelta);
  const novedades =
    input.kind === "seguimiento"
      ? htmlRows(deltaRows.length > 0 ? deltaRows : [["Datos que se achicaron de la lista de faltantes"]], {
          heading: "Qué hay de nuevo",
        })
      : undefined;

  const contactName = [input.contact.firstName, input.contact.lastName].filter(Boolean).join(" ");

  const html = renderTemplate(
    "derivacion-area",
    {
      area: AREA_LABELS[input.area],
      caseRef: input.caseRef,
      tipo: input.kind === "apertura" ? "Nueva consulta" : "Seguimiento",
      fecha: fmtDate.format(input.createdAt),
      resumen: input.summary,
      identidad: input.contact.waIdentity,
      nombrePerfil: contactName || "sin nombre de perfil",
      organizacion: input.organizationName,
      replyTo: input.replyTo ?? "el asistente: el cliente no dejó un correo válido",
      canal: isBsuid ? "WhatsApp desde la academia" : `WhatsApp al ${input.contact.phone}`,
    },
    {
      novedades,
      datos: htmlRows(dataRows),
      faltantes: htmlRows([[missingLabels.length > 0 ? missingLabels.join(", ") : "Ninguno"]]),
      transcripcion: htmlRows(transcriptRows),
    }
  );

  const subject = input.kind === "seguimiento" ? `RE: ${input.subject}` : input.subject;
  return { subject, html };
}

/**
 * Envía el correo del caso. Sin Bcc a propósito: `M365_BCC` es el registro
 * de los correos a ALUMNOS, y una derivación interna no va ahí.
 */
export function sendHandoffEmail(input: {
  recipients: Pick<HandoffRecipients, "to" | "cc" | "replyTo">;
  subject: string;
  html: string;
}): Promise<SendMailResult> {
  return sendMail({
    to: input.recipients.to,
    cc: input.recipients.cc,
    replyTo: input.recipients.replyTo ?? undefined,
    subject: input.subject,
    html: input.html,
  });
}
