import type { NormalizedGatewayEvent, PaymentProvider } from './payment-provider';

export type WebhookPersistence = {
  hasProcessed(gatewayName: string, eventId: string): Promise<boolean>;
  recordRejected(input: {
    gatewayName: string;
    rawBodySha256: string;
    reason: string;
  }): Promise<void>;
  processVerified(input: {
    gatewayName: string;
    rawBodySha256: string;
    event: NormalizedGatewayEvent;
  }): Promise<void>;
};

export async function processProviderWebhook(input: {
  provider: PaymentProvider;
  persistence: WebhookPersistence;
  rawBody: Uint8Array;
  rawBodySha256: string;
  signature: string | null;
}) {
  if (!input.signature || !await input.provider.verifyWebhookSignature(input.rawBody, input.signature)) {
    await input.persistence.recordRejected({
      gatewayName: input.provider.name,
      rawBodySha256: input.rawBodySha256,
      reason: 'invalid_signature',
    });
    return { accepted: false, duplicate: false } as const;
  }
  const event = await input.provider.parseWebhookEvent(input.rawBody);
  if (await input.persistence.hasProcessed(input.provider.name, event.id)) {
    return { accepted: true, duplicate: true } as const;
  }
  await input.persistence.processVerified({
    gatewayName: input.provider.name,
    rawBodySha256: input.rawBodySha256,
    event,
  });
  return { accepted: true, duplicate: false } as const;
}
