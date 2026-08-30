'use client';

import { RouteErrorView } from '@/components/route-error-view';

/** The customer and worker application. */
export default function AppError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorView {...props} surface="web" component="app" />;
}
