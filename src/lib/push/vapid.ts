import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import webpush from "web-push";
import { pushDevToolsEnabled } from "@/lib/push/dev";

export type VapidKeys = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

const DEV_SUBJECT = "mailto:dev@cadit.uy";
const DEV_FILE = ".dev-vapid.json";

function real(value: string | undefined): string | undefined {
  const v = value?.trim();
  // `.env` ships placeholders (`REEMPLAZA_...`): treat them as unset.
  return v && !v.startsWith("REEMPLAZA") ? v : undefined;
}

/**
 * VAPID identity of this instance. From the environment in production. With
 * the dev tools on (local/tunnel only) and no keys configured, a keypair is
 * generated once into a git-ignored file so testing needs no setup.
 * `null` = push is off; callers must degrade silently.
 */
export function loadVapid(
  env: Record<string, string | undefined> = process.env
): VapidKeys | null {
  const publicKey = real(env.VAPID_PUBLIC_KEY);
  const privateKey = real(env.VAPID_PRIVATE_KEY);
  if (publicKey && privateKey) {
    return { publicKey, privateKey, subject: real(env.VAPID_SUBJECT) ?? DEV_SUBJECT };
  }
  if (!pushDevToolsEnabled(env)) return null;

  const file = join(process.cwd(), DEV_FILE);
  if (existsSync(file)) {
    try {
      const saved = JSON.parse(readFileSync(file, "utf8")) as Partial<VapidKeys>;
      if (saved.publicKey && saved.privateKey) {
        return { publicKey: saved.publicKey, privateKey: saved.privateKey, subject: DEV_SUBJECT };
      }
    } catch {
      // corrupt file: regenerate below
    }
  }
  const keys = webpush.generateVAPIDKeys();
  writeFileSync(file, JSON.stringify(keys, null, 2));
  return { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: DEV_SUBJECT };
}
