/** Reportes: cursos, alumnos, ventas, embudo y recompra. */
export const rol = "direccion";
export const ruta = "/reportes";

const tarjeta = (loc) => loc.locator("xpath=ancestor::article[1]");

export async function guion(g) {
  const { page } = g;
  await g.paso("Reportes reúne las cifras del historial de cursadas en una sola pantalla", page.getByRole("heading", { name: "Reportes", level: 1 }).locator("xpath=.."), { sostener: 3.4 });
  await g.paso("El período se elige arriba: últimos 12 meses, este año o todo el historial", page.getByRole("group", { name: "Período de los reportes" }), {
    accion: "clic", sostener: 3.6,
    despues: async () => { await page.getByRole("button", { name: "Todo el historial" }).click(); await g.pausa(2); },
  });
  await g.paso("Cursos más cursados ordena el ranking de los cursos con más alumnos", tarjeta(page.getByRole("heading", { name: "Cursos más cursados" })), { sostener: 3.6 });
  await g.paso("Alumnos por período se ve por año o por trimestre", tarjeta(page.getByRole("heading", { name: "Alumnos", exact: true })), { sostener: 3.4 });
  await g.paso("Empresas que más capacitan y la comparación entre empresas y particulares", tarjeta(page.getByRole("heading", { name: "Empresas que más capacitan" })), { sostener: 3.6 });
  await g.paso("El embudo de leads por origen muestra de dónde llegan los interesados", tarjeta(page.getByRole("heading", { name: "Embudo de leads por origen" })), { sostener: 3.6 });
  await g.paso("Recompra indica quiénes volvieron a inscribirse; los ingresos solo aparecen con permiso de cobranza", tarjeta(page.getByRole("heading", { name: "Recompra" })), { sostener: 4 });
}
