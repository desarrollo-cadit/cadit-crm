/** Catálogo de programas y equipos de licencias. */
import { sufijo } from "../datos.mjs";

export const rol = "soporte";
export const ruta = "/licencias";

export async function guion(g) {
  const { page } = g;
  const suf = sufijo();
  const dlg = page.getByRole("dialog");
  await page.getByRole("button", { name: "Nuevo programa" }).waitFor({ timeout: 120000 });

  await g.paso("Un programa nuevo se da de alta con «Nuevo programa»", page.getByRole("button", { name: "Nuevo programa" }), {
    accion: "clic", sostener: 3, despues: () => dlg.waitFor(),
  });
  await g.paso("Se indica el nombre y, si se desea, una foto para distinguirlo", dlg, {
    sostener: 3.6,
    despues: async () => { await g.escribir(page.locator("#software-name"), `Programa demo ${suf}`); },
  });
  await g.paso("Al guardar, el programa aparece en el catálogo", dlg.getByRole("button", { name: "Guardar" }), {
    accion: "clic", sostener: 3,
    despues: () => page.getByRole("button", { name: `Programa demo ${suf}`, exact: true }).waitFor({ timeout: 60000 }),
  });

  const equipo = page.getByRole("button", { name: "Editar el equipo ATC PY" });
  await g.paso("Cada equipo de Autodesk tiene su cupo: «Editar» abre sus datos", equipo, {
    accion: "clic", sostener: 3, despues: () => dlg.waitFor(),
  });
  await g.paso("Aquí se define el nombre en Autodesk y el cupo de cada programa", dlg, { sostener: 4.2 });
  await g.paso("El cupo no puede bajar de lo que el equipo ya tiene ocupado", dlg.locator("input[type=number]").first(), { sostener: 3.4 });
  await dlg.getByRole("button", { name: "Cancelar" }).click();

  const mover = page.getByRole("button", { name: /Mover AutoCAD de ATC PY/ });
  await g.paso("«Mover» pasa un programa, con su cupo, a otro equipo", mover, {
    accion: "clic", sostener: 3, despues: () => dlg.waitFor(),
  });
  await g.paso("Si el destino ya lo tiene, se pide confirmar la suma de cupos", dlg, { sostener: 4 });
  await dlg.getByRole("button", { name: "Cancelar" }).click();
}
