/**
 * DEV ONLY — manda una notificación push de prueba a los dispositivos
 * suscriptos, desde la PC. Sirve para ver cómo suena y cómo aparece en el
 * celular BLOQUEADO.
 *
 *   pnpm push:test                         # primer ejemplo, ahora mismo
 *   pnpm push:test -- --delay 10           # espera 10 s (tiempo de bloquear el celular)
 *   pnpm push:test -- --preset 2           # 1 corrección, 2 entrega, 3 clase
 *   pnpm push:test -- --email a@b.com      # solo los dispositivos de esa cuenta
 *   pnpm push:test -- --title "Hola" --body "Texto" --url /portal
 *
 * No expone nada por HTTP y se niega a correr si DATABASE_URL no es local o si
 * `PUSH_DEV_TOOLS` no está en true: jamás le escribe a dispositivos de una
 * base de producción. Usa las mismas claves VAPID que el servidor local
 * (`.dev-vapid.json`).
 */

import { and, eq, isNull } from "drizzle-orm";
import { getDb, getSql, schema } from "@/lib/db";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { normalizarPayload } from "@/lib/push/payload";
import { enviarAUsuario } from "@/server/push/subscriptions";

const PRESETS = [
  {
    title: "Corrección publicada",
    body: "Ya podés ver el resultado de tu evaluación.",
    url: "/portal",
  },
  {
    title: "Entrega por vencer",
    body: "Te quedan 2 días para entregar “Trabajo final”.",
    url: "/portal",
  },
  { title: "Clase en 1 hora", body: "Revit Básico · hoy 19:00", url: "/portal" },
] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function esBaseLocal(): boolean {
  try {
    const host = new URL(process.env.DATABASE_URL ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

if (process.env.PUSH_DEV_TOOLS !== "true" || !esBaseLocal()) {
  console.error(
    "[push:test] Solo corre con PUSH_DEV_TOOLS=true y una DATABASE_URL local. No se envió nada."
  );
  process.exit(1);
}
// Misma regla de claves que el servidor local: el par de desarrollo en `.dev-vapid.json`.
process.env.APP_BASE_URL = "http://localhost:3000";

const presetIdx = Number(arg("preset") ?? "1") - 1;
const preset = PRESETS[presetIdx] ?? PRESETS[0];
const payload = normalizarPayload({
  title: arg("title") ?? preset.title,
  body: arg("body") ?? preset.body,
  url: arg("url") ?? preset.url,
  tag: "dev-test",
});
const delay = Math.max(0, Number(arg("delay") ?? "0") || 0);
const email = arg("email")?.trim().toLowerCase();

const org = (await getDb().select({ id: schema.organization.id }).from(schema.organization).limit(1))[0];
if (!org) {
  console.error("[push:test] No hay organización en esta base.");
  await getSql().end();
  process.exit(1);
}

for (let s = delay; s > 0; s--) {
  process.stdout.write(`\rEnviando en ${s} s… (bloqueá el celular)   `);
  await new Promise((r) => setTimeout(r, 1000));
}
if (delay > 0) process.stdout.write("\n");

const salida = await withOrganizationScope(org.id, "cli:push-test", async () => {
  const db = getDb();
  const subs = await db
    .select({ userId: schema.pushSubscription.userId })
    .from(schema.pushSubscription)
    .where(
      and(
        eq(schema.pushSubscription.organizationId, org.id),
        isNull(schema.pushSubscription.disabledAt)
      )
    );
  let userIds = [...new Set(subs.map((s) => s.userId))];

  if (email) {
    const u = (
      await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email))
    )[0];
    userIds = u ? userIds.filter((id) => id === u.id) : [];
  }

  const resultados: { userId: string; ok: boolean; error?: string }[] = [];
  for (const userId of userIds) {
    for (const r of await enviarAUsuario({ organizationId: org.id, userId }, payload)) {
      resultados.push({ userId, ok: r.ok, error: r.error });
    }
  }
  return resultados;
});

if (salida.length === 0) {
  console.log("[push:test] No hay dispositivos suscriptos. Activá los avisos en el celular primero.");
} else {
  console.log(`[push:test] "${payload.title}" → ${salida.length} dispositivo(s):`);
  for (const r of salida) console.log(`  ${r.ok ? "OK " : "ERR"} ${r.userId}${r.error ? ` (${r.error})` : ""}`);
}
await getSql().end();
