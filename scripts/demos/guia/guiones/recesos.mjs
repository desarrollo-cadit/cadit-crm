/**
 * Recesos y feriados de la academia. Todo lo que se carga cae en 2031, donde no
 * hay clases de ningún grupo: el receso de la academia borra las clases SIN
 * historia de su rango, y no debe tocar los datos sembrados.
 */

import { sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/settings/recesos";

const suf = sufijo();
const RANGO = `Receso Demo ${suf}`;
const FERIADO = `Feriado Demo ${suf}`;

export async function guion(g) {
  const { page } = g;
  const seccion = page.getByRole("region", { name: "Recesos", exact: true });
  const fila = seccion
    .getByPlaceholder("Receso de verano")
    .locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]");
  const cargar = seccion.getByRole("button", { name: "Cargar receso" });

  await g.paso(
    "Un receso son días en que ningún grupo tiene clase; las fechas de los grupos no cambian",
    seccion.locator("div").first(),
    { sostener: 4.2 }
  );

  await g.paso(
    "Puede ser un rango de fechas, un día de este año o un feriado que se repite cada año",
    seccion.locator("fieldset"),
    {
      sostener: 4.6,
      despues: async () => {
        await seccion.getByLabel("Un día solo este año").check();
        await g.pausa(0.7);
        await seccion.getByLabel("Un día que se repite todos los años").check();
        await g.pausa(0.7);
        await seccion.getByLabel("Un rango de fechas").check();
      },
    }
  );

  await g.paso("Para un rango se indican el nombre, el día de inicio y el último día", fila, {
    sostener: 5,
    despues: async () => {
      await g.escribir(seccion.getByPlaceholder("Receso de verano"), RANGO);
      await seccion.locator("input[type=date]").nth(0).fill("2031-01-05");
      await seccion.locator("input[type=date]").nth(1).fill("2031-01-12");
    },
  });

  await g.paso("«Cargar receso» lo guarda; las clases sin historia de esos días se sacan del cronograma", cargar, {
    accion: "clic",
    sostener: 4.4,
    despues: () => seccion.getByText(RANGO).waitFor(),
  });

  await g.paso(
    "Un feriado anual vale ese día todos los años, desde el año elegido",
    seccion.locator("fieldset"),
    {
      sostener: 5,
      despues: async () => {
        await seccion.getByLabel("Un día que se repite todos los años").check();
        await g.escribir(seccion.getByPlaceholder("Navidad"), FERIADO);
        await seccion.locator("input[type=date]").nth(0).fill("2031-12-25");
        await cargar.click();
        await seccion.getByText(FERIADO).waitFor();
      },
    }
  );

  await g.paso(
    "La lista muestra cada receso con sus fechas, o «todos los años» si es un feriado anual",
    seccion.locator("ul").first(),
    { sostener: 4 }
  );

  await g.paso(
    "El tacho borra un receso; las clases que se habían sacado no se recrean solas",
    seccion.getByRole("button", { name: `Borrar el receso ${RANGO}` }),
    { accion: "clic", sostener: 4, despues: () => seccion.getByText(RANGO).waitFor({ state: "detached" }) }
  );
}
