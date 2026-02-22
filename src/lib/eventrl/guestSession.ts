import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const GUEST_MEMBERSHIP_COOKIE = "eventrl_guest";
const GUEST_MEMBERSHIP_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

type GuestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "WAITLIST"
  | "REVOKED"
  | "LEFT"
  | "CANT_MAKE";

export type GuestMembership = {
  eventId: string;
  guestRequestId: string;
  issuedAt: string;
};

export type GuestContext = {
  guestRequestId: string;
  displayName: string;
  status: GuestStatus;
  paymentConfirmedAt: string | null;
  guestEventStatus: "ARRIVING" | "RUNNING_LATE" | "CANT_MAKE" | null;
  event: {
    id: string;
    name: string;
    starts_at: string;
    location_text: string;
    payment_instructions: string | null;
    requires_payment: boolean;
    allow_plus_one: boolean;
    interaction_mode: "RESTRICTED" | "OPEN_CHAT";
    invite_slug: string;
    host: {
      display_name: string;
      cash_app_url: string | null;
      paypal_url: string | null;
      venmo_url: string | null;
      zelle_url: string | null;
      google_pay_url: string | null;
      apple_pay_url: string | null;
    } | null;
  };
};

function getGuestCookieSecret(): string {
  return process.env.EVENTRL_GUEST_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function signGuestCookiePayload(payloadBase64: string): string | null {
  const secret = getGuestCookieSecret();
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(payloadBase64).digest("base64url");
}

function parseMembershipCookieValue(rawValue: string | undefined): {
  memberships: GuestMembership[];
  tampered: boolean;
} {
  if (!rawValue) {
    return { memberships: [], tampered: false };
  }

  const [payloadBase64, signature] = rawValue.split(".");
  if (!payloadBase64 || !signature) {
    return { memberships: [], tampered: true };
  }

  const expectedSignature = signGuestCookiePayload(payloadBase64);
  if (!expectedSignature) {
    return { memberships: [], tampered: true };
  }

  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return { memberships: [], tampered: true };
  }

  try {
    const decoded = Buffer.from(payloadBase64, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { memberships?: unknown };
    const memberships = Array.isArray(parsed.memberships)
      ? parsed.memberships
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const eventId = "eventId" in item ? String(item.eventId ?? "") : "";
            const guestRequestId = "guestRequestId" in item ? String(item.guestRequestId ?? "") : "";
            const issuedAt = "issuedAt" in item ? String(item.issuedAt ?? "") : "";
            if (!eventId || !guestRequestId || !issuedAt) return null;
            return { eventId, guestRequestId, issuedAt };
          })
          .filter((item): item is GuestMembership => Boolean(item))
      : [];

    return { memberships, tampered: false };
  } catch {
    return { memberships: [], tampered: true };
  }
}

function serializeMemberships(memberships: GuestMembership[]): string | null {
  const payload = Buffer.from(JSON.stringify({ memberships }), "utf8").toString("base64url");
  const signature = signGuestCookiePayload(payload);
  if (!signature) return null;
  return `${payload}.${signature}`;
}

export async function getGuestMembershipStateFromCookie(): Promise<{
  memberships: GuestMembership[];
  tampered: boolean;
}> {
  const cookieStore = await cookies();
  const rawValue = cookieStore.get(GUEST_MEMBERSHIP_COOKIE)?.value;
  return parseMembershipCookieValue(rawValue);
}

export async function getGuestMembershipForEvent(eventId: string): Promise<GuestMembership | null> {
  const { memberships, tampered } = await getGuestMembershipStateFromCookie();
  if (tampered) return null;
  return memberships.find((membership) => membership.eventId === eventId) ?? null;
}

