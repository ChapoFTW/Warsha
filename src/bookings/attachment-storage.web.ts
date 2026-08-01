import type { BookingAttachment } from './booking-types';
// expo-file-system is unavailable on web; picker URIs (blob:/data:) are used directly.
export function persistAttachment(input:{uri:string;fileName?:string|null;mimeType?:string|null}):BookingAttachment{const id=`IMG-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;return{id,uri:input.uri,fileName:input.fileName??undefined,mimeType:input.mimeType??undefined}}
export function removePersistedAttachment(_attachment:BookingAttachment){/* Nothing persisted on web; blob URLs are reclaimed by the browser. */}
