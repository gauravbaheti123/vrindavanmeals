/**
 * Print an HTML document from anywhere in the app.
 *
 * Strategy:
 *  1. Native shell (Capacitor) with a registered Printer plugin → hand the HTML to
 *     Android's native print service (shows the WiFi printer picker).
 *  2. Otherwise → render into a hidden same-document iframe and call print() on it.
 *     This reliably opens the system print dialog on Android Chrome / iOS Safari and
 *     avoids popup blockers (which silently killed the old window.open approach on mobile).
 *  3. Last resort → popup window.
 */

type NativePrinter = { print: (opts: { content: string; name?: string; orientation?: string }) => Promise<unknown> };

function nativePrinter(): NativePrinter | null {
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> };
  }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const plugin = cap.Plugins?.["Printer"] as NativePrinter | undefined;
  return plugin && typeof plugin.print === "function" ? plugin : null;
}

function printViaIframe(html: string) {
  const existing = document.getElementById("vm-print-frame");
  if (existing) existing.remove();

  const frame = document.createElement("iframe");
  frame.id = "vm-print-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.visibility = "hidden";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    throw new Error("Could not open the print view");
  }

  doc.open();
  doc.write(html);
  doc.close();

  const fire = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
    setTimeout(() => frame.remove(), 60_000);
  };

  // Wait for images (logo / stamp) before printing.
  if (doc.readyState === "complete") setTimeout(fire, 150);
  else win.addEventListener("load", () => setTimeout(fire, 150));
}

function printViaPopup(html: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
  }, 300);
  return true;
}

export async function printHtmlDocument(html: string, name = "Vrindavan Meals") {
  const printer = nativePrinter();
  if (printer) {
    try {
      await printer.print({ content: html, name });
      return;
    } catch {
      /* fall through to web printing */
    }
  }
  try {
    printViaIframe(html);
  } catch {
    if (!printViaPopup(html)) throw new Error("Printing is blocked — allow popups and try again");
  }
}
