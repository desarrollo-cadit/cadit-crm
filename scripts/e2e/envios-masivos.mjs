/**
 * 2026-10-05 — Envío masivo por cohorte (términos, bienvenida, acceso al
 * portal) y licencias por módulo desde el roster de una especialización.
 *
 * Vive en su propio módulo para poder correrlo SOLO:
 *
 *   E2E_SECCIONES=envios-masivos node --env-file=.env.e2e scripts/e2e-selftest.mjs
 *
 * En este entorno M365 NO está configurado, así que todo correo "falla" en el
 * proveedor. Es justamente lo que se quiere ver:
 *  - la corrida termina, registra cada destinatario con su motivo y NO escribe
 *    la marca de "enviado" (la marca dice "Graph lo aceptó");
 *  - el acceso al portal saltea a quien ya tiene vínculo, y su contraseña
 *    sigue sirviendo después de la corrida;
 *  - reinvitar de a uno a quien ya tiene acceso pide `force`.
 *
 * La app tiene que correr con `BULK_SEND_PAUSE_MS=0` para que la corrida no
 * tarde 2 s por destinatario.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function seccionEnviosMasivos({ api, ok, BASE }) {
  console.log("\n== 2026-10-05: envío masivo por cohorte y licencias por módulo ==");

  const sello = Date.now();
  const cola = String(sello).slice(-7);
  const isoDia = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  let ip = 40;
  const otraIp = () => ({ "x-forwarded-for": `203.0.113.${++ip}` });

  /** Inicia sesión SIN tocar la cookie del operador. */
  const ingresar = (email, password) =>
    fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, ...otraIp() },
      body: JSON.stringify({ email, password }),
    });

  /** Espera a que la corrida deje de estar en curso. */
  const esperarCorrida = async (ruta) => {
    for (let i = 0; i < 60; i++) {
      const r = await api(ruta);
      if (r.json?.status && r.json.status !== "en_curso") return r.json;
      await sleep(500);
    }
    return null;
  };

  // ---- Una cohorte con tres alumnos: dos con correo y una sin correo.
  const curso = await api("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: `Masivo ${sello}`, published: false }),
  });
  const cohorte = await api("/api/cohorts", {
    method: "POST",
    body: JSON.stringify({
      courseId: curso.json?.course?.id,
      name: `Masivo ${sello}`,
      startDate: isoDia(-3),
      endDate: isoDia(60),
    }),
  });
  const cohortId = cohorte.json?.cohort?.id;
  const inscribir = async (firstName, email, phone) => {
    const r = await api("/api/enrollments", {
      method: "POST",
      body: JSON.stringify({
        cohortId,
        contact: { firstName, lastName: `Masivo ${sello}`, phone, ...(email ? { email } : {}) },
      }),
    });
    return r.json?.enrollment?.id;
  };
  const correoA = `masivo-a-${sello}@example.com`;
  const correoB = `masivo-b-${sello}@example.com`;
  const enrA = await inscribir("Ana", correoA, `59894${cola}`);
  const enrB = await inscribir("Beto", correoB, `59895${cola}`);
  const enrC = await inscribir("Ceci", null, `59896${cola}`);
  ok(
    "setup: cohorte con dos alumnos con correo y una sin correo",
    Boolean(cohortId && enrA && enrB && enrC),
    JSON.stringify({ cohortId, enrA, enrB, enrC })
  );

  // ---- Vista previa: a quién le llegaría cada correo.
  const previa = await api(`/api/cohorts/${cohortId}/emails/bulk`);
  const terminos = previa.json?.kinds?.find((k) => k.kind === "terms");
  const bienvenida = previa.json?.kinds?.find((k) => k.kind === "welcome");
  ok(
    "vista previa de términos: 2 a enviar, 1 sin correo, 0 ya enviados",
    terminos?.counts?.toSend === 2 &&
      terminos.counts.withoutEmail === 1 &&
      terminos.counts.alreadySent === 0,
    JSON.stringify(terminos?.counts)
  );
  ok(
    "la bienvenida avisa que falta el enlace del grupo",
    typeof bienvenida?.blockedReason === "string" && bienvenida.blockedReason.includes("WhatsApp"),
    JSON.stringify(bienvenida?.blockedReason)
  );

  // ---- Envío masivo de términos: 202 y la corrida avanza sola.
  const arranque = await api(`/api/cohorts/${cohortId}/emails/bulk`, {
    method: "POST",
    body: JSON.stringify({ kind: "terms" }),
  });
  ok(
    "POST del envío masivo responde 202 con el id de la corrida",
    arranque.res.status === 202 && typeof arranque.json?.runId === "string",
    `${arranque.res.status} ${JSON.stringify(arranque.json)}`
  );
  const corrida = await esperarCorrida(
    `/api/cohorts/${cohortId}/emails/bulk/${arranque.json?.runId}`
  );
  ok(
    "la corrida termina (no queda colgada) aunque el proveedor de correo falle",
    corrida?.status === "terminada",
    JSON.stringify(corrida?.status)
  );
  const porAlumno = (run, id) => run?.recipients?.find((r) => r.enrollmentId === id);
  ok(
    "cada destinatario queda registrado con su motivo: ninguno figura como enviado",
    corrida?.totals?.sent === 0 &&
      corrida.totals.failed === 3 &&
      Boolean(porAlumno(corrida, enrA)?.message) &&
      Boolean(porAlumno(corrida, enrC)?.message),
    JSON.stringify(corrida?.recipients?.map((r) => [r.outcome, r.message]))
  );
  const rosterTras = await api(`/api/cohorts/${cohortId}/roster`);
  const filaA = rosterTras.json?.enrollments?.find((e) => e.id === enrA);
  ok(
    "sin aceptación del proveedor no se escribe la marca de enviado",
    filaA?.checklist?.termsEmailSentAt === null,
    JSON.stringify(filaA?.checklist)
  );
  const previaTras = await api(`/api/cohorts/${cohortId}/emails/bulk`);
  ok(
    "volver a enviar alcanzaría a los mismos dos (nadie quedó marcado de más)",
    previaTras.json?.kinds?.find((k) => k.kind === "terms")?.counts?.toSend === 2,
    JSON.stringify(previaTras.json?.kinds?.map((k) => k.counts))
  );

  // ---- Acceso al portal: Ana ya tiene acceso (dado de a uno).
  const accesoA = await api(`/api/enrollments/${enrA}/access`, { method: "POST" });
  const claveA = accesoA.json?.temporaryPassword;
  ok("setup: Ana recibe acceso de a una", accesoA.res.status === 201 && Boolean(claveA), `${accesoA.res.status}`);

  const previaAcceso = await api(`/api/cohorts/${cohortId}/access/bulk`);
  const conteo = previaAcceso.json?.kinds?.[0]?.counts;
  ok(
    "vista previa del acceso: 1 a enviar, 1 ya tiene acceso, 1 sin correo",
    conteo?.toSend === 1 && conteo.hasAccess === 1 && conteo.withoutEmail === 1,
    JSON.stringify(conteo)
  );

  const arranqueAcceso = await api(`/api/cohorts/${cohortId}/access/bulk`, {
    method: "POST",
    body: "{}",
  });
  ok(
    "POST del acceso masivo responde 202",
    arranqueAcceso.res.status === 202,
    `${arranqueAcceso.res.status} ${JSON.stringify(arranqueAcceso.json)}`
  );
  const corridaAcceso = await esperarCorrida(
    `/api/cohorts/${cohortId}/access/bulk/${arranqueAcceso.json?.runId}`
  );
  ok(
    "Ana figura como 'ya tiene acceso' y no se la reinvita",
    porAlumno(corridaAcceso, enrA)?.outcome === "skipped_has_access",
    JSON.stringify(porAlumno(corridaAcceso, enrA))
  );
  ok(
    "Beto: se le creó el acceso, y el registro dice que el correo no salió",
    porAlumno(corridaAcceso, enrB)?.outcome === "failed" &&
      (porAlumno(corridaAcceso, enrB)?.message ?? "").includes("Se creó el acceso"),
    JSON.stringify(porAlumno(corridaAcceso, enrB))
  );
  ok(
    "la contraseña temporal no viaja al registro de la corrida",
    !JSON.stringify(corridaAcceso ?? {}).includes(claveA ?? "@@sin-clave@@"),
    ""
  );
  const loginA = await ingresar(correoA, claveA);
  ok(
    "la contraseña de Ana sigue sirviendo después del envío masivo",
    loginA.ok,
    `${loginA.status}`
  );

  // ---- De a uno: reinvitar a quien ya tiene acceso pide confirmación.
  const sinForzar = await api(`/api/enrollments/${enrA}/access`, { method: "POST", body: "{}" });
  ok(
    "sin `force`, reinvitar a quien ya tiene acceso no hace nada y lo dice",
    sinForzar.res.status === 200 &&
      sinForzar.json?.skipped === true &&
      !sinForzar.json?.temporaryPassword,
    `${sinForzar.res.status} ${JSON.stringify(sinForzar.json)}`
  );
  const forzado = await api(`/api/enrollments/${enrA}/access`, {
    method: "POST",
    body: JSON.stringify({ force: true }),
  });
  ok(
    "con `force` (confirmado) se reinvita con una contraseña nueva",
    forzado.res.status === 201 && Boolean(forzado.json?.temporaryPassword) && forzado.json.temporaryPassword !== claveA,
    `${forzado.res.status}`
  );
  const loginViejo = await ingresar(correoA, claveA);
  ok("y la contraseña anterior deja de servir", !loginViejo.ok, `${loginViejo.status}`);

  // ---- Licencias por módulo desde el roster de la especialización.
  const software = async (name, totalLicenses) =>
    (await api("/api/software", { method: "POST", body: JSON.stringify({ name, totalLicenses }) }))
      .json?.software?.id;
  const swRevit = await software(`Revit ${sello}`, 1);
  const swNavis = await software(`Navis ${sello}`, 5);
  const nuevoCurso = async (name) =>
    (await api("/api/courses", { method: "POST", body: JSON.stringify({ name, published: false }) }))
      .json?.course?.id;
  const nuevaCohorte = async (datos) =>
    (await api("/api/cohorts", { method: "POST", body: JSON.stringify(datos) })).json?.cohort?.id;

  const madre = await nuevaCohorte({
    courseId: await nuevoCurso(`EBIM masivo ${sello}`),
    name: `EBIM masivo ${sello}`,
    startDate: isoDia(-5),
    endDate: isoDia(120),
    isSpecialization: true,
  });
  const modulo = async (nombre, position, softwareIds) =>
    nuevaCohorte({
      courseId: await nuevoCurso(`${nombre} ${sello}`),
      name: `${nombre} ${sello}`,
      parentCohortId: madre,
      position,
      startDate: isoDia(-5 + position),
      endDate: isoDia(30 + position),
      softwareIds,
    });
  const modRevit = await modulo("Módulo Revit", 1, [swRevit]);
  const modNavis = await modulo("Módulo Navis", 2, [swNavis]);
  const modTeoria = await modulo("Módulo Teoría", 3, []);

  const alumnoEsp = async (firstName, phone, modulos) => {
    const m = await api("/api/enrollments", {
      method: "POST",
      body: JSON.stringify({
        cohortId: madre,
        contact: { firstName, lastName: `Esp ${sello}`, phone },
      }),
    });
    const madreEnr = m.json?.enrollment?.id;
    const contactId = m.json?.enrollment?.contactId;
    const hijas = {};
    for (const mod of modulos) {
      const h = await api("/api/enrollments", {
        method: "POST",
        body: JSON.stringify({ cohortId: mod, contactId, parentEnrollmentId: madreEnr }),
      });
      hijas[mod] = h.json?.enrollment?.id;
    }
    return { madreEnr, hijas };
  };
  const uno = await alumnoEsp("Uno", `59897${cola}`, [modRevit, modNavis]);
  const dos = await alumnoEsp("Dos", `59898${cola}`, [modRevit]);
  ok(
    "setup: especialización con tres módulos (uno sin software) y dos alumnos",
    Boolean(madre && modRevit && modNavis && modTeoria && uno.hijas[modRevit] && uno.hijas[modNavis] && dos.hijas[modRevit]),
    JSON.stringify({ madre, modRevit, modNavis, modTeoria, uno, dos })
  );

  const rosterEsp = async () => (await api(`/api/cohorts/${madre}/roster`)).json;
  let r = await rosterEsp();
  const lineasUno = r?.enrollments?.find((e) => e.id === uno.madreEnr)?.moduleLicenses ?? [];
  ok(
    "el roster de la especialización trae una línea de licencia por módulo",
    r?.cohort?.isSpecialization === true &&
      lineasUno.length === 3 &&
      lineasUno[0]?.enrollmentId === uno.hijas[modRevit] &&
      lineasUno[0]?.software?.[0]?.id === swRevit &&
      lineasUno[1]?.enrollmentId === uno.hijas[modNavis] &&
      lineasUno[2]?.enrollmentId === null,
    JSON.stringify(lineasUno)
  );
  const lineasDos = r?.enrollments?.find((e) => e.id === dos.madreEnr)?.moduleLicenses ?? [];
  ok(
    "el módulo que no cursa figura sin inscripción (sin select)",
    lineasDos[1]?.enrollmentId === null && lineasDos[2]?.enrollmentId === null,
    JSON.stringify(lineasDos)
  );

  const asignar = (enrollmentId, softwareId) =>
    api(`/api/enrollments/${enrollmentId}/license`, {
      method: "PUT",
      body: JSON.stringify({ softwareId }),
    });
  const asignadaUno = await asignar(uno.hijas[modRevit], swRevit);
  ok("asignar Revit en el módulo de Uno responde 200", asignadaUno.res.ok, `${asignadaUno.res.status}`);
  r = await rosterEsp();
  const trasAsignar = r?.enrollments?.find((e) => e.id === uno.madreEnr)?.moduleLicenses?.[0];
  ok(
    "la línea del módulo queda con la licencia asignada (en la inscripción hija)",
    trasAsignar?.licenseAssigned === true && trasAsignar.licenseSoftwareId === swRevit,
    JSON.stringify(trasAsignar)
  );
  const inventario = (await api("/api/dashboard/licenses")).json?.inventory ?? [];
  ok(
    "el stock de Revit se descuenta (1 de 1 ocupada)",
    inventario.find((s) => s.softwareId === swRevit)?.available === 0,
    JSON.stringify(inventario.find((s) => s.softwareId === swRevit))
  );
  const sinStock = await asignar(dos.hijas[modRevit], swRevit);
  ok(
    "sin stock, el segundo alumno recibe el mismo 409 de siempre",
    sinStock.res.status === 409 && sinStock.json?.error?.code === "no_stock",
    `${sinStock.res.status} ${JSON.stringify(sinStock.json?.error)}`
  );
  const liberada = await api(`/api/enrollments/${uno.hijas[modRevit]}/license`, { method: "DELETE" });
  r = await rosterEsp();
  ok(
    "liberar desde la línea del módulo vuelve a dejar el stock libre",
    liberada.res.ok &&
      r?.enrollments?.find((e) => e.id === uno.madreEnr)?.moduleLicenses?.[0]?.licenseAssigned === false,
    `${liberada.res.status}`
  );
}
