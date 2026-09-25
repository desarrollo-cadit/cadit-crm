import { StudentOfflineCoursesClient } from "@/components/portal/student-offline-courses";

export const dynamic = "force-dynamic";

/** cursos-offline (T5) — The offline courses this student can read. */
export default function StudentOfflineCoursesPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cursos offline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Guías teóricas para leer a su ritmo y cuestionarios que se corrigen al enviarlos.
        </p>
      </div>
      <StudentOfflineCoursesClient />
    </div>
  );
}
