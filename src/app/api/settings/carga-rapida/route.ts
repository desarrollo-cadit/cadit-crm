import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import {
  cursosParaPrecio,
  estadoDeCarga,
  guardarCorreosDeProfesor,
  guardarPreciosDeCurso,
  profesoresParaCorreo,
} from "@/server/carga-rapida";

export const dynamic = "force-dynamic";

/**
 * 011 — Lo que falta cargar para que la gestión esté completa.
 *
 * `academico.editar` y no una capacidad financiera: el precio de LISTA es un
 * dato de catálogo, la misma decisión que la 006 tomó para `cohort.cost`. Lo
 * que sí es financiero —lo que cada persona pagó— vive en la inscripción y
 * sigue detrás de `cobranza.*`.
 */
export const GET = requireCapability("academico.editar", async (session) => {
  const [estado, cursos, profesores] = await Promise.all([
    estadoDeCarga(session.organizationId),
    cursosParaPrecio(session.organizationId),
    profesoresParaCorreo(session.organizationId),
  ]);
  return Response.json({ estado, cursos, profesores });
});

const guardarSchema = z.object({
  precios: z
    .array(
      z.object({
        courseId: z.string().min(1),
        // `null` BORRA el precio. Si alguien limpia el campo es porque quiere
        // sacarlo, y tragarse esa intención en silencio es peor que aplicarla.
        listPrice: z.number().int().min(0).nullable(),
        listCurrency: z.enum(["UYU", "PYG", "USD"]).nullable(),
      })
    )
    .max(200)
    .optional(),
  correos: z
    .array(
      z.object({
        teacherId: z.string().min(1),
        // Vacío borra; un texto que no es correo se rechaza acá y no llega a
        // la base a esperar a que alguien intente invitar.
        email: z.union([z.string().email(), z.literal("")]).nullable(),
      })
    )
    .max(200)
    .optional(),
});

export const PUT = requireCapability(
  "academico.editar",
  async (session, req: Request) => {
    const body = await parseBody(req, guardarSchema);
    if (!body.ok) return body.response;

    const [precios, correos] = await Promise.all([
      guardarPreciosDeCurso(session.organizationId, body.data.precios ?? []),
      guardarCorreosDeProfesor(
        session.organizationId,
        (body.data.correos ?? []).map((c) => ({
          teacherId: c.teacherId,
          email: c.email === "" ? null : c.email,
        }))
      ),
    ]);

    return Response.json({
      precios,
      correos,
      estado: await estadoDeCarga(session.organizationId),
    });
  }
);
