import { Redirect } from 'expo-router';

export default function LegacyIdentityCaptureRedirect() {
  return <Redirect href="/worker/verification" />;
}
