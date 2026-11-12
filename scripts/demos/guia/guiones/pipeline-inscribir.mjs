/** Inscribir a alguien en un grupo (formulario de inscripción). */
import { apiComo, exigir, sufijo } from "../datos.mjs";
export const rol = "direccion";
export const ruta = "/contacts";

export async function guion(g) {
  const { page } = g;
  const s = sufijo();
  const nombre = `Demo${s}`;
  const { api } = await apiComo("direccion");
  exigir("alta de contacto", await api("/api/contacts", { method: "POST", body: JSON.stringify({ firstName: nombre, lastName: "Guia", email: `demo.${s}@demo.test` }) }));
  await g.ir("/contacts");
  g.comenzar();
  const buscar = page.getByPlaceholder(/Buscar por nombre/);
  await g.paso("La inscripción se inicia desde la persona: primero se la busca", buscar, {
    sostener: 3.6, despues: async () => { await g.escribir(buscar, nombre); await g.pausa(1.5); },
  });
  const boton = page.getByRole("button", { name: new RegExp(`Inscribir a ${nombre}`) });
  const dialogo = page.getByRole("dialog");
  await g.paso("El botón «Inscribir en un grupo» de su fila abre el formulario", boton, {
    accion: "clic", sostener: 3.4, despues: async () => { await dialogo.waitFor({ state: "visible" }); },
  });
  await g.paso("Se elige el grupo entre los que están abiertos para inscribir", dialogo.getByLabel("Grupo"), {
    sostener: 3.8,
    despues: async () => {
      const sel = dialogo.getByLabel("Grupo");
      await sel.selectOption({ index: 1 });
    },
  });
  await g.paso("Monto y moneda son los que se acordaron con la persona", dialogo.getByLabel("Monto"), {
    sostener: 3.8, despues: async () => { await g.escribir(dialogo.getByLabel("Monto"), "1500"); },
  });
  await g.paso("El vendedor es obligatorio: toda inscripción en un grupo es una venta", dialogo.getByLabel(/Vendedor/), {
    sostener: 3.8,
    despues: async () => { await dialogo.getByLabel(/Vendedor/).selectOption({ index: 1 }).catch(() => {}); },
  });
  await g.paso("Si la factura va a nombre de una empresa, se elige en este campo", dialogo.getByLabel("Empresa (facturación B2B)"), { sostener: 3.8 });
  await g.paso("«Inscribir» guarda la inscripción y avisa en qué grupo quedó", dialogo.getByRole("button", { name: "Inscribir", exact: true }), {
    accion: "clic", sostener: 4,
    despues: async () => { await page.getByText(/Inscripción creada/).waitFor({ state: "visible", timeout: 20000 }); },
  });
}
