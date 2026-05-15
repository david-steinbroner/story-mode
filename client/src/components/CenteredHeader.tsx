import { ReactNode } from "react";

interface CenteredHeaderProps {
  /** Left slot (back button, spacer, etc.). Reserve 44×44px for tap targets. */
  left?: ReactNode;
  /** Right slot (dropdown trigger, step dots, etc.). */
  right?: ReactNode;
  /** Centered title. Can be a string or styled JSX. */
  title: ReactNode;
  /** Optional className for the outer container — for borders or
   *  background overrides on specific surfaces (e.g. in-story header). */
  className?: string;
  /** Optional className for the title element. Defaults to the hero
   *  style (Cinzel + foreground). Pass override for in-story usage. */
  titleClassName?: string;
}

/**
 * 3-column grid header with a center-aligned title. The 44px left/right
 * columns reserve tap-target space on either side so the title stays
 * centered on the viewport even when only one of the slots is occupied.
 *
 * Used by the Bookshelf, NewStoryCreation, and ChatInterface top bars.
 *
 * Design-system note: hero titles use `font-serif` (Cinzel) per
 * docs/design-system.md. The default `titleClassName` reflects this.
 */
export default function CenteredHeader({
  left,
  right,
  title,
  className = "",
  titleClassName = "font-serif text-xl text-foreground",
}: CenteredHeaderProps) {
  return (
    <div className={className}>
      <div
        className="grid items-center gap-2 px-3 py-2"
        style={{ gridTemplateColumns: "44px 1fr 44px", minHeight: 48 }}
      >
        <div className="flex items-center justify-start">{left ?? <span aria-hidden />}</div>
        <h1 className={`text-center leading-snug break-words ${titleClassName}`}>{title}</h1>
        <div className="flex items-center justify-end">{right ?? <span aria-hidden />}</div>
      </div>
    </div>
  );
}
