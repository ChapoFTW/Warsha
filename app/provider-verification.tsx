import { Redirect } from 'expo-router';

/** Legacy WPS-006 route retained for notifications and old deep links. */
export default function LegacyProviderVerificationRedirect() {
  return <Redirect href="/worker/verification" />;
}
