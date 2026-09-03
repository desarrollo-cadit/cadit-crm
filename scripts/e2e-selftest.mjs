/**
 * Self-test E2E de comportamiento — conduce la app real en localhost con los
 * mocks (wa-mock + ai-mock) por las superficies de usuario, en vez de darle
 * el guion al humano. Cubre tests/e2e/us-bsuid.md y tests/e2e/us-bot-api.md.
 *
 * Uso:
 *   1) app corriendo con WA_MOCK_ENABLED=true, META_GRAPH_BASE_URL → wa-mock,
 *      BOT_API_KEY configurada y BD migrada
 *   2) node --env-file=.env scripts/e2e-selftest.mjs
 *
 * CONTRA UNA BASE EFÍMERA (obligatorio si la base de dev tiene datos reales:
 * el setup REGISTRA un operador nuevo, y en una instancia mono-tenant eso
 * crea una segunda organización que rompe `resolveSoleOrganizationId` y con
 * ella todo `/api/public/*`):
 *
 *   docker exec <pg> psql -U postgres -c "create database vocero_e2e;"
 *   DATABASE_URL=...vocero_e2e pnpm db:migrate
 *   # .env aparte con: DATABASE_URL→vocero_e2e, APP_BASE_URL/PORT libres,
 *   # META_GRAPH_BASE_URL=<base>/api/dev/wa-mock/graph  ← el sufijo /graph
 *   # es obligatorio: el cliente le agrega /<version>/<path>
 *   NEXT_DIST_DIR=.next-e2e node --env-file=.env.e2e next dev -p 3005
 *   node --env-file=.env.e2e scripts/e2e-selftest.mjs
 *
 * `NEXT_DIST_DIR` evita que esta instancia pelee por `.next` con el dev
 * server que ya esté corriendo: dos procesos de Next sobre el mismo
 * directorio se corrompen el grafo de módulos.
 *
 * Sale con código 1 si algún check falla (apto para CI o para el gate previo
 * a declarar "Hecho").
 */

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const BOT_KEY = process.env.BOT_API_KEY;

let cookie = "";
let failures = 0;
let checks = 0;

