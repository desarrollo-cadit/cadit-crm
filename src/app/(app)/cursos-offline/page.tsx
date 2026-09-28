import Link from "next/link";
import { redirect } from "next/navigation";
import { Library } from "lucide-react";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { listCourses } from "@/server/offline-courses/library";
import { thumbnailAssetId } from "@/server/offline-courses/portal-logic";
import { OfflineCourseStatusBadge } from "@/components/offline-courses/status-badge";
import { NewCourseButton } from "@/components/offline-courses/editor/new-course-button";

export const dynamic = "force-dynamic";

/**
 * cursos-offline (T4) — The library imported from LearnDash, for staff.
 * T11b: with `academico.editar`, "Nuevo curso" creates one and opens its editor.
 *
 * Gated here and not only in the menu: hiding the link does not protect a URL
 * that can be typed. The read runs inside `withTenantTransaction` because a
 * server component does not go through `withAuth`, and without
 * `app.current_org` RLS returns zero rows in silence.
 */
export default async function OfflineCoursesPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const capabilities = sessionCapabilities(session);
  if (!capabilities.includes("academico.ver")) redirect("/");
  const canEdit = capabilities.includes("academico.editar");

  const courses = await withTenantTransaction(session, () =>
    listCourses(session.organizationId)
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Library className="h-5 w-5" aria-hidden />
              Cursos offline
            </h2>
            <p className="text-sm text-muted-foreground">
              Guías teóricas y cuestionarios importados de la academia anterior.
              Se asignan desde cada cohorte, en la pestaña «Cursos offline».
            </p>
          </div>
          {canEdit && <NewCourseButton />}
        </header>

        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canEdit
              ? "La biblioteca está vacía. Creá un curso con «Nuevo curso» o cargalos con el script de importación."
              : "La biblioteca está vacía. Los cursos se cargan con el script de importación."}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cursos-offline/${c.id}`}
                  className="flex h-full flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:bg-accent"
                >
                  {thumbnailAssetId(c.thumbnailUrl) ? (
                    // The stored URL is `/api/media/<id>`, which asks for
                    // `inbox.ver`; the library's own route asks `academico.ver`.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/offline-courses/${c.id}/thumbnail`}
                      alt={`Portada de ${c.title}`}
                      className="aspect-video w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="flex aspect-video w-full items-center justify-center bg-brand-tint text-brand-text"
                    >
                      <Library className="h-8 w-8" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{c.title}</span>
                      <OfflineCourseStatusBadge status={c.status} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {plural(c.lessons, "lección", "lecciones")} ·{" "}
                      {plural(c.topics, "tema", "temas")} ·{" "}
                      {plural(c.quizzes, "cuestionario", "cuestionarios")}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}
