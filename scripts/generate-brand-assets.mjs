// One-off generator for the PNG brand assets that ship in client/public/.
// Run with `node scripts/generate-brand-assets.mjs` whenever the source SVGs
// or copy below changes; commit the resulting PNGs.

import sharp from "sharp";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "..", "client", "public");

// ---------------------------------------------------------------------------
// Apple touch icon (180×180). iOS home-screen / Safari pinned tabs use this.
// Background is the cream brand color so the orb has somewhere to sit on dark
// home screens without a transparent halo.
// ---------------------------------------------------------------------------

const appleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#FFD6A5"/>
      <stop offset="60%" stop-color="#FFB6B9"/>
      <stop offset="100%" stop-color="#C9B6E4"/>
    </radialGradient>
    <radialGradient id="i" cx="50%" cy="35%" r="40%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="180" height="180" fill="#FFF9F0"/>
  <circle cx="90" cy="86" r="68" fill="url(#g)" opacity="0.3"/>
  <ellipse cx="90" cy="90" rx="50" ry="54" fill="url(#g)"/>
  <ellipse cx="90" cy="79" rx="36" ry="32" fill="url(#i)"/>
  <ellipse cx="72" cy="83" rx="7.2" ry="8.1" fill="#5a4a3a"/>
  <ellipse cx="108" cy="83" rx="7.2" ry="8.1" fill="#5a4a3a"/>
  <circle cx="74.7" cy="80.1" r="2.7" fill="#fff"/>
  <circle cx="110.7" cy="80.1" r="2.7" fill="#fff"/>
  <path d="M 72 101 Q 90 114 108 101" fill="none" stroke="#5a4a3a" stroke-width="4.5" stroke-linecap="round"/>
</svg>
`;

await sharp(Buffer.from(appleSvg))
  .resize(180, 180)
  .png()
  .toFile(resolve(PUBLIC_DIR, "apple-touch-icon.png"));

// ---------------------------------------------------------------------------
// Open Graph image (1200×630). Twitter/X, iMessage, Slack, LinkedIn all crop
// from this aspect ratio. Composition: Guide orb on the left, headline + sub
// on the right, soft pastel halo behind. Tagline copy mirrors the in-app
// voice ("Your story. Your Guide.") so the unfurl matches what users see on
// arrival — no bait-and-switch.
// ---------------------------------------------------------------------------

const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <radialGradient id="halo" cx="28%" cy="50%" r="38%">
      <stop offset="0%" stop-color="#FFD6A5" stop-opacity="0.45"/>
      <stop offset="50%" stop-color="#FFB6B9" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#C9B6E4" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orb" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#FFD6A5"/>
      <stop offset="55%" stop-color="#FFB6B9"/>
      <stop offset="100%" stop-color="#C9B6E4"/>
    </radialGradient>
    <radialGradient id="orbInner" cx="50%" cy="32%" r="42%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Cream background -->
  <rect width="1200" height="630" fill="#FFF9F0"/>

  <!-- Soft halo behind the orb -->
  <rect x="0" y="0" width="700" height="630" fill="url(#halo)"/>

  <!-- Decorative soft sparkles -->
  <circle cx="445" cy="120" r="6" fill="#FFD6A5" opacity="0.7"/>
  <circle cx="80" cy="490" r="5" fill="#C9B6E4" opacity="0.6"/>
  <circle cx="500" cy="540" r="4" fill="#A8E6CF" opacity="0.7"/>

  <!-- Guide orb (left side, ~280px diameter) -->
  <g transform="translate(330, 315)">
    <circle cx="0" cy="0" r="180" fill="url(#orb)" opacity="0.18"/>
    <ellipse cx="0" cy="0" rx="135" ry="145" fill="url(#orb)"/>
    <ellipse cx="0" cy="-26" rx="95" ry="86" fill="url(#orbInner)"/>
    <!-- eyes -->
    <ellipse cx="-46" cy="-14" rx="18" ry="20" fill="#5a4a3a"/>
    <ellipse cx="46" cy="-14" rx="18" ry="20" fill="#5a4a3a"/>
    <circle cx="-39.5" cy="-21" r="6" fill="#fff"/>
    <circle cx="52.5" cy="-21" r="6" fill="#fff"/>
    <!-- smile -->
    <path d="M -48 30 Q 0 70 48 30" fill="none" stroke="#5a4a3a" stroke-width="11" stroke-linecap="round"/>
  </g>

  <!-- Right-side type block -->
  <g transform="translate(640, 0)">
    <!-- Wordmark -->
    <text x="0" y="240" font-family="Inter, system-ui, -apple-system, sans-serif"
          font-size="84" font-weight="800" fill="#6C7A89" letter-spacing="-2">
      Story Mode
    </text>

    <!-- Tagline -->
    <text x="0" y="320" font-family="Inter, system-ui, -apple-system, sans-serif"
          font-size="38" font-weight="500" fill="#6C7A89" opacity="0.78">
      Your story. Your Guide.
    </text>

    <!-- Sub -->
    <text x="0" y="408" font-family="Inter, system-ui, -apple-system, sans-serif"
          font-size="26" font-weight="400" fill="#6C7A89" opacity="0.62">
      AI-driven interactive stories.
    </text>
    <text x="0" y="446" font-family="Inter, system-ui, -apple-system, sans-serif"
          font-size="26" font-weight="400" fill="#6C7A89" opacity="0.62">
      One tap at a time.
    </text>

    <!-- URL chip -->
    <rect x="0" y="500" width="280" height="50" rx="25" fill="#FFB6B9" opacity="0.95"/>
    <text x="140" y="533" font-family="Inter, system-ui, -apple-system, sans-serif"
          font-size="22" font-weight="600" fill="#FFFDF8" text-anchor="middle">
      mystorymode.com
    </text>
  </g>
</svg>
`;

await sharp(Buffer.from(ogSvg))
  .resize(1200, 630)
  .png()
  .toFile(resolve(PUBLIC_DIR, "og-image.png"));

console.log("brand assets generated:");
console.log("  client/public/apple-touch-icon.png  (180×180)");
console.log("  client/public/og-image.png          (1200×630)");
