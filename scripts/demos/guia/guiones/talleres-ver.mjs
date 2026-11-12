/** Talleres: lista de ediciones, cupos, inscriptos y estado de cobro. */

import { apiComo, exigir, sufijo } from "../datos.mjs";

/* Datos de apoyo: un taller con cupo, costo y cuatro inscriptos (uno ya confirmado). */
const suf = sufijo();
const { api } = await apiComo("coordinacion");
const nombre = `Taller Revit Básico ${suf}`;
const taller = exigir(
  "alta del taller",
  await api("/api/talleres", {
    method: "POST",
    body: JSON.stringify({
      courseName: nombre,
      description: "Taller de demostración.",
      edition: {
        startDate: "2026-12-04",
        startTime: "18:00",
        endTime: "20:00",
        modality: "online",
        meetingUrl: "https://example.com/reunion-demo",
        capacity: 12,
        cost: 150000,
        currency: "UYU",
        registrationStatus: "abierta",
      },
    }),
  })
);
const editionId = taller?.editionId;
if (!editionId) throw new Error(`no se obtuvo el id de la edición: ${JSON.stringify(taller).slice(0, 200)}`);

const digitos = String(Date.now()).slice(-6);
const personas = [
  ["Lucía", "Fernández"],
  ["Martín", "Techera"],
  ["Camila", "Rodríguez"],
  ["Joaquín", "Pereira"],
];
for (const [i, [firstName, lastName]] of personas.entries()) {
  exigir(
    `inscripto ${i + 1}`,
    await api(`/api/talleres/ediciones/${editionId}/inscriptos`, {
      method: "POST",
      body: JSON.stringify({
        contact: { firstName, lastName, phone: `5989${digitos}${i}`, email: `${firstName.toLowerCase().replace(/[^a-z]/g, "")}.${suf}@example.test` },
      }),
    })
  );
}

const detalle = exigir("detalle de la edición", await api(`/api/talleres/ediciones/${editionId}`));
const inscriptos = detalle.attendees;
// El primero ya confirmó y el segundo pagó: así se ven estados y cobro distintos.
exigir(
  "confirmar",
  await api(`/api/talleres/inscriptos/${inscriptos[0].id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmado" }) })
);
exigir(
  "pago",
  await api(`/api/enrollments/${inscriptos[1].enrollmentId}/payments`, {
    method: "POST",
    body: JSON.stringify({ amount: 150000, paidAt: new Date().toISOString(), method: "transferencia" }),
  })
);

export const rol = "coordinacion";
export const ruta = "/talleres";

export async function guion(g) {
  const { page } = g;
  const fila = page.getByRole("link", { name: new RegExp(nombre) });
  const tarjetaFiltros = page.getByPlaceholder(/Buscar taller/).locator("xpath=ancestor::*[contains(@class,'rounded')][1]");

  await g.paso(
    "Talleres reúne cada edición: los próximos arriba y los realizados abajo",
    page.locator("#talleres-proximos").locator("xpath=.."),
    { sostener: 3.4 }
  );

  await g.paso("El buscador y el filtro por año acotan la lista", tarjetaFiltros, { sostener: 2.8 });
  await g.escribir(page.getByPlaceholder(/Buscar taller/), "Revit");
  await g.pausa(1);

  await g.paso("Cada fila indica día, horario, modalidad, costo y cupo", fila, { sostener: 3.6 });

  await g.paso("Al abrir una edición se ve su detalle", fila, {
    accion: "clic",
    sostener: 2.6,
    despues: async () => {
      await page.getByRole("heading", { name: nombre }).waitFor();
    },
  });

  await g.paso(
    "Los contadores muestran cuántos hay por estado y los lugares libres",
    page.getByLabel("Contadores"),
    { sostener: 3.8 }
  );

  await g.paso(
    "En Inscriptos, el estado se cambia desde la propia fila",
    page.getByRole("table"),
    { sostener: 3.6 }
  );

  await g.paso(
    "La columna Pago muestra quién pagó y cuánto debe cada inscripto",
    page.getByRole("columnheader", { name: "Pago" }).locator("xpath=ancestor::table"),
    { sostener: 3.8 }
  );
}
