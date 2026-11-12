/** Grabaciones de Zoom: tabla, estados, filtros y enlace. */
export const rol = "soporte";
export const ruta = "/grabaciones";

export async function guion(g) {
  const { page } = g;
  const tabla = page.locator("[data-recordings-table]");
  await tabla.waitFor({ timeout: 120000 });

  await g.paso("Aquí están las grabaciones en la nube de las aulas de Zoom", page.getByRole("heading", { name: /Grabaciones/ }).locator("xpath=ancestor::*[2]"), { sostener: 3.2 });
  await g.paso("El estado indica si la grabación ya está asignada a una clase", page.getByRole("group", { name: "Estado" }), { sostener: 3.6 });
  await g.paso("Al elegir «Asignada» solo se listan las que ya tienen clase", page.getByRole("group", { name: "Estado" }).getByRole("button", { name: /Asignada/ }), {
    accion: "clic", sostener: 3.2,
    despues: () => page.locator("[data-recording-id][data-state=asignada]").first().waitFor({ timeout: 60000 }),
  });
  await g.paso("Cada fila muestra inicio, duración, aula, tema, clase y cuenta", page.locator("[data-recording-id]").first(), { sostener: 3.8 });
  await g.paso("Los filtros de cuenta, aula y fechas acotan la lista", page.locator("#rec-connection").locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), { sostener: 3.4 });
  await g.paso("«Copiar enlace» entrega la dirección sin entrar a Zoom; «Ver» la abre en Zoom", page.getByRole("button", { name: "Copiar enlace" }).first().locator("xpath=.."), { sostener: 4 });
}
