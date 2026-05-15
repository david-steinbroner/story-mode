import { ReactNode } from "react";

interface PlayerBubbleProps {
  /** Message text or node. */
  children: ReactNode;
  /** Optional explicit font-size (used on the in-story surface where the
   *  user controls scale). When omitted, falls back to the inherited
   *  Tailwind text size. */
  fontSize?: number;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

/**
 * Right-aligned player message bubble — the visual counterpart to the
 * Guide's left-aligned `<GuideBubble>`. Used in:
 *   - ChatInterface (player messages in the story conversation)
 *   - Bookshelf (player Q&A messages: "Tell me how this works", etc.)
 *
 * Max-width 88% so the asymmetric layout reads at a glance — the
 * directional cue (left vs right alignment) is what distinguishes
 * speaker; no avatar is shown for the player.
 */
export default function PlayerBubble({
  children,
  fontSize,
  className = "",
}: PlayerBubbleProps) {
  return (
    <div className={`flex justify-end ${className}`}>
      <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl overflow-hidden max-w-[88%] bg-primary/10">
        <p
          className="leading-relaxed text-foreground whitespace-pre-line break-words"
          style={fontSize ? { fontSize: `${fontSize}px` } : undefined}
        >
          {children}
        </p>
      </div>
    </div>
  );
}
