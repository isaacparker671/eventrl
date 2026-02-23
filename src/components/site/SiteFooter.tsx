"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteFooter() {
  const pathname = usePathname();
  const returnTo = pathname || "/";

  return (
    <footer className="border-t border-neutral-200/80 bg-white/80 px-4 py-3">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-3 text-xs text-neutral-600">
        <Link href={`/terms?returnTo=${encodeURIComponent(returnTo)}`} className="underline-offset-2 hover:text-orange-700 hover:underline">
          Terms
        </Link>
        <span aria-hidden>•</span>
        <Link href={`/privacy?returnTo=${encodeURIComponent(returnTo)}`} className="underline-offset-2 hover:text-orange-700 hover:underline">
          Privacy
        </Link>
        <span aria-hidden>•</span>
        <Link href={`/refunds?returnTo=${encodeURIComponent(returnTo)}`} className="underline-offset-2 hover:text-orange-700 hover:underline">
          Refunds
        </Link>
        <span aria-hidden>•</span>
        <Link href={`/support?returnTo=${encodeURIComponent(returnTo)}`} className="underline-offset-2 hover:text-orange-700 hover:underline">
          Support
        </Link>
      </div>
    </footer>
  );
}
