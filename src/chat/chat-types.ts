export type MessageKind = 'text' | 'image' | 'system';
export type DeliveryState = 'sent' | 'delivered' | 'read';

export type ChatAttachment = {
  id: string;
  path: string;
  mimeType: string;
  url?: string;
};

export type BookingMessage = {
  id: string;
  bookingId: string;
  senderId?: string;
  kind: MessageKind;
  body?: string;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
  systemEvent?: string;
  attachments: ChatAttachment[];
  delivery: DeliveryState;
};

export type ChatPage = { items: BookingMessage[]; hasMore: boolean };

export type MessageDraft = {
  kind: Exclude<MessageKind, 'system'>;
  body?: string;
  attachment?: { uri: string; mimeType?: string | null; fileName?: string | null };
  clientId: string;
};
