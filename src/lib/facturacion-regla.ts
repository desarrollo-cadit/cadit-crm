/**
 * 042 — LA regla de "le falta la factura", en un módulo HOJA (sin imports).
 *
 * La usan el correo de T-7/T-2 de 039 (`sinFacturar` en `staff-notices.ts`) y
 * la pantalla de Facturación (`enLaVista` en `facturacion.ts`). Vive aparte
 * porque `facturacion.ts` importa `billing-notices.ts`, que importa
 * `staff-notices.ts`: si la regla viviera en `facturacion.ts`, el correo la
 * importaría cerrando un ciclo. Una hoja no tiene ciclos.
 */

/**
 * El número tal como se guarda: recortado. Vacío o solo espacios es BORRAR —
 * una corrección, que se permite (la factura se anuló o se cargó en la venta
 * equivocada).
 */
export function normalizarNumero(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return v ? v : null;
}

/** Un número de solo espacios cuenta como "sin factura" (039 ya lo decía). */
export function estaFacturada(invoiceNumber: string | null): boolean {
  return normalizarNumero(invoiceNumber) !== null;
}

/**
 * Inscripción madre, de un contacto activo, sin número. El correo y la
 * pantalla la comparten: si cada lado tuviera la suya, el correo diría
 * "faltan 3" y la pantalla mostraría 2, y nadie sabría cuál creer.
 */
export function pendienteDeFacturar(f: {
  deBaja: boolean;
  esHija: boolean;
  invoiceNumber: string | null;
}): boolean {
  return !f.deBaja && !f.esHija && !estaFacturada(f.invoiceNumber);
}
