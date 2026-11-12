/** El inicio: pulso, «Para resolver» y agenda de hoy. */

export const rol = "direccion";
export const ruta = "/";

/** El primer ancestro con borde redondeado: la tarjeta que contiene un texto. */
const tarjeta = (loc) => loc.locator("xpath=ancestor::*[contains(@class,'rounded')][1]");

export async function guion(g) {
  const { page } = g;

  await g.paso(
    "El inicio resume en una pantalla lo que requiere atención hoy",
    page.getByRole("heading", { name: /^Hola,/ }).locator("xpath=ancestor::*[2]"),
    { sostener: 3.2 }
  );

  await g.paso(
    "Las cifras de arriba muestran grupos en curso, inscripciones y clases del día",
    page.getByText("grupos en curso").locator("xpath=.."),
    { sostener: 3.4 }
  );

  const paraResolver = tarjeta(page.getByText("Para resolver").first());
  await g.paso("«Para resolver» junta las tareas pendientes, ordenadas por urgencia", paraResolver, { sostener: 3.6 });

  await g.paso(
    "Cada fila lleva a la pantalla donde se resuelve. Por ejemplo, la asistencia sugerida por Zoom",
    page.getByText("Asistencia sugerida para revisar").locator("xpath=ancestor::*[3]"),
    { sostener: 3.8 }
  );

  await g.paso("La agenda de hoy indica qué clase terminó, cuál está en curso y cuáles siguen", tarjeta(page.getByText("Agenda de hoy").first()), {
    sostener: 3.8,
  });

  await g.paso(
    "Más abajo, el mes en curso: facturación, morosidad y licencias disponibles",
    page.getByText("Nadie con cuotas vencidas.").locator("xpath=ancestor::*[contains(@class,'rounded')][1]/.."),
    { sostener: 3.8 }
  );

  await g.paso("Cada bloque se muestra solo si su cuenta tiene el permiso correspondiente", null, { sostener: 3.2 });
}
