const formatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

export function DataFreshness({ value, compact = false }: { value: string | null; compact?: boolean }) {
  return (
    <p className={compact ? "data-freshness compact" : "data-freshness"}>
      <span aria-hidden="true" className="freshness-dot" />
      Données actualisées {value ? <time dateTime={value}>le {formatter.format(new Date(value))}</time> : "récemment"}
    </p>
  );
}

