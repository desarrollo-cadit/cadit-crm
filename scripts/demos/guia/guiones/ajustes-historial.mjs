/** Configuración › Importar historial: planilla ficticia, vista previa, aplicar y deshacer. */
import { sufijo } from "../datos.mjs";

export const rol = "direccion";
export const ruta = "/settings/historial";

export async function guion(g) {
  const { page } = g;
  const s = sufijo();
  const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded-lg')][1]");

  // Un curso real del catálogo, para que la asociación se sugiera sola.
  const r = await page.request.get(new URL("/api/courses", page.url()).href);
  const cursos = (await r.json()).courses ?? [];
  const curso = (cursos.find((c) => !c.isModule && c.name) ?? cursos[0])?.name;
  if (!curso) throw new Error("no hay cursos en el catálogo");
  const encabezado = "nombre,apellido,correo,telefono,empresa,curso,curso_original,estudiante,edicion,fecha,vendedor,nota,fila_planilla";
  const filas = [
    `Historial,Demo ${s} Uno,hist.uno.${s}@demo.test,,,${curso},${curso},si,2021,2021-05-10,Vendedor Planilla,,2`,
    `Historial,Demo ${s} Dos,hist.dos.${s}@demo.test,,,${curso},${curso},no,2022,2022-03-14,Vendedor Planilla,,3`,
    `Historial,Demo ${s} Tres,hist.tres.${s}@demo.test,,,${curso},${curso},si,2023,2023-09-01,,,4`,
  ];
  const csv = `${encabezado}\n${filas.join("\n")}\n`;

  await g.paso(
    "Aquí se carga la planilla histórica de cursadas 2020 a 2024, en tres pasos",
    page.getByRole("heading", { name: "Importar historial" }).locator("xpath=.."),
    { sostener: 3.6 }
  );

  await g.paso("Conviene hacer un respaldo antes: deshacer borra cursadas, no contactos ni empresas", page.getByText("Antes de importar"), {
    sostener: 3.8,
  });

  await g.paso("Se elige el archivo CSV con las columnas indicadas", page.getByText("Elegir archivo CSV"), {
    despues: async () => {
      await page.locator('input[type="file"]').setInputFiles({
        name: `historial-demo-${s}.csv`,
        mimeType: "text/csv",
        buffer: Buffer.from(csv, "utf8"),
      });
      await page.getByText("filas se pueden importar").waitFor({ timeout: 20000 });
    },
    sostener: 3.4,
  });

  await g.paso("Cada curso de la planilla se asocia a un curso del catálogo", page.getByText("Cursos de la planilla").locator("xpath=ancestor::table[1]"), {
    sostener: 3.6,
  });

  await g.paso("Lo mismo con los vendedores: pueden asociarse o quedar sin vendedor", page.getByText("Vendedores de la planilla").locator("xpath=ancestor::table[1]"), {
    sostener: 3.4,
  });

  await g.paso("La vista previa muestra qué se creará, sin escribir nada todavía", page.getByRole("button", { name: "Ver la vista previa" }), {
    accion: "clic",
    despues: async () => {
      await page.getByText("Todavía no se escribió nada.").waitFor({ timeout: 20000 });
    },
    sostener: 2.6,
  });

  await g.paso("Contactos y cursadas nuevas, y las filas descartadas, se cuentan antes de confirmar", tarjeta(page.getByRole("heading", { name: "2. Vista previa" })), {
    sostener: 4,
  });

  page.once("dialog", (d) => d.accept());
  await g.paso("Al confirmar, la importación se aplica por tandas", page.getByRole("button", { name: /^Importar \d+ cursadas/ }), {
    accion: "clic",
    despues: async () => {
      await page.getByText("Aplicada").first().waitFor({ timeout: 60000 });
    },
    sostener: 3,
  });

  const item = page.locator("li").filter({ hasText: `historial-demo-${s}.csv` });
  await g.paso("Cada importación queda registrada con sus totales", item, { sostener: 3.4 });

  page.once("dialog", (d) => d.accept());
  await g.paso("«Deshacer esta importación» borra sus cursadas históricas", item.getByRole("button", { name: "Deshacer esta importación" }), {
    accion: "clic",
    despues: async () => {
      await item.getByText("Deshecha").waitFor({ timeout: 30000 });
    },
    sostener: 3.4,
  });
}
