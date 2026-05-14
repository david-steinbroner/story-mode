import { getTestModel } from "@/lib/testModel";

/**
 * Tiny dev-only indicator: shows in the top-right corner of every view
 * when this tab has a `?testmodel=…` override set. Renders nothing when
 * no override is active.
 *
 * Useful for keeping track of which tab is generating on which model
 * when running side-by-side comparison.
 */
export default function TestModelBadge() {
  const testModel = getTestModel();
  if (!testModel) return null;

  // Short label for the common aliases; fall back to the full ID for
  // anything else (e.g. when the user pastes a full OpenRouter model ID).
  const label =
    testModel === "haiku" || testModel === "sonnet"
      ? testModel
      : testModel.split("/").pop() || testModel;

  return (
    <div
      className="fixed top-2 right-2 z-50 px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider pointer-events-none select-none"
      style={{
        backgroundColor: "#5C5470",
        color: "white",
        opacity: 0.85,
      }}
      title={`Test model override (this tab): ${testModel}. Visit ?testmodel= to clear.`}
    >
      test: {label}
    </div>
  );
}
