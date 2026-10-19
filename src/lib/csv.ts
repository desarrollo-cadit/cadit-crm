/**
 * Una celda de CSV, segura para abrir en una planilla.
 *
 * Vivía en `src/server/enrollments.ts`; 042 la mudó acá porque el export de
 * Facturación se arma en el NAVEGADOR (con la misma lista filtrada que se ve)
 * y un componente cliente no puede importar un módulo de servidor. Una sola
 * copia de la protección: dos se separan, y la que se separa es la que nadie
 * mira. `server/enrollments.ts` la re-exporta para sus llamadores.
 */
export function csvField(value: string | null): string {
  let v = value ?? "";
  // Anti inyección de fórmulas: Excel/Sheets ejecutan una celda que arranca con
  // = + - @ (o tab/CR, que algunos parsers descartan antes de mirar el resto).
  // El nombre puede venir de un formulario público SIN autenticar, así que un
  // `=HYPERLINK(...)` o un `=cmd|...` llegaría hasta la máquina de quien abre
  // el export. El apóstrofo inicial hace que la planilla lo trate como texto.
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  // RFC 4180: entrecomillar si tiene coma, comilla o salto de línea; comillas escapadas duplicándolas.
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
