import { requireCapability } from "@/lib/api";
import { listConversations } from "@/server/inbox/queries";

export const dynamic = "force-dynamic";

export const GET = requireCapability(
  "inbox.ver",
  async (session, req: Request) => {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const conversations = await listConversations(
    session.organizationId,
    since && !Number.isNaN(since.getTime()) ? since : undefined
  );
  return Response.json({ conversations });
});
