/**
 * Restablece la contraseña de un usuario de ESTA instancia.
 *
 *   pnpm reset-password -- <email> <contraseña-nueva>
 *
 * Existe porque CadIT es self-hosted y sin servicio de recuperación por
 * correo: el dueño de la instancia tiene acceso a la base, y esta es la vía
 * ordenada de usarlo. Se apoya en el hasher de Better Auth (scrypt) a través
 * de su propio contexto — escribir un hash a mano en `account.password`
 * genera una cuenta que no puede iniciar sesión nunca más.
 *
 * Solo corre contra la base que apunte DATABASE_URL. No expone nada por HTTP.
 */

import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb, getSql, schema } from "@/lib/db";

// pnpm interpone un "--" propio al reenviar argumentos: se descarta.
const args = process.argv.slice(2).filter((a) => a !== "--");
const email = args[0];

if (!email) {
  console.error("Uso: pnpm reset-password -- <email>");
  process.exit(1);
}

/**
 * La contraseña se pide por STDIN y no se toma de la línea de comandos.
 *
 * Pasarla como argumento parece más cómodo y es una trampa: PowerShell
 * interpreta `$`, `!` y las comillas ANTES de que el script vea nada, así que
 * se termina hasheando un string mutilado y el login falla con la contraseña
 * "correcta" —sin ningún error visible que lo explique—. Además, como
 * argumento queda escrita en el historial del shell.
 *
 * Se sigue aceptando por argumento solo si se pasa explícitamente, para no
 * romper un uso automatizado.
 */
async function readPassword(): Promise<string> {
  if (args[1]) return args[1];
  process.stdout.write("Contraseña nueva: ");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").split("\n")[0]!.trim();
}

const password = await readPassword();

if (!password) {
  console.error("No se ingresó ninguna contraseña.");
  process.exit(1);
}
if (password.length < 8) {
  console.error("La contraseña debe tener al menos 8 caracteres (minPasswordLength).");
  process.exit(1);
}

const db = getDb();
const users = await db
  .select({ id: schema.user.id, email: schema.user.email, name: schema.user.name })
  .from(schema.user)
  .where(eq(schema.user.email, email.toLowerCase()))
  .limit(1);

const user = users[0];
if (!user) {
  console.error(`No existe un usuario con el correo ${email}.`);
  await getSql().end();
  process.exit(1);
}

// `$context` expone el hasher configurado y el adaptador interno: la MISMA
// ruta que usa el login, así que el hash queda con el formato que espera.
const ctx = await getAuth().$context;
const hash = await ctx.password.hash(password);
await ctx.internalAdapter.updatePassword(user.id, hash);

console.log(`Contraseña actualizada para ${user.email} (${user.name}).`);
await getSql().end();
process.exit(0);