async function getGuestContextFromMembership(membership: GuestMembership): Promise<GuestContext | null> {
  const supabase = getSupabaseAdminClient();
  const { data: guestRequestRow, error } = await supabase
    .from("guest_requests")
    .select(
      `
      id,
      display_name,
      status,
      payment_confirmed_at,
      guest_event_status,
      event_id,
      events!inner (
        id,
        host_user_id,
        name,
        starts_at,
        location_text,
        payment_instructions,
        requires_payment,
        allow_plus_one,
        interaction_mode,
        invite_slug
      )
      `,
    )
    .eq("id", membership.guestRequestId)
    .eq("event_id", membership.eventId)
    .single();

  if (error || !guestRequestRow) {
    return null;
  }

  const event = Array.isArray(guestRequestRow.events)
    ? guestRequestRow.events[0]
    : guestRequestRow.events;

  if (!event) {
    return null;
  }

  const { data: hostProfile } = await supabase
    .from("host_profiles")
    .select("display_name, cash_app_url, paypal_url, venmo_url, zelle_url, google_pay_url, apple_pay_url")
    .eq("user_id", event.host_user_id)
    .maybeSingle();

  return {
    guestRequestId: guestRequestRow.id,
    displayName: guestRequestRow.display_name,
    status: guestRequestRow.status,
    paymentConfirmedAt: guestRequestRow.payment_confirmed_at,
    guestEventStatus: guestRequestRow.guest_event_status,
    event: {
      id: event.id,
      name: event.name,
      starts_at: event.starts_at,
      location_text: event.location_text,
      payment_instructions: event.payment_instructions,
      requires_payment: event.requires_payment,
      allow_plus_one: event.allow_plus_one,
      interaction_mode: event.interaction_mode,
      invite_slug: event.invite_slug,
      host: hostProfile
        ? {
            display_name: hostProfile.display_name || "Host",
            cash_app_url: hostProfile.cash_app_url,
            paypal_url: hostProfile.paypal_url,
            venmo_url: hostProfile.venmo_url,
            zelle_url: hostProfile.zelle_url,
            google_pay_url: hostProfile.google_pay_url,
            apple_pay_url: hostProfile.apple_pay_url,
          }
        : null,
    },
  };
}

export async function getGuestContextFromCookie(eventId?: string): Promise<GuestContext | null> {
  const { memberships, tampered } = await getGuestMembershipStateFromCookie();
  if (tampered || !memberships.length) {
    return null;
  }

  const membership = eventId
    ? memberships.find((item) => item.eventId === eventId) ?? null
    : memberships.length === 1
      ? memberships[0]
      : null;

  if (!membership) {
    return null;
  }

  return getGuestContextFromMembership(membership);
}

export async function getGuestContextsFromCookie(): Promise<GuestContext[]> {
  const { memberships, tampered } = await getGuestMembershipStateFromCookie();
  if (tampered || !memberships.length) {
    return [];
  }

  const contexts = await Promise.all(memberships.map((membership) => getGuestContextFromMembership(membership)));
  return contexts.filter((context): context is GuestContext => Boolean(context));
}

type CookieCapableResponse = {
  cookies: {
    set: (
      name: string,
      value: string,
      options: {
        httpOnly: boolean;
        secure: boolean;
        sameSite: "lax";
        path: string;
        maxAge: number;
      },
    ) => void;
  };
};

export async function addGuestMembershipToResponse(
  response: CookieCapableResponse,
  membership: { eventId: string; guestRequestId: string },
): Promise<boolean> {
  const { memberships, tampered } = await getGuestMembershipStateFromCookie();
  const safeMemberships = tampered ? [] : memberships;
  const nextMemberships = [
    ...safeMemberships.filter((item) => item.eventId !== membership.eventId),
    {
      eventId: membership.eventId,
      guestRequestId: membership.guestRequestId,
      issuedAt: new Date().toISOString(),
    },
  ];
  const serialized = serializeMemberships(nextMemberships);
  if (!serialized) {
    return false;
  }
  response.cookies.set(GUEST_MEMBERSHIP_COOKIE, serialized, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_MEMBERSHIP_COOKIE_MAX_AGE,
  });
  return true;
}

export function clearGuestMembershipCookieOnResponse(response: CookieCapableResponse) {
  response.cookies.set(GUEST_MEMBERSHIP_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function removeGuestMembershipFromResponse(response: CookieCapableResponse, eventId: string) {
  const { memberships, tampered } = await getGuestMembershipStateFromCookie();
  if (tampered) {
    clearGuestMembershipCookieOnResponse(response);
    return;
  }

  const nextMemberships = memberships.filter((membership) => membership.eventId !== eventId);
  if (!nextMemberships.length) {
    clearGuestMembershipCookieOnResponse(response);
    return;
  }

  const serialized = serializeMemberships(nextMemberships);
  if (!serialized) {
    clearGuestMembershipCookieOnResponse(response);
    return;
  }

  response.cookies.set(GUEST_MEMBERSHIP_COOKIE, serialized, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_MEMBERSHIP_COOKIE_MAX_AGE,
  });
}
