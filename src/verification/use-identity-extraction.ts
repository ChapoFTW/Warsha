import { useCallback, useEffect, useRef, useState } from 'react';

import { providerClients } from '@/src/providers/provider-clients';
import {
  extractionPhaseFor,
  shouldRequestExtraction,
  visibleExtractionPhase,
  withAttempt,
  type ExtractableDocumentType,
  type ExtractionAttempt,
  type ExtractionOutcome,
  type ExtractionPhase,
} from './identity-extraction-flow';

/**
 * Asking the server to read a document, and knowing what to say while it does.
 *
 * The backend for this has been complete for some time and had no caller — see
 * the header of `identity-extraction-flow.ts`. This hook is the caller, and it
 * is a hook rather than a call site inside the screen for three reasons:
 *
 *   * **Cost.** OCR is a paid external call. The decision to make one lives in
 *     `shouldRequestExtraction`, which is import-free and tested, rather than
 *     in an effect that a later edit could make fire twice.
 *   * **Capability.** The provider is switched on by a governed activation
 *     flow, and until it is, asking spends a request to be told no. The
 *     capability is read once and cached for the screen's lifetime.
 *   * **Honesty.** A screen that owned this would be tempted to turn a failed
 *     read into a failed step. It cannot from here: this hook returns a phase
 *     and nothing else, and no phase it can return blocks progress.
 *
 * Manual entry is available throughout, including while a read is in flight.
 */
export function useIdentityExtraction(options?: { onCandidates?: () => void }) {
  const [capabilityAvailable, setCapabilityAvailable] = useState(false);
  const [inFlight, setInFlight] = useState<ExtractableDocumentType | null>(null);
  const [lastOutcome, setLastOutcome] = useState<ExtractionOutcome | null>(null);
  const attempts = useRef<ExtractionAttempt[]>([]);
  const onCandidates = useRef(options?.onCandidates);
  onCandidates.current = options?.onCandidates;

  useEffect(() => {
    let active = true;
    void providerClients.extractionCapability().then((capability) => {
      if (active) setCapabilityAvailable(capability.available === true);
    });
    return () => { active = false; };
  }, []);

  /**
   * Read one document, if reading it is worth a request.
   *
   * Returns the phase so a caller can react, but the caller is never obliged
   * to: every path through this function leaves the worker able to type the
   * details in themselves.
   */
  const request = useCallback(async (
    documentType: ExtractableDocumentType,
    storagePath: string | null | undefined,
    context?: { requestedByWorker?: boolean },
  ): Promise<ExtractionPhase> => {
    const documentKey = storagePath ?? null;
    if (!shouldRequestExtraction({
      documentType,
      documentKey,
      capabilityAvailable,
      attempts: attempts.current,
      requestedByWorker: context?.requestedByWorker,
    })) {
      return visibleExtractionPhase({
        inFlight: inFlight !== null,
        lastOutcome,
        capabilityAvailable,
      });
    }

    attempts.current = withAttempt(attempts.current, {
      documentType, documentKey: documentKey!, phase: 'reading',
    });
    setInFlight(documentType);
    setLastOutcome(null);

    const result = await providerClients.extractIdentityFields(storagePath!, documentType);
    const outcome = (result.outcome ?? 'provider_error') as ExtractionOutcome;
    const phase = extractionPhaseFor(outcome);

    attempts.current = withAttempt(attempts.current, {
      documentType, documentKey: documentKey!, phase,
    });
    setInFlight(null);
    setLastOutcome(outcome);
    // Candidates live in the onboarding state, read back through
    // `get_my_identity_candidates`. The screen refreshes rather than being
    // handed values here, so there is one path a candidate can arrive by.
    if (phase === 'complete') onCandidates.current?.();
    return phase;
  }, [capabilityAvailable, inFlight, lastOutcome]);

  return {
    capabilityAvailable,
    phase: visibleExtractionPhase({
      inFlight: inFlight !== null,
      lastOutcome,
      capabilityAvailable,
    }),
    request,
  };
}
