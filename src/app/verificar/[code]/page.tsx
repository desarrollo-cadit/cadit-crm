import { verifyCertificate } from "@/server/certificates";

export const dynamic = "force-dynamic";

/**
 * 010 (FR-009) — Página PÚBLICA de verificación de un certificado.
 *
 * Vive fuera de `(app)` a propósito: no exige sesión. Es la dirección que va
 * impresa en el diploma, y quien la abre suele ser un empleador chequeando si
 * el título es real.
 *
 * Muestra SOLO alumno, curso, cohorte, fecha y horas. Nada de notas,
 * asistencia ni datos de contacto: verificar no es acceder al legajo.
 */
export default async function VerificarPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const cert = await verifyCertificate(code);

  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          CAD IT — Autodesk Training Center
        </p>
        <h1 className="mt-1 text-lg font-semibold">Verificación de certificado</h1>

        {!cert ? (
          <div className="mt-6">
            <p className="text-sm font-medium text-destructive">
              No existe un certificado con ese código.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Revisá que esté copiado completo, con sus guiones. El código tiene el
              formato XXXX-XXXX-XXXX.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {cert.valid ? (
              <p className="rounded-md bg-brand-tint px-3 py-2 text-sm font-medium text-primary">
                Certificado válido
              </p>
            ) : (
              // Un certificado anulado NO se oculta: decir "no existe" sobre
              // algo que sí se emitió es peor que decir "se anuló".
              <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-destructive">
                Certificado ANULADO
                {cert.revokedAt
                  ? ` el ${new Date(cert.revokedAt).toLocaleDateString("es-UY")}`
                  : ""}
              </p>
            )}

            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Alumno</dt>
                <dd className="font-medium">{cert.student}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Curso</dt>
                <dd className="font-medium">{cert.course}</dd>
              </div>
              {cert.hours && (
                <div>
                  <dt className="text-xs text-muted-foreground">Carga horaria</dt>
                  <dd>{cert.hours}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Emitido</dt>
                <dd>{new Date(cert.issuedAt).toLocaleDateString("es-UY")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Código</dt>
                <dd className="font-mono text-xs">{cert.code}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </main>
  );
}
