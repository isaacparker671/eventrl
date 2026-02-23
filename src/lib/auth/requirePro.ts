import "server-only";

import { redirect } from "next/navigation";
import { requireHost } from "@/lib/auth/requireHost";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";

export async function requirePro() {
  const hostUser = await requireHost();
  const profile = await ensureHostProfile(hostUser);

  if (!hasProAccess(profile)) {
    redirect("/host/settings?error=Pro%20required%20for%20this%20feature.");
  }

  return { hostUser, profile };
}
