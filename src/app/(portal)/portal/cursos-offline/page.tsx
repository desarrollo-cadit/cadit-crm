import { StudentOfflineCoursesClient } from "@/components/portal/student-offline-courses";
import { EncabezadoDePagina } from "@/components/portal/campus";

export const dynamic = "force-dynamic";

export default function StudentOfflineCoursesPage() {
  return (
    <div className="space-y-6">
      <EncabezadoDePagina
        migas={[
          { label: "Inicio", href: "/portal" },
          { label: "Cursos offline", href: null },
        ]}
        titulo="Cursos offline"
        descripcion="Guías teóricas de estudio autónomo y cuestionarios con corrección automática."
      />
      <StudentOfflineCoursesClient />
    </div>
  );
}
