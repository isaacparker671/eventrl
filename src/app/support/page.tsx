import Link from "next/link";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import SupportForm from "./SupportForm";

type SupportPageProps = {
  searchParams: Promise<{ returnTo?: string }>;
};

function safeReturnTo(value: string | undefined) {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}

export default async function SupportPage({ searchParams }: SupportPageProps) {
  const query = await searchParams;
  const hostUser = await getCurrentHostUser();
  const returnTo = safeReturnTo(query.returnTo) ?? (hostUser ? "/host/settings" : "/");

  return (
    <main className="app-shell min-h-screen px-4 py-6 text-neutral-900">
      <div className="glass-card mx-auto w-full max-w-md rounded-2xl p-5">
        <Link href={returnTo} className="link-btn">
          Back
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Support</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Need help? Send us a message and we will get back to you.
        </p>
        <p className="mt-2 text-sm text-neutral-700">
          Support email:{" "}
          <a className="text-orange-700 underline-offset-2 hover:underline" href="mailto:support@eventrl.com">
            support@eventrl.com
          </a>
        </p>
        <SupportForm />
      </div>
    </main>
  );
}
