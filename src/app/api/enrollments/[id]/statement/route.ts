import { eq } from "drizzle-orm";
import { requireCapability } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { listInstallments, listPayments } from "@/server/billing";
import { escapeHtml, fullName } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const SYMBOL: Record<string, string> = { UYU: "$", PYG: "Gs. ", USD: "US$" };
const money = (n: number, c: string) => `${SYMBOL[c] ?? "$"}${n.toLocaleString("es-UY")}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("es-UY");


/**
 * 008 (T027) — Estado de cuenta imprimible de una inscripción.
 *
 * Devuelve HTML y no PDF a propósito: generar PDF exigiría una dependencia
 * nueva, y el navegador ya sabe imprimir a PDF con Ctrl+P. La constitución
 * (principio II) pide no sumar dependencias que no hagan falta, y esta no
 * hace falta.
 *
 * `cobranza.ver`: es el detalle financiero completo del alumno.
 */
export const GET = requireCapability(
  "cobranza.ver",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const db = getDb();

  const rows = await db
    .select({
      contact: schema.contact,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      amount: schema.enrollment.amount,
      currency: schema.enrollment.currency,
      invoiceNumber: schema.enrollment.invoiceNumber,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        session.organizationId,
        eq(schema.enrollment.id, id)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return new Response("Inscripción no encontrada", { status: 404 });
  }

  const [installments, payments] = await Promise.all([
    listInstallments(session.organizationId, id),
    listPayments(session.organizationId, id),
  ]);

  const vigentes = installments.filter((i) => !i.canceledAt);
  const saldo = vigentes.reduce((s, i) => s + i.balance, 0);
  const pagado = vigentes.reduce((s, i) => s + i.paid, 0);
  const currency = vigentes[0]?.currency ?? row.currency;

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Estado de cuenta — ${escapeHtml(fullName(row.contact))}</title>
<style>
  body { font-family: system-ui, Arial, sans-serif; color: #18181b; max-width: 800px; margin: 32px auto; padding: 0 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #71717a; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e4e4e7; }
  th { background: #fafafa; font-size: 12px; text-transform: uppercase; color: #71717a; }
  .right { text-align: right; }
  .totals { display: flex; gap: 24px; margin-top: 8px; }
  .totals div { border: 1px solid #e4e4e7; border-radius: 6px; padding: 10px 14px; }
  .totals p { margin: 0; }
  .big { font-size: 20px; font-weight: bold; }
  .anulado { text-decoration: line-through; color: #a1a1aa; }
  @media print { body { margin: 0; } .noprint { display: none; } }
</style></head><body>
<h1>Estado de cuenta</h1>
<p class="muted">
  ${escapeHtml(fullName(row.contact))} — ${escapeHtml(row.cohortName ?? row.courseName)}<br />
  Total pactado: ${money(row.amount ?? 0, currency)}${row.invoiceNumber ? ` · Factura ${escapeHtml(row.invoiceNumber)}` : ""}
</p>

<div class="totals">
  <div><p class="muted">Pagado</p><p class="big">${money(pagado, currency)}</p></div>
  <div><p class="muted">Saldo</p><p class="big">${money(saldo, currency)}</p></div>
</div>

<h2 style="font-size:15px;margin-top:24px">Cuotas</h2>
<table>
  <thead><tr><th>#</th><th>Vence</th><th class="right">Monto</th><th class="right">Pagado</th><th class="right">Saldo</th><th>Estado</th></tr></thead>
  <tbody>
    ${installments
      .map(
        (i) => `<tr${i.canceledAt ? ' class="anulado"' : ""}>
      <td>${i.number}</td><td>${day(i.dueDate)}</td>
      <td class="right">${money(i.amount, i.currency)}</td>
      <td class="right">${money(i.paid, i.currency)}</td>
      <td class="right">${money(i.balance, i.currency)}</td>
      <td>${i.canceledAt ? "anulada" : i.status}</td></tr>`
      )
      .join("")}
  </tbody>
</table>

<h2 style="font-size:15px">Pagos</h2>
${
  payments.length === 0
    ? '<p class="muted">Sin pagos registrados.</p>'
    : `<table>
  <thead><tr><th>Fecha</th><th class="right">Monto</th><th>Medio</th><th>Recibo</th><th>Estado</th></tr></thead>
  <tbody>
    ${payments
      .map(
        (p) => `<tr${p.voidedAt ? ' class="anulado"' : ""}>
      <td>${day(p.paidAt)}</td>
      <td class="right">${money(p.amount, p.currency)}</td>
      <td>${escapeHtml(p.method)}</td>
      <td>${escapeHtml(p.receiptNumber ?? "—")}</td>
      <td>${p.voidedAt ? `anulado: ${escapeHtml(p.voidReason ?? "")}` : "vigente"}</td></tr>`
      )
      .join("")}
  </tbody>
</table>`
}

<p class="muted noprint">Imprimí con Ctrl+P (o guardá como PDF desde el mismo diálogo).</p>
</body></html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
