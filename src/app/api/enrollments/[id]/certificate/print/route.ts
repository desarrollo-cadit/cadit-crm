import { eq } from "drizzle-orm";
import { requireCapability } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { scoped } from "@/lib/db/tenant";
import { escapeHtml, fullName } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };


/**
 * 010 (DV-002) — El certificado, en HTML pensado para imprimir.
 *
 * A4 APAISADO vía `@page`, y el navegador lo pasa a PDF con Ctrl+P. No se
 * suma una librería de PDF: la constitución (principio II) pide no agregar
 * dependencias que no hagan falta, y esta no hace falta. A cambio, el diseño
 * se edita como cualquier HTML.
 *
 * Las medidas van en milímetros y no en píxeles: es lo único que se comporta
 * igual en pantalla y en papel.
 */
export const GET = requireCapability(
  "evaluacion.ver",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const db = getDb();

  const rows = await db
    .select({
      certificate: schema.certificate,
      contact: schema.contact,
      courseName: schema.course.name,
      cohortName: schema.cohort.name,
      endDate: schema.cohort.endDate,
      durationWeeks: schema.course.durationWeeks,
      hoursPerWeek: schema.course.hoursPerWeek,
    })
    .from(schema.certificate)
    .innerJoin(schema.enrollment, eq(schema.certificate.enrollmentId, schema.enrollment.id))
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.certificate.organizationId,
        session.organizationId,
        eq(schema.certificate.enrollmentId, id)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return new Response("Certificado no emitido para esta inscripción", { status: 404 });
  }

  // DV-005 — las horas del CURSO (lo que figura en la web y lo que el alumno
  // compró), no las efectivamente dictadas.
  const hours =
    row.durationWeeks && row.hoursPerWeek ? row.durationWeeks * row.hoursPerWeek : null;

  const fecha = (row.endDate ?? row.certificate.issuedAt).toLocaleDateString("es-UY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const verifyUrl = `${getEnv().APP_BASE_URL}/verificar/${row.certificate.code}`;

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Certificado — ${escapeHtml(fullName(row.contact))}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; }
  .hoja {
    width: 297mm; height: 210mm; padding: 18mm 22mm;
    display: flex; flex-direction: column; justify-content: space-between;
    border: 3mm solid #18181b; background: #fff;
  }
  .marco { border: 0.4mm solid #a1a1aa; height: 100%; padding: 12mm 14mm;
           display: flex; flex-direction: column; justify-content: space-between; }
  .encabezado { text-align: center; }
  .academia { font-size: 6mm; letter-spacing: 2mm; text-transform: uppercase; margin: 0; }
  .atc { font-size: 3.4mm; color: #52525b; margin: 2mm 0 0; letter-spacing: 0.6mm; }
  .cuerpo { text-align: center; }
  .otorga { font-size: 4mm; color: #52525b; margin: 0 0 4mm; }
  .alumno { font-size: 13mm; margin: 0; font-weight: normal; border-bottom: 0.3mm solid #d4d4d8;
            display: inline-block; padding: 0 10mm 3mm; }
  .detalle { font-size: 4.6mm; line-height: 8mm; margin: 8mm 0 0; }
  .curso { font-weight: bold; }
  .pie { display: flex; justify-content: space-between; align-items: flex-end; font-size: 3.2mm; color: #52525b; }
  .firma { text-align: center; }
  .linea { width: 60mm; border-top: 0.3mm solid #18181b; margin-bottom: 2mm; }
  .codigo { font-family: "Courier New", monospace; font-size: 3.6mm; letter-spacing: 0.5mm; color: #18181b; }
  .anulado { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
             font-size: 40mm; color: rgba(220,38,38,.18); transform: rotate(-24deg);
             letter-spacing: 4mm; font-weight: bold; }
  .noprint { text-align: center; padding: 6mm; font-family: system-ui, sans-serif; font-size: 3.5mm; color: #71717a; }
  @media print { .noprint { display: none; } }
</style></head><body>
<div class="hoja">
  <div class="marco">
    ${row.certificate.revokedAt ? '<div class="anulado">ANULADO</div>' : ""}

    <div class="encabezado">
      <p class="academia">CAD IT</p>
      <p class="atc">Autodesk Training Center</p>
    </div>

    <div class="cuerpo">
      <p class="otorga">Certifica que</p>
      <h1 class="alumno">${escapeHtml(fullName(row.contact))}</h1>
      <p class="detalle">
        ha completado satisfactoriamente el curso<br />
        <span class="curso">${escapeHtml(row.courseName)}</span><br />
        ${hours ? `con una carga horaria de ${hours} horas` : ""}
      </p>
    </div>

    <div class="pie">
      <div>
        <p>Emitido el ${fecha}</p>
        <p class="codigo">${escapeHtml(row.certificate.code)}</p>
        <p>Verificable en ${escapeHtml(verifyUrl)}</p>
      </div>
      <div class="firma">
        <div class="linea"></div>
        <p>Dirección académica</p>
      </div>
    </div>
  </div>
</div>
<p class="noprint">Imprimí con Ctrl+P — elegí A4 apaisado y desactivá encabezados y pies de página.</p>
</body></html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
