import { requireCapability } from "@/lib/api";
import { opcionesDeFiltros } from "@/server/marketing/audiences";

export const dynamic = "force-dynamic";

/**
 * 045 (contracts/audiences.md) — Los valores con que se arman los filtros de
 * una audiencia. Sin formularios, grupos o empresas: listas vacías, nunca error.
 */
export const GET = requireCapability("marketing.ver", async (session) => {
  return Response.json(await opcionesDeFiltros(session.organizationId));
});
