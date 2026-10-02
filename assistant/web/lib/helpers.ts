/** Works on HTTP LAN addresses where crypto.randomUUID is unavailable. */
export function uid(): string {
  const random = new Uint32Array(2);
  crypto.getRandomValues(random);
  return `${Date.now().toString(36)}-${random[0].toString(36)}${random[1].toString(36)}`;
}
