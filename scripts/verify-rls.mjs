/**
 * 012 (T023, T025) — Verificación de RLS contra una base REAL, con el rol de
 * aplicación.
 *
 * Por qué no es un test de vitest: lo que se prueba acá no es lógica nuestra,
 * es el comportamiento de PostgreSQL. Un mock del driver no puede demostrar
 * que la base filtra filas — demostraría que nuestro mock filtra filas, que no
 * le interesa a nadie.
 *
 * CONTRA BASE EFÍMERA. Crea dos organizaciones de prueba y las borra al final.
 *
 *   RLS_OWNER_URL=postgresql://postgres:postgres@localhost:5433/vocero_e2e \
 *   RLS_APP_URL=postgresql://cadit_app:...@localhost:5433/vocero_e2e \
 *   node scripts/verify-rls.mjs
 *
 * Sale distinto de cero si algo falla.
 */

import postgres from "postgres";

const OWNER_URL = process.env.RLS_OWNER_URL;
const APP_URL = process.env.RLS_APP_URL;

if (!OWNER_URL || !APP_URL) {
  console.error("Faltan RLS_OWNER_URL y/o RLS_APP_URL.");
  process.exit(1);
}

let checks = 0;
let failures = 0;

function ok(name, cond, extra = "") {
  checks++;
  if (cond) {
    console.log(`  OK  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

const owner = postgres(OWNER_URL, { max: 2, onnotice: () => {} });
// `max: 1` a propósito para T025: fuerza a que los dos pedidos concurrentes
// compartan LA MISMA conexión física. Con un pool grande podrían tocarles
// conexiones distintas y el test pasaría sin probar nada.
const app = postgres(APP_URL, { max: 1, onnotice: () => {} });

const ORG_A = "org_rls_a";
const ORG_B = "org_rls_b";

async function limpiar() {
  await owner`delete from contact where organization_id in (${ORG_A}, ${ORG_B})`;
  await owner`delete from organization where id in (${ORG_A}, ${ORG_B})`;
}

async function main() {
  await limpiar();

  await owner`
    insert into organization (id, name, slug)
    values (${ORG_A}, 'Academia A', ${"rls-a-" + Date.now()}),
           (${ORG_B}, 'Academia B', ${"rls-b-" + Date.now()})
  `;
  await owner`
    insert into contact (id, organization_id, first_name, wa_identity)
    values ('ct_rls_a', ${ORG_A}, 'Alumna de A', 'rls-a'),
           ('ct_rls_b', ${ORG_B}, 'Alumno de B', 'rls-b')
  `;

  console.log("\n== El dueño saltea RLS (por eso hace falta cadit_app) ==");
  const comoDueno = await owner`
    select count(*)::int as n from contact where id in ('ct_rls_a','ct_rls_b')
  `;
  ok(
    "postgres ve las 2 filas SIN declarar organización — RLS no lo toca",
    comoDueno[0].n === 2,
    `vio ${comoDueno[0].n}`
  );

  console.log("\n== T023 (FR-015): sin app.current_org no se ve NADA ==");
  const sinDeclarar = await app`
    select count(*)::int as n from contact where id in ('ct_rls_a','ct_rls_b')
  `;
  ok(
    "cadit_app sin declarar organización ve CERO filas",
    sinDeclarar[0].n === 0,
    `vio ${sinDeclarar[0].n}`
  );

  const conA = await app.begin(async (tx) => {
    await tx`select set_config('app.current_org', ${ORG_A}, true)`;
    return tx`select id from contact where id in ('ct_rls_a','ct_rls_b')`;
  });
  ok(
    "declarando A ve SOLO lo de A",
    conA.length === 1 && conA[0].id === "ct_rls_a",
    JSON.stringify(conA)
  );

  console.log("\n== La fuga que SET LOCAL evita ==");
  /**
   * `set_config(..., true)` es `SET LOCAL`: muere con la transacción. Si se
   * usara `false`, el valor quedaría pegado a la CONEXIÓN y el pedido
   * siguiente que la tome del pool heredaría la organización del anterior.
   * Ese es exactamente el agujero que esta fase existe para cerrar.
   */
  const trasCommit = await app`
    select count(*)::int as n from contact where id in ('ct_rls_a','ct_rls_b')
  `;
  ok(
    "terminada la transacción, la conexión vuelve limpia (0 filas)",
    trasCommit[0].n === 0,
    `heredó visibilidad de ${trasCommit[0].n} filas`
  );

  console.log("\n== T025: dos pedidos concurrentes, MISMA conexión ==");
  /**
   * El test que justifica la fase. Si esto falla, RLS no está protegiendo
   * nada y hay que volver a DV-002.
   */
  const [resA, resB] = await Promise.all([
    app.begin(async (tx) => {
      await tx`select set_config('app.current_org', ${ORG_A}, true)`;
      await tx`select pg_sleep(0.05)`; // fuerza el solapamiento
      return tx`select id, organization_id from contact where id in ('ct_rls_a','ct_rls_b')`;
    }),
    app.begin(async (tx) => {
      await tx`select set_config('app.current_org', ${ORG_B}, true)`;
      await tx`select pg_sleep(0.05)`;
      return tx`select id, organization_id from contact where id in ('ct_rls_a','ct_rls_b')`;
    }),
  ]);

  ok(
    "el pedido de A vio solo A",
    resA.length === 1 && resA[0].organization_id === ORG_A,
    JSON.stringify(resA)
  );
  ok(
    "el pedido de B vio solo B",
    resB.length === 1 && resB[0].organization_id === ORG_B,
    JSON.stringify(resB)
  );
  ok(
    "ninguno vio al otro",
    !resA.some((r) => r.organization_id === ORG_B) &&
      !resB.some((r) => r.organization_id === ORG_A),
    `${JSON.stringify(resA)} / ${JSON.stringify(resB)}`
  );

  console.log("\n== Escribir tampoco cruza organizaciones (with check) ==");
  let rechazado = false;
  try {
    await app.begin(async (tx) => {
      await tx`select set_config('app.current_org', ${ORG_A}, true)`;
      // Declarando A, intenta insertar una fila de B.
      await tx`
        insert into contact (id, organization_id, first_name, wa_identity)
        values ('ct_rls_intruso', ${ORG_B}, 'Intruso', 'rls-intruso')
      `;
    });
  } catch {
    rechazado = true;
  }
  ok("insertar en OTRA organización es rechazado por la política", rechazado);

  console.log("\n== cadit_app no puede escaparse ==");
  const flags = await owner`
    select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
    from pg_roles where rolname = 'cadit_app'
  `;
  ok(
    "cadit_app no es superusuario ni tiene BYPASSRLS",
    flags[0] &&
      !flags[0].rolsuper &&
      !flags[0].rolbypassrls &&
      !flags[0].rolcreatedb &&
      !flags[0].rolcreaterole,
    JSON.stringify(flags[0])
  );

  const duenas = await owner`
    select count(*)::int as n from pg_tables
    where schemaname = 'public' and tableowner = 'cadit_app'
  `;
  ok(
    "cadit_app no es dueño de ninguna tabla (el dueño saltea RLS)",
    duenas[0].n === 0,
    `es dueño de ${duenas[0].n}`
  );

  let truncateRechazado = false;
  try {
    await app`truncate contact`;
  } catch {
    truncateRechazado = true;
  }
  ok("cadit_app no puede TRUNCATE (RLS no filtra truncate)", truncateRechazado);
}

try {
  await main();
} catch (err) {
  console.error("\nERROR FATAL:", err);
  failures++;
} finally {
  await limpiar().catch(() => {});
  await app.end();
  await owner.end();
}

console.log(`\n===== ${checks - failures}/${checks} checks OK, ${failures} fallos =====`);
process.exit(failures > 0 ? 1 : 0);
