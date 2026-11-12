/** Contactos: alta, edición, duplicados y baja. */
import { apiComo, exigir, sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/contacts";

const post = (api, url, body) => api(url, { method: "POST", body: JSON.stringify(body) });

export async function guion(g) {
  const { page } = g;
  const suf = sufijo();
  const { api } = await apiComo("direccion");
  const nuevo = exigir("alta", await post(api, "/api/contacts", { firstName: "Renata", lastName: `Altamira ${suf}`, email: `renata.${suf}@demo.test` })).contact;
  const otro = exigir("alta 2", await post(api, "/api/contacts", { firstName: "Bruno", lastName: `Duplicado ${suf}`, email: `bruno.${suf}@demo.test` })).contact;
  const empresa = exigir("empresa", await post(api, "/api/companies", { legalName: `Demo Guia ${suf} S.A.` })).company;
  await page.reload({ waitUntil: "load" });
  await page.getByRole("searchbox").waitFor();
  g.comenzar();

  const dlg = page.getByRole("dialog");
  const buscador = page.getByRole("searchbox");
  const fila = page.getByRole("row").filter({ hasText: `renata.${suf}@demo.test` });
  const buscar = async (t) => {
    const r = page.waitForResponse((x) => x.url().includes("/api/contacts?") && new URL(x.url()).searchParams.get("q") === t, { timeout: 90000 });
    await g.escribir(buscador, t);
    await r;
    await fila.waitFor();
  };

  await g.paso("Un contacto nuevo se crea al inscribir: alcanza con un teléfono o solo un correo", page.getByRole("button", { name: "Inscribir alumno" }), {
    accion: "clic",
    sostener: 4,
    despues: async () => {
      await dlg.waitFor();
      await dlg.getByRole("button", { name: "Contacto nuevo" }).click();
    },
  });
  await g.paso("Sin teléfono no hay WhatsApp, pero el contacto queda registrado", dlg, { sostener: 4, despues: async () => {} });
  await dlg.getByRole("button", { name: "Cancelar" }).click();

  await g.paso("Para modificar a alguien, se lo busca y se abre «Editar»", buscador, { sostener: 3.6, despues: () => buscar(`Altamira ${suf}`) });
  await g.paso("«Editar»", fila.getByRole("button", { name: "Editar" }), {
    accion: "clic",
    sostener: 2.6,
    despues: () => dlg.waitFor(),
  });
  await g.paso("Aquí se agregan el teléfono, un correo secundario y la empresa", dlg, {
    sostener: 6,
    despues: async () => {
      await dlg.getByLabel("Teléfono").fill("099 123 456");
      await dlg.getByLabel("Correo secundario").fill(`renata.laboral.${suf}@demo.test`);
      await dlg.getByLabel("Empresa").selectOption({ label: `Demo Guia ${suf} S.A.` });
    },
  });
  await g.paso("Si el correo ya pertenece a otro contacto, el sistema lo nombra y ofrece unificarlos", dlg.getByLabel("Email"), {
    sostener: 6,
    despues: async () => {
      await dlg.getByLabel("Email", { exact: true }).fill(`bruno.${suf}@demo.test`);
      await dlg.getByRole("button", { name: "Guardar" }).click();
      await dlg.getByRole("alert").waitFor();
    },
  });
  await g.paso("Se corrige el correo y se guarda", dlg.getByRole("button", { name: "Guardar" }), {
    sostener: 4,
    despues: async () => {
      await dlg.getByLabel("Email", { exact: true }).fill(`renata.${suf}@demo.test`);
      await dlg.getByRole("button", { name: "Guardar" }).click();
      await dlg.waitFor({ state: "detached" });
    },
  });
  await g.paso("El papelero da de baja: sin inscripciones se elimina; con inscripciones, se archiva", fila.getByRole("button", { name: /Dar de baja/ }), {
    accion: "clic",
    sostener: 4.6,
  });
  void otro; void empresa;
}
