# Monitoring Alerts Setup (Vercel + Supabase)

This project already emits structured log tags for key failures:

- Webhook failures: `[stripe-webhook]`
- Auth failures: `[auth-failure]`

Use these to create alerts.

## 1) Vercel alert for 5xx spikes

1. Open Vercel project dashboard.
2. Go to `Observability` -> `Alerts`.
3. Create alert: `Server Errors (5xx)` (or equivalent metric in your Vercel plan UI).
4. Scope: `Production`.
5. Threshold recommendation:
  - warning: `>= 5` errors in `5 min`
  - critical: `>= 20` errors in `5 min`
6. Notification channel: email + Slack (if connected).

## 2) Vercel alert for Stripe webhook failures

1. Go to `Observability` -> `Logs`.
2. Filter:
  - Environment: `Production`
  - Text contains: `[stripe-webhook]`
  - Level: `error`
3. Save this as a log view/query.
4. Create an alert from this saved query.
5. Threshold recommendation:
  - warning: `>= 1` in `5 min`
  - critical: `>= 3` in `10 min`

## 3) Vercel alert for auth failures

1. Go to `Observability` -> `Logs`.
2. Filter:
  - Environment: `Production`
  - Text contains: `[auth-failure]`
3. Save as a log view/query.
4. Create an alert from this query.
5. Threshold recommendation:
  - warning: `>= 10` in `10 min`
  - critical: `>= 50` in `10 min`

## 4) Supabase alerts (recommended)

1. Open Supabase project -> `Reports` / `Database` monitoring.
2. Enable notifications for:
  - connection saturation
  - CPU spikes
  - storage growth anomalies
3. Ensure PITR/backups are enabled.

## 5) Validate after setup

1. Trigger a failed login on `/host/*` and confirm `[auth-failure]` appears.
2. Send a test invalid Stripe webhook signature and confirm `[stripe-webhook] Invalid Stripe signature.` appears.
3. Confirm alert notifications are received.
