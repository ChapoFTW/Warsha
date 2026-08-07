/**
 * WPS-024 OCR composition root.
 *
 * The ONE module that names every OCR implementation. Edge Functions import
 * this and `ocr-provider.ts`, never a vendor file, so the set of vendors Warsha
 * can call is enumerated in exactly one place a reviewer can read in ten
 * seconds.
 *
 * Adding a provider is: write the implementation, add a line here, add a
 * registry row with its `capability_role`. Nothing in the request path changes,
 * because the request path resolves by key and the key comes from the database.
 */

import { googleVisionProvider } from './google-vision-provider.ts';
import { registerOcrProvider } from './ocr-provider.ts';

registerOcrProvider(googleVisionProvider);

export {
  registeredOcrProviderKeys,
  resolveOcrProvider,
} from './ocr-provider.ts';
