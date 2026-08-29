import { useEffect, useState } from "react";

export default function InstallApp() {
  const [prompt, setPrompt] = useState(null);
  const [requested, setRequested] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    navigator.serviceWorker?.register("/sw.js", { updateViaCache: "none" }).catch(console.error);
    setRequested(new URLSearchParams(window.location.search).get("install") === "1");
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    const capture = (event) => { event.preventDefault(); setPrompt(event); };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  if (!requested) return null;
  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
    setRequested(false);
    window.history.replaceState({}, "", window.location.pathname);
  }

  return <aside className="pwa-install-banner" aria-label="Installer Prono L1 Admin">
    <div><strong>Installer Prono L1 Admin</strong><span>{ios ? "Safari : Partager → Sur l’écran d’accueil" : prompt ? "Ajoute le back-office à ton appareil." : "Utilise le menu du navigateur puis « Installer l’application »."}</span></div>
    {prompt ? <button type="button" onClick={install}>Installer</button> : null}
    <button type="button" className="pwa-install-close" onClick={() => setRequested(false)} aria-label="Fermer">×</button>
  </aside>;
}
