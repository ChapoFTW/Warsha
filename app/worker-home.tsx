import { Redirect } from 'expo-router';

/** Legacy WPS-023 deep link. The canonical worker home is /worker. */
export default function LegacyWorkerHomeRedirect() {
  return <Redirect href="/worker" />;
}
