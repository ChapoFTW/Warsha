import Storage from 'expo-sqlite/kv-store';

const MOCK_KEY = 'warsha:disputes:v1';
const PUBLICATION_HOLD_STATES = new Set([
  'submitted',
  'waiting_customer',
  'waiting_worker',
  'waiting_staff',
  'under_review',
]);

type StoredDisputeSummary = { id?: string; bookingId?: string; state?: string };
type StoredDisputeState = { disputes?: StoredDisputeSummary[] };

export async function getMockDisputePublicationHoldId(bookingId: string) {
  try {
    const raw = await Storage.getItem(MOCK_KEY);
    if (!raw) return undefined;
    const state = JSON.parse(raw) as StoredDisputeState;
    return state.disputes?.find((item) =>
      item.bookingId === bookingId
      && Boolean(item.id)
      && Boolean(item.state && PUBLICATION_HOLD_STATES.has(item.state)))?.id;
  } catch {
    return undefined;
  }
}
