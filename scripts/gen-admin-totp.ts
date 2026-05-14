/**
 * Generate a new TOTP secret for the admin login + print a QR code in the
 * terminal. One-time setup / rotation tool.
 *
 * Usage:
 *   tsx scripts/gen-admin-totp.ts
 *
 * What it does:
 *   1. Generates a fresh random base32 secret (otplib default = 32 chars,
 *      which is ~160 bits of entropy — RFC 4226 minimum is 128).
 *   2. Builds the standard otpauth:// URL: issuer=Story Mode, account=admin.
 *   3. Prints a scannable QR code in the terminal.
 *   4. Prints the base32 secret as text in case you can't scan (e.g. you're
 *      pasting it into 1Password manually).
 *
 * After running:
 *   - Scan the QR or paste the secret into 1Password (or another TOTP app).
 *   - Copy the SECRET line into Render's env as ADMIN_TOTP_SECRET.
 *   - Redeploy. Old codes from any prior secret stop working immediately.
 *
 * NOTE: the secret is printed to stdout — don't run this in a recorded
 * session or screen share.
 */

import { generateSecret, generateURI } from "otplib";
import qrcode from "qrcode-terminal";

const ISSUER = "Story Mode";
const ACCOUNT = "admin";

const secret = generateSecret();
const otpauthUrl = generateURI({ issuer: ISSUER, label: ACCOUNT, secret });

console.log("\nStory Mode — Admin TOTP Setup");
console.log("==============================\n");
console.log("Scan this QR code with 1Password (or any TOTP app):\n");

qrcode.generate(otpauthUrl, { small: true }, (qr) => {
  console.log(qr);
  console.log("If you can't scan, paste this secret into your TOTP app:");
  console.log(`\n  ${secret}\n`);
  console.log("Then add to Render env (Service → Environment):");
  console.log(`\n  ADMIN_TOTP_SECRET=${secret}\n`);
  console.log("Redeploy. Your next login at /admin will require:");
  console.log("  - the ADMIN_KEY env value");
  console.log("  - the current 6-digit code from your TOTP app\n");
  console.log("Verify locally with .env before pushing to Render:");
  console.log(`  echo 'ADMIN_TOTP_SECRET=${secret}' >> .env && npm run dev\n`);
});
