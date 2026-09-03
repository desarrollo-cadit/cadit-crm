import { StudentCertificatesClient } from "@/components/portal/student-certificates-client";

export const dynamic = "force-dynamic";

/** 015 (US6) — Mis certificados y su enlace de verificación. */
export default function StudentCertificatesPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mis certificados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El enlace de verificación es público: se puede compartir con una
          empresa sin darle acceso a nada más.
        </p>
      </div>
      <StudentCertificatesClient />
    </div>
  );
}
