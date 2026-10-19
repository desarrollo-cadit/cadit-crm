import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { AcademicClient } from "@/components/academic/academic-client";

export const dynamic = "force-dynamic";

/**
 * 040 (DV-008) — Las capacidades se resuelven en el SERVIDOR y bajan como
 * booleanos: quien solo ve (Ventas, Administración) no recibe botones que
 * responderían 403. Las rutas tienen su propio `requireCapability`.
 */
export default async function AcademicoPage() {
  const session = await getSessionOrNull();
  const caps = session ? sessionCapabilities(session) : [];
  return (
    <AcademicClient
      canEdit={caps.includes("academico.editar")}
      canManageAccess={caps.includes("accesos.gestionar")}
    />
  );
}
