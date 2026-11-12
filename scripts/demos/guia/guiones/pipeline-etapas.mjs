/** Pipeline: administrar las etapas. */
import { sufijo } from "../datos.mjs";
export const rol = "direccion";
export const ruta = "/pipeline";

export async function guion(g) {
  const { page } = g;
  const nombre = `Demo ${sufijo()}`;
  const dialogo = page.getByRole("dialog");
  await g.paso("«Gestionar etapas» abre la lista de etapas del pipeline", page.getByRole("button", { name: "Gestionar etapas" }), {
    accion: "clic", sostener: 3.4,
    despues: async () => { await dialogo.waitFor({ state: "visible" }); },
  });
  await g.paso("Cada etapa se renombra escribiendo sobre su nombre", dialogo.locator("input").first(), { sostener: 3.4 });
  await g.paso("Las flechas suben o bajan la etapa y definen el orden de las columnas", dialogo.getByRole("button", { name: "Subir" }).nth(1), { sostener: 3.6 });
  await g.paso("Una etapa nueva se crea escribiendo su nombre", dialogo.getByPlaceholder("Nueva etapa…"), {
    sostener: 3.6, despues: async () => { await g.escribir(dialogo.getByPlaceholder("Nueva etapa…"), nombre); },
  });
  await g.paso("«Agregar» la suma al final del tablero", dialogo.getByRole("button", { name: "Agregar" }), {
    accion: "clic", sostener: 3.4,
    despues: async () => { await dialogo.locator(`input[value="${nombre}"]`).waitFor({ state: "visible" }); },
  });
  await g.paso("El tacho elimina una etapa; si tiene tarjetas, pide elegir adónde moverlas", dialogo.locator("li", { has: page.locator(`input[value="${nombre}"]`) }), {
    accion: "ver", sostener: 4,
  });
  // Limpieza: la etapa es nueva y está vacía.
  await dialogo.locator("li", { has: page.locator(`input[value="${nombre}"]`) }).getByRole("button", { name: "Eliminar etapa" }).click();
  await g.pausa(1);
}
