"use client";

import { useEffect } from "react";

export function BrowserTimezone() {
  useEffect(() => {
    const formatter = new Intl.DateTimeFormat(navigator.languages?.[0] ?? "fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const timeZone = formatter.resolvedOptions().timeZone;

    function localize(root: ParentNode | HTMLTimeElement) {
      const times = root instanceof HTMLTimeElement
        ? [root]
        : Array.from(root.querySelectorAll<HTMLTimeElement>("time[datetime]"));

      for (const time of times) {
        const raw = time.dateTime || time.getAttribute("datetime");
        if (!raw) continue;
        const date = new Date(raw);
        if (Number.isNaN(date.valueOf())) continue;
        time.textContent = formatter.format(date);
        time.dataset.timeZone = timeZone;
        time.title = `Heure locale · ${timeZone}`;
      }
    }

    localize(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLTimeElement) localize(node);
          else if (node instanceof Element) localize(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
