import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { signUpWithAssignedPassword } from "@/server/auth/assigned-password";
import { sessionCapabilities } from "@/lib/capabilities";
import { addTeamMember } from "@/server/team";

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

  // 030 (addendum) — Quién del equipo es TAMBIÉN profesor con portal: la fila
  // lo dice, y "Quitar del equipo" le avisa que el portal le queda.
  const profesores = new Set(
    members.length === 0
      ? []
      : (
          await db
            .select({ userId: schema.accountLink.userId })
            .from(schema.accountLink)
            .where(
              and(
                eq(schema.accountLink.organizationId, session.organizationId),
                eq(schema.accountLink.kind, "profesor"),
                inArray(
                  schema.accountLink.userId,
                  members.map((m) => m.userId)
                )
              )
            )
        ).map((r) => r.userId)
  );
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
      // Crear-roles — Tu propia fila no ofrece cambiar el rol: lo cambia otra
      // persona (`changeMemberRole` lo rechaza igual).
      isSelf: m.userId === session.userId,
      isTeacher: profesores.has(m.userId),
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  /**
   * 030 (addendum) — Opcional: si el correo es de un PROFESOR, se le agrega
   * el equipo a su misma cuenta y su contraseña no se toca. Para una cuenta
   * nueva sigue siendo obligatoria (`addTeamMember` lo exige).
   */
  password: z.union([z.literal(""), z.string().min(8).max(128)]).optional(),
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

/**
 * Alta de cuenta de equipo: email + contraseña temporal (FR-061).
 *
 * El rol tiene que existir en ESTA organización (un rol inventado caería al
 * respaldo de código y otorgaría todo) y no puede exceder a quien da el alta.
 * La contraseña la escribe quien da el alta: al entrar por primera vez se le
 * pide a la persona que elija la suya (`mustChangePassword`).
 *
 * 030 (addendum) — Si el correo es de un PROFESOR, no se crea otra cuenta: se
 * le agrega el equipo a la suya (`attached: true`). Si es de un alumno, se
 * rechaza con un mensaje claro. Las reglas viven en `addTeamMember`.
 */
export const POST = requireCapability(
  "accesos.gestionar",
  async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const result = await addTeamMember(
    session.organizationId,
    sessionCapabilities(session),
    {
      name: body.data.name,
      email: body.data.email,
      password: body.data.password || undefined,
      roleKey: body.data.roleKey,
    },
    // La contraseña asignada enciende `mustChangePassword` (helper único).
    { signUp: (cuenta) => signUpWithAssignedPassword(cuenta) }
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return Response.json({ ok: true, attached: result.data.attached }, { status: 201 });
});
