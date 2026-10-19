import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { onAfterCommit } from "@/lib/db/tenant-context";
import { claveDeAviso, columnasDelSujeto, type SujetoDeAviso } from "@/lib/staff-notices";

/**
 * 041 — La puerta por la que el alta de una venta y el registro de un pago
 * le avisan a Administración.
 *
 * Dos pasos, a propósito:
 *
 * 1. **Encolar dentro de la transacción del pedido** (`encolarAviso`): si el
 *    alta o el pago revierten, el aviso desaparece con ellos; si confirman, el
 *    aviso queda registrado aunque el proceso se caiga un instante después.
 * 2. **Mandar DESPUÉS del commit** (`onAfterCommit`): una tarea suelta no ve
 *    las filas que la transacción que la disparó acaba de crear. Un fallo del
 *    correo nunca deshace el alta ni el pago: queda `failed` y lo reintenta la
 *    periódica.
 *
 * Vive aparte de `billing-notices.ts` para no cerrar un ciclo de imports
 * (`billing.ts` → acá → `billing-notices.ts` → `billing.ts`): no importa
 * ningún módulo de `src/server`, y el envío se carga con import dinámico.
 */

/**
 * 041 — ENCOLA un aviso dentro de la transacción que lo origina (el alta, el
 * pago): `pending`, 0 intentos, sin reclamo. Si esa transacción revierte, el
 * aviso desaparece con ella; si confirma y el proceso se cae antes de mandar,
 * la periódica lo encuentra. Ya encolado (misma llave) → no hace nada.
 */
async function encolarAviso(organizationId: string, sujeto: SujetoDeAviso): Promise<void> {
  await getDb()
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
    })
    .onConflictDoNothing();
}

type SujetoDeEvento = Extract<SujetoDeAviso, { kind: "inscripcion_nueva" | "pago_registrado" }>;

export async function avisarAAdministracion(organizationId: string, sujeto: SujetoDeEvento): Promise<void> {
  await encolarAviso(organizationId, sujeto);
  onAfterCommit(() => {
    void import("@/server/billing-notices")
      .then((m) => m.enviarAvisoDeCobranza(organizationId, sujeto))
      .catch(() => {});
  });
}
