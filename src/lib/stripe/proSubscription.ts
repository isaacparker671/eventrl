import "server-only";

import type { User } from "@supabase/supabase-js";
import type { HostProfile } from "@/lib/host/profile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const ACTIVE_PRO_STATUSES = new Set(["active", "trialing"]);

type StripeCustomer = { id?: string };
type StripeSubscription = {
  id?: string;
  customer?: string;
  status?: string;
  current_period_end?: number;
  metadata?: Record<string, unknown>;
};

function getRequiredEnv(name: "STRIPE_SECRET_KEY") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function toIsoFromUnix(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function stripeGet(path: string) {
  const stripeSecretKey = getRequiredEnv("STRIPE_SECRET_KEY");
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

async function listCustomersByEmail(email: string) {
  const payload = await stripeGet(`/v1/customers?email=${encodeURIComponent(email)}&limit=5`);
  if (!payload || !Array.isArray(payload.data)) {
    return [] as StripeCustomer[];
  }
  return payload.data as StripeCustomer[];
}

async function listSubscriptionsByCustomer(customerId: string) {
  const payload = await stripeGet(`/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=20`);
  if (!payload || !Array.isArray(payload.data)) {
    return [] as StripeSubscription[];
  }
  return payload.data as StripeSubscription[];
}

function pickBestSubscription(subscriptions: StripeSubscription[], userId: string) {
  if (!subscriptions.length) {
    return null;
  }

  const sorted = [...subscriptions].sort((a, b) => {
    const aEnd = typeof a.current_period_end === "number" ? a.current_period_end : 0;
    const bEnd = typeof b.current_period_end === "number" ? b.current_period_end : 0;
    return bEnd - aEnd;
  });

  const metadataMatch = sorted.find((subscription) => {
    const metadata = subscription.metadata && typeof subscription.metadata === "object"
      ? (subscription.metadata as Record<string, unknown>)
      : null;
    const subscriptionUserId = metadata ? getString(metadata.userId) || getString(metadata.hostUserId) : "";
    return subscriptionUserId === userId;
  });
  if (metadataMatch) {
    return metadataMatch;
  }

  return sorted.find((subscription) => ACTIVE_PRO_STATUSES.has(getString(subscription.status))) ?? sorted[0];
}

export async function syncProSubscriptionForHost(user: User, profile: HostProfile) {
  const candidateCustomerIds = new Set<string>();
  if (profile.stripe_customer_id) {
    candidateCustomerIds.add(profile.stripe_customer_id);
  }

  if (user.email) {
    const customers = await listCustomersByEmail(user.email);
    for (const customer of customers) {
      const customerId = getString(customer.id);
      if (customerId) {
        candidateCustomerIds.add(customerId);
      }
    }
  }

  const subscriptions: StripeSubscription[] = [];
  for (const customerId of candidateCustomerIds) {
    const rows = await listSubscriptionsByCustomer(customerId);
    subscriptions.push(...rows);
  }

  const bestSubscription = pickBestSubscription(subscriptions, user.id);
  if (!bestSubscription) {
    return { synced: false, isPro: false };
  }

  const status = getString(bestSubscription.status) || null;
  const isPro = status ? ACTIVE_PRO_STATUSES.has(status) : false;
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("host_profiles")
    .update({
      stripe_customer_id: getString(bestSubscription.customer) || profile.stripe_customer_id,
      stripe_subscription_id: getString(bestSubscription.id) || profile.stripe_subscription_id,
      subscription_status: status,
      current_period_end: toIsoFromUnix(bestSubscription.current_period_end),
      is_pro: isPro,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  return { synced: true, isPro };
}
