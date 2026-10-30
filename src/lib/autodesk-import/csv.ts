import { csvField } from "@/lib/csv";
import type { CasoDeConciliacion, TipoDeTarea } from "./conciliacion";

/**
 * 0089 — Las dos listas que Soporte se lleva para trabajar en Autodesk: los
 * EXTERNOS (tienen licencia en Autodesk y no están en el campus) y lo PENDIENTE
 * en Autodesk (asignar o sacar). Se arman en el navegador con la lista que ya se
 * ve —como el export de Facturación—: no hay una ruta `text/csv` que pueda traer
 * más que la pantalla. Sin plata.
 */

const fecha = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

const ESTADO: Record<CasoDeConciliacion["estado"], string> = {
  verificado: "Verificada",
  a_resolver: "A resolver",
  resuelto: "Resuelto",
  pendiente: "Pendiente en Autodesk",
};

const TAREA: Record<TipoDeTarea, string> = {
  asignar_en_autodesk: "Asignar en Autodesk",
  sacar_en_autodesk: "Sacar en Autodesk",
};

export type ExternoParaCsv = Pick<
  CasoDeConciliacion,
  "tipo" | "email" | "nombre" | "nota" | "estado" | "aparece" | "resolucion" | "tarea"
> & { programa: string; equipo: string };

export type PendienteParaCsv = {
  equipo: string;
  programa: string;
  kind: TipoDeTarea;
  email: string | null;
  persona: string | null;
  creadaEn: string;
};

function filas(encabezado: readonly string[], cuerpo: readonly (readonly (string | null)[])[]): string {
  return [encabezado, ...cuerpo].map((fila) => fila.map((c) => csvField(c)).join(",")).join("\r\n");
}

export function csvDeExternos(casos: readonly ExternoParaCsv[]): string {
  return filas(
    ["Equipo", "Programa", "Correo", "Nombre", "Estado", "Decisión", "Nota", "Aparece desde", "Importaciones"],
    casos
      .filter((c) => c.tipo === "externo")
      .map((c) => [
        c.equipo,
        c.programa,
        c.email,
        c.nombre,
        c.tarea ? TAREA[c.tarea.kind] : ESTADO[c.estado],
        c.resolucion ? (c.resolucion.decision === "mantener" ? "Mantener" : "Omitir") : "",
        c.resolucion?.nota ?? c.nota,
        fecha(c.aparece?.desde),
        c.aparece ? `${c.aparece.n} de ${c.aparece.de}` : "",
      ])
  );
}

export function csvDePendientes(pendientes: readonly PendienteParaCsv[]): string {
  return filas(
    ["Equipo", "Programa", "Qué hacer en Autodesk", "Correo", "Persona", "Desde"],
    pendientes.map((p) => [p.equipo, p.programa, TAREA[p.kind], p.email, p.persona, fecha(p.creadaEn)])
  );
}
