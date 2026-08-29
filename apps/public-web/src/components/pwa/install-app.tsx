"use client";

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Props = { variant?: "header" | "menu" };

export function InstallApp({ variant = "header" }: Props) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch((error) => console.error("Service worker registration failed", error));
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setInstalled(standalone);

    const userAgent = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(userAgent)) setPlatform("ios");
    else if (/Android/.test(userAgent)) setPlatform("android");

    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const confirm = () => {
      setInstalled(true);
      setPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", confirm);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", confirm);
    };
  }, []);

  if (installed || (!prompt && !platform)) return null;

  async function install() {
    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPrompt(null);
      return;
    }
    setShowHelp(true);
  }

  const help = platform === "ios"
    ? "Dans Safari, ouvre le menu Partager puis choisis « Sur l’écran d’accueil »."
    : "Ouvre le menu du navigateur puis choisis « Installer l’application » ou « Ajouter à l’écran d’accueil ».";

  return (
    <div className={`install-app install-app-${variant}`}>
      <button type="button" onClick={install}>Installer Stat de Foot</button>
      {showHelp ? (
        <div className="install-help" role="dialog" aria-modal="true" aria-label="Installer Stat de Foot">
          <button type="button" className="install-close" onClick={() => setShowHelp(false)} aria-label="Fermer">×</button>
          <strong>Installer Stat de Foot</strong>
          <p>{help}</p>
        </div>
      ) : null}
    </div>
  );
}
