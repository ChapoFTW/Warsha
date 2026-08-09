# Worker experience navigation

## Canonical homes

| Account target | Session home | Default experience |
| --- | --- | --- |
| customer | `/` | customer |
| worker onboarding | `/onboarding/worker` | worker |
| worker ready | `/worker` | worker |

The display mode is deliberately not persisted. Authentication and server role
state select the experience after provider hydration. A worker can explicitly
enter `/` through **Request a service**, but that choice does not survive the
session.

## Route classification

`src/navigation/worker-route-policy.ts` classifies routes as worker, customer
or shared. Worker paths include canonical `/worker/**` and compatibility paths
such as `/provider-job`, `/worker-quote`, `/provider-verification` and
`/provider-mode`. Shared paths include support, notification and legal flows.

`AuthGate` then applies four rules:

```text
signed out → authentication entry
customer route + customer account → customer route
worker route + worker capability → worker route and worker experience
worker route + no worker capability → customer home or guided onboarding
```

Pending worker states cannot escape into a second worker navigation system.
Customers are not granted a worker surface merely because they deep-link to
one.

## Notification routing

Worker opportunities resolve to `/worker/requests`; worker quote details to
`/worker/requests/[id]`; worker bookings to `/worker/jobs/[id]`; verification
to `/worker/verification`. Customer booking routes are unchanged.

## Compatibility principle

Compatibility files redirect or re-export the canonical implementation. They
do not carry duplicate state or business logic. This keeps old links usable
while making all new navigation converge on the worker product.
