/** Talleres: crear una edición, anotar a alguien a mano y los avisos. */

import { sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/talleres";

const suf = sufijo();
const nombre = `Taller de Dibujo Técnico ${suf}`;
const digitos = String(Date.now()).slice(-7);

export async function guion(g) {
  const { page } = g;
  const formulario = page.locator("form").filter({ has: page.getByLabel("Nombre del taller") });

  await g.paso("«Nuevo taller» crea el taller y su primera edición", page.getByRole("button", { name: "Nuevo taller" }), {
    accion: "clic",
    sostener: 3,
    despues: async () => {
      await formulario.waitFor();
    },
  });

  await g.paso("Complete el nombre, la fecha y el horario", formulario.locator("xpath=.."), {
    sostener: 5,
    despues: async () => {
      await g.escribir(page.getByLabel("Nombre del taller"), nombre);
      await page.getByLabel("Fecha", { exact: true }).fill("2026-12-10");
      await page.getByLabel("Hora de inicio").fill("18:00");
      await page.getByLabel("Hora de fin").fill("20:00");
    },
  });

  await g.paso(
    "En modalidad online, el enlace no se publica en la web: solo lo reciben los confirmados",
    page.getByText("Modalidad", { exact: true }).locator("xpath=ancestor::fieldset[1]"),
    {
      sostener: 4.4,
      despues: async () => {
        await page.getByLabel("Enlace de la reunión").fill("https://example.com/reunion-demo");
      },
    }
  );

  await g.paso(
    "El cupo limita las inscripciones. Con costo, cada inscripción nace con un pago pendiente",
    page.getByText("Costo", { exact: true }).locator("xpath=ancestor::fieldset[1]"),
    {
      sostener: 5,
      despues: async () => {
        await page.getByLabel("Cupo (vacío = sin límite)").fill("12");
        await page.getByLabel("Con costo").check();
        await page.getByLabel("Monto").fill("1500");
      },
    }
  );

  await g.paso("Al crearlo, la edición aparece entre los próximos y se abre su detalle", page.getByRole("button", { name: "Crear taller" }), {
    accion: "clic",
    sostener: 3.4,
    despues: async () => {
      const fila = page.getByRole("link", { name: new RegExp(nombre) });
      await fila.waitFor();
      await g.pausa(1.2);
      await fila.click();
      await page.getByRole("button", { name: "Anotar a alguien" }).waitFor();
    },
  });

  await g.paso("«Anotar a alguien» pide nombre y teléfono; si ya es contacto, usa el existente", page.getByRole("button", { name: "Anotar a alguien" }), {
    accion: "clic",
    sostener: 6,
    despues: async () => {
      await g.escribir(page.getByLabel("Nombre", { exact: true }), "Valentina");
      await g.escribir(page.getByLabel("Apellido"), "Acosta");
      await g.escribir(page.getByLabel(/Teléfono/), `5989${digitos}`);
    },
  });

  await g.paso("Al anotar, la persona queda con el cupo y el pago pendiente", page.getByRole("button", { name: "Anotar", exact: true }), {
    accion: "clic",
    sostener: 4,
    despues: async () => {
      await page.getByRole("link", { name: "Valentina Acosta" }).waitFor();
    },
  });

  await g.paso(
    "Con los avisos activados, se confirma por WhatsApp al anotarse y se recuerda el día anterior",
    page.getByLabel("Contadores"),
    { sostener: 5 }
  );
}
