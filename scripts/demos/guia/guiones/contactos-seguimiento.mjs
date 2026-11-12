import { id } from "../ids.mjs";
/** Seguimiento de un interesado. */
import { sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = `/contacts/${id("seguimiento")}/legajo?tab=seguimiento`;

export async function guion(g) {
  const { page } = g;
  const suf = sufijo();
  await page.getByText("Línea de tiempo").first().waitFor();
  const tarjeta = (t) => page.getByText(t, { exact: true }).first().locator("xpath=ancestor::*[contains(@class,'rounded')][1]");

  await g.paso("En un interesado, el legajo abre primero en «Seguimiento»", page.getByRole("tab", { name: "Seguimiento" }), { sostener: 3.4 });
  await g.paso("La línea de tiempo muestra cada formulario enviado, con sus datos y su mensaje", tarjeta("Línea de tiempo"), { sostener: 4.6 });
  const nota = page.getByLabel("Agregar una nota");
  await g.paso("Las notas del equipo se escriben aquí", nota, {
    sostener: 4.4,
    despues: () => g.escribir(nota, `Pidió información sobre fechas (demo ${suf})`),
  });
  await g.paso("Al guardar, la nota queda al comienzo de la línea de tiempo", page.getByRole("button", { name: "Guardar nota" }), {
    accion: "clic",
    sostener: 4,
    despues: () => page.getByText(`demo ${suf}`).first().waitFor({ timeout: 60000 }),
  });
  await g.paso("«Escribir por correo» y «Escribir por WhatsApp» abren el mensaje y registran el contacto", tarjeta("Contactar"), { sostener: 4.4 });
  await g.paso("«Cursos que hizo» cuenta solo lo que se dictó de verdad", tarjeta("Cursos que hizo"), { sostener: 4 });
}
