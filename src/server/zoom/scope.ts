import { currentTenantScope } from "@/lib/db/tenant-context";
import { withOrganizationScope } from "@/lib/db/with-tenant";

/**
 * 030 — Corre `fn` dentro del alcance de la organización.
 *
 * La sincronización corre FUERA de todo pedido (después del commit, o desde
 * el temporizador): cada escritura abre su propia transacción corta con
 * `app.current_org`, para que RLS filtre y para no sostener una transacción
 * durante el HTTP a Zoom. Si ya hay un alcance abierto de ESA organización
 * (el pedido que dispara la corrida), se reusa: abrir otra transacción ahí
 * no vería lo que el pedido todavía no confirmó.
 */
export function inOrgScope<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  if (currentTenantScope()?.organizationId === organizationId) return fn();
  return withOrganizationScope(organizationId, "system:zoom-sync", fn);
}
