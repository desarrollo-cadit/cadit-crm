/**
 * CLI del seed académico (004): `pnpm seed:academic`. Acepta --force para
 * recargar aunque haya datos demo académicos. Independiente de
 * `seed:demo` (Ferretería El Martillo, negocio genérico). Se bundlea con
 * esbuild (alias @ → ./src).
 */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { isAcademicDemoEmpty, seedAcademicDemo } from "@/server/seed/academic";

function loadEnvVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(".env", "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim();
  } catch {
    return undefined;
  }
}

const url = loadEnvVar("DATABASE_URL");
if (!url) {
  console.error("[seed:academic] DATABASE_URL no está definida");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(sql, { schema });

const orgs = await db.select().from(schema.organization).limit(1);
const org = orgs[0];
if (!org) {
  console.error(
    "[seed:academic] No hay organización: regístrate primero en la app y vuelve a correr el seed"
  );
  await sql.end();
  process.exit(1);
}

const force = process.argv.includes("--force");
if (!force && !(await isAcademicDemoEmpty(db, org.id))) {
  console.error(
    "[seed:academic] Ya hay datos demo académicos. Usa --force para recargarlos."
  );
  await sql.end();
  process.exit(1);
}

const result = await seedAcademicDemo(db, org.id);
console.log(
  `[seed:academic] Demo académica cargada: ${result.courses} cursos, ${result.cohorts} cohortes, ${result.enrollments} inscripciones`
);
await sql.end();
process.exit(0);
