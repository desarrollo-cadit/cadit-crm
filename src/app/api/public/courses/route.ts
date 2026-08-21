import { z } from "zod";
import { parseQuery } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import { listPublicCategories, listPublicCourses } from "@/server/public-catalog";

export const dynamic = "force-dynamic";

/** 007 — preflight: el sitio comercial consume el catálogo desde otro dominio. */
export function OPTIONS(req: Request) {
  return corsPreflight(req);
}

const querySchema = z.object({
  /** 006 — filtro del catálogo por categoría, con el slug público. */
  categoria: z.string().min(1).optional(),
});

/**
 * 005 (T042, US7, contracts/public-courses.md) — sin `withAuth`: es la ÚNICA
 * ruta pública de la API interna (FR-020). Nunca requiere ni acepta
 * `organizationId` (DV-010) — responde igual con o sin sesión.
 *
 * 006 — devuelve además `categories`, para que el sitio comercial dibuje el
 * filtro del catálogo sin una segunda llamada.
 */
export async function GET(req: Request) {
  const query = parseQuery(new URL(req.url), querySchema);
  if (!query.ok) return withCors(req, query.response);

  const [courses, categories] = await Promise.all([
    listPublicCourses({ categorySlug: query.data.categoria }),
    listPublicCategories(),
  ]);

  return withCors(
    req,
    Response.json(
      { courses, categories },
      { headers: { "Cache-Control": "public, max-age=60" } }
    )
  );
}
