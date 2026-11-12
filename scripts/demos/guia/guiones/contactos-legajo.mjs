import { id } from "../ids.mjs";
/** El legajo de un alumno con cursadas, certificado y escolaridad. */
export const rol = "coordinacion";
export const ruta = `/contacts/${id("legajo")}/legajo`;

export async function guion(g) {
  const { page } = g;
  await page.getByText(/^Cursadas \(/).waitFor();

  await g.paso(
    "El legajo reúne todo el recorrido de una persona en una sola pantalla",
    page.getByRole("heading", { level: 1 }).locator("xpath=ancestor::header[1]"),
    { sostener: 3.6 }
  );
  await g.paso(
    "Arriba figuran el correo, el teléfono, el acceso al portal y la cantidad de cursadas",
    page.getByRole("heading", { level: 1 }).locator("xpath=ancestor::header[1]"),
    { sostener: 4 }
  );
  await g.paso("Cada cursada muestra su resultado, la asistencia y las evaluaciones del grupo", page.locator("article").first(), { sostener: 4.4 });
  await g.paso(
    "Un certificado emitido aparece aquí y se descarga en PDF",
    page.getByText(/^Certificado /).first().locator("xpath=ancestor::div[1]"),
    { sostener: 4 }
  );
  await g.paso("«Descargar escolaridad» genera el PDF con todo el recorrido académico", page.getByRole("link", { name: "Descargar escolaridad" }), { sostener: 4 });
  await g.paso("Si un dato aún no existe, se indica «Sin datos»: nunca se asume aprobado ni 0 %", null, { sostener: 3.6 });
}
