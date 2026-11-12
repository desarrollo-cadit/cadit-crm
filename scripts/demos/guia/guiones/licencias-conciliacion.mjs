/** Conciliar las licencias del campus con el Excel de usuarios de Autodesk. */
import path from "node:path";

export const rol = "soporte";
export const ruta = "/licencias";

export async function guion(g) {
  const { page } = g;
  const dlg = page.getByRole("dialog");
  const archivo = path.resolve("demos-output/guia/tmp/autodesk-demo.csv");
  const tab = page.getByRole("button", { name: "Conciliación con Autodesk" });
  await tab.waitFor({ timeout: 120000 });

  await g.paso("La pestaña «Conciliación con Autodesk» compara el campus con lo que dice Autodesk", tab, {
    accion: "clic", sostener: 3.2, despues: () => page.getByText("Última importación").waitFor({ timeout: 60000 }),
  });
  await g.paso("Cada equipo muestra de cuándo es la última foto y las cuentas por programa", page.getByText("Última importación").locator("xpath=.."), { sostener: 3.6 });

  const importar = page.getByRole("button", { name: "Importar archivo de Autodesk" });
  await g.paso("Para actualizarla, se importa el Excel de usuarios de un solo equipo", importar, {
    accion: "clic", sostener: 3, despues: () => dlg.waitFor(),
  });
  await g.paso("Se elige el equipo y el archivo .xlsx o .csv exportado de Autodesk", dlg, {
    sostener: 3.6,
    despues: async () => {
      const opts = await page.locator("#importar-equipo option").allTextContents();
      await page.locator("#importar-equipo").selectOption({ index: opts.findIndex((t) => /ATC PY/.test(t)) });
      await page.locator("#importar-archivo").setInputFiles(archivo);
      await dlg.getByText("Qué saldría de este archivo").waitFor({ timeout: 60000 });
    },
  });
  await g.paso("La vista previa cuenta los casos y no cambia nada hasta importar", dlg.getByRole("region", { name: "Qué saldría" }), { sostener: 4 });
  await g.paso("Cada oferta de Autodesk se asocia con un programa del campus", dlg.getByRole("region", { name: "Programa de cada oferta" }), { sostener: 3.6 });
  await g.paso("«Importar» guarda la foto del día; ninguna licencia se modifica todavía", dlg.getByRole("button", { name: "Importar" }), {
    accion: "clic", sostener: 3, despues: () => dlg.waitFor({ state: "hidden", timeout: 60000 }),
  });

  const seguro = page.getByRole("button", { name: "Aplicar lo seguro" });
  await g.paso("«Aplicar lo seguro» aplica solo lo que no admite dos lecturas, y antes dice cuántas son", seguro, {
    accion: "clic", sostener: 3.4, despues: () => dlg.waitFor(),
  });
  await dlg.getByRole("button", { name: "Cancelar" }).click();

  await g.paso("Los externos, lo pendiente en Autodesk y lo verificado se revisan en sus secciones", page.getByRole("group", { name: "Secciones" }), { sostener: 3.6 });
}
