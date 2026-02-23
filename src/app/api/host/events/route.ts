import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getScannerOnlyRedirect } from "@/lib/auth/eventAccess";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";
import { randomSlug } from "@/lib/eventrl/security";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type InteractionMode = "RESTRICTED" | "OPEN_CHAT";

function parseInteractionMode(value: string | null): InteractionMode {
  if (value === "RESTRICTED") {
    return "RESTRICTED";
  }
  return "OPEN_CHAT";
}

export async function POST(request: Request) {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return NextResponse.redirect(new URL("/host/login", request.url), { status: 303 });
  }
  const scannerRedirect = await getScannerOnlyRedirect(hostUser);
  if (scannerRedirect) {
    return NextResponse.redirect(new URL(`${scannerRedirect}?error=scanner_role_limited`, request.url), { status: 303 });
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const locationText = String(formData.get("location_text") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const allowPlusOne = String(formData.get("allow_plus_one") ?? "") === "on";
  const paidEntry = String(formData.get("paid_entry") ?? "") === "on";
  const priceDollarsRaw = String(formData.get("price_dollars") ?? "").trim();
  const paymentInstructions = String(formData.get("payment_instructions") ?? "").trim();
  const interactionMode = parseInteractionMode(String(formData.get("interaction_mode") ?? ""));

  if (!name || !startsAt || !locationText) {
    return NextResponse.redirect(new URL("/host/dashboard?error=missing_fields", request.url), {
      status: 303,
    });
  }

  const parsedCapacity = capacityRaw ? Number.parseInt(capacityRaw, 10) : null;
  if (capacityRaw && (!Number.isFinite(parsedCapacity) || (parsedCapacity ?? 0) < 1)) {
    return NextResponse.redirect(new URL("/host/dashboard?error=invalid_capacity", request.url), {
      status: 303,
    });
  }
  const capacity = parsedCapacity;
  const hostProfile = await ensureHostProfile(hostUser);
  const proAccess = hasProAccess(hostProfile);
  let priceCents: number | null = null;
  if (paidEntry && priceDollarsRaw) {
    const parsedPrice = Number(priceDollarsRaw);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return NextResponse.redirect(new URL("/host/dashboard?error=invalid_paid_entry_price", request.url), {
        status: 303,
      });
    }
    priceCents = Math.round(parsedPrice * 100);
  }
  const isPaidEvent = Boolean(
    paidEntry && proAccess && hostProfile.stripe_account_id && priceCents && priceCents > 0,
  );

  const supabase = getSupabaseAdminClient();

  let inviteSlug = "";
  let insertErrorMessage = "create_failed";
  for (let i = 0; i < 5; i += 1) {
    inviteSlug = randomSlug(16);
    const { data, error } = await supabase
      .from("events")
      .insert({
        host_user_id: hostUser.id,
        name,
        starts_at: new Date(startsAt).toISOString(),
        location_text: locationText,
        capacity,
        allow_plus_one: allowPlusOne,
        requires_payment: paidEntry,
        is_paid_event: isPaidEvent,
        price_cents: isPaidEvent ? priceCents : null,
        payment_instructions: paymentInstructions || null,
        invite_title: null,
        invite_subtitle: null,
        invite_instructions: null,
        interaction_mode: interactionMode,
        invite_slug: inviteSlug,
      })
      .select("id")
      .single();

    if (!error) {
      if (data?.id) {
        const inviteResult = await supabase.from("invite_links").upsert(
          {
            event_id: data.id,
            created_by_host_user_id: hostUser.id,
            slug: inviteSlug,
          },
          { onConflict: "event_id" },
        );
        if (inviteResult.error) {
          insertErrorMessage = inviteResult.error.message;
          await supabase.from("events").delete().eq("id", data.id).eq("host_user_id", hostUser.id);
          continue;
        }

        await supabase.from("event_chat_members").upsert(
          {
            event_id: data.id,
            role: "HOST",
            host_user_id: hostUser.id,
          },
          { onConflict: "event_id,host_user_id" },
        );

        await supabase.from("event_chat_messages").insert({
          event_id: data.id,
          sender_type: "SYSTEM",
          sender_name: "Eventrl",
          body: "Group chat is live.",
        });
      }
      return NextResponse.redirect(new URL("/host/dashboard", request.url), { status: 303 });
    }

    insertErrorMessage = error.message;
    if (!error.message.toLowerCase().includes("invite_slug")) {
      break;
    }
  }

  return NextResponse.redirect(
    new URL(`/host/dashboard?error=${encodeURIComponent(insertErrorMessage)}`, request.url),
    { status: 303 },
  );
}
