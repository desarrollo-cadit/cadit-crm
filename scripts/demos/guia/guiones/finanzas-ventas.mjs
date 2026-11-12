/** Finanzas: ventas por vendedor y período. */
import { apiComo, exigir, sufijo } from "../datos.mjs";

export const rol = "administracion";
export const ruta = "/finanzas?tab=ventas";

export async function guion(g) {
  const { page } = g;
  const nombre = `Venta${sufijo()}`;
  const { api } = await apiComo("direccion");
  const grupo = (await api("/api/cohorts")).json.cohorts.find((c) => c.name === "AutoCAD 2D");
  const vend = (await api("/api/sellers")).json.sellers.find((s) => !s.archived);
  exigir("alta", await api("/api/enrollments", { method: "POST", body: JSON.stringify({ cohortId: grupo.id, sellerId: vend.id, amount: 1800000, currency: "UYU", contact: { firstName: nombre, lastName: "Demostración", email: `${nombre.toLowerCase()}@demo.test` } }) }));
  await page.reload({ waitUntil: "load" });
  const periodo = page.getByRole("button", { name: /Período/ });
  await periodo.waitFor({ timeout: 120000 });

  await g.paso("«Ventas por vendedor» sirve para liquidar comisiones", page.getByRole("button", { name: "Ventas por vendedor" }), { sostener: 3.2 });
  await g.paso("El período se elige aquí", periodo, { accion: "clic", sostener: 2.6, despues: () => page.getByText("Noviembre 2026").first().waitFor() });
  await g.paso("Se selecciona el mes de las ventas", page.getByText("Noviembre 2026").first(), {
    accion: "clic", sostener: 2.6, despues: () => page.getByText(new RegExp(nombre)).first().waitFor({ timeout: 60000 }),
  });
  const bloque = page.getByText(new RegExp(nombre)).first().locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]//h3/..");
  await g.paso("Cada bloque es un vendedor, con la cantidad de ventas y el total por moneda", bloque, { sostener: 4.4 });
  await g.paso("Cada fila indica fecha, alumno, grupo, importe y moneda", page.getByRole("row", { name: new RegExp(nombre) }), { sostener: 3.6 });
  await g.paso("El grupo lleva a su ficha, donde se corrige la venta", page.getByRole("row", { name: new RegExp(nombre) }).locator("a"), { sostener: 3.4 });
}
