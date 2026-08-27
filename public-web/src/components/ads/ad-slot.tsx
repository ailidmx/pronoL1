type AdSlotProps = {
  name: string;
  format?: "leaderboard" | "rectangle" | "in-feed";
};

export function AdSlot({ name, format = "in-feed" }: AdSlotProps) {
  return (
    <aside
      className={`ad-slot ad-slot-${format}`}
      aria-label="Emplacement publicitaire"
      data-ad-slot={name}
      data-ad-format={format}
    >
      <span>Publicité</span>
      <small>Emplacement Google AdSense réservé</small>
    </aside>
  );
}
