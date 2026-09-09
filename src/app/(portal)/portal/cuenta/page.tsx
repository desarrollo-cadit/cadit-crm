import { StudentAccountClient } from "@/components/portal/student-account-client";

export const dynamic = "force-dynamic";

/** 015 (US7) — Mi estado de cuenta: cuotas, pagos y saldo por moneda. */
export default function StudentAccountPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tus cuotas, lo que pagaste y lo que falta.
        </p>
      </div>
      <StudentAccountClient />
    </div>
  );
}
