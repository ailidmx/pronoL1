export const publicExperienceStorageKey = "docfoot-experience-assignment-v2";
export const publicExperienceChangedEvent = "docfoot:experience-changed";

export const publicExperienceOptions = [
  { key: "data-lab", label: "A — Data Lab" },
  { key: "match-day", label: "B — Match Day" },
  { key: "encyclopedia", label: "C — Encyclopédie" },
] as const;

export function setPublicExperience(variant: string) {
  if (!publicExperienceOptions.some((option) => option.key === variant)) return;
  localStorage.setItem(publicExperienceStorageKey, variant);
  document.documentElement.dataset.publicTheme = variant;
  window.__PRONO_EXPERIMENTS__ = { ...window.__PRONO_EXPERIMENTS__, "docfoot-experience-v2": variant };
  window.dispatchEvent(new CustomEvent(publicExperienceChangedEvent, { detail: { variant } }));
}
