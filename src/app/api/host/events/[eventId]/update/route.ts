import { NextResponse } from "next/server";
import { getCurrentHostUser } from "@/lib/auth/requireHost";
import { getScannerOnlyRedirect } from "@/lib/auth/eventAccess";
import { ensureHostProfile, hasProAccess } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type InteractionMode = "RESTRICTED" | "OPEN_CHAT";

function parseInteractionMode(value: string | null): InteractionMode {
  if (value === "OPEN_CHAT") {
    return "OPEN_CHAT";
  }
  return "RESTRICTED";
}

function normalizeInviteSlug(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z0-9_-]{4,64}$/.test(normalized)) return "__invalid__";
  return normalized;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const hostUser = await getCurrentHostUser();
  if (!hostUser) {
    return NextResponse.redirect(new URL("/host/login", request.url), { status: 303 });
  }
  const scannerRedirect = await getScannerOnlyRedirect(hostUser);
  if (scannerRedirect) {
    return NextResponse.redirect(new URL(`${scannerRedirect}?error=scanner_role_limited`, request.url), { status: 303 });
  }

  const { eventId } = await context.params;
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const locationText = String(formData.get("location_text") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const allowPlusOne = String(formData.get("allow_plus_one") ?? "") === "on";
  const paidEntry = String(formData.get("paid_entry") ?? "") === "on";
  const priceDollarsRaw = String(formData.get("price_dollars") ?? "").trim();
  const paymentInstructions = String(formData.get("payment_instructions") ?? "").trim();
  const customInviteSlugRaw = String(formData.get("custom_invite_slug") ?? "");
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
  const proAccess = hasProAccess(hostProfile);
  let priceCents: number | null = null;
  let isPaidEvent = false;
  if (paidEntry && priceDollarsRaw) {
    const parsedPrice = Number(priceDollarsRaw);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return NextResponse.redirect(new URL(`/host/events/${eventId}/edit?error=invalid_paid_entry_price`, request.url), {
        status: 303,
      });
    }
    priceCents = Math.round(parsedPrice * 100);
  }
  if (paidEntry && proAccess && hostProfile.stripe_account_id && priceCents && priceCents > 0) {
    isPaidEvent = true;
  }

  const supabase = getSupabaseAdminClient();
  const { data: eventRow } = await supabase
    .from("events")
    .select("id, host_user_id, invite_slug")
    .eq("id", eventId)
    .maybeSingle();
  if (!eventRow) {
    return NextResponse.redirect(new URL("/host/dashboard?error=event_not_found", request.url), { status: 303 });
  }
  if (eventRow.host_user_id !== hostUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const normalizedInviteSlug = normalizeInviteSlug(customInviteSlugRaw);
  if (normalizedInviteSlug === "__invalid__") {
    return NextResponse.redirect(
      new URL(`/host/events/${eventId}/edit?error=${encodeURIComponent("Invalid custom invite slug format.")}`, request.url),
      { status: 303 },
    );
  }
  if (normalizedInviteSlug && !proAccess) {
    return NextResponse.redirect(
      new URL(`/host/events/${eventId}/edit?error=${encodeURIComponent("Pro required for custom invite links.")}`, request.url),
      { status: 303 },
    );
  }

  const eventUpdatePayload: Record<string, string | number | boolean | null> = {
    name,
    starts_at: new Date(startsAt).toISOString(),
    location_text: locationText,
    capacity: parsedCapacity,
    allow_plus_one: allowPlusOne,
    requires_payment: paidEntry,
    is_paid_event: isPaidEvent,
    price_cents: isPaidEvent ? priceCents : null,
    payment_instructions: paymentInstructions || null,
    invite_title: null,
    invite_subtitle: null,
    invite_instructions: null,
    interaction_mode: interactionMode,
  };
  if (normalizedInviteSlug) {
    eventUpdatePayload.invite_slug = normalizedInviteSlug;
  }

  const { error } = await supabase
    .from("events")
    .update(eventUpdatePayload)
    .eq("id", eventId);

  if (error) {
    return NextResponse.redirect(
      new URL(`/host/events/${eventId}/edit?error=${encodeURIComponent(error.message)}`, request.url),
      { status: 303 },
    );
  }

  if (normalizedInviteSlug && normalizedInviteSlug !== eventRow.invite_slug) {
    const { error: inviteError } = await supabase.from("invite_links").upsert(
      {
        event_id: eventId,
        created_by_host_user_id: hostUser.id,
        slug: normalizedInviteSlug,
      },
      { onConflict: "event_id" },
    );
    if (inviteError) {
      return NextResponse.redirect(
        new URL(`/host/events/${eventId}/edit?error=${encodeURIComponent(inviteError.message)}`, request.url),
        { status: 303 },
      );
    }
  }

  return NextResponse.redirect(new URL(`/host/events/${eventId}?saved=1`, request.url), { status: 303 });
}
