import { redirect } from "next/navigation";

export default function HostRootPage() {
  redirect("/host/dashboard");
}

