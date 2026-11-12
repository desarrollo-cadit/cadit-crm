/**
 * Portal del alumno: certificados, escolaridad y verificación pública.
 * Salvedad: en el clon de demostración ningún certificado resulta visible
 * (el servidor los trata como suspendidos), así que se muestra el estado vacío
 * y la respuesta de /verificar ante un código que no corresponde.
 */
export const rol = "alumno";
export const ruta = "/portal/certificados";

export async function guion(g) {
  const { page } = g;
  await page.getByRole("heading", { name: "Mis certificados" }).waitFor({ state: "visible", timeout: 60000 });

  await g.paso("Certificados reúne los que la academia emitió al finalizar cada curso", page.getByRole("heading", { name: "Mis certificados" }).locator("xpath=ancestor::*[2]"), { sostener: 4.5 });

  await g.paso("Sin certificado emitido, la pantalla lo indica y explica los requisitos", page.getByText("No tenés certificados emitidos").locator("xpath=ancestor::*[contains(@class,'rounded')][1]"), { sostener: 5 });

  await g.paso("Cada certificado emitido ofrece «Descargar PDF» y «Ver y compartir»", page.getByText(/enlace de verificación es público/), { sostener: 4.5 });

  await g.paso("El enlace de verificación es público: puede enviarse a una empresa", page.getByText(/enlace de verificación es público/), { sostener: 4 });

  await page.goto("http://localhost:3006/verificar/AAAA-BBBB-CCCC", { waitUntil: "load" });
  await page.getByText("No encontramos un certificado con ese código.").waitFor({ state: "visible", timeout: 30000 });

  await g.paso("Quien recibe el enlace ve la página pública de verificación, sin ingresar", page.getByRole("heading", { name: "Verificación de certificado" }), { sostener: 4.5 });

  await g.paso("Con un código inexistente, la página lo dice; con uno válido confirma alumno, curso, fecha y horas", page.getByText("No encontramos un certificado con ese código.").locator("xpath=.."), { sostener: 5.5 });

  await page.goto("http://localhost:3006/portal", { waitUntil: "load" });
  await page.getByText("Mi escolaridad").first().waitFor({ state: "visible", timeout: 60000 });
  await g.paso("Mi escolaridad ofrece los cursos y notas en un PDF, desde el inicio", page.getByText("Mi escolaridad").first().locator("xpath=ancestor::section[1]"), { sostener: 4.5 });
}
