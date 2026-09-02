"use client";

import { signOut } from "firebase/auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "@/lib/client/firebase";
import { useAuth } from "@/lib/client/auth";
import { InstallApp } from "@/components/pwa/install-app";
import { ADMIN_APP_URL, PLAYER_APP_URL } from "@/config/app-links";
import { publicExperienceOptions, publicExperienceStorageKey, setPublicExperience } from "@/lib/experiments/client";

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

export function AuthButton() {
  const { user, loading, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [experience, setExperience] = useState("data-lab");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setExperience(localStorage.getItem(publicExperienceStorageKey) || document.documentElement.dataset.publicTheme || "data-lab");
  }, []);

  const avatarLabel = useMemo(() => initials(user?.displayName, user?.email), [user?.displayName, user?.email]);

  if (loading) return null;
  if (!user) return <a href="/connexion" className="auth-link">Se connecter</a>;

  const isAdmin = profile?.isAdmin === true;
  const canUsePlayer = isAdmin || profile?.isAllowed === true;

  return (
    <div className="account-menu" ref={menuRef}>
      <button className="account-trigger" type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Ouvrir le menu du compte" onClick={() => setOpen((value) => !value)}>
        {user.photoURL ? (
          <span className="account-avatar-image" aria-hidden="true" style={{ backgroundImage: `url(${user.photoURL})` }} />
        ) : (
          <span className="account-avatar-fallback" aria-hidden="true">{avatarLabel}</span>
        )}
        <span className="account-caret" aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="account-dropdown" role="menu">
          <div className="account-identity">
            <strong>{user.displayName || "Mon compte"}</strong>
            {user.email ? <span>{user.email}</span> : null}
          </div>
          <a href="/pronostics" role="menuitem" onClick={() => setOpen(false)}>Mes pronostics</a>
          <a href="/favoris" role="menuitem" onClick={() => setOpen(false)}>Favoris</a>
          <a href="/historique" role="menuitem" onClick={() => setOpen(false)}>Historique</a>
          {isAdmin ? (
            <label className="account-experience">
              <span>Expérience publique</span>
              <select value={experience} onChange={(event) => { setExperience(event.target.value); setPublicExperience(event.target.value); }}>
                {publicExperienceOptions.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}
              </select>
            </label>
          ) : null}
          <div className="account-apps" aria-label="Applications">
            <span>Applications</span>
            <InstallApp variant="menu" />
            {canUsePlayer ? <a href={`${PLAYER_APP_URL}/?install=1`} role="menuitem">Installer Prono L1</a> : null}
            {isAdmin ? <a href={`${ADMIN_APP_URL}/?install=1`} role="menuitem">Installer Prono L1 Admin</a> : null}
          </div>
          <button type="button" role="menuitem" onClick={() => signOut(auth)}>Déconnexion</button>
        </div>
      ) : null}
    </div>
  );
}
