/** Licencias: stock por programa y equipo, y quién tiene cada licencia. */

export const rol = "soporte";
export const ruta = "/licencias";

const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded')][1]");

export async function guion(g) {
  const { page } = g;

  const equipo = tarjeta(page.getByRole("heading", { name: "ATC UY" }));
  await g.paso("Cada equipo de Autodesk tiene su propio cupo de cada programa", equipo, { sostener: 3.4 });

  await g.paso(
    "Se indican las licencias ocupadas y las libres. «En Autodesk» son asientos que el campus no cuenta",
    equipo.getByRole("row", { name: /Revit/ }),
    { sostener: 4.2 }
  );

  const tabla = page.getByRole("columnheader", { name: "Asignadas" }).locator("xpath=ancestor::table");
  await g.paso("Abajo, el total de cada programa sumando todos los equipos", tabla, { sostener: 3.4 });

  await g.paso(
    "Un clic en el nombre del programa muestra quién tiene sus licencias",
    tabla.getByRole("button", { name: "Revit" }),
    { accion: "clic", sostener: 3.4, despues: () => page.getByRole("heading", { name: "Revit" }).waitFor() }
  );

  const detalle = page.getByRole("columnheader", { name: "Alumno o profesor" }).locator("xpath=ancestor::table");
  await g.paso("Cada fila indica la persona, el grupo, el equipo, el origen, la fecha y el estado", detalle, {
    sostener: 4.2,
  });

  const buscador = page.getByPlaceholder("Buscar alumno o profesor…");
  const nombre = (await detalle.locator("tbody tr").first().locator("a").first().innerText()).split(" ")[0];
  await g.paso("El buscador y los filtros de grupo, equipo, titular y origen acotan la lista", buscador.locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), {
    sostener: 3.6,
    despues: async () => {
      await g.escribir(buscador, nombre);
    },
  });
}
