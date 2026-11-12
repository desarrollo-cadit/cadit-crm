/** Pipeline: el embudo de interesados. */
export const rol = "direccion";
export const ruta = "/pipeline";

export async function guion(g) {
  const { page } = g;
  const select = page.getByLabel("Filtrar por grupo");
  await g.paso("El Pipeline ordena a los interesados en columnas, una por etapa", page.locator("div.flex.h-full.gap-3").first(), { sostener: 3.8 });
  await g.paso("Cada tarjeta indica la persona, el curso de interés y los días sin actividad", page.locator("div.cursor-grab").first(), { sostener: 3.8 });
  await g.paso("El filtro cambia entre leads sin grupo, todos los grupos o un grupo puntual", select, {
    sostener: 4.4,
    despues: async () => { await select.selectOption("all"); await g.pausa(2); },
  });
  await g.paso("Con «Todos los grupos» se ve quién está anotado en cada uno", page.locator("div.cursor-grab").first(), { sostener: 3.6 });
  await g.paso("Sin permiso de seguimiento el tablero es de solo lectura: no se arrastra", null, { sostener: 3.4 });
}
