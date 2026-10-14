import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { CorrectionInbox } from "@/components/grading/correction-inbox";

export const dynamic = "force-dynamic";

/**
 * 031 (T034, DV-012) — La bandeja de aprobación de correcciones.
 *
 * Gate en el servidor y no solo en el menú: un enlace oculto sigue siendo una
 * URL que se puede escribir a mano. Las rutas `/api/corrections/**` tienen su
 * propio `requireCapability`; esto decide qué VE la persona, y dice lo mismo.
 */
export default async function CorreccionesPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("correcciones.aprobar")) redirect("/");
  return <CorrectionInbox />;
}
