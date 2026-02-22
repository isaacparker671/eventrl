import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { ensureHostProfile } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type InteractionMode = "RESTRICTED" | "OPEN_CHAT";

function parseInteractionMode(value: string | null): InteractionMode {
  if (value === "OPEN_CHAT") {
    return "OPEN_CHAT";
  }
  return "RESTRICTED";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return NextResponse.redirect(new URL("/host/login", request.url), { status: 303 });
  }

  const { eventId } = await context.params;
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const locationText = String(formData.get("location_text") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const allowPlusOne = String(formData.get("allow_plus_one") ?? "") === "on";
  const requiresPayment = String(formData.get("requires_payment") ?? "") === "on";
  const isPaidEvent = String(formData.get("is_paid_event") ?? "") === "on";
  const priceDollarsRaw = String(formData.get("price_dollars") ?? "").trim();
  const paymentInstructions = String(formData.get("payment_instructions") ?? "").trim();
  const interactionMode = parseInteractionMode(String(formData.get("interaction_mode") ?? ""));

  if (!name || !startsAt || !locationText) {
    return NextResponse.redirect(new URL(`/host/events/${eventId}/edit?error=missing_fields`, request.url), {
      status: 303,
    });
  }

  const parsedCapacity = capacityRaw ? Number.parseInt(capacityRaw, 10) : null;
  if (capacityRaw && (!Number.isFinite(parsedCapacity) || (parsedCapacity ?? 0) < 1)) {
    return NextResponse.redirect(new URL(`/host/events/${eventId}/edit?error=invalid_capacity`, request.url), {
      status: 303,
    });
  }

  const hostProfile = await ensureHostProfile(hostUser);
  let priceCents: number | null = null;
  if (isPaidEvent) {
    if (!hostProfile.is_pro || !hostProfile.stripe_account_id) {
      return NextResponse.redirect(
        new URL(`/host/events/${eventId}/edit?error=pro_and_connected_stripe_required_for_paid_entry`, request.url),
        { status: 303 },
      );
    }
    if (!priceDollarsRaw) {
      return NextResponse.redirect(new URL(`/host/events/${eventId}/edit?error=price_required_for_paid_entry`, request.url), {
        status: 303,
      });
    }
    const parsedPrice = Number(priceDollarsRaw);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return NextResponse.redirect(new URL(`/host/events/${eventId}/edit?error=invalid_paid_entry_price`, request.url), {
        status: 303,
      });
    }
    priceCents = Math.round(parsedPrice * 100);
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("events")
    .update({
      name,
      starts_at: new Date(startsAt).toISOString(),
      location_text: locationText,
      capacity: parsedCapacity,
      allow_plus_one: allowPlusOne,
      requires_payment: requiresPayment,
      is_paid_event: isPaidEvent,
      price_cents: isPaidEvent ? priceCents : null,
      payment_instructions: paymentInstructions || null,
      interaction_mode: interactionMode,
    })
    .eq("id", eventId)
    .eq("host_user_id", hostUser.id);

  if (error) {
    return NextResponse.redirect(
      new URL(`/host/events/${eventId}/edit?error=${encodeURIComponent(error.message)}`, request.url),
      { status: 303 },
    );
  }

  const { data: owned } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("host_user_id", hostUser.id)
    .maybeSingle();
  if (!owned) {
    return NextResponse.redirect(new URL("/host/dashboard?error=event_not_found", request.url), { status: 303 });
  }

  return NextResponse.redirect(new URL(`/host/events/${eventId}?saved=1`, request.url), { status: 303 });
}
