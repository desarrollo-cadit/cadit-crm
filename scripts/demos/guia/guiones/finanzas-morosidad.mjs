/** Morosidad: cuotas vencidas, atraso mínimo y saldo por moneda. */
import { apiComo, exigir, sufijo } from "../datos.mjs";

export const rol = "administracion";
export const ruta = "/finanzas/morosidad";

export async function guion(g) {
  const { page } = g;
  const nombre = `Moroso${sufijo()}`;
  const { api } = await apiComo("direccion");
  const grupo = (await api("/api/cohorts")).json.cohorts.find((c) => c.name === "AutoCAD 2D");
  const vend = (await api("/api/sellers")).json.sellers.find((s) => !s.archived);
  const insc = exigir("alta", await api("/api/enrollments", { method: "POST", body: JSON.stringify({
    cohortId: grupo.id, sellerId: vend.id, amount: 3000000, currency: "UYU",
    contact: { firstName: nombre, lastName: "Demostración", email: `${nombre.toLowerCase()}@demo.test` } }) }));
  const dia = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  exigir("plan", await api(`/api/enrollments/${insc.enrollment.id}/installments`, { method: "POST", body: JSON.stringify({ count: 3, firstDueDate: dia }) }));
  await page.reload({ waitUntil: "load" });
  await page.getByText(nombre).waitFor({ timeout: 120000 });

  await g.paso("Morosidad lista las cuotas vencidas y sin saldar, de mayor a menor atraso", page.getByRole("heading", { name: "Morosidad" }).locator("xpath=ancestor::section"), { sostener: 3.6 });
  await g.paso("El saldo vencido se totaliza por moneda, sin mezclarlas", page.locator("p.text-destructive").first().locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]"), { sostener: 3.4 });
  await g.paso("Cada fila indica alumno, grupo, monto vencido, cuotas y días de atraso", page.getByRole("row", { name: new RegExp(nombre) }), { sostener: 3.8 });
  await g.paso("«Atraso mínimo» deja solo a quienes superan esa cantidad de días", page.locator("#min-days"), {
    sostener: 3.4, despues: async () => { await g.escribir(page.locator("#min-days"), "60"); await page.getByText("Nadie con cuotas vencidas.").waitFor({ timeout: 30000 }); },
  });
  await g.paso("Con un atraso mínimo mayor, la lista se acota", page.getByText("Nadie con cuotas vencidas."), { sostener: 3, despues: async () => { await g.escribir(page.locator("#min-days"), "0"); await page.getByText(nombre).waitFor(); } });
  await g.paso("El nombre del grupo lleva a su ficha, donde se gestiona el cobro", page.getByRole("row", { name: new RegExp(nombre) }).locator("a"), { sostener: 3.2 });
}
