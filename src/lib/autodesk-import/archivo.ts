import { leerCsv } from "@/lib/historial-import/csv";
import { leerXlsx, pareceZip, XlsxInvalido } from "./xlsx";

/**
 * 0091 — El archivo de usuarios de Autodesk (manage.autodesk.com › Usuarios ›
 * Exportar), de UN equipo.
 *
 * Una fila por persona y SUB-PRODUCTO: Revit trae Rendering, Twinmotion, Forma…
 * y todas esas filas son UNA licencia. La unidad es (correo, oferta
 * `offering_name`). Una persona sin oferta (administradores, invitados) no
 * ocupa ningún asiento. `subscription_id` llega en notación científica y ya
 * perdió dígitos: no se usa de llave.
 *
 * Puro salvo por `leerXlsx` (que usa `node:zlib`): lo llaman las rutas del
 * servidor, nunca el navegador.
 */

export const MAX_BYTES_DEL_ARCHIVO = 15 * 1024 * 1024;
const MAX_FILAS = 60_000;

export type LicenciaDeAutodesk = {
  email: string;
  firstName: string;
  lastName: string;
  autodeskId: string;
  role: string;
  accountStatus: string;
  offeringName: string;
};

export type OfertaDelArchivo = { clave: string; nombre: string; personas: number };

export type ArchivoDeAutodesk = {
  /** El `team_alias` del archivo, o `null` si no trae. */
  teamAlias: string | null;
  /** Una por (correo, oferta). */
  licencias: LicenciaDeAutodesk[];
  ofertas: OfertaDelArchivo[];
  /** Filas de datos leídas. */
  filas: number;
  /** Personas distintas del archivo (con o sin licencia). */
  personas: number;
  /** Personas que no tienen ninguna oferta. */
  sinLicencia: number;
  /** Filas descartadas por no traer un correo válido. */
  filasSinCorreo: number;
};

export type LecturaDelArchivo =
  | { ok: true; archivo: ArchivoDeAutodesk }
  | {
      ok: false;
      code: "archivo_invalido" | "sin_columnas" | "equipos_varios" | "demasiado_grande";
      message: string;
    };

/** Sin tildes, en minúsculas y con los espacios plegados: la llave de una oferta. */
export function claveDeOferta(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+$/;

function encabezado(h: string): string {
  return h
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function leerArchivoDeAutodesk(nombre: string, bytes: Uint8Array): LecturaDelArchivo {
  if (bytes.length === 0) {
    return { ok: false, code: "archivo_invalido", message: "El archivo está vacío" };
  }
  if (bytes.length > MAX_BYTES_DEL_ARCHIVO) {
    return {
      ok: false,
      code: "demasiado_grande",
      message: `El archivo pesa más de ${MAX_BYTES_DEL_ARCHIVO / 1024 / 1024} MB`,
    };
  }

  let filas: string[][];
  if (pareceZip(bytes)) {
    try {
      filas = leerXlsx(bytes);
    } catch (e) {
      if (e instanceof XlsxInvalido) return { ok: false, code: "archivo_invalido", message: e.message };
      throw e;
    }
  } else if (/\.csv$/i.test(nombre)) {
    filas = leerCsv(new TextDecoder("utf-8").decode(bytes));
  } else {
    return {
      ok: false,
      code: "archivo_invalido",
      message: "Subí el .xlsx que exporta Autodesk (o un .csv con las mismas columnas)",
    };
  }

  if (filas.length > MAX_FILAS) {
    return { ok: false, code: "demasiado_grande", message: `El archivo tiene más de ${MAX_FILAS} filas` };
  }
  const cabecera = (filas[0] ?? []).map(encabezado);
  const col = (n: string) => cabecera.indexOf(n);
  const iCorreo = col("email");
  const iOferta = col("offering_name");
  if (iCorreo < 0 || iOferta < 0) {
    return {
      ok: false,
      code: "sin_columnas",
      message:
        "No encontramos las columnas «email» y «offering_name». Subí el archivo de usuarios que exporta Autodesk.",
    };
  }
  const iAlias = col("team_alias");
  const iNombre = col("first_name");
  const iApellido = col("last_name");
  const iId = col("autodesk_id");
  const iRol = col("role");
  const iEstado = col("account_status");

  const celda = (f: string[], i: number) => (i < 0 ? "" : (f[i] ?? "").trim());

  const alias = new Map<string, string>();
  const personas = new Set<string>();
  const conOferta = new Set<string>();
  const licencias = new Map<string, LicenciaDeAutodesk>();
  const ofertas = new Map<string, { nombre: string; personas: Set<string> }>();
  let datos = 0;
  let filasSinCorreo = 0;

  for (const f of filas.slice(1)) {
    if (f.every((c) => c.trim() === "")) continue;
    datos++;
    const a = celda(f, iAlias);
    if (a && !alias.has(claveDeOferta(a))) alias.set(claveDeOferta(a), a);
    const email = celda(f, iCorreo).toLowerCase();
    if (!CORREO_VALIDO.test(email)) {
      filasSinCorreo++;
      continue;
    }
    personas.add(email);
    const oferta = celda(f, iOferta);
    if (!oferta) continue;
    conOferta.add(email);
    const clave = claveDeOferta(oferta);
    const llave = `${email}\u0000${clave}`;
    const previa = licencias.get(llave);
    if (previa) {
      // El mismo (correo, oferta) en otra fila: solo completa lo que falte.
      previa.firstName ||= celda(f, iNombre);
      previa.lastName ||= celda(f, iApellido);
      previa.autodeskId ||= celda(f, iId);
    } else {
      licencias.set(llave, {
        email,
        firstName: celda(f, iNombre),
        lastName: celda(f, iApellido),
        autodeskId: celda(f, iId),
        role: celda(f, iRol),
        accountStatus: celda(f, iEstado),
        offeringName: oferta,
      });
    }
    const o = ofertas.get(clave) ?? { nombre: oferta, personas: new Set<string>() };
    o.personas.add(email);
    ofertas.set(clave, o);
  }

  if (alias.size > 1) {
    return {
      ok: false,
      code: "equipos_varios",
      message: `El archivo mezcla varios equipos (${[...alias.values()].join(", ")}). Exportá y subí un equipo por vez.`,
    };
  }

  return {
    ok: true,
    archivo: {
      teamAlias: [...alias.values()][0] ?? null,
      licencias: [...licencias.values()],
      ofertas: [...ofertas]
        .map(([clave, o]) => ({ clave, nombre: o.nombre, personas: o.personas.size }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      filas: datos,
      personas: personas.size,
      sinLicencia: [...personas].filter((p) => !conOferta.has(p)).length,
      filasSinCorreo,
    },
  };
}

/**
 * Sugiere el programa del campus que corresponde a una oferta de Autodesk, o
 * `null`. Solo coincidencia EXACTA o «Programa - …» / «Programa (…)»: «Revit LT»
 * NO es «Revit». Es una sugerencia que la persona confirma, nunca se aplica sola.
 */
export function sugerirPrograma(
  oferta: string,
  programas: readonly { id: string; name: string }[]
): string | null {
  const o = claveDeOferta(oferta);
  const exacto = programas.find((p) => claveDeOferta(p.name) === o);
  if (exacto) return exacto.id;
  const candidatos = programas
    .filter((p) => {
      const n = claveDeOferta(p.name);
      return n.length > 0 && o.startsWith(n) && /^\s*[-–—(:,]/.test(o.slice(n.length));
    })
    .sort((a, b) => b.name.length - a.name.length);
  return candidatos[0]?.id ?? null;
}
