/**
 * Cuentas de demostración para grabar la guía: una por rol del staff, más el
 * alumno y el profesor con más datos. Misma contraseña para todas.
 *
 * SOLO contra `cadit_demo` (clon anonimizado). Idempotente: si la cuenta
 * existe, solo se le fija la contraseña.
 *
 *   DEMO_ADMIN_URL=postgresql://USUARIO:CLAVE@localhost:PUERTO/cadit_demo node scripts/demos/guia/usuarios.mjs
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { hashPassword } from "better-auth/crypto";
import { nanoid } from "nanoid";
import postgres from "postgres";

export const CLAVE_DEMO = "Demo-Guia-2026";

/** Una cuenta por rol de sistema del staff. */
export const CUENTAS_STAFF = [
  { rol: "direccion", email: "demo.direccion@demo.test", nombre: "Dirección Demo" },
  { rol: "coordinacion", email: "demo.coordinacion@demo.test", nombre: "Coordinación Demo" },
  { rol: "soporte", email: "demo.soporte@demo.test", nombre: "Soporte Demo" },
  { rol: "administracion", email: "demo.administracion@demo.test", nombre: "Administración Demo" },
  { rol: "ventas", email: "demo.ventas@demo.test", nombre: "Ventas Demo" },
];

const URL = process.env.DEMO_ADMIN_URL ?? "postgresql://postgres:postgres@localhost:5433/cadit_demo";
if (!/\/cadit_demo$/.test(URL)) {
  console.error("DEMO_ADMIN_URL debe apuntar a cadit_demo.");
  process.exit(1);
}

const sql = postgres(URL, { max: 1 });

// El alumno y el profesor con más datos de la base: los que mejor muestran las pantallas del portal.
const [{ id: ALUMNO_ID }] = await sql`select c.id from contact c join enrollment e on e.contact_id = c.id
  join account_link l on l.contact_id = c.id group by c.id order by count(*) desc limit 1`;
const [{ id: PROFESOR_ID }] = await sql`select t.id from teacher t join cohort h on h.teacher_id = t.id
  join account_link l on l.teacher_id = t.id group by t.id order by count(*) desc limit 1`;
const hash = await hashPassword(CLAVE_DEMO);

try {
  const [{ id: orgId }] = await sql`select id from organization limit 1`;

  async function fijarClave(userId) {
    await sql`update account set password = ${hash}, updated_at = now()
      where user_id = ${userId} and provider_id = 'credential'`;
    const [{ n }] = await sql`select count(*)::int n from account where user_id = ${userId} and provider_id = 'credential'`;
    if (n === 0) {
      await sql`insert into account (id, account_id, provider_id, user_id, password, created_at, updated_at)
        values (${nanoid()}, ${userId}, 'credential', ${userId}, ${hash}, now(), now())`;
    }
    await sql`update "user" set must_change_password = false, email_verified = true where id = ${userId}`;
  }

  for (const c of CUENTAS_STAFF) {
    let [u] = await sql`select id from "user" where email = ${c.email}`;
    if (!u) {
      u = { id: nanoid(32) };
      await sql`insert into "user" (id, name, email, email_verified, created_at, updated_at, must_change_password)
        values (${u.id}, ${c.nombre}, ${c.email}, true, now(), now(), false)`;
    }
    await fijarClave(u.id);
    const [m] = await sql`select id from member where user_id = ${u.id} and organization_id = ${orgId}`;
    if (m) {
      await sql`update member set role = ${c.rol} where id = ${m.id}`;
    } else {
      await sql`insert into member (id, organization_id, user_id, role, created_at, receives_internal_notices)
        values (${nanoid()}, ${orgId}, ${u.id}, ${c.rol}, now(), false)`;
    }
    console.log(`  staff   ${c.rol.padEnd(15)} ${c.email}`);
  }

  const [alumno] = await sql`select l.user_id, u.email from account_link l join "user" u on u.id = l.user_id
    where l.contact_id = ${ALUMNO_ID}`;
  await fijarClave(alumno.user_id);
  console.log(`  alumno  ${alumno.email}`);

  const [profesor] = await sql`select l.user_id, u.email from account_link l join "user" u on u.id = l.user_id
    where l.teacher_id = ${PROFESOR_ID}`;
  await fijarClave(profesor.user_id);
  console.log(`  profesor ${profesor.email}`);

  await mkdir("demos-output/guia", { recursive: true });
  // Los ids van a un archivo local (ver ids.mjs); los demás los conservan si ya estaban.
  let ids = {};
  try { ids = JSON.parse(await readFile("demos-output/guia/ids.json", "utf8")); } catch {}
  const base = { alumno: ALUMNO_ID, profesor: PROFESOR_ID };
  for (const k of ["legajo", "estadoDeCuenta", "seguimiento", "auditoria"]) base[k] = ids[k] ?? ALUMNO_ID;
  await writeFile("demos-output/guia/ids.json", JSON.stringify({ ...ids, ...base }, null, 2));
  await writeFile("demos-output/guia/cuentas.json", JSON.stringify({ alumno: alumno.email, profesor: profesor.email }, null, 2));
  console.log(`\nContraseña de todas: ${CLAVE_DEMO}`);
} finally {
  await sql.end();
}
