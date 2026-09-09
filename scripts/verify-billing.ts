/**
 * Verificación manual de cobranza (008) contra la base real.
 *
 * Existe porque probar esto por HTTP exige un servidor corriendo, y con dos
 * dev servers compartiendo `.next` el módulo se corrompe. Acá se llaman las
 * funciones del dominio directamente: es lo que importa validar, la capa HTTP
 * es un pasamanos ya cubierto por typecheck y build.
 *
 *   pnpm verify-billing
 *
 * Crea un plan, registra pagos, mide morosidad y caja, y BORRA todo al final.
 */

import { eq } from "drizzle-orm";
import {
  collectedByCurrency,
  generateInstallmentPlan,
  listInstallments,
  listOverdue,
  recordPayment,
  replaceInstallmentPlan,
  voidPayment,
} from "@/server/billing";
import { getDb, getSql, schema } from "@/lib/db";

const db = getDb();
const orgs = await db.select().from(schema.organization).limit(1);
const org = orgs[0];
if (!org) {
  console.error("No hay organización");
  process.exit(1);
}

const rows = await db
  .select({ id: schema.enrollment.id, amount: schema.enrollment.amount })
  .from(schema.enrollment)
  .where(eq(schema.enrollment.amount, 57000))
  .limit(1);
const enrollment = rows[0];
if (!enrollment) {
  console.error("No hay una inscripción de $57.000 para la prueba");
  process.exit(1);
}

console.log(`\nInscripción ${enrollment.id} — total $${enrollment.amount}\n`);

// 1. Plan de 3 cuotas con el primer vencimiento en el PASADO: nace vencida.
const plan = await generateInstallmentPlan(org.id, enrollment.id, {
  count: 3,
  firstDueDate: new Date("2026-05-10"),
});
if (!plan.ok) {
  console.error("No se pudo generar el plan:", plan.message);
  await getSql().end();
  process.exit(1);
}
console.log("Plan generado:");
for (const i of plan.data) {
  console.log(`  #${i.number}  $${i.amount}  vence ${i.dueDate.slice(0, 10)}  ${i.status}`);
}
console.log(`  suma = $${plan.data.reduce((s, i) => s + i.amount, 0)} (debe ser 57000)\n`);

// 2. Pago PARCIAL sobre la primera cuota.
const primera = plan.data[0]!;
const pago = await recordPayment(org.id, enrollment.id, {
  installmentId: primera.id,
  amount: 12000,
  paidAt: new Date(),
  method: "transferencia",
  idempotencyKey: "verify-billing-1",
});
console.log("Pago parcial de $12.000:", pago.ok ? "registrado" : pago.message);

// 3. Idempotencia: el MISMO intento no debe crear un segundo pago.
const repetido = await recordPayment(org.id, enrollment.id, {
  installmentId: primera.id,
  amount: 12000,
  paidAt: new Date(),
  method: "transferencia",
  idempotencyKey: "verify-billing-1",
});
console.log(
  "Reintento con la misma clave:",
  repetido.ok && pago.ok && repetido.data.id === pago.data.id
    ? `devolvió el MISMO pago (${repetido.data.id}) — no duplicó`
    : "DUPLICÓ (mal)"
);

const conPago = await listInstallments(org.id, enrollment.id);
console.log("\nEstado tras el pago parcial:");
for (const i of conPago) {
  console.log(`  #${i.number}  pagado $${i.paid}  saldo $${i.balance}  ${i.status}`);
}

// 4. Morosidad.
const overdue = await listOverdue(org.id);
const fila = overdue.rows.find((r) => r.enrollmentId === enrollment.id);
console.log("\nMorosidad:");
console.log(
  fila
    ? `  ${fila.contact.name} — ${fila.overdueCount} cuotas, $${fila.overdueAmount}, ${fila.daysOverdue} días de atraso`
    : "  (la inscripción no aparece)"
);
console.log(
  "  totales por moneda:",
  overdue.byCurrency.filter((c) => c.enrollments > 0).map((c) => `${c.currency} $${c.overdueTotal} (${c.enrollments})`).join(" · ") || "sin morosidad"
);

// 5. Caja cobrada del mes.
const hoy = new Date();
const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
const cobrado = await collectedByCurrency(org.id, desde, hasta);
console.log(
  "\nCobrado este mes:",
  cobrado.filter((c) => c.total > 0).map((c) => `${c.currency} $${c.total}`).join(" · ") || "nada"
);

// 6. Anulación: el pago no se borra y el saldo vuelve.
if (pago.ok) {
  await voidPayment(org.id, pago.data.id, { reason: "verificación" });
  const tras = await listInstallments(org.id, enrollment.id);
  const cobradoTras = await collectedByCurrency(org.id, desde, hasta);
  console.log(
    `\nTras anular: saldo cuota 1 = $${tras[0]!.balance} (debe volver a ${primera.amount})`
  );
  console.log(
    "  cobrado del mes:",
    cobradoTras.filter((c) => c.total > 0).map((c) => `${c.currency} $${c.total}`).join(" · ") ||
      "nada (el pago anulado no cuenta)"
  );
}

// 7. Refinanciación. Primero con un pago VIGENTE: debe rechazar, porque el
// pago quedaría colgado de una cuota que dejó de existir.
const pagoVivo = await recordPayment(org.id, enrollment.id, {
  installmentId: primera.id,
  amount: 5000,
  paidAt: new Date(),
  method: "efectivo",
});
const conPagos = await replaceInstallmentPlan(org.id, enrollment.id, {
  count: 6,
  firstDueDate: new Date("2026-10-01"),
});
console.log(
  "\nRefinanciar con un pago vigente:",
  conPagos.ok ? "PERMITIÓ (mal)" : `rechazado — ${conPagos.message}`
);

// Anulado ese pago, ahora sí debe dejar rearmar.
if (pagoVivo.ok) {
  await voidPayment(org.id, pagoVivo.data.id, { reason: "verificación" });
}
const refi = await replaceInstallmentPlan(org.id, enrollment.id, {
  count: 6,
  firstDueDate: new Date("2026-10-01"),
});
if (refi.ok) {
  const vig = refi.data.filter((i) => !i.canceledAt);
  const anu = refi.data.filter((i) => i.canceledAt);
  console.log(
    `Refinanciado: ${anu.length} cuotas anuladas (siguen visibles) + ${vig.length} nuevas, suma ${vig.reduce((s, i) => s + i.amount, 0)}`
  );
  console.log("  numeración:", refi.data.map((i) => i.number).join(", "));
} else {
  console.log("Refinanciación falló:", refi.message);
}

// Limpieza.
await db.delete(schema.payment).where(eq(schema.payment.enrollmentId, enrollment.id));
await db.delete(schema.installment).where(eq(schema.installment.enrollmentId, enrollment.id));
console.log("\nDatos de prueba borrados.\n");

await getSql().end();
process.exit(0);
