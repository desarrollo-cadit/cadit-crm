/** Avisos al grupo: publicar un comunicado que el alumno ve en su portal. */

import { apiComo } from "../datos.mjs";

/* ------------------------------------------------------------------ apoyo */
const sello = Date.now().toString(36).slice(-5);
const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ok = (n, r) => {
  if (!r.res.ok) throw new Error(`${n}: ${r.res.status} ${JSON.stringify(r.json)}`);
  return r.json;
};
const enviar = (api, ruta, body, metodo = "POST") => api(ruta, { method: metodo, body: JSON.stringify(body) });

/** Cliente de Coordinación con la sesión guardada en disco (no se llama a sign-in: tiene cupo). */
const apiCoordinacion = async () => (await apiComo("coordinacion")).api;

const NOMBRES = [["Martina", "Rodríguez"], ["Santiago", "Pereira"], ["Valentina", "Silva"], ["Joaquín", "González"], ["Camila", "Martínez"], ["Facundo", "Suárez"]];

/** Un curso propio y un grupo con cronograma, alumnos y (si se pide) la lista tomada en todas las clases. */
async function armarGrupo(api, { curso, cursoId, nombre, inicio = -28, fin = -2, alumnos = 4, pasarLista = true }) {
  cursoId ??= ok("curso", await enviar(api, "/api/courses", { name: curso ?? `Curso demo ${sello}`, grantsCertificate: true })).course.id;
  const alta = ok("grupo", await enviar(api, "/api/cohorts", {
    courseId: cursoId, name: nombre ?? `Grupo demo ${sello}`, startDate: dia(inicio), endDate: dia(fin),
    daysOfWeek: "0,2", startTime: "18:30", endTime: "20:30",
  }));
  const grupoId = alta.cohort?.id ?? alta.id;
  ok("cronograma", await api(`/api/cohorts/${grupoId}/schedule`, { method: "POST" }));
  const sellerId = ((await api("/api/sellers")).json?.sellers ?? []).find((s) => !s.archived)?.id;
  const inscripciones = [];
  for (const [i, [n, a]] of NOMBRES.slice(0, alumnos).entries()) {
    const r = ok(`inscripción de ${n}`, await enviar(api, "/api/enrollments", {
      cohortId: grupoId, sellerId,
      contact: {
        firstName: n, lastName: `${a} ${sello}`,
        phone: `5989${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
        email: `${n}.${a}.${sello}.${i}@demo.test`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
      },
    }));
    inscripciones.push({ id: r.enrollment?.id, nombre: `${n} ${a} ${sello}` });
  }
  const clases = ((await api(`/api/cohorts/${grupoId}/classes`)).json?.classes ?? []).filter((c) => c.id);
  if (pasarLista) {
    const E = ["presente", "presente", "presente", "tarde"];
    for (const [k, c] of clases.entries()) {
      ok("lista", await enviar(api, `/api/class-sessions/${c.id}`, {
        attendance: inscripciones.map((e, i) => ({ enrollmentId: e.id, status: i === 3 && k % 3 === 0 ? "ausente" : E[(i + k) % 4] })),
      }, "PATCH"));
    }
  }
  return { cursoId, grupoId, inscripciones, clases };
}
/* ------------------------------------------------------------------------- */

const api = await apiCoordinacion();
const g = await armarGrupo(api, { nombre: `Grupo avisos ${sello}`, inicio: -14, fin: 14, alumnos: 3, pasarLista: false });
ok("aviso previo", await enviar(api, `/api/cohorts/${g.grupoId}/announcements`, {
  title: "Bienvenida al grupo",
  body: "Les damos la bienvenida. El material de la primera clase ya está disponible.",
}));

export const rol = "coordinacion";
export const ruta = `/cohorts/${g.grupoId}?tab=avisos`;

export async function guion(g2) {
  const { page } = g2;
  const titulo = "La clase del lunes se pasa al martes";

  await g2.paso(
    "La pestaña Avisos reúne los comunicados del grupo",
    page.getByRole("button", { name: "Avisos", exact: true }),
    { sostener: 3 }
  );
  await g2.paso(
    "Cada aviso queda con su autor y su fecha de publicación",
    page.getByText("Bienvenida al grupo").locator("xpath=ancestor::li[1]"),
    { sostener: 3.4 }
  );

  const formulario = page.locator("#anc-title").locator("xpath=ancestor::*[contains(@class,'rounded-md')][1]");
  await g2.paso("Para publicar uno nuevo, escriba el título", formulario, { sostener: 1 });
  await g2.escribir(page.locator("#anc-title"), titulo, { retardo: 45 });
  await g2.paso("Luego, el texto del aviso", page.locator("#anc-body"), { sostener: 1 });
  await g2.escribir(page.locator("#anc-body"), "Por feriado, la clase se dicta el martes a la misma hora. Se mantiene el enlace de siempre.", { retardo: 25 });

  await g2.paso(
    "Al seleccionar «Publicar aviso», queda registrado en el grupo",
    page.getByRole("button", { name: "Publicar aviso" }),
    { accion: "clic", sostener: 3, despues: () => page.getByText(titulo).first().waitFor({ timeout: 15000 }) }
  );
  await g2.paso(
    "Aparece en la lista y el alumno lo lee en su portal",
    page.getByText(titulo).first().locator("xpath=ancestor::li[1]"),
    { sostener: 3.4 }
  );
  await g2.paso(
    "El aviso no envía notificación: el alumno lo ve al ingresar a su portal",
    page.getByText("Todavía no envía notificación.", { exact: false }).first(),
    { sostener: 3.6 }
  );
}
