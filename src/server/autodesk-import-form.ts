import { apiError } from "@/lib/api";
import { MAX_BYTES_DEL_ARCHIVO } from "@/lib/autodesk-import/archivo";
import {
  camposDeImportacionSchema,
  mapeoDeOfertasSchema,
  type MapeoDeOfertas,
} from "@/lib/autodesk-import/body";

/**
 * 0091 — Lee el multipart de la vista previa y de la importación: el archivo en
 * el campo `file` y, como texto, `teamId`, `mapeo` (JSON: oferta → programa) y
 * `guardarAlias`. Un archivo que no es un archivo, uno vacío o uno enorme son
 * 422 acá, antes de leerlo entero.
 */
export type FormularioDeImportacion = {
  nombre: string;
  bytes: Uint8Array;
  teamId?: string;
  mapeo: MapeoDeOfertas;
  guardarAlias: boolean;
};

export async function leerFormularioDeImportacion(
  req: Request
): Promise<{ ok: true; data: FormularioDeImportacion } | { ok: false; response: Response }> {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return { ok: false, response: apiError(400, "invalid", "Se esperaba multipart/form-data") };
  }
  const archivo = form.get("file");
  if (!(archivo instanceof File)) {
    return { ok: false, response: apiError(422, "invalid_body", "Falta el archivo (campo `file`)") };
  }
  if (archivo.size > MAX_BYTES_DEL_ARCHIVO) {
    return {
      ok: false,
      response: apiError(422, "demasiado_grande", `El archivo pesa más de ${MAX_BYTES_DEL_ARCHIVO / 1024 / 1024} MB`),
    };
  }

  const campos = camposDeImportacionSchema.safeParse({
    teamId: (form.get("teamId") as string | null) || undefined,
    mapeo: (form.get("mapeo") as string | null) || undefined,
    guardarAlias: (form.get("guardarAlias") as string | null) || undefined,
  });
  if (!campos.success) {
    return { ok: false, response: apiError(422, "invalid_body", "Los datos del formulario no son válidos") };
  }

  let mapeo: MapeoDeOfertas = {};
  if (campos.data.mapeo) {
    let crudo: unknown;
    try {
      crudo = JSON.parse(campos.data.mapeo);
    } catch {
      return { ok: false, response: apiError(422, "invalid_body", "El mapeo de ofertas no es un JSON válido") };
    }
    const parsed = mapeoDeOfertasSchema.safeParse(crudo);
    if (!parsed.success) {
      return { ok: false, response: apiError(422, "invalid_body", "El mapeo de ofertas no es válido") };
    }
    mapeo = parsed.data;
  }

  return {
    ok: true,
    data: {
      nombre: archivo.name || "usuarios.xlsx",
      bytes: new Uint8Array(await archivo.arrayBuffer()),
      teamId: campos.data.teamId,
      mapeo,
      guardarAlias: campos.data.guardarAlias === "true",
    },
  };
}
