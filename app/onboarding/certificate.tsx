import { Redirect } from 'expo-router';

export default function LegacyCertificateRedirect() {
  return <Redirect href="/worker/verification?step=certificate" />;
}
