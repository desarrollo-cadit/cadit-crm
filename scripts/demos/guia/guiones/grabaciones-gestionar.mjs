/** Sincronizar y adjudicar grabaciones (sin modificar las sembradas). */
export const rol = "coordinacion";
export const ruta = "/grabaciones";

export async function guion(g) {
  const { page } = g;
  await page.locator("[data-recordings-table]").waitFor({ timeout: 120000 });
  const estado = page.getByRole("group", { name: "Estado" });

  await g.paso("«Sincronizar» trae de Zoom las grabaciones nuevas y las asigna a su clase", page.getByRole("button", { name: /Sincroniza/ }), { sostener: 3.6 });
  await g.paso("«Verificar en Zoom» busca las que se borraron allá; corre sola una vez por día", page.getByRole("button", { name: "Verificar en Zoom" }), { sostener: 3.8 });
  await g.paso("Ambigua o en conflicto: el sistema no adivina, una persona decide", estado, { sostener: 3.6 });
  await g.paso("Las que están «Sin clase» pueden asignarse a mano", estado.getByRole("button", { name: /Sin clase/ }), {
    accion: "clic", sostener: 3,
    despues: () => page.locator("[data-recording-id][data-state=sin_clase]").first().waitFor({ timeout: 60000 }),
  });
  const asignar = page.getByRole("button", { name: "Asignar a clase" }).first();
  await g.paso("«Asignar a clase» abre las clases sugeridas para esa fecha", asignar, {
    accion: "clic", sostener: 3,
    despues: () => page.getByRole("region", { name: "Asignar grabación a una clase" }).waitFor({ timeout: 60000 }),
  });
  await g.paso("Se puede buscar por grupo o por día, y elegir varias clases si la reunión es compartida", page.getByRole("region", { name: "Asignar grabación a una clase" }), { sostener: 4.4 });
  await g.paso("Una decisión manual no la deshace la sincronización; «Volver a automático» la revierte", page.getByRole("region", { name: "Asignar grabación a una clase" }).getByRole("button", { name: "Cerrar" }), {
    accion: "clic", sostener: 3.4,
  });
}
