/** Facturación: qué falta facturar, filtros, totales por moneda y CSV. */
export const rol = "administracion";
export const ruta = "/facturacion";

export async function guion(g) {
  const { page } = g;
  const buscador = page.getByPlaceholder(/Buscar por alumno/);
  await buscador.waitFor({ timeout: 120000 });
  await page.getByRole("columnheader", { name: "Alumno" }).waitFor({ timeout: 120000 });

  await g.paso("Facturación lista las ventas que todavía no tienen número de factura", page.getByRole("heading", { name: "Facturación" }).locator("xpath=ancestor::header"), { sostener: 3.6 });
  await g.paso("Es la misma lista que Administración recibe por correo 7 y 2 días antes del inicio", page.getByText(/misma lista que/), { sostener: 3.6 });
  await g.paso("«Pendientes» y «Facturadas» separan las ventas según tengan o no número", page.getByRole("group", { name: "Ventas" }), { sostener: 3.2 });
  await g.paso("Se puede buscar por alumno, curso, vendedor, empresa o factura", buscador.locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), {
    sostener: 3.6,
    despues: async () => {
      await g.escribir(buscador, "AutoCAD");
    },
  });
  await g.paso("Los filtros de grupo, empresa y fecha de inicio acotan la lista", page.getByRole("button", { name: /Grupo:/ }), { sostener: 3.4 });
  await g.paso("Abajo, un total por moneda de lo que falta facturar", page.getByText(/Total UYU/).locator("xpath=.."), { sostener: 3.6 });
  await g.paso("«Exportar CSV» descarga exactamente la lista filtrada", page.getByRole("button", { name: "Exportar CSV" }), { sostener: 3.4 });
}
