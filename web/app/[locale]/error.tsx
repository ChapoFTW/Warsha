'use client';

import { RouteErrorView } from '@/components/route-error-view';

/** The public site. */
export default function PublicError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorView {...props} surface="web" component="public" />;
}
