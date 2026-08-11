import { listPublicCourses } from "@/server/public-catalog";

export const dynamic = "force-dynamic";

/**
 * 005 (T042, US7, contracts/public-courses.md) — sin `withAuth`: es la ÚNICA
 * ruta pública de la API interna (FR-020). Nunca requiere ni acepta
 * `organizationId` (DV-010) — responde igual con o sin sesión.
 */
export async function GET() {
  const courses = await listPublicCourses();
  return Response.json(
    { courses },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
