import "server-only";

import crypto from "node:crypto";

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function randomSlug(bytes = 16): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function randomDigits(length = 6): string {
  const min = 10 ** (length - 1);
  const max = (10 ** length) - 1;
  return crypto.randomInt(min, max + 1).toString();
}
