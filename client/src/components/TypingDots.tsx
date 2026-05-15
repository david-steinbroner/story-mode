/**
 * Animated three-dot indicator — the texting-app "typing…" pattern.
 * Used anywhere the Guide is generating a response. Replaces the older
 * "Your Guide is thinking…" text card.
 *
 * Pure CSS: three dots, each fading in and out on a 1.2s cycle with a
 * 0.16s stagger between them. Keyframe lives in client/src/index.css
 * as `@keyframes typing-dot`.
 *
 * Render this INSIDE a <GuideBubble loading>…</GuideBubble> so the
 * dots inherit the messenger layout (avatar above, bubble left-aligned).
 */
export default function TypingDots() {
  return (
    <div
      role="status"
      aria-label="Your Guide is typing"
      className="flex items-center gap-1.5 py-1"
    >
      <span
        className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-typing-dot"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-typing-dot"
        style={{ animationDelay: "160ms" }}
      />
      <span
        className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-typing-dot"
        style={{ animationDelay: "320ms" }}
      />
    </div>
  );
}
