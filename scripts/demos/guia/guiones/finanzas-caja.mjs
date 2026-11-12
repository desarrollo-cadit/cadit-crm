/** Finanzas: caja y devengado de un período, por moneda. */
import { apiComo, exigir, sufijo } from "../datos.mjs";

export const rol = "administracion";
export const ruta = "/finanzas?tab=caja";

export async function guion(g) {
  const { page } = g;
  const nombre = `Caja${sufijo()}`;
  const { api } = await apiComo("direccion");
  const grupo = (await api("/api/cohorts")).json.cohorts.find((c) => c.name === "AutoCAD 2D");
  const vend = (await api("/api/sellers")).json.sellers.find((s) => !s.archived);
  const insc = exigir("alta", await api("/api/enrollments", { method: "POST", body: JSON.stringify({ cohortId: grupo.id, sellerId: vend.id, amount: 2000000, currency: "UYU", contact: { firstName: nombre, lastName: "Demostración", email: `${nombre.toLowerCase()}@demo.test` } }) }));
  const hoy = new Date().toISOString().slice(0, 10);
  const plan = exigir("plan", await api(`/api/enrollments/${insc.enrollment.id}/installments`, { method: "POST", body: JSON.stringify({ count: 2, firstDueDate: hoy }) }));
  exigir("pago", await api(`/api/enrollments/${insc.enrollment.id}/payments`, { method: "POST", body: JSON.stringify({ installmentId: plan.installments[0].id, amount: 500000, paidAt: hoy, method: "transferencia", bank: "BROU", idempotencyKey: `g-${nombre}` }) }));
  await page.reload({ waitUntil: "load" });
  await page.getByRole("heading", { name: "Finanzas" }).waitFor({ timeout: 120000 });
  const periodo = page.getByRole("button", { name: /Período/ });

  await g.paso("Finanzas presenta el cierre de un período para transcribir a la contabilidad", page.getByRole("heading", { name: "Finanzas" }).locator("xpath=ancestor::*[2]"), { sostener: 3.4 });
  await g.paso("El período se elige aquí; por defecto se muestra el mes anterior", periodo, {
    accion: "clic", sostener: 2.8, despues: () => page.getByText(/Noviembre 2026/).first().waitFor(),
  });
  await g.paso("Se selecciona el mes que se desea cerrar", page.getByText(/Noviembre 2026/).first(), {
    accion: "clic", sostener: 2.6, despues: () => page.getByRole("heading", { name: /Caja en/ }).first().waitFor({ timeout: 60000 }),
  });
  await g.paso("Caja es lo que entró en el período, con un total por moneda", page.getByRole("heading", { name: /Caja en/ }).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), { sostener: 4 });
  await g.paso("Devengado muestra las cuotas con vencimiento en el período, cobradas o no", page.getByRole("button", { name: "Devengado" }), {
    accion: "clic", sostener: 3, despues: () => page.getByRole("heading", { name: /Devengado en/ }).first().waitFor({ timeout: 60000 }),
  });
  await g.paso("Emitido, cobrado y saldo se calculan por moneda y nunca se suman entre sí", page.getByRole("heading", { name: /Devengado en/ }).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), { sostener: 4 });
}
