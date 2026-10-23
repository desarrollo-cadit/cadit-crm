/**
 * 046 US6 (FR-014) — Un lector de CSV mínimo y propio (RFC 4180): comas,
 * comillas dobles (con `""` para una comilla), saltos de línea dentro de
 * comillas, CRLF y el BOM de Excel. Sin dependencias nuevas (constitución II).
 *
 * Puro: recibe el texto y devuelve las filas como listas de celdas, sin
 * recortar nada (cada uso decide).
 */
export function leerCsv(texto: string): string[][] {
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entreComillas = false;

  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (entreComillas) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          celda += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        celda += ch;
      }
      continue;
    }
    if (ch === '"') {
      entreComillas = true;
    } else if (ch === ",") {
      fila.push(celda);
      celda = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else {
      celda += ch;
    }
  }
  // La última fila sin salto final; una línea vacía al final no es una fila.
  if (celda !== "" || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}
