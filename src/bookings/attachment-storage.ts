import { Directory,File,Paths } from 'expo-file-system';
import type { BookingAttachment } from './booking-types';
const directory=new Directory(Paths.document,'booking-attachments');
function ensureDirectory(){if(!directory.exists)directory.create({idempotent:true,intermediates:true})}
export function persistAttachment(input:{uri:string;fileName?:string|null;mimeType?:string|null}):BookingAttachment{ensureDirectory();const extension=input.fileName?.split('.').pop()?.replace(/[^a-zA-Z0-9]/g,'')||'jpg';const id=`IMG-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;const destination=new File(directory,`${id}.${extension}`);new File(input.uri).copy(destination);return{id,uri:destination.uri,fileName:input.fileName??destination.name,mimeType:input.mimeType??undefined}}
export function removePersistedAttachment(attachment:BookingAttachment){try{const file=new File(attachment.uri);if(file.exists)file.delete()}catch{/* The UI has already removed the attachment; cleanup is best-effort. */}}
