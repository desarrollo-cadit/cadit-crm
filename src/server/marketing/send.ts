import { sendMail, type SendMailResult } from "@/lib/m365/client";

/**
 * 045 (DV-004; FR-016) — El ÚNICO llamador de `sendMail` que pasa `sender`.
 *
 * Constitución 1.8.0 II.a: las campañas salen de un buzón de marketing
 * SEPARADO del de los correos operativos (`M365_SENDER`), por el mismo
 * adaptador. `tests/unit/marketing-guard.test.ts` fija que nadie más elija
 * remitente.
 */
export async function enviarCorreoDeMarketing(input: {
  sender: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
}): Promise<SendMailResult> {
  return sendMail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    sender: input.sender,
    fromName: input.fromName,
  });
}
