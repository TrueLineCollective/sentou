export function cookieName(slug: string): string {
  return `sentou_${slug}`;
}

export function verifyCookieName(slug: string): string {
  return `sentou_verify_${slug}`;
}
