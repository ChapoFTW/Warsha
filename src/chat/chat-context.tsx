import { createContext, type PropsWithChildren, useContext, useMemo, useState } from 'react';

type ChatVisibility = { activeBookingId: string | null; setActiveBookingId: (bookingId: string | null) => void };
const Context = createContext<ChatVisibility | null>(null);

export function ChatProvider({ children }: PropsWithChildren) {
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const value = useMemo(() => ({ activeBookingId, setActiveBookingId }), [activeBookingId]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useChatVisibility() {
  const value = useContext(Context);
  if (!value) throw new Error('useChatVisibility must be used inside ChatProvider');
  return value;
}
