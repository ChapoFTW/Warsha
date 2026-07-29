export type VerificationStatus =
  | 'not_started'
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'requires_resubmission'
  | 'expired';

export type VerificationDocumentType =
  | 'national_id_front'
  | 'national_id_back'
  | 'selfie'
  | 'skill_certificate'
  | 'trade_license'
  | 'qualification'
  | 'other';

export type VerificationDocumentStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired';

export type VerificationDocument = {
  id: string;
  type: VerificationDocumentType;
  status: VerificationDocumentStatus;
  storagePath?: string;
  previewUrl: string;
  mimeType?: string;
  fileSizeBytes?: number;
  createdAt: string;
};

export type ProviderVerification = {
  id?: string;
  providerId: string;
  status: VerificationStatus;
  revision: number;
  skillCertificateAnswer: 'not_answered' | 'yes' | 'no';
  identityVerified: boolean;
  skillCertificateVerified: boolean;
  rejectionReason?: string;
  submittedAt?: string;
  reviewedAt?: string;
  expiresAt?: string;
  documents: VerificationDocument[];
};

export const editableVerificationStatuses: VerificationStatus[] = [
  'not_started',
  'draft',
  'rejected',
  'requires_resubmission',
  'expired',
];

export const requiredIdentityDocumentTypes: VerificationDocumentType[] = [
  'national_id_front',
  'national_id_back',
  'selfie',
];

export function normalizeNationalId(value: string) {
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';
  const latinDigits = '01234567890123456789';
  return value
    .replace(/[\s-]/g, '')
    .replace(/[٠-٩۰-۹]/g, digit => latinDigits[arabicDigits.indexOf(digit)] ?? digit)
    .replace(/[^0-9]/g, '')
    .slice(0, 14);
}

export function maskedNationalId(value: string) {
  const normalized = normalizeNationalId(value);
  if (!normalized) return '';
  return `${'•'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}
