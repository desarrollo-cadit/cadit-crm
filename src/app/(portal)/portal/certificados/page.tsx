import { StudentCertificatesClient } from "@/components/portal/student-certificates-client";
import { EncabezadoDePagina } from "@/components/portal/campus";

export const dynamic = "force-dynamic";

/** 015 (US6) — Mis certificados y su enlace de verificación. */
export default function StudentCertificatesPage() {
  return (
    <div className="space-y-6">
      <EncabezadoDePagina
        migas={[
          { label: "Inicio", href: "/portal" },
          { label: "Mis certificados", href: null },
        ]}
        titulo="Mis certificados"
        descripcion="El enlace de verificación es público: podés compartirlo con una empresa sin otorgarle acceso a otros datos."
      />
      <StudentCertificatesClient />
    </div>
  );
}
