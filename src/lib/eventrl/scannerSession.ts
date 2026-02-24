import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";

export const SCANNER_SESSION_COOKIE = "eventrl_scanner";
export const SCANNER_GATE_COOKIE = "eventrl_scanner_gate";
const SCANNER_SESSION_MAX_AGE = 60 * 60 * 24 * 14;
const SCANNER_GATE_MAX_AGE = 60 * 10;

type ScannerSessionPayload = {
  eventId: string;
  scannerName?: string;
  grantedAt: string;
};

type ScannerGatePayload = {
  eventId: string;
  verifiedAt: string;
};

function getScannerCookieSecret(): string {
  return (
    process.env.EVENTRL_SCANNER_COOKIE_SECRET ||
    process.env.EVENTRL_GUEST_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

function signPayload(payloadBase64: string): string | null {
  const secret = getScannerCookieSecret();
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(payloadBase64).digest("base64url");
}

function serializePayload(payload: ScannerSessionPayload): string | null {
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(payloadBase64);
  if (!signature) return null;
  return `${payloadBase64}.${signature}`;
}

function serializeGatePayload(payload: ScannerGatePayload): string | null {
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(payloadBase64);
  if (!signature) return null;
  return `${payloadBase64}.${signature}`;
}

function parsePayload(value: string | undefined): ScannerSessionPayload | null {
  if (!value) return null;
  const [payloadBase64, signature] = value.split(".");
  if (!payloadBase64 || !signature) return null;
  const expectedSignature = signPayload(payloadBase64);
  if (!expectedSignature) return null;

  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8")) as ScannerSessionPayload;
    if (!parsed?.eventId || !parsed?.grantedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseGatePayload(value: string | undefined): ScannerGatePayload | null {
  if (!value) return null;
  const [payloadBase64, signature] = value.split(".");
  if (!payloadBase64 || !signature) return null;
  const expectedSignature = signPayload(payloadBase64);
  if (!expectedSignature) return null;

  const provided = Buffer.from(signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8")) as ScannerGatePayload;
    if (!parsed?.eventId || !parsed?.verifiedAt) return null;
    return parsed;
  } catch {
    return null;
  }
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
    delete: (name: string) => void;
  };
};

export async function setScannerSessionInResponse(
  response: CookieCapableResponse,
  payload: ScannerSessionPayload,
) {
  const serialized = serializePayload(payload);
  if (!serialized) {
    return false;
  }
  response.cookies.set(SCANNER_SESSION_COOKIE, serialized, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SCANNER_SESSION_MAX_AGE,
  });
  return true;
}

export async function clearScannerSessionInResponse(response: CookieCapableResponse) {
  response.cookies.delete(SCANNER_SESSION_COOKIE);
}

export async function setScannerGateInResponse(
  response: CookieCapableResponse,
  payload: ScannerGatePayload,
) {
  const serialized = serializeGatePayload(payload);
  if (!serialized) {
    return false;
  }
  response.cookies.set(SCANNER_GATE_COOKIE, serialized, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SCANNER_GATE_MAX_AGE,
  });
  return true;
}

export async function clearScannerGateInResponse(response: CookieCapableResponse) {
  response.cookies.delete(SCANNER_GATE_COOKIE);
}

export async function getScannerSessionFromCookie() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SCANNER_SESSION_COOKIE)?.value;
  return parsePayload(raw);
}

export async function getScannerGateFromCookie() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SCANNER_GATE_COOKIE)?.value;
  return parseGatePayload(raw);
}

export async function hasScannerSessionForEvent(eventId: string) {
  const session = await getScannerSessionFromCookie();
  return Boolean(session && session.eventId === eventId);
}
