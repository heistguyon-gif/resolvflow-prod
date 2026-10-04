export function importedTemplateName(sourceName: string, ownerLabel: string) {
  const base = sourceName.replace(/\s*·\s*template\s*$/i, "").trim() || "Template";
  const label = ownerLabel.trim();
  const suffix = label ? ` · ${label}` : "";
  return `${base}${suffix} · template`.slice(0, 120);
}
