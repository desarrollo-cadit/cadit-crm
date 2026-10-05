import { eq } from "drizzle-orm";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getRootDb, schema } from "@/lib/db";

/**
 * Contraseñas que elige OTRA persona: la invitación al portal, el alta del
 * equipo, `scripts/reset-password.ts`.
 *
 * Es el único lugar del código que llama a `signUpEmail` y a
 * `updatePassword` (`cambio-de-contrasena.test.ts` lo exige), y por eso es
 * también el único que enciende `mustChangePassword`: fijar la contraseña y
 * marcarla como ajena son el mismo paso, y un camino nuevo no puede hacer
 * uno sin el otro.
 *
 * La marca se escribe con `getRootDb()` y no con `getDb()`: Better Auth
 * guarda la contraseña con su propia conexión, fuera de la transacción del
 * pedido. Si la marca fuera adentro y el pedido revirtiera, quedaría una
 * contraseña asignada sin marca —justo el caso que esto existe para evitar—.
 */

async function markAssigned(userId: string): Promise<void> {
  await getRootDb()
    .update(schema.user)
    .set({ mustChangePassword: true })
    .where(eq(schema.user.id, userId));
}

/** Crea la cuenta con una contraseña que eligió otra persona. Lanza si falla el alta. */
export async function signUpWithAssignedPassword(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ userId: string }> {
  const created = await runInternalSignup(() =>
    getAuth().api.signUpEmail({ body: input })
  );
  await markAssigned(created.user.id);
  return { userId: created.user.id };
}

/**
 * Reemplaza la contraseña de una cuenta que ya existe.
 *
 * Usa el hasher de Better Auth (scrypt) a través de su contexto: escribir un
 * hash a mano en `account.password` genera una cuenta que no puede iniciar
 * sesión nunca más.
 */
export async function assignPassword(userId: string, password: string): Promise<void> {
  const ctx = await getAuth().$context;
  await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(password));
  await markAssigned(userId);
}

/** La persona eligió la suya: las pantallas dejan de mandarla a cambiarla. */
export async function clearAssignedPasswordMark(userId: string): Promise<void> {
  await getRootDb()
    .update(schema.user)
    .set({ mustChangePassword: false })
    .where(eq(schema.user.id, userId));
}
