/** Unificar dos empresas duplicadas (solo datos creados por el guion). */
import { apiComo, exigir, sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/empresas";

const rutAlAzar = () => `21${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;

export async function guion(g) {
  const { page } = g;
  const suf = sufijo();
  const { api } = await apiComo("direccion");
  const crear = async (b) => exigir("empresa", await api("/api/companies", { method: "POST", body: JSON.stringify(b) })).company;
  const base = `Constructora Gemela ${suf}`;
  await crear({ legalName: `${base} S.A.`, taxId: rutAlAzar(), addressCountry: "Uruguay", billingEmail: `a.${suf}@demo.test` });
  await crear({ legalName: base, addressCity: "Montevideo", addressCountry: "Uruguay" });
  await crear({ legalName: `Otra Empresa ${suf} S.A.`, taxId: rutAlAzar(), addressCountry: "Uruguay" });
  await page.reload({ waitUntil: "load" });
  const buscador = page.getByRole("searchbox");
  await g.escribir(buscador, base);
  const filaA = page.getByRole("listitem").filter({ hasText: `${base} S.A.` }).first();
  await filaA.waitFor({ timeout: 60000 });
  g.comenzar();
  const dlg = page.getByRole("dialog");

  await g.paso("Si una empresa quedó cargada dos veces, se unifican desde su fila", filaA.getByRole("button", { name: /Unificar .* con…/ }), {
    accion: "clic",
    sostener: 3.4,
    despues: () => dlg.waitFor(),
  });
  const busca = dlg.getByPlaceholder("Razón social, nombre comercial o RUT");
  await g.paso("Se busca la otra empresa por razón social, nombre comercial o RUT", busca, {
    sostener: 3.4,
    despues: async () => {
      await g.escribir(busca, `Otra Empresa ${suf}`);
      await dlg.getByRole("button", { name: new RegExp(`Otra Empresa ${suf}`) }).waitFor();
    },
  });
  await g.paso("Con dos RUT distintos, el sistema bloquea la unificación", dlg.getByRole("button", { name: new RegExp(`Otra Empresa ${suf}`) }), {
    accion: "clic",
    sostener: 4,
    despues: () => dlg.getByRole("alert").waitFor({ timeout: 60000 }),
  });
  await g.paso("Pueden ser dos empresas distintas: por eso no se permite", dlg.getByRole("alert"), { sostener: 4 });
  await g.paso("«Elegir otra» vuelve a la lista", dlg.getByRole("button", { name: "Elegir otra" }), { accion: "clic", sostener: 2.6 });
  await g.paso("Se busca ahora el duplicado sin RUT", busca, {
    sostener: 3,
    despues: async () => {
      await g.escribir(busca, base);
      await dlg.getByRole("button", { name: new RegExp(`^${base}(?! S\.A\.)`) }).waitFor();
    },
  });
  await g.paso("Se lo elige de la lista", dlg.getByRole("button", { name: new RegExp(`^${base}(?! S\.A\.)`) }).first(), {
    accion: "clic",
    sostener: 2.8,
    despues: () => dlg.getByText("Queda esta empresa").waitFor({ timeout: 60000 }),
  });
  await g.paso("La vista previa indica cuál queda, cuál se absorbe y cómo queda cada dato", dlg.locator("table"), { sostener: 5 });
  await g.paso("También detalla qué se mueve: contactos, inscripciones y accesos a cursos offline", dlg.getByText(/Se van a mover/).locator("xpath=ancestor::div[1]"), { sostener: 4 });
  await g.paso("«Unificar» es irreversible: la empresa absorbida se borra", dlg.getByRole("button", { name: "Unificar", exact: true }), {
    accion: "clic",
    sostener: 3.4,
    despues: () => dlg.waitFor({ state: "detached", timeout: 60000 }),
  });
}
