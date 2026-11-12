/** Portal del alumno: responder un cuestionario de un curso offline y completar el curso. */
import { calentar, clienteDe, comoStaff, dia, ok, para, sufijo, datosBase } from "./prof-ingreso.mjs";

export const rol = "alumno";

const idDe = (j) => j?.id ?? Object.values(j ?? {}).find((v) => v && typeof v === "object" && v.id)?.id;

const d = await para("alu-cuestionario", async () => {
  const s = sufijo();
  const staff = await comoStaff("direccion");
  const { santiago } = await datosBase();
  const curso = idDe(ok("curso", await staff("/api/offline-courses", { method: "POST", body: { title: `Introducción a AutoCAD ${s}`, descriptionMd: "Curso breve de demostración.", status: "published" } })));
  const leccion = idDe(ok("lección", await staff(`/api/offline-courses/${curso}/lessons`, { method: "POST", body: { title: "Lección 1 — Primeros pasos" } })));
  const tema = idDe(ok("tema", await staff(`/api/offline-courses/${curso}/lessons/${leccion}/topics`, { method: "POST", body: { title: "La interfaz de AutoCAD", contentMd: "La **cinta de opciones** agrupa los comandos por pestañas." } })));
  const quiz = idDe(ok("cuestionario", await staff(`/api/offline-courses/${curso}/quizzes`, { method: "POST", body: { title: "Cuestionario — Interfaz", descriptionMd: "Responda las preguntas sobre la interfaz.", passingPercentage: 50, retriesAllowed: null } })));
  const preguntas = [
    ["¿Dónde se agrupan los comandos por pestañas?", "single", [["En la cinta de opciones", true], ["En la barra de estado", false], ["En el cuadro de diálogo de impresión", false]]],
    ["¿Cuáles son unidades de dibujo habituales?", "multiple", [["Metros", true], ["Milímetros", true], ["Colores", false]]],
  ];
  for (const [q, tipo, resp] of preguntas) {
    ok("pregunta", await staff(`/api/offline-courses/${curso}/quizzes/${quiz}/questions`, { method: "POST", body: { questionMd: q, answerType: tipo, answers: resp.map(([text, isCorrect]) => ({ text, isCorrect })) } }));
  }
  ok("acceso", await staff(`/api/offline-courses/${curso}/grants`, { method: "POST", body: { contactId: santiago.id, accessUntil: dia(120) } }));
  const alu = await clienteDe("alumno");
  ok("tema visto", await alu(`/api/portal/me/offline-courses/${curso}/topics/${tema}/progress`, { method: "POST", body: { noVideo: true } }));
  await calentar("alumno", [`/portal/cursos-offline/${curso}`, `/portal/cursos-offline/${curso}/cuestionarios/${quiz}`, `/api/portal/me/offline-courses/${curso}/quizzes/${quiz}`]);
  return { curso, quiz };
});
export const ruta = d ? `/portal/cursos-offline/${d.curso}/cuestionarios/${d.quiz}` : "/portal/cursos-offline";

export async function guion(g) {
  const { page } = g;
  await page.getByRole("button", { name: "Enviar respuestas" }).waitFor({ state: "visible", timeout: 60000 });

  await g.paso("Cada cuestionario indica el porcentaje para aprobar y los intentos disponibles", page.getByText(/Se aprueba con/), { sostener: 4.5 });

  const p1 = page.locator("fieldset").nth(0);
  await g.paso("Las preguntas de una sola respuesta se contestan con un círculo", p1, {
    sostener: 4,
    despues: async () => {
      await p1.getByText("En la cinta de opciones").click();
    },
  });

  const p2 = page.locator("fieldset").nth(1);
  await g.paso("En las de varias respuestas se puede marcar más de una", p2, {
    sostener: 4.5,
    despues: async () => {
      await p2.getByText("Metros", { exact: true }).click();
      await p2.getByText("Milímetros", { exact: true }).click();
    },
  });

  await g.paso("«Enviar respuestas» registra el intento; una pregunta sin responder cuenta como incorrecta", page.getByRole("button", { name: "Enviar respuestas" }), {
    accion: "clic",
    sostener: 3,
    despues: async () => {
      await page.getByRole("status").first().waitFor({ state: "visible", timeout: 30000 });
    },
  });

  await g.paso("El resultado muestra si el intento fue aprobado, el puntaje y los intentos restantes", page.getByRole("status").first(), { sostener: 5 });

  await g.paso("Cada intento queda en «Mis intentos», con su fecha y su resultado", page.getByText("Mis intentos").locator("xpath=ancestor::section[1]"), { sostener: 4.5 });

  await g.paso("El nombre del curso, en la ruta superior, vuelve al curso, que se completa con los temas vistos y el cuestionario aprobado", page.getByRole("link", { name: /Introducción a AutoCAD/ }).first(), {
    accion: "clic",
    sostener: 3,
    despues: async () => {
      await page.getByText("Curso completado").first().waitFor({ state: "visible", timeout: 60000 });
    },
  });

  await g.paso("El curso queda marcado como completado", page.getByText("Curso completado").first(), { sostener: 4 });
}
