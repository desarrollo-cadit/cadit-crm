import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { onAfterCommit } from "@/lib/db/tenant-context";
import {
  claveDeInteresado,
  sujetoDeInteresado,
  type InteresadoNuevo,
  type InteresDelInteresado,
} from "@/lib/lead-notices";
import { claveDeAviso, columnasDelSujeto } from "@/lib/staff-notices";

/**
 * La puerta por la que un formulario PÚBLICO avisa que llegó un interesado.
 * Mismo diseño que `avisarAAdministracion` (`billing-notices-queue.ts`):
 *
 * 1. **Encolar dentro de la transacción del envío del formulario**: si el
 *    alta revierte, el aviso desaparece con ella; si confirma, queda
 *    registrado aunque el proceso se caiga un instante después (la periódica
 *    lo recupera).
 * 2. **Mandar DESPUÉS del commit** (`onAfterCommit`), sin esperar: el correo
 *    nunca demora ni rompe la respuesta al navegador.
 *
 * El encolado corre en un SAVEPOINT y no lanza: un aviso que no se pudo
 * encolar se pierde (y se registra en el log), pero el interesado queda en el
 * CRM igual. Perder el lead por culpa del aviso sería peor que perder el aviso.
 *
 * Liviano a propósito (no importa nada de `src/server`): lo importan
 * `intake-forms.ts` y `workshops.ts`, y el envío se carga con import dinámico.
 */

export type EnvioDeFormulario = {
  contactId: string;
  contactoNuevo: boolean;
  /** Qué le interesa, para la llave: `curso:<id>`, `form:<id>` o `taller:<cohortId>`. */
  ref: string;
  datos: {
    name: string;
    lastName?: string | null;
    phone: string | null;
    email?: string | null;
    notes?: string | null;
    /** Solo talleres: la empresa que escribió en el formulario. */
    company?: string | null;
  };
  /** El `source` de la captación ("formulario:<nombre>"). */
  origen: string;
  interes: InteresDelInteresado;
  /** Solo talleres: "anotado" o el motivo del rechazo. */
  resultado?: string | null;
  now?: Date;
};

export async function avisarInteresadoNuevo(organizationId: string, envio: EnvioDeFormulario): Promise<void> {
  const now = envio.now ?? new Date();
  const sujeto = sujetoDeInteresado(
    envio.contactId,
    claveDeInteresado({ contactId: envio.contactId, ref: envio.ref, recibidoEn: now })
  );
  const payload: InteresadoNuevo = {
    contactId: envio.contactId,
    nombre: envio.datos.name,
    apellido: envio.datos.lastName ?? null,
    telefono: envio.datos.phone,
    email: envio.datos.email ?? null,
    mensaje: envio.datos.notes ?? null,
    empresa: envio.datos.company ?? null,
    interes: envio.interes,
    origen: envio.origen,
    contactoNuevo: envio.contactoNuevo,
    recibidoEn: now.toISOString(),
    resultado: envio.resultado ?? null,
  };

  try {
    await getDb().transaction(async (sp) => {
      await sp
        .insert(schema.staffNotice)
        .values({
          id: newId("staffNotice"),
          organizationId,
          ...columnasDelSujeto(sujeto),
          dedupKey: claveDeAviso(sujeto),
          kind: sujeto.kind,
          status: "pending",
          attempts: 0,
          claimedAt: null,
          payload,
        })
        .onConflictDoNothing();
    });
  } catch (err) {
    console.error(`[avisos] interesado ${envio.contactId}: no se pudo encolar (${err instanceof Error ? err.name : "error"})`);
    return;
  }

  onAfterCommit(() => {
    void import("@/server/lead-notices")
      .then((m) => m.enviarAvisoDeInteresado(organizationId, sujeto))
      .catch((err: unknown) => {
        console.error(`[avisos] interesado: no se pudo intentar (${err instanceof Error ? err.name : "error"})`);
      });
  });
}
