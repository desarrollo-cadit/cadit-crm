import { requireCapability } from "@/lib/api";
import { roomAgenda } from "@/server/virtual-rooms";

export const dynamic = "force-dynamic";

const DIA_MS = 86_400_000;

/**
 * 023 (US4, FR-011) — Qué aula está ocupada por quién, y cuándo.
 *
 * Sin parámetros devuelve los próximos 7 días: es la pregunta que se hace de
 * verdad ("¿qué aula tengo libre esta semana?"), y obligar a elegir un rango
 * para ver lo de siempre es fricción sin ganancia.
 */
export const GET = requireCapability("academico.ver", async (session, req: Request) => {
  const params = new URL(req.url).searchParams;
  const desdeParam = params.get("desde");
  const hastaParam = params.get("hasta");

  const desde = desdeParam ? new Date(desdeParam) : new Date();
  const hasta = hastaParam ? new Date(hastaParam) : new Date(desde.getTime() + 7 * DIA_MS);

  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    return Response.json({ agenda: [] });
  }

  const agenda = await roomAgenda(session.organizationId, desde, hasta);
  return Response.json({ agenda });
});
