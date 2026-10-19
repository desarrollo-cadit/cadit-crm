import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { PipelineClient } from "@/components/pipeline/pipeline-client";

export const dynamic = "force-dynamic";

/**
 * 040 (DV-008) — Las capacidades bajan como booleanos: mover un lead pide
 * `inscripciones.seguimiento` y las etapas `configuracion.editar`. Las rutas
 * tienen su propio `requireCapability`; esto es lo que la persona VE.
 */
export default async function PipelinePage() {
  const session = await getSessionOrNull();
  const caps = session ? sessionCapabilities(session) : [];
  return (
    <PipelineClient
      canMove={caps.includes("inscripciones.seguimiento")}
      canManageStages={caps.includes("configuracion.editar")}
    />
  );
}
