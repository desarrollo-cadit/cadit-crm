import { Badge } from "@/components/ui/badge";
import type { OfflineCourseStatus } from "@/lib/db/schema";

/** cursos-offline — published / draft, the same words everywhere. */
export function OfflineCourseStatusBadge({ status }: { status: OfflineCourseStatus }) {
  return status === "published" ? (
    <Badge variant="success">Publicado</Badge>
  ) : (
    <Badge variant="secondary">Borrador</Badge>
  );
}
