import { apiError, parseQuery, requireCapability } from "@/lib/api";
import { reporteQuerySchema } from "@/lib/autodesk-import/body";
import { sessionCapabilities } from "@/lib/capabilities";
import { importarArchivo, reporteDeConciliacion } from "@/server/autodesk-import";
import { leerFormularioDeImportacion } from "@/server/autodesk-import-form";

export const dynamic = "force-dynamic";

/**
 * 0091 — El reporte de la conciliación con Autodesk: por equipo, la última
 * importación, las cuentas por programa (cupo, ocupadas, en Autodesk, solo en
 * Autodesk) y los casos a resolver, externos y tareas pendientes en Autodesk.
 * `academico.ver`, como `/api/licenses`. Los correos y las personas solo viajan
 * con `contactos.ver`: sin ella llegan las cuentas y nada más. Sin plata.
 */
export const GET = requireCapability("academico.ver", async (session, req: Request) => {
  const query = parseQuery(new URL(req.url), reporteQuerySchema);
  if (!query.ok) return query.response;
  const conDetalle = sessionCapabilities(session).includes("contactos.ver");
  return Response.json(
    await reporteDeConciliacion(session.organizationId, { conDetalle, teamId: query.data.teamId })
  );
});

/**
 * Importa el Excel de usuarios de Autodesk de UN equipo (multipart: `file`,
 * `teamId`, `mapeo`, `guardarAlias`). Guarda la foto y cierra las tareas que el
 * archivo ya muestra hechas; NO toca ninguna licencia del campus. `licencias.gestionar`.
 */
export const POST = requireCapability("licencias.gestionar", async (session, req: Request) => {
  const form = await leerFormularioDeImportacion(req);
  if (!form.ok) return form.response;
  if (!form.data.teamId) return apiError(422, "invalid_body", "Elegí el equipo al que corresponde el archivo");
  const r = await importarArchivo(session.organizationId, session.userId, {
    nombre: form.data.nombre,
    bytes: form.data.bytes,
    teamId: form.data.teamId,
    mapeo: form.data.mapeo,
    guardarAlias: form.data.guardarAlias,
  });
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json({ importacion: r.data }, { status: 201 });
});
