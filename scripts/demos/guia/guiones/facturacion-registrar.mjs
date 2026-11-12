/** Registrar factura y recibo sobre una venta creada por el guion. */
import { apiComo, exigir, sufijo } from "../datos.mjs";

export const rol = "administracion";
export const ruta = "/facturacion";

export async function guion(g) {
  const { page } = g;
  const nombre = `Factura${sufijo()}`;
  const { api } = await apiComo("direccion");
  const grupo = (await api("/api/cohorts")).json.cohorts.find((c) => c.name === "AutoCAD 2D");
  const vend = (await api("/api/sellers")).json.sellers.find((s) => !s.archived);
  const insc = exigir("alta", await api("/api/enrollments", { method: "POST", body: JSON.stringify({ cohortId: grupo.id, sellerId: vend.id, amount: 2400000, currency: "UYU", contact: { firstName: nombre, lastName: "Demostración", email: `${nombre.toLowerCase()}@demo.test` } }) }));
  const hoy = new Date().toISOString().slice(0, 10);
  const plan = exigir("plan", await api(`/api/enrollments/${insc.enrollment.id}/installments`, { method: "POST", body: JSON.stringify({ count: 2, firstDueDate: hoy }) }));
  exigir("pago", await api(`/api/enrollments/${insc.enrollment.id}/payments`, { method: "POST", body: JSON.stringify({ installmentId: plan.installments[0].id, amount: 1200000, paidAt: hoy, method: "transferencia", bank: "BROU", idempotencyKey: `g-${nombre}` }) }));
  await page.reload({ waitUntil: "load" });
  const buscador = page.getByPlaceholder(/Buscar por alumno/);
  await buscador.waitFor({ timeout: 120000 });
  await g.escribir(buscador, nombre);
  const fila = page.getByRole("row", { name: new RegExp(nombre) });
  await fila.waitFor({ timeout: 60000 });

  await g.paso("Cada venta pendiente tiene su campo para el número de factura", fila.getByLabel(/Número de factura/), { sostener: 3.2 });
  await g.paso("Se escribe el número de la factura emitida", fila.getByLabel(/Número de factura/), {
    sostener: 2.8,
    despues: async () => {
      await g.escribir(fila.getByLabel(/Número de factura/), "A-1042");
    },
  });
  await g.paso("«Registrar factura» guarda el número y la venta sale de Pendientes", fila.getByRole("button", { name: "Registrar factura" }), {
    accion: "clic",
    sostener: 3,
    despues: () => page.getByText(/Factura A-1042 anotada/).waitFor({ timeout: 30000 }),
  });
  await g.paso("Las ventas con número pasan a «Facturadas», donde se pueden corregir", page.getByRole("button", { name: "Facturadas" }), {
    accion: "clic",
    sostener: 3,
    despues: async () => {
      await page.getByRole("row", { name: new RegExp(nombre) }).waitFor({ timeout: 60000 });
    },
  });
  const f2 = page.getByRole("row", { name: new RegExp(nombre) });
  await g.paso("«Seguimiento de pagos» muestra los cobros de la venta", f2.getByRole("button", { name: "Seguimiento de pagos" }), {
    accion: "clic",
    sostener: 3,
    despues: () => page.getByText("anotar recibo").first().waitFor({ timeout: 30000 }),
  });
  await g.paso("Cada pago admite su propio número de recibo con «anotar recibo»", page.getByText("anotar recibo").first().locator("xpath=ancestor::ul[1]"), { sostener: 3.8 });
}
