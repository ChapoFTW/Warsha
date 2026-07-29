export type WarshaNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  bookingId?: string;
  providerId?: string;
  dedupeKey?: string;
  readAt?: string;
  createdAt: string;
};

export type NotificationPage = { items: WarshaNotification[]; hasMore: boolean };
