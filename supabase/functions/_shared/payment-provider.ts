// Server-only provider boundary. This file is intentionally not wired to a
// deployed public Edge Function until a licensed provider and webhook secret
// are configured.

export type NormalizedGatewayEvent = {
  id: string;
  type:
    | 'payment.pending'
    | 'payment.succeeded'
    | 'payment.failed'
    | 'payment.chargeback';
  attemptId: string;
  occurredAt?: string;
  sanitizedMetadata: Record<string, string>;
};

export type GatewayCheckout = {
  providerReference: string;
  checkoutUrl?: string;
  expiresAt?: string;
};

export interface PaymentProvider {
  readonly name: string;
  createPaymentIntent(input: {
    attemptId: string;
    amountMinor: string;
    currency: 'EGP';
    idempotencyKey: string;
  }): Promise<GatewayCheckout>;
  retrievePaymentStatus(providerReference: string): Promise<NormalizedGatewayEvent>;
  verifyWebhookSignature(rawBody: Uint8Array, signature: string): Promise<boolean>;
  parseWebhookEvent(rawBody: Uint8Array): Promise<NormalizedGatewayEvent>;
  createRefund(input: {
    paymentReference: string;
    amountMinor: string;
    currency: 'EGP';
    idempotencyKey: string;
  }): Promise<{ providerRefundReference: string }>;
  retrieveRefundStatus(providerRefundReference: string): Promise<'pending' | 'succeeded' | 'failed'>;
  normalizeGatewayError(reason: unknown): { code: string; retryable: boolean };
}

export class DisabledLivePaymentProvider implements PaymentProvider {
  readonly name = 'disabled_live';
  private disabled(): never {
    throw new Error('Live payment provider is not configured.');
  }
  async createPaymentIntent(): Promise<GatewayCheckout> { return this.disabled(); }
  async retrievePaymentStatus(): Promise<NormalizedGatewayEvent> { return this.disabled(); }
  async verifyWebhookSignature(): Promise<boolean> { return false; }
  async parseWebhookEvent(): Promise<NormalizedGatewayEvent> { return this.disabled(); }
  async createRefund(): Promise<{ providerRefundReference: string }> { return this.disabled(); }
  async retrieveRefundStatus(): Promise<'pending' | 'succeeded' | 'failed'> { return this.disabled(); }
  normalizeGatewayError() { return { code: 'live_provider_disabled', retryable: false }; }
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  async createPaymentIntent(input: { attemptId: string }): Promise<GatewayCheckout> {
    return { providerReference: `mock:${input.attemptId}` };
  }
  async retrievePaymentStatus(providerReference: string): Promise<NormalizedGatewayEvent> {
    return {
      id: `mock-status:${providerReference}`,
      type: 'payment.pending',
      attemptId: providerReference.replace(/^mock:/, ''),
      sanitizedMetadata: {},
    };
  }
  async verifyWebhookSignature(_rawBody: Uint8Array, signature: string) {
    return signature === 'mock-valid-signature';
  }
  async parseWebhookEvent(rawBody: Uint8Array): Promise<NormalizedGatewayEvent> {
    const parsed = JSON.parse(new TextDecoder().decode(rawBody)) as NormalizedGatewayEvent;
    if (
      !parsed.id
      || !parsed.attemptId
      || ![
        'payment.pending',
        'payment.succeeded',
        'payment.failed',
        'payment.chargeback',
      ].includes(parsed.type)
    ) {
      throw new Error('Invalid mock gateway event');
    }
    return { ...parsed, sanitizedMetadata: parsed.sanitizedMetadata ?? {} };
  }
  async createRefund(input: { idempotencyKey: string }) {
    return { providerRefundReference: `mock-refund:${input.idempotencyKey}` };
  }
  async retrieveRefundStatus(): Promise<'succeeded'> { return 'succeeded'; }
  normalizeGatewayError(reason: unknown) {
    return { code: reason instanceof Error ? reason.name : 'mock_error', retryable: true };
  }
}
