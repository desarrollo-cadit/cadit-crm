/** Unificar dos contactos que son la misma persona (solo datos creados por el guion). */
import { apiComo, exigir, sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/contacts";

export async function guion(g) {
  const { page } = g;
  const suf = sufijo();
  const { api } = await apiComo("direccion");
  const crear = async (b) => exigir("alta", await api("/api/contacts", { method: "POST", body: JSON.stringify(b) })).contact;
  const a = await crear({ firstName: "Lorena", lastName: `Gemela${suf}`, email: `lorena.${suf}@demo.test` });
  await crear({ firstName: "Lorena", lastName: `Gemela${suf}`, phone: `09${Math.floor(1000000 + Math.random() * 8999999)}`, notes: "Cargada desde WhatsApp" });
  await g.ir(`/contacts/${a.id}/legajo`);
  const dlg = page.getByRole("dialog");
  await page.getByRole("button", { name: "Unificar con…" }).waitFor();
  g.comenzar();

  await g.paso("Si una misma persona quedó cargada dos veces, se unifican sus contactos", page.getByRole("button", { name: "Unificar con…" }), {
    accion: "clic",
    sostener: 3.4,
    despues: () => dlg.waitFor(),
  });
  const buscador = dlg.getByPlaceholder("Nombre, teléfono o correo…");
  await g.paso("Se busca al duplicado por nombre, teléfono o correo", buscador, {
    sostener: 4,
    despues: async () => {
      await g.escribir(buscador, `Gemela${suf}`);
      await dlg.getByRole("option").first().waitFor({ timeout: 60000 });
      await g.pausa(0.8);
    },
  });
  await g.paso("Se elige a la persona de la lista", dlg.getByRole("option").first(), {
    accion: "clic",
    sostener: 2.8,
    despues: () => dlg.getByText("Queda este contacto").waitFor({ timeout: 60000 }),
  });
  await g.paso("La vista previa es obligatoria: muestra quién queda y quién se absorbe", dlg.getByText("Queda este contacto").locator("xpath=ancestor::div[2]"), { sostener: 4.6 });
  await g.paso("Queda el contacto con WhatsApp: es su identidad y no se cambia", dlg.getByText(/Queda el contacto que tiene WhatsApp/), { sostener: 4 });
  await g.paso("La tabla indica cómo queda cada dato: se completan, nunca se pisan", dlg.locator("table"), { sostener: 4.6 });
  await g.paso("Si hubiera conflictos, un aviso rojo bloquearía la unificación", dlg.getByText("Esta acción no se puede deshacer."), { sostener: 4 });
  await g.paso("«Unificar» es irreversible: el contacto absorbido se borra", dlg.getByRole("button", { name: "Unificar", exact: true }), {
    accion: "clic",
    sostener: 3.4,
    despues: () => page.waitForURL(/tab=seguimiento/, { timeout: 60000 }),
  });
}
