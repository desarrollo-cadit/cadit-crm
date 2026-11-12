/** Académico: pestañas, buscador, filtros por estado y año, progreso y cupos. */

export const rol = "coordinacion";
export const ruta = "/academico?tab=grupos";

export async function guion(g) {
  const { page } = g;
  const buscador = page.getByPlaceholder("Buscar grupo por nombre, curso o profesor…");
  const tarjetaDeFiltros = page.getByText(/^Mostrando/).locator("xpath=ancestor::div[contains(@class,'rounded')][1]");

  await g.paso(
    "Académico tiene cuatro pestañas: cursos, grupos, profesores y aulas",
    page.getByRole("button", { name: "Cursos", exact: true }).locator("xpath=ancestor::div[1]"),
    { sostener: 3.4 }
  );

  await g.paso("Arriba, el resumen cuenta los grupos en curso, por empezar y finalizados", page.getByRole("list", { name: "Resumen de grupos" }), {
    sostener: 3.4,
  });

  await g.paso("El buscador filtra por nombre del grupo, curso o profesor, sin importar tildes", tarjetaDeFiltros, {
    sostener: 4.4,
    despues: async () => {
      await g.escribir(buscador, "revit");
      await page.getByText(/^Mostrando \d+ de/).waitFor();
    },
  });

  await g.paso(
    "El estado se elige con un clic y «Mostrando N de M» indica cuántos grupos quedan",
    page.getByRole("button", { name: /^En curso \d+/ }),
    { accion: "clic", sostener: 4 }
  );

  await g.paso(
    "Cada grupo muestra su progreso, «Clase X de Y», y cuántos alumnos tiene inscriptos",
    page.getByText(/^Clase \d+ de \d+/).first().locator("xpath=ancestor::li[1]"),
    { sostener: 4.6 }
  );

  await g.paso("El año y el tipo de curso completan los filtros", page.getByRole("button", { name: /^Año:/ }), {
    accion: "clic",
    sostener: 3.4,
    despues: async () => {
      await g.pausa(1);
      await page.keyboard.press("Escape");
    },
  });

  await g.paso("«Profesores» lista a cada docente con sus cursos", page.getByRole("button", { name: "Profesores", exact: true }), {
    accion: "clic",
    sostener: 3,
  });

  await g.paso("«Aulas» muestra las salas de reunión y avisa cuando dos clases se pisan", page.getByRole("button", { name: "Aulas", exact: true }), {
    accion: "clic",
    sostener: 3.4,
  });
}
