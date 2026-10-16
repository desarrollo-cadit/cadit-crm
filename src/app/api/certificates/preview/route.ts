import { z } from "zod";
import { apiError, requireCapability } from "@/lib/api";
import {
  MAX_DESCRIPCION_CERTIFICADO,
  armarCertificado,
  type CertificadoSnapshot,
} from "@/lib/certificado";
import { renderCertificadoPdf } from "@/lib/certificado-pdf";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  formato: z.enum(["curso", "modulo"]),
  curso: z.string().trim().min(1).max(200),
  descripcion: z.string().max(MAX_DESCRIPCION_CERTIFICADO).optional(),
});

/**
 * 038 (FR-013) — "Vista previa del certificado" desde la edición del curso.
 *
 * El PDF REAL —misma plantilla, mismas fuentes, mismo acomodo— con un nombre
 * de ejemplo y el texto que está en el formulario, guardado o no: así se ve
 * cómo queda antes de guardar. No lee la base y no emite nada; el código es
 * de muestra y no verifica. `academico.ver`, la puerta del formulario.
 *
 * Inline y no attachment: se abre en otra pestaña para mirarlo.
 */
export const GET = requireCapability("academico.ver", async (_session, req: Request) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const q = querySchema.safeParse(params);
  if (!q.success) {
    return apiError(422, "invalid_query", q.error.issues[0]?.message ?? "Parámetros inválidos");
  }
  const esModulo = q.data.formato === "modulo";
  const snapshot: CertificadoSnapshot = {
    version: 1,
    formato: q.data.formato,
    alumno: "Sofía Núñez Muñoz",
    curso: esModulo ? "Especialización de ejemplo" : q.data.curso,
    cohorte: null,
    anio: new Date().getUTCFullYear(),
    modulo: esModulo ? { ordinal: 1, nombre: q.data.curso } : null,
    modulos: [],
    descripcion: q.data.descripcion?.trim() || null,
  };
  const pdf = await renderCertificadoPdf(
    armarCertificado(snapshot, { codigo: "MUESTRA", baseUrl: getEnv().APP_BASE_URL })
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="Vista previa del certificado.pdf"',
      "cache-control": "private, no-store",
    },
  });
});
