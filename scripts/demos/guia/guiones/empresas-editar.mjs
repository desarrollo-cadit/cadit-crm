/** Empresas: alta con datos de facturación. */
import { sufijo } from "../datos.mjs";

export const rol = "coordinacion";
export const ruta = "/empresas";

export async function guion(g) {
  const { page } = g;
  const suf = sufijo();
  await page.getByRole("button", { name: "Nueva empresa" }).waitFor();
  const form = () => page.getByText("Solo la razón social es obligatoria").locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
  const rut = `21${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;

  await g.paso("«Nueva empresa» abre el formulario de alta", page.getByRole("button", { name: "Nueva empresa" }), {
    accion: "clic",
    sostener: 3,
    despues: () => page.getByRole("textbox", { name: "Razón social" }).waitFor(),
  });
  await g.paso("Solo la razón social es obligatoria; el resto se completa cuando se tenga", page.getByRole("textbox", { name: "Razón social" }), {
    sostener: 4,
    despues: async () => {
      await g.escribir(page.getByRole("textbox", { name: "Razón social" }), `Constructora Demo ${suf} S.A.`);
      await g.escribir(page.getByRole("textbox", { name: "Nombre comercial" }), `Demo ${suf}`);
    },
  });
  await g.paso("En Uruguay el RUT debe tener 12 dígitos: si no, el sistema lo rechaza", page.getByRole("textbox", { name: "RUT" }), {
    sostener: 5,
    despues: async () => {
      await g.escribir(page.getByRole("textbox", { name: "RUT" }), "2112345");
      await page.getByRole("button", { name: "Crear empresa" }).click();
      await page.getByRole("alert").waitFor({ timeout: 60000 });
    },
  });
  await g.paso("Se corrige el RUT y se completan la dirección fiscal y el contacto de facturación", page.getByRole("textbox", { name: "RUT" }), {
    sostener: 6,
    despues: async () => {
      await g.escribir(page.getByRole("textbox", { name: "RUT" }), rut);
      await page.getByLabel("Calle y número").fill("Av. Italia 1234");
      await page.getByLabel("Ciudad").fill("Montevideo");
      await page.getByLabel("A quién se le factura").fill("Administración Demo");
      await page.getByLabel("Correo de facturación").fill(`facturas.${suf}@demo.test`);
    },
  });
  await g.paso("La condición de pago puede ser contado o crédito, con su plazo en días", page.getByLabel("Condición de pago"), {
    sostener: 4.6,
    despues: async () => {
      await page.getByLabel("Condición de pago").selectOption("credito");
      await page.getByLabel("Plazo en días").fill("30");
    },
  });
  await g.paso("«Excluir de los reportes» deja afuera convenios que no son una venta", page.getByText("Excluir de los reportes").locator("xpath=ancestor::label[1]"), { sostener: 4 });
  await g.paso("Al crear la empresa, se abre su ficha con los datos cargados", page.getByRole("button", { name: "Crear empresa" }), {
    accion: "clic",
    sostener: 3.6,
    despues: () => page.getByText("Crédito a 30 días").first().waitFor({ timeout: 60000 }),
  });
  void form;
}
