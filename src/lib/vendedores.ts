/**
 * 2026-10-06 — Lo que ofrece el selector de vendedor de los formularios de
 * inscripción. Puro, sin base: lo usan el alta y la edición comercial.
 */

export type SellerOption = { id: string; name: string; archived: boolean };

/**
 * - Para una venta se ofrecen los vendedores ACTIVOS, por nombre.
 * - El vendedor que la venta ya tiene se conserva aunque hoy esté archivado:
 *   corregir la factura de una venta vieja no puede obligar a cambiarlo.
 * - La opción vacía ("Sin vendedor") sólo aparece donde se permite dejarlo
 *   vacío: una venta vieja que nunca lo tuvo.
 */
export function opcionesDeVendedor(
  sellers: readonly SellerOption[],
  opciones: { actual: string | null; permiteVacio: boolean }
): { id: string; label: string }[] {
  const visibles = sellers
    .filter((s) => !s.archived || s.id === opciones.actual)
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((s) => ({ id: s.id, label: s.archived ? `${s.name} (archivado)` : s.name }));
  return opciones.permiteVacio ? [{ id: "", label: "Sin vendedor" }, ...visibles] : visibles;
}
