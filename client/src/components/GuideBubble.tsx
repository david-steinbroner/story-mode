import { ReactNode } from "react";
import GuideAvatar from "./GuideAvatar";

interface GuideBubbleProps {
  /** Bubble body. String, JSX, or any ReactNode. */
  children: ReactNode;
  /** Avatar size in px. 28px for in-story; 36px for hero + wizard. */
  avatarSize?: number;
  /** When true, the bubble pulses (animate-pulse) — used by the typing
   *  indicator. The avatar above does NOT pulse so the Guide identity
   *  remains stable while the bubble breathes. */
  loading?: boolean;
  /** Extra classes for the outer container (e.g. `mb-6` on the hero use). */
  className?: string;
  /** Extra classes for the bubble itself (e.g. a different background
   *  for the bookshelf hero bubble where it lives on a card surface). */
  bubbleClassName?: string;
  /** Override the default bubble max-width. Defaults to 88% which gives
   *  long-form prose room while preserving the messenger asymmetry. */
  maxWidthClass?: string;
}

/**
 * Shared "Guide message" component — avatar on its own line above a
 * left-aligned bubble. Standardized in v1.7.3 across all three Guide
 * surfaces (bookshelf hero, new-story wizard, in-story AI pages).
 *
 * Default bubble background is `bg-muted/50` (in-story style). For the
 * bookshelf hero / wizard which sit on a different surface, pass
 * `bubbleClassName="bg-card border border-border"` to match the card
 * treatment.
 */
export default function GuideBubble({
  children,
  avatarSize = 28,
  loading = false,
  className = "",
  bubbleClassName = "bg-muted/50",
  maxWidthClass = "max-w-[88%]",
}: GuideBubbleProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <GuideAvatar size={avatarSize} animate={false} />
      <div className="flex justify-start">
        <div
          className={`px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl overflow-hidden ${maxWidthClass} ${bubbleClassName} ${
            loading ? "animate-pulse" : ""
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