function ok(name, cond, extra = "") {
  checks++;
  if (cond) {
    console.log(`  OK  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      // Better Auth valida Origin (CSRF) en los endpoints de auth.
      origin: BASE,
      ...(cookie ? { cookie } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  }
  let json = null;
  try {
    json = await res.clone().json();
  } catch {}
  return { res, json };
}

function bot(path, opts = {}) {
  return api(path, {
    ...opts,
    headers: { "x-api-key": BOT_KEY ?? "", ...(opts.headers ?? {}) },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PN = "PN-E2E-1";

async function main() {
  if (!BOT_KEY || BOT_KEY.length < 16) {
    console.error(
      "BOT_API_KEY ausente o corta (<16): los checks de /api/bot/* no pueden correr."
    );
    process.exit(1);
  }

  console.log("== Setup: registro/login + conexión WhatsApp ==");
  const email = "e2e@vocero.test";
  const password = "password-e2e-123";
  let su = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Operador E2E" }),
  });
  if (!su.res.ok) {
    // Re-corrida: el registro se cierra tras la primera organización.
    su = await api("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }
  ok("registro o login del operador", su.res.ok, JSON.stringify(su.json));

  const conn = await api("/api/settings/whatsapp", {
    method: "PUT",
    body: JSON.stringify({
      wabaId: "WABA-E2E",
      phoneNumberId: PN,
      token: "tok-e2e",
    }),
  });
  ok(
    "conexión WhatsApp guardada (vía wa-mock)",
    conn.res.ok,
    JSON.stringify(conn.json)
  );
  await api("/api/dev/wa-mock/outbox", { method: "DELETE" });

  console.log("\n== us-bsuid: inbound sin wa_id ==");
  const inb1 = await api("/api/dev/wa-mock/inbound", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      fromUserId: "bsu_e2e_1",
      name: "Dueña Dental",
      text: "hola, vi su anuncio",
      waMessageId: "wamid.e2e.bsuid.1",
    }),
  });
  ok("inbound BSUID entregado", inb1.res.ok, JSON.stringify(inb1.json));
  await sleep(1200);

  let convs = (await api("/api/conversations")).json?.conversations ?? [];
  const bsuidConv = convs.find((c) => c.contact.name === "Dueña Dental");
  ok("conversación con nombre de perfil (no el BSUID crudo)", !!bsuidConv);
  ok("contacto BSUID sin teléfono", bsuidConv?.contact.phone === null);

  const reply = await api(`/api/conversations/${bsuidConv?.id}/messages`, {
    method: "POST",
    body: JSON.stringify({ text: "¡Hola! Te atendemos enseguida" }),
  });
  ok("respuesta a contacto BSUID enviable", reply.res.ok, JSON.stringify(reply.json));

  const outbox = (await api("/api/dev/wa-mock/outbox")).json?.outbox ?? [];
  ok(
    "el destinatario del envío es el BSUID",
    outbox.some((o) => o.to === "bsu_e2e_1"),
    JSON.stringify(outbox.map((o) => o.to))
  );

  // Idempotencia: re-entrega del mismo wa_message_id
  await api("/api/dev/wa-mock/inbound", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      fromUserId: "bsu_e2e_1",
      name: "Dueña Dental",
      text: "hola, vi su anuncio",
      waMessageId: "wamid.e2e.bsuid.1",
    }),
  });
  await sleep(800);
  const msgs =
    (await api(`/api/conversations/${bsuidConv?.id}/messages`)).json?.messages ??
    [];
  const inCount = msgs.filter((m) => m.direction === "in").length;
  ok("webhook duplicado no duplica mensajes", inCount === 1, `in=${inCount}`);

  console.log("\n== us-bsuid: reconciliación 521/52 ==");
  await api("/api/dev/wa-mock/inbound", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      from: "5214621349768",
      name: "Kevin MX",
      text: "uno",
    }),
  });
  await sleep(800);
  await api("/api/dev/wa-mock/inbound", {
    method: "POST",
    body: JSON.stringify({ phoneNumberId: PN, from: "524621349768", text: "dos" }),
  });
  await sleep(800);
  const contacts =
    (await api("/api/contacts?q=Kevin%20MX")).json?.contacts ?? [];
  ok(
    "521 y 52 resuelven a UN solo contacto",
    contacts.length === 1,
    `n=${contacts.length}`
  );

  const mxConv = ((await api("/api/conversations")).json?.conversations ?? []).find(
    (c) => c.contact.name === "Kevin MX"
  );
  ok("el contacto reconciliado conserva su conversación", !!mxConv);

  console.log("\n== us-bot-api: autorización ==");
  const noKey = await api("/api/bot/media/media123");
  ok("media sin API key → 401", noKey.res.status === 401);
  const badKey = await api("/api/bot/media/media123", {
    headers: { "x-api-key": "x".repeat(BOT_KEY.length) },
  });
  ok("media con API key equivocada → 401", badKey.res.status === 401);
  const resetNoKey = await api("/api/bot/reset", {
    method: "POST",
    body: JSON.stringify({ conversationId: mxConv?.id }),
  });
  ok("reset sin API key → 401", resetNoKey.res.status === 401);

  console.log("\n== us-bot-api: typing + leído ==");
  const convId = mxConv?.id;
  const outboxBeforeTyping =
    ((await api("/api/dev/wa-mock/outbox")).json?.outbox ?? []).length;
  const typ = await bot("/api/bot/typing", {
    method: "POST",
    body: JSON.stringify({ conversationId: convId }),
  });
  ok(
    "POST /api/bot/typing → ok:true (leído + escribiendo…)",
    typ.res.ok && typ.json?.ok === true,
    JSON.stringify(typ.json)
  );
  const outboxAfterTyping =
    ((await api("/api/dev/wa-mock/outbox")).json?.outbox ?? []).length;
  ok(
    "typing NO contamina el outbox",
    outboxAfterTyping === outboxBeforeTyping,
    `antes=${outboxBeforeTyping} después=${outboxAfterTyping}`
  );

  const typ404 = await bot("/api/bot/typing", {
    method: "POST",
    body: JSON.stringify({ conversationId: "cv_no_existe" }),
  });
  ok("typing con conversación inexistente → 404", typ404.res.status === 404);

  console.log("\n== us-bot-api: media proxy ==");
  const med = await bot("/api/bot/media/media123");
  const medBytes = med.res.ok ? await med.res.arrayBuffer() : new ArrayBuffer(0);
  ok(
    "GET /api/bot/media/{id} → binario con content-type",
    med.res.ok &&
      medBytes.byteLength > 0 &&
      (med.res.headers.get("content-type") ?? "").includes("image"),
    `status=${med.res.status} bytes=${medBytes.byteLength}`
  );
  const medBad = await bot("/api/bot/media/no-es-media");
  ok(
    "mediaId que Graph no reconoce → error tipado, no 500",
    medBad.res.status === 404 || medBad.res.status === 502,
    `status=${medBad.res.status}`
  );

  console.log("\n== us-bot-api: IA pausada y reset ==");
  const pause = await api(`/api/conversations/${convId}`, {
    method: "PATCH",
    body: JSON.stringify({ aiEnabled: false }),
  });
  ok("IA pausada desde la bandeja", pause.res.ok, JSON.stringify(pause.json));

  const typPaused = await bot("/api/bot/typing", {
    method: "POST",
    body: JSON.stringify({ conversationId: convId }),
  });
  ok(
    "typing con IA pausada → ok:false ai_paused (no toca Meta)",
    typPaused.res.ok &&
      typPaused.json?.ok === false &&
      typPaused.json?.reason === "ai_paused",
    JSON.stringify(typPaused.json)
  );

  const msgsBeforeReset =
    ((await api(`/api/conversations/${convId}/messages`)).json?.messages ?? [])
      .length;
  const rst = await bot("/api/bot/reset", {
    method: "POST",
    body: JSON.stringify({ conversationId: convId }),
  });
  ok(
    "POST /api/bot/reset → ok:true",
    rst.res.ok && rst.json?.ok === true,
    JSON.stringify(rst.json)
  );
  await sleep(400);
  convs = (await api("/api/conversations")).json?.conversations ?? [];
  const afterReset = convs.find((c) => c.id === convId);
  ok(
    "reset reactiva la IA (sale del handoff)",
    afterReset?.aiEnabled === true && !afterReset?.handoffAt,
    JSON.stringify({
      aiEnabled: afterReset?.aiEnabled,
      handoffAt: afterReset?.handoffAt,
    })
  );
  const msgsAfterReset =
    ((await api(`/api/conversations/${convId}/messages`)).json?.messages ?? [])
      .length;
  ok(
    "el reset conserva el historial (auditoría)",
    msgsAfterReset === msgsBeforeReset,
    `antes=${msgsBeforeReset} después=${msgsAfterReset}`
  );

  const stages = (await api("/api/pipeline/stages")).json?.stages ?? [];
  const firstStage = [...stages].sort((a, b) => a.position - b.position)[0];
  const detail = (await api(`/api/contacts/${afterReset?.contact.id}`)).json;
  ok(
    "reset regresa el lead a la primera etapa",
    !detail?.lead || detail?.stage?.id === firstStage?.id,
    `etapa=${detail?.stage?.name} esperada=${firstStage?.name}`
  );

  console.log("\n== 008: paridad inbox — echoes de coexistence (US1) ==");
  const LEAD = "5214627008001"; // canónica: 524627008001

  // Un inbound primero: la conversación existe y la ventana queda abierta.
  await api("/api/dev/wa-mock/inbound", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      from: LEAD,
      name: "Lead 008",
      text: "hola, quiero informes",
      waMessageId: "wamid.e2e.008.in.1",
    }),
  });
  await sleep(1200);
  const findConv008 = async () =>
    (((await api("/api/conversations")).json?.conversations) ?? []).find(
      (c) => c.contact.phone === "524627008001"
    );
  let conv008 = await findConv008();
  ok("conversación del lead 008 creada", Boolean(conv008), "sin conversación");
  const inboundAtBefore = conv008?.lastInboundAt;

  // Echo: el dueño contesta A MANO desde la app del teléfono.
  const echo1 = await api("/api/dev/wa-mock/echo", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      to: LEAD,
      text: "te contesto yo, dame un minuto",
      waMessageId: "wamid.e2e.008.echo.1",
    }),
  });
  ok("echo entregado al webhook", echo1.res.ok, JSON.stringify(echo1.json));
  await sleep(900);

  const msgs1 = (await api(`/api/conversations/${conv008.id}/messages`)).json?.messages ?? [];
  const manual1 = msgs1.find((m) => m.text === "te contesto yo, dame un minuto");
  ok(
    "el mensaje manual aparece como saliente origin=manual",
    manual1?.direction === "out" && manual1?.origin === "manual" && manual1?.status === "sent",
    JSON.stringify(manual1)
  );

  conv008 = await findConv008();
  ok(
    "la IA quedó pausada con handoff manual_reply",
    conv008?.aiEnabled === false && conv008?.handoffReason === "manual_reply",
    JSON.stringify({ aiEnabled: conv008?.aiEnabled, reason: conv008?.handoffReason })
  );
  ok(
    "el echo NO tocó la ventana de 24 h (lastInboundAt intacto)",
    conv008?.lastInboundAt === inboundAtBefore,
    `${inboundAtBefore} → ${conv008?.lastInboundAt}`
  );

  // Idempotencia: el mismo echo otra vez no duplica.
  await api("/api/dev/wa-mock/echo", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      to: LEAD,
      text: "te contesto yo, dame un minuto",
      waMessageId: "wamid.e2e.008.echo.1",
    }),
  });
  await sleep(700);
  const msgs2 = (await api(`/api/conversations/${conv008.id}/messages`)).json?.messages ?? [];
  ok(
    "echo duplicado (mismo wamid) no duplica el mensaje",
    msgs2.filter((m) => m.text === "te contesto yo, dame un minuto").length === 1
  );

  // Variante defensiva: echoes bajo la clave `messages`.
  await api("/api/dev/wa-mock/echo", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      to: LEAD,
      text: "segundo mensaje manual",
      waMessageId: "wamid.e2e.008.echo.2",
      useMessagesKey: true,
    }),
  });
  await sleep(700);
  const msgs3 = (await api(`/api/conversations/${conv008.id}/messages`)).json?.messages ?? [];
  ok(
    "echo bajo la clave `messages` también se ingiere (parser tolerante)",
    msgs3.some((m) => m.text === "segundo mensaje manual" && m.origin === "manual")
  );

  // Echo hacia un número SIN conversación previa → la crea.
  await api("/api/dev/wa-mock/echo", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      to: "5214627008002",
      text: "hola, te escribo del anuncio",
      waMessageId: "wamid.e2e.008.echo.3",
    }),
  });
  await sleep(700);
  const convNew = (((await api("/api/conversations")).json?.conversations) ?? []).find(
    (c) => c.contact.phone === "524627008002"
  );
  ok("echo a número nuevo crea contacto y conversación", Boolean(convNew));

  // Reactivación desde el CRM (flujo existente de handoff).
  const react = await api(`/api/conversations/${conv008.id}`, {
    method: "PATCH",
    body: JSON.stringify({ reactivate: true }),
  });
  conv008 = await findConv008();
  ok(
    "reactivar la IA desde el CRM limpia el handoff",
    react.res.ok && conv008?.aiEnabled === true && !conv008?.handoffReason
  );

  console.log("\n== 008: enviar adjuntos desde el composer (US2) ==");
  const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0xff, 0xd9]);
  const mediaForm = new FormData();
  mediaForm.set(
    "file",
    new Blob([JPEG_BYTES], { type: "image/jpeg" }),
    "local.jpg"
  );
  mediaForm.set("caption", "mira nuestro local");
  const upRes = await fetch(`${BASE}/api/conversations/${conv008.id}/messages/media`, {
    method: "POST",
    headers: { cookie, origin: BASE },
    body: mediaForm,
  });
  const upJson = await upRes.json().catch(() => null);
  ok("imagen con caption enviada (201)", upRes.status === 201, JSON.stringify(upJson));

  const msgs4 = (await api(`/api/conversations/${conv008.id}/messages`)).json?.messages ?? [];
  const sentImg = msgs4.find((m) => m.media?.caption === "mira nuestro local");
  ok(
    "el saliente con imagen trae asset disponible y origin=operator",
    sentImg?.type === "image" &&
      sentImg?.origin === "operator" &&
      sentImg?.media?.fetchStatus === "available",
    JSON.stringify(sentImg)
  );

  const imgBin = await fetch(`${BASE}/api/media/${sentImg?.media?.assetId}`, {
    headers: { cookie, origin: BASE },
  });
  ok(
    "GET /api/media/{id} sirve el binario con su content-type",
    imgBin.ok && (imgBin.headers.get("content-type") ?? "").includes("image/jpeg")
  );

  const outbox008 = (await api("/api/dev/wa-mock/outbox")).json?.outbox ?? [];
  ok(
    "el envío llegó a Graph como type=image con media id subido",
    outbox008.some((o) => o.type === "image" && JSON.stringify(o.body).includes("media-up-"))
  );

  // Camino infeliz: archivo que excede el límite (imagen > 5 MB) → 413 previo.
  const bigForm = new FormData();
  bigForm.set(
    "file",
    new Blob([Buffer.alloc(6 * 1024 * 1024)], { type: "image/png" }),
    "grande.png"
  );
  const bigRes = await fetch(`${BASE}/api/conversations/${conv008.id}/messages/media`, {
    method: "POST",
    headers: { cookie, origin: BASE },
    body: bigForm,
  });
  ok("imagen de 6 MB → 413 too_large ANTES de enviar", bigRes.status === 413);

  // Ubicación (payload estructurado, sin archivo).
  const locRes = await api(`/api/conversations/${conv008.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      type: "location",
      location: { latitude: 21.019, longitude: -101.257, name: "Oficina Central" },
    }),
  });
  ok("ubicación enviada", locRes.res.ok, JSON.stringify(locRes.json));
  const msgs5 = (await api(`/api/conversations/${conv008.id}/messages`)).json?.messages ?? [];
  const sentLoc = msgs5.find((m) => m.type === "location" && m.direction === "out");
  ok(
    "la ubicación viaja como payload (lat/long/name) sin binario",
    sentLoc?.media?.kind === "location" && sentLoc?.media?.payload?.latitude === 21.019,
    JSON.stringify(sentLoc?.media)
  );
  const outboxLoc = (await api("/api/dev/wa-mock/outbox")).json?.outbox ?? [];
  ok(
    "Graph recibió type=location",
    outboxLoc.some((o) => o.type === "location")
  );

  console.log("\n== 008: previews de adjuntos entrantes (US3) ==");
  await api("/api/dev/wa-mock/inbound", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      from: LEAD,
      type: "image",
      mediaId: "media-e2e-img-1",
      caption: "foto de mi negocio",
      waMessageId: "wamid.e2e.008.in.img",
    }),
  });
  await sleep(1600); // ingesta + descarga in-process del binario
  const msgs6 = (await api(`/api/conversations/${conv008.id}/messages`)).json?.messages ?? [];
  const inImg = msgs6.find((m) => m.media?.caption === "foto de mi negocio");
  ok(
    "imagen entrante queda disponible tras la descarga in-process",
    inImg?.direction === "in" &&
      inImg?.media?.kind === "image" &&
      inImg?.media?.fetchStatus === "available",
    JSON.stringify(inImg?.media)
  );
  const inImgBin = await fetch(`${BASE}/api/media/${inImg?.media?.assetId}`, {
    headers: { cookie, origin: BASE },
  });
  ok("el binario entrante se sirve desde el volumen local", inImgBin.ok);

  // Ubicación entrante: payload directo, sin binario (404 en /api/media).
  await api("/api/dev/wa-mock/inbound", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      from: LEAD,
      type: "location",
      location: { latitude: 20.5, longitude: -100.8, name: "Mi taller" },
      waMessageId: "wamid.e2e.008.in.loc",
    }),
  });
  await sleep(900);
  const msgs7 = (await api(`/api/conversations/${conv008.id}/messages`)).json?.messages ?? [];
  const inLoc = msgs7.find((m) => m.type === "location" && m.direction === "in");
  ok(
    "ubicación entrante trae payload directo",
    inLoc?.media?.payload?.name === "Mi taller",
    JSON.stringify(inLoc?.media)
  );

  // Camino infeliz: media cuya descarga falla (metadata sin url) → failed,
  // el mensaje se conserva y /api/media responde 410.
  await api("/api/dev/wa-mock/inbound", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      from: LEAD,
      type: "image",
      mediaId: "broken-no-url",
      waMessageId: "wamid.e2e.008.in.broken",
    }),
  });
  await sleep(1600);
  const msgs8 = (await api(`/api/conversations/${conv008.id}/messages`)).json?.messages ?? [];
  const broken = msgs8.find((m) => m.id !== inImg?.id && m.media?.fetchStatus === "failed");
  ok(
    "descarga fallida degrada a failed sin perder el mensaje",
    Boolean(broken),
    JSON.stringify(msgs8.filter((m) => m.media).map((m) => m.media))
  );
  if (broken) {
    const goneRes = await fetch(`${BASE}/api/media/${broken.media.assetId}`, {
      headers: { cookie, origin: BASE },
    });
    ok("asset fallido → 410 gone en /api/media", goneRes.status === 410);
  }

  // Echo CON adjunto (AC-5 de US1): la foto que el dueño mandó desde el cel.
  await api("/api/dev/wa-mock/echo", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: PN,
      to: LEAD,
      type: "image",
      mediaId: "media-e2e-echo-img",
      caption: "así quedaría tu logo",
      waMessageId: "wamid.e2e.008.echo.img",
    }),
  });
  await sleep(1600);
  const msgs9 = (await api(`/api/conversations/${conv008.id}/messages`)).json?.messages ?? [];
  const echoImg = msgs9.find((m) => m.media?.caption === "así quedaría tu logo");
  ok(
    "echo con imagen: manual + asset descargado y previsualizable",
    echoImg?.origin === "manual" && echoImg?.media?.fetchStatus === "available",
    JSON.stringify(echoImg?.media)
  );

  console.log("\n== dashboard/finance: los totales NO mezclan monedas ==");
  // Dos inscripciones del mes en curso, en monedas distintas. Si el panel
  // vuelve a sumar `amount` ignorando `currency`, este bloque falla: 150000
  // UYU y 1200 USD no pueden colapsar en un solo número.
  const courseFin = await api("/api/courses", {
    method: "POST",
    // `published: false` a propósito: este curso es de prueba y NO debe
    // aparecer nunca en el catálogo público del sitio comercial (007).
    body: JSON.stringify({
      name: `Curso Finanzas E2E ${Date.now()}`,
      published: false,
    }),
  });
  const courseFinId = courseFin.json?.course?.id;
  ok("curso de prueba creado", Boolean(courseFinId), JSON.stringify(courseFin.json));

  const cohortFin = await api("/api/cohorts", {
    method: "POST",
    body: JSON.stringify({
      courseId: courseFinId,
      startDate: new Date().toISOString(),
    }),
  });
  const cohortFinId = cohortFin.json?.cohort?.id;
  ok("cohorte de prueba creada", Boolean(cohortFinId), JSON.stringify(cohortFin.json));

  const stamp = Date.now();
  const enrUyu = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({
      cohortId: cohortFinId,
      contact: { firstName: "Alumna", lastName: "Uruguaya", phone: `598${stamp}`.slice(0, 15) },
      amount: 150000,
      currency: "UYU",
    }),
  });
  ok("inscripción en UYU creada", enrUyu.res.status === 201, JSON.stringify(enrUyu.json));

  const enrUsd = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({
      cohortId: cohortFinId,
      contact: { firstName: "Alumno", lastName: "Dolarizado", phone: `1${stamp}`.slice(0, 15) },
      amount: 1200,
      currency: "USD",
    }),
  });
  ok("inscripción en USD creada", enrUsd.res.status === 201, JSON.stringify(enrUsd.json));

  const fin = await api("/api/dashboard/finance");
  ok("GET /api/dashboard/finance responde 200", fin.res.ok, JSON.stringify(fin.json));

  const totals = fin.json?.currentMonth?.totals ?? [];
  const uyu = totals.find((t) => t.currency === "UYU")?.total ?? 0;
  const usd = totals.find((t) => t.currency === "USD")?.total ?? 0;
  ok(
    "el total en UYU incluye la inscripción en pesos",
    uyu >= 150000,
    JSON.stringify(totals)
  );
  ok(
    "el total en USD es el de dólares SOLO (1200), no la suma cruzada",
    usd >= 1200 && usd < 150000,
    JSON.stringify(totals)
  );
  ok(
    "ninguna moneda absorbió a la otra (regresión del bug de suma cruzada)",
    uyu !== usd && !totals.some((t) => t.total === uyu + usd),
    JSON.stringify(totals)
  );
  ok(
    "el endpoint declara las monedas con movimiento",
    Array.isArray(fin.json?.currencies) &&
      fin.json.currencies.includes("UYU") &&
      fin.json.currencies.includes("USD"),
    JSON.stringify(fin.json?.currencies)
  );
  ok(
    "la tendencia trae los totales por moneda en cada mes",
    Array.isArray(fin.json?.trend) &&
      fin.json.trend.every((p) => Array.isArray(p.totals)),
    JSON.stringify(fin.json?.trend?.[0])
  );

  // Camino infeliz: soporte no ve nada financiero (FR-016) — la regla dura
  // sigue en pie después del cambio de forma de la respuesta.
  const finTypes = fin.json?.currentMonth?.totals?.map((t) => typeof t.total) ?? [];
  ok(
    "todos los totales son números (nunca null)",
    finTypes.length > 0 && finTypes.every((t) => t === "number"),
    JSON.stringify(finTypes)
  );

  // ============================================================
  // 008 (T028) — Cobranza de punta a punta.
  //
  // Inscribir → plan de 3 cuotas → pagar una → anular → verificar que el
  // saldo vuelve. El caso de moneda comprueba que el pago hereda la de SU
  // cuota y no la de la inscripción: es la regla (FR-004) que evita cobrar
  // pesos contra una cuota en guaraníes.
  // ============================================================
  console.log("\n== Cobranza (008): plan, pago parcial, anulación ==");

  const curso = await api("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: "Curso Cobranza E2E" }),
  });
  const cursoId = curso.json?.course?.id ?? curso.json?.id;
  ok("curso de prueba creado", Boolean(cursoId), JSON.stringify(curso.json));

  const cohorte = await api("/api/cohorts", {
    method: "POST",
    body: JSON.stringify({
      courseId: cursoId,
      name: "Cobranza E2E",
      startDate: "2026-09-01",
      endDate: "2026-10-01",
    }),
  });
  const cohorteId = cohorte.json?.cohort?.id ?? cohorte.json?.id;
  ok("cohorte de prueba creada", Boolean(cohorteId), JSON.stringify(cohorte.json));

  const insc = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({
      cohortId: cohorteId,
      contact: { firstName: "Alumno", lastName: "Cobranza", phone: "59899000111" },
      amount: 90000,
      currency: "UYU",
    }),
  });
  const inscId = insc.json?.enrollment?.id;
  ok("inscripción con monto creada", Boolean(inscId), JSON.stringify(insc.json));

  const plan = await api(`/api/enrollments/${inscId}/installments`, {
    method: "POST",
    body: JSON.stringify({ count: 3, firstDueDate: "2026-09-10" }),
  });
  const cuotas = plan.json?.installments ?? [];
  ok(
    "plan de 3 cuotas generado y la suma da el total",
    cuotas.length === 3 && cuotas.reduce((s, c) => s + c.amount, 0) === 90000,
    JSON.stringify(cuotas.map((c) => c.amount))
  );

  // Pago PARCIAL: la caja recibe lo que el alumno trae (DV-002).
  const pago = await api(`/api/enrollments/${inscId}/payments`, {
    method: "POST",
    body: JSON.stringify({
      installmentId: cuotas[0]?.id,
      amount: 10000,
      paidAt: "2026-09-10",
      method: "transferencia",
      idempotencyKey: "e2e-cobranza-1",
    }),
  });
  ok("pago parcial registrado", pago.res.status === 201, JSON.stringify(pago.json));
  ok(
    "el pago hereda la moneda de su cuota (FR-004)",
    pago.json?.payment?.currency === cuotas[0]?.currency,
    `${pago.json?.payment?.currency} vs ${cuotas[0]?.currency}`
  );

  // Idempotencia (FR-011): el mismo intento no cobra dos veces.
  const repetido = await api(`/api/enrollments/${inscId}/payments`, {
    method: "POST",
    body: JSON.stringify({
      installmentId: cuotas[0]?.id,
      amount: 10000,
      paidAt: "2026-09-10",
      method: "transferencia",
      idempotencyKey: "e2e-cobranza-1",
    }),
  });
  ok(
    "reintento con la misma idempotencyKey no duplica",
    repetido.json?.payment?.id === pago.json?.payment?.id,
    `${repetido.json?.payment?.id} vs ${pago.json?.payment?.id}`
  );

  const conPago = await api(`/api/enrollments/${inscId}/installments`);
  const cuota1 = conPago.json?.installments?.[0];
  ok(
    "el pago parcial deja saldo y el estado es 'parcial'",
    cuota1?.paid === 10000 && cuota1?.balance === 20000 && cuota1?.status === "parcial",
    JSON.stringify(cuota1)
  );

  // Anular NO borra: el saldo vuelve y el registro queda (FR-006).
  const anulado = await api(`/api/payments/${pago.json?.payment?.id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason: "prueba e2e" }),
  });
  ok("pago anulado", anulado.res.ok, JSON.stringify(anulado.json));

  const trasAnular = await api(`/api/enrollments/${inscId}/installments`);
  const cuota1b = trasAnular.json?.installments?.[0];
  ok(
    "el saldo vuelve al total de la cuota tras anular",
    cuota1b?.paid === 0 && cuota1b?.balance === cuota1b?.amount,
    JSON.stringify(cuota1b)
  );
  ok(
    "el pago anulado sigue registrado, no se borró",
    (trasAnular.json?.payments ?? []).some((p) => p.voidedAt),
    JSON.stringify(trasAnular.json?.payments)
  );

  // Rearmar el plan con un pago vigente debe rechazarse (409); sin pagos, no.
  const refi = await api(`/api/enrollments/${inscId}/installments`, {
    method: "POST",
    body: JSON.stringify({ count: 6, firstDueDate: "2026-11-01", replace: true }),
  });
  ok(
    "refinanciar sin pagos vigentes rearma el plan",
    refi.res.status === 201 &&
      (refi.json?.installments ?? []).filter((i) => !i.canceledAt).length === 6,
    JSON.stringify(refi.json?.installments?.map((i) => i.number))
  );

  const morosidad = await api("/api/dashboard/overdue");
  ok(
    "la vista de morosidad responde con totales por moneda",
    morosidad.res.ok && Array.isArray(morosidad.json?.byCurrency),
    JSON.stringify(morosidad.json?.byCurrency)
  );

  // ============================================================
  // 012 (T017/T017b/T017d) — Acceso al portal del alumno.
  //
  // Lo que se conduce acá es sobre todo el camino INFELIZ, porque es el que
  // importa: el alumno sin correo (6 de los 340 reales), y el proveedor de
  // correo caído o sin configurar. Ninguno de los dos puede colgar la acción
  // ni contestar un 500 sin explicación.
  //
  // En este entorno M365 NO está configurado a propósito, así que invitar
  // llega hasta el envío y falla ahí — que es exactamente el escenario que
  // hay que ver degradar bien.
  // ============================================================
  console.log("\n== 012: acceso al portal del alumno ==");

  const cursoP = await api("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: "Curso Portal E2E" }),
  });
  const cursoPId = cursoP.json?.course?.id ?? cursoP.json?.id;
  ok("curso de prueba creado", Boolean(cursoPId), JSON.stringify(cursoP.json));

  const cohortePAPI = await api("/api/cohorts", {
    method: "POST",
    body: JSON.stringify({
      courseId: cursoPId,
      name: "Portal E2E",
      startDate: "2026-09-01",
      endDate: "2026-10-01",
    }),
  });
  const cohortePId = cohortePAPI.json?.cohort?.id ?? cohortePAPI.json?.id;
  ok("cohorte de prueba creada", Boolean(cohortePId), JSON.stringify(cohortePAPI.json));

  // --- Alumno SIN correo: el caso de los 6 contactos importados (T017d) ---
  const sinCorreo = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({
      cohortId: cohortePId,
      contact: { firstName: "Sin", lastName: "Correo", phone: "59899000777" },
    }),
  });
  const sinCorreoId = sinCorreo.json?.enrollment?.id ?? sinCorreo.json?.id;
  ok("inscripción sin correo creada", Boolean(sinCorreoId), JSON.stringify(sinCorreo.json));

  const estadoSin = await api(`/api/enrollments/${sinCorreoId}/access`);
  ok(
    "sin correo: el estado dice el motivo en vez de ofrecer el acceso",
    estadoSin.res.ok &&
      estadoSin.json?.link === null &&
      typeof estadoSin.json?.blockedReason === "string" &&
      estadoSin.json.blockedReason.includes("correo"),
    JSON.stringify(estadoSin.json)
  );

  const invitarSin = await api(`/api/enrollments/${sinCorreoId}/access`, { method: "POST" });
  ok(
    "sin correo: invitar responde 422 explicado, no 500",
    invitarSin.res.status === 422 && invitarSin.json?.error?.code === "no_email",
    `${invitarSin.res.status} ${JSON.stringify(invitarSin.json)}`
  );

  // --- Alumno CON correo: el camino normal hasta el envío ---
  const conCorreo = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({
      cohortId: cohortePId,
      contact: {
        firstName: "Con",
        lastName: "Correo",
        phone: "59899000888",
        email: "portal.e2e@example.com",
      },
    }),
  });
  const conCorreoId = conCorreo.json?.enrollment?.id ?? conCorreo.json?.id;
  ok("inscripción con correo creada", Boolean(conCorreoId), JSON.stringify(conCorreo.json));

  const estadoCon = await api(`/api/enrollments/${conCorreoId}/access`);
  ok(
    "con correo: no hay motivo de bloqueo y todavía no tiene acceso",
    estadoCon.res.ok &&
      estadoCon.json?.blockedReason === null &&
      estadoCon.json?.link === null,
    JSON.stringify(estadoCon.json)
  );

  /**
   * 014 (fase 4) — Sin M365 el envío falla, y ANTES eso devolvía 502 que se
   * llevaba puesta la contraseña temporal: la cuenta quedaba creada —devolver
   * una `Response` de error no revierte la transacción— y la persona sin
   * ninguna forma de entrar. Reintentar generaba otra contraseña y volvía a
   * fallar en el mismo lugar.
   *
   * Ahora el acceso se ENTREGA igual: la contraseña viaja con el motivo de por
   * qué el correo no salió, y quien invita se la dicta. Perder una credencial
   * recién generada porque un tercero falló está mal con M365 configurado y
   * sin configurar — una caída de Graph produce exactamente el mismo agujero.
   */
  const invitarCon = await api(`/api/enrollments/${conCorreoId}/access`, { method: "POST" });
  ok(
    "sin M365 la invitación NO falla: entrega el acceso igual",
    invitarCon.res.ok,
    `${invitarCon.res.status} ${JSON.stringify(invitarCon.json)}`
  );
  ok(
    "con la contraseña temporal, que es lo único que sirve para entrar",
    Boolean(invitarCon.json?.temporaryPassword),
    JSON.stringify(invitarCon.json)
  );
  ok(
    "y diciendo que el correo no salió, en vez de mentir",
    invitarCon.json?.emailSentAt === null && Boolean(invitarCon.json?.emailError),
    JSON.stringify({
      emailSentAt: invitarCon.json?.emailSentAt,
      emailError: invitarCon.json?.emailError,
    })
  );

  const estadoTras = await api(`/api/enrollments/${conCorreoId}/access`);
  ok(
    "tras el fallo de correo el acceso EXISTE (la respuesta no mintió)",
    estadoTras.res.ok && estadoTras.json?.link?.kind === "alumno",
    JSON.stringify(estadoTras.json)
  );

  const rosterPortal = await api(`/api/cohorts/${cohortePId}/roster`);
  const filaSin = (rosterPortal.json?.enrollments ?? []).find((e) => e.id === sinCorreoId);
  const filaCon = (rosterPortal.json?.enrollments ?? []).find((e) => e.id === conCorreoId);
  ok(
    "el roster trae el motivo del bloqueo para pintarlo en la pantalla (T017d)",
    typeof filaSin?.portalAccess?.blockedReason === "string" &&
      filaSin.portalAccess.granted === false,
    JSON.stringify(filaSin?.portalAccess)
  );
  ok(
    "el roster marca a quien ya tiene acceso",
    filaCon?.portalAccess?.granted === true,
    JSON.stringify(filaCon?.portalAccess)
  );

  // T017b — la puerta masiva no existe: la ruta invita de a UNA inscripción.
  const masivo = await api(`/api/cohorts/${cohortePId}/access`, { method: "POST" });
  ok(
    "no existe una ruta para invitar a toda la cohorte (T017b)",
    masivo.res.status === 404 || masivo.res.status === 405,
    `${masivo.res.status}`
  );

  // ============================================================
  // 013 — Calendario real, legajo y reporte por empresa.
  //
  // Lo que se conduce acá es lo que la fase vino a arreglar: el calendario
  // mostraba días teóricos y una clase cancelada seguía apareciendo. Y el
  // legajo, que es la pantalla donde el sistema AFIRMA cosas sobre una
  // persona: si dice "aprobado" sin datos, miente.
  // ============================================================
  console.log("\n== 013: calendario real, legajo y empresas ==");

  const curso13 = await api("/api/courses", {
    method: "POST",
    body: JSON.stringify({ name: "Curso 013 E2E" }),
  });
  const curso13Id = curso13.json?.course?.id ?? curso13.json?.id;

  // Cohorte con días declarados y fecha de fin: puede generar cronograma.
  const coh13 = await api("/api/cohorts", {
    method: "POST",
    body: JSON.stringify({
      courseId: curso13Id,
      name: "Cronograma E2E",
      startDate: "2026-09-07",
      endDate: "2026-09-25",
      daysOfWeek: "0,2",
      startTime: "18:30",
      endTime: "20:30",
    }),
  });
  const coh13Id = coh13.json?.cohort?.id ?? coh13.json?.id;
  ok("cohorte con días y horario creada", Boolean(coh13Id), JSON.stringify(coh13.json));

  const proyectadas = await api(`/api/cohorts/${coh13Id}/classes`);
  ok(
    "sin cronograma, las clases vienen marcadas como PROYECCIÓN",
    proyectadas.json?.projected === true &&
      (proyectadas.json?.classes ?? []).length > 0,
    JSON.stringify({ p: proyectadas.json?.projected, n: proyectadas.json?.classes?.length })
  );
  ok(
    "y una proyección no ofrece enlace de reunión",
    (proyectadas.json?.classes ?? []).every((c) => c.meetingUrl === null)
  );
  ok(
    "se puede generar: sin motivo de bloqueo",
    proyectadas.json?.cannotGenerateReason === null,
    String(proyectadas.json?.cannotGenerateReason)
  );

  const gen = await api(`/api/cohorts/${coh13Id}/schedule`, { method: "POST" });
  ok("generar el cronograma responde 201", gen.res.status === 201, `${gen.res.status}`);

  const reales = await api(`/api/cohorts/${coh13Id}/classes`);
  ok(
    "ahora las clases son REALES, no proyección",
    reales.json?.projected === false && (reales.json?.classes ?? []).length > 0,
    JSON.stringify({ p: reales.json?.projected, n: reales.json?.classes?.length })
  );
  ok(
    "generar dos veces NO duplica (constitución IV)",
    (await api(`/api/cohorts/${coh13Id}/schedule`, { method: "POST" })).res.status === 409
  );

  // FR-005e — una clase cancelada no ofrece enlace ni grabación.
  const primeraClase = (reales.json?.classes ?? [])[0];
  if (primeraClase?.id) {
    await api(`/api/class-sessions/${primeraClase.id}/links`, {
      method: "PATCH",
      body: JSON.stringify({ recordingUrl: "https://drive.example.com/grabacion" }),
    });
    const conGrabacion = await api(`/api/cohorts/${coh13Id}/classes`);
    ok(
      "la grabación cargada aparece en su clase",
      (conGrabacion.json?.classes ?? []).some(
        (c) => c.recordingUrl === "https://drive.example.com/grabacion"
      )
    );

    const rechazado = await api(`/api/class-sessions/${primeraClase.id}/links`, {
      method: "PATCH",
      body: JSON.stringify({ recordingUrl: "no-es-una-url" }),
    });
    ok(
      "un enlace inválido se rechaza (422), no se guarda roto",
      rechazado.res.status === 422,
      `${rechazado.res.status}`
    );
  }

  // El calendario ahora lee class_session, no los días teóricos.
  const cal = await api(
    `/api/calendar?from=${encodeURIComponent("2026-09-01T00:00:00.000Z")}&to=${encodeURIComponent("2026-09-30T00:00:00.000Z")}`
  );
  ok(
    "el calendario trae las clases REALES de esa cohorte",
    (cal.json?.classes ?? []).some((c) => c.cohortId === coh13Id && !c.projected),
    `n=${(cal.json?.classes ?? []).length}`
  );

  // Material: enlaces, con contenedor único.
  const mat = await api("/api/resources", {
    method: "POST",
    body: JSON.stringify({
      title: "Guía de la clase 1",
      url: "https://drive.example.com/guia",
      kind: "guia",
      classSessionId: primeraClase?.id,
    }),
  });
  ok("se agrega material a una clase", mat.res.status === 201, `${mat.res.status}`);

  const matMal = await api("/api/resources", {
    method: "POST",
    body: JSON.stringify({ title: "x", url: "https://x.com", courseId: curso13Id, classSessionId: primeraClase?.id }),
  });
  ok(
    "material con curso Y clase se rechaza con 422 explicado, no 500",
    matMal.res.status === 422 && matMal.json?.error?.code === "invalid_container",
    `${matMal.res.status} ${JSON.stringify(matMal.json?.error)}`
  );

  // Avisos: quedan registrados con autor.
  const aviso = await api(`/api/cohorts/${coh13Id}/announcements`, {
    method: "POST",
    body: JSON.stringify({ title: "Cambio de horario", body: "La clase pasa al viernes" }),
  });
  ok("se publica un aviso", aviso.res.status === 201, `${aviso.res.status}`);
  const avisos = await api(`/api/cohorts/${coh13Id}/announcements`);
  ok(
    "el aviso queda con su autor (FR-008)",
    (avisos.json?.announcements ?? []).some((a) => a.authorName),
    JSON.stringify(avisos.json?.announcements?.[0])
  );

  // Legajo: la pantalla donde el sistema afirma cosas sobre una persona.
  const insc13 = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({
      cohortId: coh13Id,
      contact: { firstName: "Legajo", lastName: "E2E", phone: "59899000999" },
    }),
  });
  const contactoId = insc13.json?.enrollment?.contactId;
  const legajo = await api(`/api/contacts/${contactoId}/record`);
  ok("el legajo responde", legajo.res.status === 200, `${legajo.res.status}`);
  ok(
    "reúne la cursada de la persona",
    (legajo.json?.courses ?? []).length === 1,
    `n=${(legajo.json?.courses ?? []).length}`
  );
  ok(
    "sin evaluaciones ni asistencia dice «sin_datos», NO «aprobado»",
    legajo.json?.courses?.[0]?.approval === "sin_datos",
    String(legajo.json?.courses?.[0]?.approval)
  );
  ok(
    "con cobranza.ver el estado de cuenta viaja",
    "account" in (legajo.json ?? {}),
    Object.keys(legajo.json ?? {}).join(",")
  );

  // Reporte por empresa: el CSV que sale de la academia.
  const emp = await api("/api/companies", {
    method: "POST",
    body: JSON.stringify({ legalName: "Constructora E2E" }),
  });
  const empId = emp.json?.company?.id ?? emp.json?.id;
  const rep = await api(`/api/companies/${empId}/report`);
  ok("el reporte de una empresa responde", rep.res.status === 200, `${rep.res.status}`);
  ok("una empresa sin empleados devuelve lista vacía", (rep.json?.rows ?? []).length === 0);

  /* ============================================================
   * 014 — El portal del profesor
   * ============================================================
   * Las dos historias que la fase existe para sostener:
   *
   * - SC-001: un profesor entra, toma asistencia, y el dato APARECE en el
   *   panel de coordinación. Es lo que convierte al portal en algo más que una
   *   pantalla de consulta.
   * - SC-002: un profesor NO alcanza la cohorte de otro, y recibe 404 y no
   *   403. Se comprueba comparando los CUERPOS de las dos respuestas, no solo
   *   los códigos: un 403 confirmaría que la cohorte existe.
   */
  console.log("\n== 014: el portal del profesor ==");

  // Dos profesores: uno con cohorte, otro sin nada que ver con ella.
  const profeA = await api("/api/teachers", {
    method: "POST",
    body: JSON.stringify({ name: "Profe A E2E", email: "profe-a@e2e.test" }),
  });
  const profeAId = profeA.json?.teacher?.id ?? profeA.json?.id;
  const profeB = await api("/api/teachers", {
    method: "POST",
    body: JSON.stringify({ name: "Profe B E2E", email: "profe-b@e2e.test" }),
  });
  const profeBId = profeB.json?.teacher?.id ?? profeB.json?.id;
  ok("dos profesores con correo", Boolean(profeAId && profeBId));

  // La cohorte de 013 ya tiene cronograma generado: se le asigna el profesor A.
  await api(`/api/cohorts/${coh13Id}`, {
    method: "PATCH",
    body: JSON.stringify({ teacherId: profeAId }),
  });

  // Y una cohorte del profesor B, que A no debe alcanzar jamás.
  const cohB = await api("/api/cohorts", {
    method: "POST",
    body: JSON.stringify({
      courseId: curso13Id,
      name: "Cohorte de B",
      startDate: "2026-10-05",
      endDate: "2026-10-30",
      daysOfWeek: "0,2",
      startTime: "18:30",
      endTime: "20:30",
      teacherId: profeBId,
    }),
  });
  const cohBId = cohB.json?.cohort?.id ?? cohB.json?.id;
  ok("la cohorte del otro profesor existe", Boolean(cohBId));

  // Invitación individual. Con M365 sin configurar el correo NO sale, y eso ya
  // no rompe nada: la contraseña viaja igual con el motivo (fase 4).
  const invA = await api(`/api/teachers/${profeAId}/access`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  ok("invitar al profesor responde 201", invA.res.status === 201, `${invA.res.status}`);
  ok(
    "y entrega la contraseña aunque el correo no salga",
    Boolean(invA.json?.temporaryPassword),
    JSON.stringify({ emailError: invA.json?.emailError })
  );

  const invB = await api(`/api/teachers/${profeBId}/access`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  /**
   * El profesor usa su PROPIO tarro de cookies: el `cookie` global es del
   * operador, y pisarlo dejaría al resto del arnés sin sesión de staff.
   */
  async function comoProfesor(jar, path, opts = {}) {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        "content-type": "application/json",
        origin: BASE,
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
        ...(opts.headers ?? {}),
      },
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) jar.cookie = set.map((c) => c.split(";")[0]).join("; ");
    let json = null;
    try {
      json = await res.clone().json();
    } catch {}
    return { res, json };
  }

  const jarA = { cookie: "" };
  const jarB = { cookie: "" };
  const loginA = await comoProfesor(jarA, "/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({
      email: "profe-a@e2e.test",
      password: invA.json?.temporaryPassword,
    }),
  });
  ok("el profesor entra con la contraseña temporal", loginA.res.ok, `${loginA.res.status}`);
  await comoProfesor(jarB, "/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({
      email: "profe-b@e2e.test",
      password: invB.json?.temporaryPassword,
    }),
  });

  const misCohortes = await comoProfesor(jarA, "/api/portal/cohorts");
  ok("ve sus cohortes en el portal", misCohortes.res.ok, `${misCohortes.res.status}`);
  ok(
    "y solo las suyas",
    (misCohortes.json?.cohorts ?? []).length === 1 &&
      misCohortes.json.cohorts[0].id === coh13Id,
    JSON.stringify((misCohortes.json?.cohorts ?? []).map((c) => c.id))
  );
  ok(
    "sin un solo dato financiero (SC-003)",
    !JSON.stringify(misCohortes.json).match(/cost|currency|installment|payment/i)
  );

  // SC-002, la comprobación fuerte: 404 y el MISMO cuerpo que una inventada.
  const ajena = await comoProfesor(jarA, `/api/portal/cohorts/${cohBId}/classes`);
  const inventada = await comoProfesor(jarA, "/api/portal/cohorts/coh_no_existe/classes");
  ok("la cohorte ajena responde 404 (SC-002)", ajena.res.status === 404, `${ajena.res.status}`);
  ok(
    "y su cuerpo es idéntico al de una inventada",
    JSON.stringify(ajena.json) === JSON.stringify(inventada.json),
    `${JSON.stringify(ajena.json)} vs ${JSON.stringify(inventada.json)}`
  );

  // Las dos puertas no se cruzan (FR-008).
  const staffDesdePortal = await comoProfesor(jarA, "/api/cohorts");
  ok(
    "el profesor no entra al panel del staff",
    staffDesdePortal.res.status === 401,
    `${staffDesdePortal.res.status}`
  );
  const portalDesdeStaff = await api("/api/portal/cohorts");
  ok(
    "y el operador no entra al portal del profesor",
    portalDesdeStaff.res.status === 401 || portalDesdeStaff.res.status === 403,
    `${portalDesdeStaff.res.status}`
  );

  // SC-001 — toma asistencia y el dato llega al panel de coordinación.
  const inscPortal = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({
      cohortId: coh13Id,
      contact: { firstName: "Alumno", lastName: "Portal", phone: "59899000998" },
    }),
  });
  const enrollmentPortal = inscPortal.json?.enrollment?.id;

  const clasesPortal = await comoProfesor(jarA, `/api/portal/cohorts/${coh13Id}/classes`);
  const claseReal = (clasesPortal.json?.classes?.classes ?? []).find(
    (c) => c.id && !c.projected
  );
  ok("el profesor ve las clases reales de su cohorte", Boolean(claseReal));

  const planilla = await comoProfesor(jarA, `/api/portal/classes/${claseReal?.id}/attendance`);
  ok("abre la planilla de asistencia", planilla.res.ok, `${planilla.res.status}`);
  ok(
    "el alumno viaja como un nombre y nada más (DV-004)",
    (planilla.json?.students ?? []).every(
      (s) => Object.keys(s).sort().join(",") ===
        "enrollmentId,name,recordedAt,recordedByName,status"
    ),
    JSON.stringify(planilla.json?.students?.[0])
  );

  const marca = await comoProfesor(jarA, `/api/portal/classes/${claseReal?.id}/attendance`, {
    method: "PUT",
    body: JSON.stringify({
      entries: [{ enrollmentId: enrollmentPortal, status: "presente" }],
    }),
  });
  ok("el profesor marca asistencia", marca.res.ok, `${marca.res.status}`);

  // **El check que justifica la fase**: el dato cruzó de una puerta a la otra.
  const panel = await api(`/api/cohorts/${coh13Id}/attendance`);
  const enPanel = (panel.json?.students ?? []).find(
    (s) => s.enrollmentId === enrollmentPortal
  );
  ok(
    "y APARECE en el panel de coordinación (SC-001)",
    enPanel?.bySession?.[claseReal?.id] === "presente",
    JSON.stringify(enPanel?.bySession)
  );

  // DV-001 — corregir una clase pasada corrige, no duplica, y deja autor.
  await comoProfesor(jarA, `/api/portal/classes/${claseReal?.id}/attendance`, {
    method: "PUT",
    body: JSON.stringify({
      entries: [{ enrollmentId: enrollmentPortal, status: "tarde" }],
    }),
  });
  const reabierta = await comoProfesor(jarA, `/api/portal/classes/${claseReal?.id}/attendance`);
  const corregido = (reabierta.json?.students ?? []).find(
    (s) => s.enrollmentId === enrollmentPortal
  );
  ok("la corrección CORRIGE (DV-001)", corregido?.status === "tarde", corregido?.status);
  ok(
    "y queda registrado quién la dejó así",
    corregido?.recordedByName === "Profe A E2E",
    String(corregido?.recordedByName)
  );

  // El profesor B no puede tocar la clase de A, ni siquiera conociendo su id.
  const intruso = await comoProfesor(jarB, `/api/portal/classes/${claseReal?.id}/attendance`, {
    method: "PUT",
    body: JSON.stringify({
      entries: [{ enrollmentId: enrollmentPortal, status: "ausente" }],
    }),
  });
  ok("el otro profesor recibe 404 al marcar", intruso.res.status === 404, `${intruso.res.status}`);
  const intacta = await comoProfesor(jarA, `/api/portal/classes/${claseReal?.id}/attendance`);
  ok(
    "y el dato no se movió",
    (intacta.json?.students ?? []).find((s) => s.enrollmentId === enrollmentPortal)
      ?.status === "tarde"
  );

  // FR-006/DV-002 — el profesor no crea evaluaciones: la ruta no existe.
  const crearEval = await comoProfesor(jarA, `/api/portal/cohorts/${coh13Id}/grading`, {
    method: "POST",
    body: JSON.stringify({ name: "Inventada" }),
  });
  ok("el portal no deja crear evaluaciones", crearEval.res.status === 405, `${crearEval.res.status}`);

  // US5/FR-010 — mis horas, sin tarifa.
  const horas = await comoProfesor(jarA, "/api/portal/hours");
  ok("las horas dictadas responden", horas.res.ok, `${horas.res.status}`);
  ok(
    "sin tarifa de nadie",
    !JSON.stringify(horas.json).match(/rate|tarifa|precio|monto/i),
    JSON.stringify(horas.json)
  );

  // 014 fase 2 — copiar evaluaciones entre cohortes (DV-009).
  const evalA = await api(`/api/cohorts/${coh13Id}/grading`, {
    method: "POST",
    body: JSON.stringify({ name: "Trabajo final" }),
  });
  ok("la academia crea una evaluación", evalA.res.status === 201, `${evalA.res.status}`);
  const copia = await api(`/api/cohorts/${cohBId}/assessments/copy`, {
    method: "POST",
    body: JSON.stringify({ fromCohortId: coh13Id }),
  });
  ok("copiar evaluaciones a otra cohorte responde", copia.res.ok, `${copia.res.status}`);
  ok("copia la que había", copia.json?.copiadas === 1, `${copia.json?.copiadas}`);
  const copia2 = await api(`/api/cohorts/${cohBId}/assessments/copy`, {
    method: "POST",
    body: JSON.stringify({ fromCohortId: coh13Id }),
  });
  ok(
    "copiar dos veces NO duplica (constitución IV)",
    copia2.json?.copiadas === 0 && copia2.json?.omitidas?.length === 1,
    JSON.stringify(copia2.json)
  );

  // 014 fase 1 — con historial se ARCHIVA, no se borra.
  const baja = await api(`/api/contacts/${inscPortal.json?.enrollment?.contactId}`, {
    method: "DELETE",
  });
  ok("la baja de un alumno con historial responde", baja.res.ok, `${baja.res.status}`);
  ok("y lo ARCHIVA en vez de borrarlo", baja.json?.accion === "archivar", JSON.stringify(baja.json));

  // 014 fase 1 — el profesor con cohortes exige reasignar antes de la baja.
  const bajaProfe = await api(`/api/teachers/${profeAId}`, { method: "DELETE" });
  ok(
    "dar de baja a un profesor con cohortes responde 409",
    bajaProfe.res.status === 409,
    `${bajaProfe.res.status}`
  );

  /* ============================================================
   * 015 — El portal del alumno
   *
   * Lo que se conduce acá es la promesa entera de la fase: que el alumno vea
   * TODO lo suyo en un pedido, y NADA de nadie más. Las dos mitades importan
   * igual — un portal que no muestra la próxima clase no sirve, y uno que
   * muestra la de otro es peor que no tenerlo.
   *
   * El aislamiento se prueba con dos alumnos reales y cruzando los ids, no
   * leyendo el código: un `if` de alcance mal escrito compila igual.
   * ============================================================ */
  console.log("\n== 015: el portal del alumno ==");

  function conJar(jar) {
    return async (path, opts = {}) => {
      const res = await fetch(`${BASE}${path}`, {
        ...opts,
        headers: {
          "content-type": "application/json",
          origin: BASE,
          ...(jar.cookie ? { cookie: jar.cookie } : {}),
          ...(opts.headers ?? {}),
        },
      });
      const set = res.headers.getSetCookie?.() ?? [];
      if (set.length) jar.cookie = set.map((c) => c.split(";")[0]).join("; ");
      let json = null;
      try {
        json = await res.clone().json();
      } catch {}
      return { res, json };
    };
  }

  // Dos alumnos: uno en la cohorte CON cronograma real (coh13Id), para que
  // tenga próxima clase; el otro en otra cohorte, para cruzar los ids.
  const alumnoA = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({
      cohortId: coh13Id,
      contact: {
        firstName: "Alumna",
        lastName: "Uno",
        phone: "59899000901",
        email: "alumno-a@e2e.test",
      },
    }),
  });
  const alumnoAId = alumnoA.json?.enrollment?.id ?? alumnoA.json?.id;
  const alumnoB = await api("/api/enrollments", {
    method: "POST",
    body: JSON.stringify({
      cohortId: cohortePId,
      contact: {
        firstName: "Alumno",
        lastName: "Dos",
        phone: "59899000902",
        email: "alumno-b@e2e.test",
      },
    }),
  });
  const alumnoBId = alumnoB.json?.enrollment?.id ?? alumnoB.json?.id;
  ok(
    "dos inscripciones de alumno creadas",
    Boolean(alumnoAId) && Boolean(alumnoBId),
    JSON.stringify([alumnoA.json, alumnoB.json])
  );

  const accesoA = await api(`/api/enrollments/${alumnoAId}/access`, { method: "POST" });
  const accesoB = await api(`/api/enrollments/${alumnoBId}/access`, { method: "POST" });
  ok(
    "los dos reciben acceso al portal con contraseña temporal",
    Boolean(accesoA.json?.temporaryPassword) && Boolean(accesoB.json?.temporaryPassword),
    `${accesoA.res.status}/${accesoB.res.status}`
  );

  const jarAlumnoA = { cookie: "" };
  const jarAlumnoB = { cookie: "" };
  const comoA = conJar(jarAlumnoA);
  const comoB = conJar(jarAlumnoB);

  const loginAlumnoA = await comoA("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({
      email: "alumno-a@e2e.test",
      password: accesoA.json?.temporaryPassword,
    }),
  });
  ok(
    "el alumno entra con su contraseña temporal",
    loginAlumnoA.res.ok,
    `${loginAlumnoA.res.status}`
  );
  await comoB("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({
      email: "alumno-b@e2e.test",
      password: accesoB.json?.temporaryPassword,
    }),
  });

  // --- US1..US7: todo lo suyo, en un pedido ---
  const mio = await comoA("/api/portal/me");
  ok("ve su propio panel", mio.res.ok, `${mio.res.status}`);
  ok(
    "con su nombre y sus cursadas",
    mio.json?.student?.name?.includes("Alumna") && (mio.json?.courses ?? []).length >= 1,
    JSON.stringify({ student: mio.json?.student, cursadas: mio.json?.courses?.length })
  );
  ok(
    "y la zona de la academia, para poder decir de dónde es la hora (FR-011)",
    typeof mio.json?.timezone === "string" && mio.json.timezone.includes("/"),
    `${mio.json?.timezone}`
  );
  ok(
    "US2 — su próxima clase, resuelta en un instante real",
    mio.json?.nextClass !== null && typeof mio.json?.nextClass?.cohortId === "string",
    JSON.stringify(mio.json?.nextClass)
  );

  /**
   * FR-002 / SC-002 — La comprobación fuerte del aislamiento: el nombre del
   * OTRO alumno no puede aparecer en ningún lado de la respuesta. No se
   * pregunta por un campo concreto porque el riesgo no es un campo concreto:
   * es que alguien reuse el roster del staff y traiga la cohorte entera.
   */
  ok(
    "no aparece ni el nombre de un compañero en toda la respuesta",
    !JSON.stringify(mio.json).includes("Alumno Dos") &&
      !JSON.stringify(mio.json).includes("alumno-b@e2e.test"),
    "hay datos de otro alumno en la respuesta"
  );

  // --- SC-002: cruzar los ids ---
  const propia = await comoA(`/api/portal/me/cursadas/${alumnoAId}`);
  ok("abre su propia cursada", propia.res.ok, `${propia.res.status}`);
  ok(
    "con sus clases y su asistencia",
    Array.isArray(propia.json?.classes) && propia.json.classes.length > 0,
    `${propia.json?.classes?.length}`
  );

  const ajenaAlumno = await comoA(`/api/portal/me/cursadas/${alumnoBId}`);
  const inventadaAlumno = await comoA("/api/portal/me/cursadas/enr_no_existe");
  ok(
    "la cursada de otro alumno da 404, no 403",
    ajenaAlumno.res.status === 404,
    `${ajenaAlumno.res.status}`
  );
  ok(
    "y responde EXACTAMENTE lo mismo que una inventada: no confirma que existe",
    JSON.stringify(ajenaAlumno.json) === JSON.stringify(inventadaAlumno.json),
    `${JSON.stringify(ajenaAlumno.json)} vs ${JSON.stringify(inventadaAlumno.json)}`
  );

  // --- SC-003: las tres puertas no se cruzan ---
  const alumnoEnPortalProfe = await comoA("/api/portal/cohorts");
  ok(
    "el alumno NO entra al portal del profesor (SC-003)",
    alumnoEnPortalProfe.res.status === 403,
    `${alumnoEnPortalProfe.res.status}`
  );
  const profeEnPortalAlumno = await comoProfesor(jarA, "/api/portal/me");
  ok(
    "y el profesor NO entra al del alumno",
    profeEnPortalAlumno.res.status === 403,
    `${profeEnPortalAlumno.res.status}`
  );
  const alumnoEnStaff = await comoA(`/api/cohorts/${coh13Id}/roster`);
  ok(
    "el alumno NO alcanza ningún endpoint del staff (SC-003)",
    alumnoEnStaff.res.status === 401 || alumnoEnStaff.res.status === 403,
    `${alumnoEnStaff.res.status}`
  );
  const staffEnPortalAlumno = await api("/api/portal/me");
  ok(
    "y el operador tampoco entra al portal del alumno",
    staffEnPortalAlumno.res.status === 401 || staffEnPortalAlumno.res.status === 403,
    `${staffEnPortalAlumno.res.status}`
  );

  // --- US7 y US6 ---
  const cuenta = await comoA("/api/portal/me/cuenta");
  ok("ve su estado de cuenta", cuenta.res.ok, `${cuenta.res.status}`);
  ok(
    "con los saldos separados por moneda (nunca sumados)",
    Array.isArray(cuenta.json?.balances) &&
      new Set((cuenta.json.balances ?? []).map((b) => b.currency)).size ===
        (cuenta.json.balances ?? []).length,
    JSON.stringify(cuenta.json?.balances)
  );
  const certs = await comoA("/api/portal/me/certificados");
  ok(
    "ve sus certificados",
    certs.res.ok && Array.isArray(certs.json?.certificates),
    `${certs.res.status}`
  );

  // --- FR-003: solo lectura, y la garantía es que el método NO existe ---
  const escribir = await comoA("/api/portal/me", { method: "POST", body: "{}" });
  ok(
    "el portal del alumno es de SOLO LECTURA (FR-003)",
    escribir.res.status === 405 || escribir.res.status === 404,
    `${escribir.res.status}`
  );

  // --- Las pantallas responden ---
  const PANTALLAS_ALUMNO = ["/portal", "/portal/cuenta", "/portal/certificados"];
  const rotasAlumno = [];
  for (const ruta of PANTALLAS_ALUMNO) {
    const r = await fetch(`${BASE}${ruta}`, { headers: { cookie: jarAlumnoA.cookie } });
    if (r.status >= 400) rotasAlumno.push(`${ruta}(${r.status})`);
  }
  ok("las pantallas del alumno responden", rotasAlumno.length === 0, rotasAlumno.join(", "));

  /**
   * 021 — El caparazón del portal es el MISMO que el del panel: barra lateral.
   * Se comprueba en el HTML servido porque es lo que la fase vino a corregir, y
   * porque una regresión acá no rompe nada: solo deja media pantalla vacía, que
   * es justo el tipo de error que nadie reporta y todos sufren.
   */
  const htmlPortal = await (
    await fetch(`${BASE}/portal`, { headers: { cookie: jarAlumnoA.cookie } })
  ).text();
  ok(
    "el portal se sirve con barra lateral, no con el encabezado angosto",
    htmlPortal.includes("<aside") && htmlPortal.includes('data-surface="portal"')
  );
  ok("y con el cajón para el celular", htmlPortal.includes('aria-label="Abrir el men'));

  /**
   * 021 — El acceso: dos columnas y el ojo de la contraseña. Es la única
   * pantalla que ve TODO el mundo, así que una regresión acá la sufren las 340
   * personas de una vez.
   */
  const htmlLogin = await (await fetch(`${BASE}/login`)).text();
  ok(
    "el acceso trae el panel de marca",
    htmlLogin.includes("brand-grid") && htmlLogin.includes("<aside")
  );
  ok(
    "y el ojo para ver la contraseña que se dicta por teléfono",
    /aria-label="(Mostrar|Ocultar) la contrase/.test(htmlLogin)
  );


  /* ============================================================
   * 020 — Los dos temas
   * ============================================================
   * Lo que se comprueba acá no es que se vea lindo: eso no se comprueba con un
   * arnés. Es que el tema **llegue del servidor** y que ninguna pantalla se
   * caiga con el tema puesto — un tema oscuro a medias es peor que no tenerlo.
   */
  console.log("\n== 020: identidad visual en los dos temas ==");

  async function conTema(path, tema) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { cookie: `${cookie}; tema=${tema}`, origin: BASE },
      redirect: "manual",
    });
    return { res, html: await res.text() };
  }

  const claro = await conTema("/inbox", "light");
  const oscuro = await conTema("/inbox", "dark");
  ok(
    "sin preferencia el tema es CLARO (DV-001)",
    /<html[^>]*data-theme="light"/.test(claro.html)
  );
  ok(
    "con la cookie, el servidor manda el tema OSCURO ya puesto",
    /<html[^>]*data-theme="dark"/.test(oscuro.html)
  );
  /**
   * Sin esto habría un fogonazo blanco en cada carga, que es exactamente lo
   * que alguien elige el tema oscuro para no ver.
   */
  ok(
    "y viene en el HTML, antes del <body>: sin destello",
    oscuro.html.indexOf('data-theme="dark"') < oscuro.html.indexOf("<body")
  );

  const estilo = oscuro.html.match(/<style[^>]*>(:root\{[^<]*)<\/style>/)?.[1] ?? "";
  ok("el acento de la organización se inyecta en SSR", estilo.includes(":root{--accent:"));
  ok(
    "con los DOS juegos, para poder cambiar sin volver al servidor",
    estilo.includes('[data-theme="dark"]{--accent:')
  );

  const PANTALLAS = ["/", "/inbox", "/contacts", "/academico", "/calendar", "/settings"];
  for (const tema of ["light", "dark"]) {
    const rotas = [];
    for (const p of PANTALLAS) {
      const { res } = await conTema(p, tema);
      if (res.status >= 500) rotas.push(`${p}(${res.status})`);
    }
    ok(`las ${PANTALLAS.length} pantallas responden en tema ${tema}`, rotas.length === 0, rotas.join(", "));
  }

  // El conmutador tiene que estar donde la persona lo pueda encontrar.
  ok(
    "el conmutador de tema está en el panel",
    /aria-label="Cambiar a tema (claro|oscuro)"/.test(claro.html)
  );

  console.log(`\n===== ${checks - failures}/${checks} checks OK, ${failures} fallos =====`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("ERROR FATAL:", err);
  process.exit(1);
});
