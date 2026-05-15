import { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ChoiceButtonProps {
  /** Button label text or node. */
  children: ReactNode;
  /** Tap handler. */
  onClick: () => void;
  /** Disabled state (matches the in-story drawer behavior — disabled
   *  while the Guide is generating a reply). */
  disabled?: boolean;
  /** Extra classes for the wrapper. */
  className?: string;
}

/**
 * Outline choice button — the visual primitive for "pick one of these"
 * across the app. Used in the in-story drawer (AI-generated choices) and
 * on the Bookshelf drawer (Q&A options).
 *
 * Establishing a single shared button shape teaches the user: "outline
 * button = a choice the Guide is offering me." Tap targets are 44px
 * high per the design system.
 *
 * For the primary CTA (Start a New Story etc.) use the regular Button
 * component with default variant — this component is for the secondary
 * choice slots only.
 */
export default function ChoiceButton({
  children,
  onClick,
  disabled = false,
  className = "",
}: ChoiceButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={`w-full justify-start text-left h-auto py-2.5 px-3 min-h-[44px] whitespace-normal ${className}`}
    >
      <span className="text-sm leading-snug break-words">{children}</span>
    </Button>
  );
}
