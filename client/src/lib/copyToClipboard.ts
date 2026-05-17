// Two-tier clipboard write. Modern `navigator.clipboard.writeText` requires a
// *secure context* (HTTPS or `localhost`), so testing the dev server over a
// LAN IP (e.g. `http://192.168.86.28:3000` on a phone) hits an undefined
// `navigator.clipboard` and throws. Fall back to the legacy
// `document.execCommand('copy')` flow with a hidden textarea, which works in
// non-secure contexts and on older browsers.
//
// Returns `true` on success, `false` if both paths fail.
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);

    // Preserve any existing selection so we don't clobber the user's text
    // selection in the page after the temporary textarea steals focus.
    const selection = document.getSelection();
    const previousRange =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");

    document.body.removeChild(textarea);
    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
    return ok;
  } catch {
    return false;
  }
}
