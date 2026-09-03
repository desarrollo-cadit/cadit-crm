import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { listRoles } from "@/server/roles";

export const dynamic = "force-dynamic";

export const GET = requireCapability(
  "accesos.gestionar",
  async (session) => {
  const db = getDb();
  const members = await db
    .select({
      id: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(scoped(schema.member.organizationId, session.organizationId));
  return Response.json({
    members: members.map((m) => ({
      id: m.id,
      // 005 (US2) — sellerId de una inscripción referencia user.id, no
      // member.id; se expone acá para poblar el selector de vendedor.
      userId: m.userId,
      role: m.role,
      name: m.name,
      email: m.email,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  /**
   * 012 (T029) — La llave de un rol de la tabla `role`, no un enum fijo.
   *
   * Antes era `z.enum(["member", "soporte"])`. Dejarlo así después de migrar
   * los roles habría sido el peor de los errores posibles: `member` deja de
   * existir como llave, así que la cuenta nueva nacía con un rol sin mapear
   * y —por el respaldo en código— **con TODAS las capacidades**. Una
   * escalada de privilegios silenciosa cada vez que se da de alta a alguien.
   *
   * Ahora se valida contra los roles que existen de verdad en la base.
   */
  roleKey: z.string().trim().min(1),
});

/** Alta de cuenta de equipo: email + contraseña temporal (FR-061). */
export const POST = requireCapability(
  "accesos.gestionar",
  async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  // El rol tiene que existir en ESTA organización. Sin esto, un rol inventado
  // cae al respaldo de código y otorga todo.
  const roles = await listRoles(session.organizationId, session.role);
  const target = roles.find((r) => r.key === body.data.roleKey);
  if (!target) {
    return apiError(422, "invalid_role", "Ese rol no existe en la organización");
  }

  const auth = getAuth();
  let newUserId: string;
  try {
    const result = await runInternalSignup(() =>
      auth.api.signUpEmail({
        body: {
          name: body.data.name,
          email: body.data.email,
          password: body.data.password,
        },
      })
    );
    newUserId = result.user.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo crear la cuenta";
    if (/exist/i.test(message)) {
      return apiError(409, "duplicate", "Ya existe una cuenta con ese correo");
    }
    return apiError(422, "invalid", message);
  }

  const db = getDb();
  await db
    .insert(schema.member)
    .values({
      id: newId("member"),
      organizationId: session.organizationId,
      userId: newUserId,
      role: body.data.roleKey,
    })
    .onConflictDoNothing();

  return Response.json({ ok: true }, { status: 201 });
});
