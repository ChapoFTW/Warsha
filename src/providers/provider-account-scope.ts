export function providerStorageKey(accountId: string) {
  return `warsha:provider-foundation:v2:${accountId}`;
}
export function providerPortfolioStorageKey(accountId: string) {
  return `warsha:provider-portfolio:v1:${accountId}`;
}
export function providerCertificateStorageKey(accountId: string) {
  return `warsha:provider-certificates:v1:${accountId}`;
}
export function providerVerificationStorageKey(providerId: string) {
  return `warsha:provider-verification:v2:${providerId}`;
}
