/** Anular un pago mal cargado y refinanciar el plan, sobre una venta creada por el guion. */
import { apiComo, exigir, sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/facturacion";

export async function guion(g) {
  const { page } = g;
  const nombre = `Corregir${sufijo()}`;
  const { api } = await apiComo("direccion");
  const grupo = (await api("/api/cohorts")).json.cohorts.find((c) => c.name === "AutoCAD 2D");
  const vend = (await api("/api/sellers")).json.sellers.find((s) => !s.archived);
  const insc = exigir("alta", await api("/api/enrollments", { method: "POST", body: JSON.stringify({ cohortId: grupo.id, sellerId: vend.id, amount: 2400000, currency: "UYU", contact: { firstName: nombre, lastName: "Demostración", email: `${nombre.toLowerCase()}@demo.test` } }) }));
  const hoy = new Date().toISOString().slice(0, 10);
  const plan = exigir("plan", await api(`/api/enrollments/${insc.enrollment.id}/installments`, { method: "POST", body: JSON.stringify({ count: 2, firstDueDate: hoy }) }));
  exigir("pago", await api(`/api/enrollments/${insc.enrollment.id}/payments`, { method: "POST", body: JSON.stringify({ installmentId: plan.installments[0].id, amount: 900000, paidAt: hoy, method: "efectivo", idempotencyKey: `g-${nombre}` }) }));
  await page.reload({ waitUntil: "load" });
  const buscador = page.getByPlaceholder(/Buscar por alumno/);
  await buscador.waitFor({ timeout: 120000 });
  await g.escribir(buscador, nombre);
  const fila = page.getByRole("row", { name: new RegExp(nombre) });
  await fila.waitFor({ timeout: 60000 });

  await g.paso("Corregir la cobranza requiere un permiso propio, que tienen Coordinación y Dirección", fila.getByRole("button", { name: "Seguimiento de pagos" }), {
    accion: "clic",
    sostener: 3.6,
    despues: () => page.getByRole("button", { name: "anular" }).first().waitFor({ timeout: 30000 }),
  });
  await g.paso("Un pago mal cargado no se borra: se anula con «anular»", page.getByRole("button", { name: "anular" }).first(), { sostener: 3.4 });
  page.once("dialog", (d) => d.accept("Monto mal cargado"));
  await g.paso("Se indica el motivo, y el pago queda tachado con esa razón", page.getByRole("button", { name: "anular" }).first(), {
    accion: "clic",
    sostener: 3.4,
    despues: () => page.getByText(/anulado: Monto mal cargado/).waitFor({ timeout: 30000 }),
  });
  await g.paso("El saldo de la cuota vuelve a su valor original", page.getByText("Saldo:").locator("xpath=.."), { sostener: 3.4 });
  await g.paso("«Refinanciar» rearma el plan: las cuotas actuales se anulan y se crean otras", page.getByRole("button", { name: "Refinanciar" }), {
    accion: "clic",
    sostener: 3.2,
    despues: () => page.getByRole("dialog").waitFor(),
  });
  await g.paso("Si alguna cuota tiene pagos vigentes, primero hay que anularlos", page.getByRole("dialog"), {
    sostener: 4,
    despues: async () => {
      await page.getByRole("dialog").locator("input[type=date]").fill(new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10));
    },
  });
  await g.paso("«Rearmar plan» deja las cuotas nuevas por el mismo total", page.getByRole("dialog").getByRole("button", { name: "Rearmar plan" }), {
    accion: "clic",
    sostener: 3.4,
    despues: () => page.getByText("Plan de cuotas generado.").waitFor({ timeout: 30000 }),
  });
}
