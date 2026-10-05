export const normalizeText = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[&/]+/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const optionalText = (value: string | undefined): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};