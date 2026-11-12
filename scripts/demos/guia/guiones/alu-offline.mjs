/** Portal del alumno: cursos offline, temas y progreso. */
export const rol = "alumno";
export const ruta = "/portal/cursos-offline";

export async function guion(g) {
  const { page } = g;
  const curso = page.getByRole("link", { name: /Revit® Básico 2025/ }).first();
  await curso.waitFor({ state: "visible", timeout: 60000 });

  await g.paso("Cursos offline lista los cursos a los que el alumno tiene acceso vigente", page.getByRole("heading", { name: "Cursos offline" }).locator("xpath=ancestor::*[2]"), { sostener: 4.5 });

  await g.paso("Cada curso muestra su progreso: temas vistos y cuestionarios aprobados", curso, { sostener: 5 });

  await g.paso("Seleccionar un curso abre su contenido", curso, {
    accion: "clic",
    sostener: 3,
    despues: async () => {
      await page.getByText("se habilitan en orden").waitFor({ state: "visible", timeout: 90000 });
    },
  });

  await g.paso("Los temas se habilitan en orden; los cuestionarios, sin orden obligatorio", page.getByText("se habilitan en orden").locator("xpath=ancestor::*[contains(@class,'rounded')][1]/.."), { sostener: 5 });

  await g.paso("Las lecciones agrupan los temas, y el candado marca los que aún están bloqueados", page.locator('a[href*="/temas/"]').first().locator("xpath=ancestor::li[1]/.."), { sostener: 5 });

  await g.paso("Los cuestionarios figuran aparte, con su estado", page.locator('a[href*="/cuestionarios/"]').first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), { sostener: 4.5 });

  const tema = page.locator('a[href*="/temas/"]').first();
  await g.paso("Un tema abre su texto y su video", tema, {
    accion: "clic",
    sostener: 4,
    despues: async () => {
      await page.locator("article").first().waitFor({ state: "visible", timeout: 90000 });
    },
  });

  await g.paso("El tema se completa al ver al menos el 90 % del video; recién entonces se habilita el siguiente", page.getByRole("navigation", { name: "Temas" }), { sostener: 5.5 });
}
