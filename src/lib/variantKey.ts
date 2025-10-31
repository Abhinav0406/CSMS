export function buildVariantKey(
  handle: string | undefined,
  location: string | undefined,
  option1Value?: string | null,
  option2Value?: string | null,
  option3Value?: string | null,
): string {
  const h = (handle || '').trim();
  const loc = (location || '').trim();
  const o1 = (option1Value || '').trim();
  const o2 = (option2Value || '').trim();
  const o3 = (option3Value || '').trim();
  return `${h}|${loc}|${o1}|${o2}|${o3}`;
}


