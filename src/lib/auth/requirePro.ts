import "server-only";

import { redirect } from "next/navigation";
import { requireHost } from "@/lib/auth/requireHost";
import { ensureHostProfile } from "@/lib/host/profile";

export async function requirePro() {
  const hostUser = await requireHost();
  const profile = await ensureHostProfile(hostUser);

  if (!profile.is_pro) {
    redirect("/host/settings?error=Pro%20required%20for%20this%20feature.");
  }

  return { hostUser, profile };
}
