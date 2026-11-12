/** Plan de cuotas y registro de pagos desde Facturación. */
import { apiComo, exigir, sufijo } from "../datos.mjs";

export const rol = "administracion";
export const ruta = "/facturacion";

export async function guion(g) {
  const { page } = g;
  const nombre = `Cuotas${sufijo()}`;
  const { api } = await apiComo("direccion");
  const grupo = (await api("/api/cohorts")).json.cohorts.find((c) => c.name === "AutoCAD 2D");
  const vend = (await api("/api/sellers")).json.sellers.find((s) => !s.archived);
  exigir("alta", await api("/api/enrollments", { method: "POST", body: JSON.stringify({ cohortId: grupo.id, sellerId: vend.id, amount: 3000000, currency: "UYU", contact: { firstName: nombre, lastName: "Demostración", email: `${nombre.toLowerCase()}@demo.test` } }) }));
  await page.reload({ waitUntil: "load" });
  const buscador = page.getByPlaceholder(/Buscar por alumno/);
  await buscador.waitFor({ timeout: 120000 });
  await g.escribir(buscador, nombre);
  const fila = page.getByRole("row", { name: new RegExp(nombre) });
  await fila.waitFor({ timeout: 60000 });
  const dlg = page.getByRole("dialog");

  await g.paso("La columna «Cobro» resume lo pagado; desde aquí también se arma el plan", fila.getByRole("button", { name: "Seguimiento de pagos" }), {
    accion: "clic",
    sostener: 3.2,
    despues: () => page.getByRole("button", { name: "Generar plan" }).waitFor({ timeout: 30000 }),
  });
  await g.paso("Sin plan, se indica la cantidad de cuotas y el primer vencimiento", page.getByRole("button", { name: "Generar plan" }).locator("xpath=.."), {
    sostener: 3.4,
    despues: async () => {
      await page.locator("input[type=date]").last().fill(new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10));
    },
  });
  await g.paso("«Generar plan» crea las cuotas por el total pactado", page.getByRole("button", { name: "Generar plan" }), {
    accion: "clic",
    sostener: 3,
    despues: () => page.getByRole("button", { name: "Registrar pago" }).first().waitFor({ timeout: 30000 }),
  });
  await g.paso("Cada cuota muestra su vencimiento, estado y saldo", page.getByRole("button", { name: "Registrar pago" }).first().locator("xpath=ancestor::li"), { sostener: 3.4 });
  await g.paso("«Registrar pago» abre el formulario de cobro", page.getByRole("button", { name: "Registrar pago" }).first(), {
    accion: "clic",
    sostener: 3,
    despues: () => dlg.waitFor(),
  });
  await g.paso("Se completan monto, fecha, medio y banco; se admite el pago parcial", dlg, {
    sostener: 3.8,
    despues: async () => {
      await page.locator("#pay-method").selectOption("transferencia");
      await g.escribir(page.locator("#pay-bank"), "Itaú");
    },
  });
  await g.paso("Al registrar, el saldo de la venta baja", dlg.getByRole("button", { name: "Registrar", exact: true }), {
    accion: "clic",
    sostener: 3.4,
    despues: () => page.getByText(/· Itaú/).first().waitFor({ timeout: 30000 }),
  });
  await g.paso("El pago queda en la lista, con su banco y la cuota imputada", page.getByText(/· Itaú/).first(), { sostener: 3.4 });
}
