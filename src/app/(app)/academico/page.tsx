import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { leerPestana } from "@/lib/tab-param";
import { ALIAS_ACADEMICO, PESTANAS_ACADEMICO } from "@/lib/pestanas";
import { AcademicClient } from "@/components/academic/academic-client";

export const dynamic = "force-dynamic";

/**
 * 040 (DV-008) — Las capacidades se resuelven en el SERVIDOR y bajan como
 * booleanos: quien solo ve (Ventas, Administración) no recibe botones que
 * responderían 403. Las rutas tienen su propio `requireCapability`.
 *
 * 2026-10-26 — `?tab=cursos|grupos|profesores|aulas` abre en esa pestaña.
 */
export default async function AcademicoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ tab }, session] = await Promise.all([searchParams, getSessionOrNull()]);
  const caps = session ? sessionCapabilities(session) : [];
  return (
    <AcademicClient
      canEdit={caps.includes("academico.editar")}
      canManageAccess={caps.includes("accesos.gestionar")}
      canManageLicenses={caps.includes("licencias.gestionar")}
      initialTab={leerPestana(tab, PESTANAS_ACADEMICO, "cursos", ALIAS_ACADEMICO)}
    />
  );
}
