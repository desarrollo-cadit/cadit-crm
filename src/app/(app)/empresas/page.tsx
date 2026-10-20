import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { CompaniesClient } from "@/components/companies/companies-client";

export const dynamic = "force-dynamic";

/**
 * 013 (T033, FR-010c) — Empresas y el avance de sus empleados.
 *
 * Gate en el servidor y no solo en el menú: esconder el enlace no protege una
 * URL que se puede tipear. La ruta de la API tiene su propio
 * `requireCapability`; esto decide qué VE la persona, y tiene que decir lo
 * mismo.
 */
export default async function EmpresasPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const caps = sessionCapabilities(session);
  if (!caps.includes("contactos.ver")) redirect("/");

  return (
    <div className="h-full overflow-y-auto">
      {/* 040 — Crear y editar, solo con `empresas.editar`. */}
      {/* 045 — Cursos offline: ver con `contactos.ver`; asignar, extender y quitar con `academico.editar`. */}
      <CompaniesClient
        canEdit={caps.includes("empresas.editar")}
        canEditAcademic={caps.includes("academico.editar")}
      />
    </div>
  );
}
