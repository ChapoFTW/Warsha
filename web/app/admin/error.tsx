'use client';

import { RouteErrorView } from '@/components/route-error-view';

/** The staff console. */
export default function AdminError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorView {...props} surface="admin" component="admin" />;
}
