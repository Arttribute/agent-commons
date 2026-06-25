export function normalizePrincipalId(value: string | null | undefined) {
  if (!value) return "";
  return /^0x[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : value;
}
