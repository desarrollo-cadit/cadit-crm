import { StudentAccountClient } from "@/components/portal/student-account-client";
import { EncabezadoDePagina } from "@/components/portal/campus";

export const dynamic = "force-dynamic";

/** 015 (US7) — Mi estado de cuenta: cuotas, pagos y saldo por moneda. */
export default function StudentAccountPage() {
  return (
    <div className="space-y-6">
      <EncabezadoDePagina
        migas={[
          { label: "Inicio", href: "/portal" },
          { label: "Estado de cuenta", href: null },
        ]}
        titulo="Estado de cuenta"
        descripcion="Detalle de cuotas, pagos registrados y saldo pendiente."
      />
      <StudentAccountClient />
    </div>
  );
}
