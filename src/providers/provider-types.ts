export type ProviderOnboardingStatus =
  | 'draft'
  | 'submitted'
  | 'pending_review'
  | 'more_information_required'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type ProviderServiceInput = { serviceId: string; name: string };
export type ProviderAreaInput = { governorate: string; district: string; radiusKm: number };

export type ProviderDraft = {
  id?: string;
  status: ProviderOnboardingStatus;
  displayName: string;
  avatarPath: string;
  avatarUrl: string;
  profession: string;
  about: string;
  experienceYears: number;
  experienceSummary: string;
  specialties: string[];
  ratingAverage?: number;
  languages: string[];
  categoryIds: string[];
  services: ProviderServiceInput[];
  areas: ProviderAreaInput[];
  serviceRadiusKm: number;
  isAvailable: boolean;
  emergencyAvailable: boolean;
  temporaryUnavailableUntil?: string;
  agreementAccepted: boolean;
};

export type ProviderMediaInput = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export type ProviderPhoto = { storagePath: string; previewUrl: string };

export type PortfolioImage = {
  id: string;
  storagePath: string;
  previewUrl: string;
  mimeType?: string;
  fileSizeBytes?: number;
  contentHash?: string;
  sortOrder: number;
};

export type PortfolioItemStatus = 'draft' | 'published';
export type PortfolioItem = {
  id: string;
  title: string;
  description: string;
  categoryId?: string;
  serviceId?: string;
  completedPeriod?: string;
  status: PortfolioItemStatus;
  sortOrder: number;
  createdAt: string;
  images: PortfolioImage[];
};

export type PortfolioItemInput = Omit<PortfolioItem, 'id' | 'sortOrder' | 'createdAt' | 'images'> & { id?: string };

export type ProviderCertificateType = 'professional' | 'trade_license' | 'qualification' | 'other';
export type ProviderCertificateStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'expired';
export type ProviderCertificate = {
  id: string;
  type: ProviderCertificateType;
  title: string;
  issuer?: string;
  status: ProviderCertificateStatus;
  storagePath?: string;
  previewUrl?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  rejectionReason?: string;
  submittedAt?: string;
  reviewedAt?: string;
  expiresAt?: string;
  createdAt: string;
};
export type ProviderCertificateInput = Pick<ProviderCertificate, 'type' | 'title' | 'issuer'> & { id?: string };

export type ProviderChecklist = {
  photo: boolean;
  professions: boolean;
  services: boolean;
  area: boolean;
  verification: boolean;
};

export const emptyProviderDraft: ProviderDraft = {
  status: 'draft',
  displayName: '',
  avatarPath: '',
  avatarUrl: '',
  profession: '',
  about: '',
  experienceYears: 0,
  experienceSummary: '',
  specialties: [],
  ratingAverage: 0,
  languages: [],
  categoryIds: [],
  services: [],
  areas: [],
  serviceRadiusKm: 15,
  isAvailable: false,
  emergencyAvailable: false,
  agreementAccepted: false,
};

/**
 * `radius_km` remains a required storage compatibility field. New worker UI
 * does not ask for or imply a personal travel radius: the schema maximum
 * makes matching waves and job location, not this value, the limiting policy.
 */
export const MARKETPLACE_MANAGED_RADIUS_KM = 250;

export function providerChecklist(value: ProviderDraft, identityApproved: boolean): ProviderChecklist {
  return {
    photo: Boolean(value.avatarPath),
    professions: Boolean(value.profession.trim()),
    services: value.services.length > 0,
    area: Boolean(value.areas.some(area => area.governorate.trim() && area.radiusKm >= 1)),
    verification: identityApproved,
  };
}

export function providerCompletion(value: ProviderDraft, identityApproved = false) {
  const checks = Object.values(providerChecklist(value, identityApproved));
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function validatePortfolioItem(value: PortfolioItemInput) {
  if (value.title.trim().length < 2 || value.title.trim().length > 80) throw new Error('Invalid portfolio title');
  if (value.description.length > 500) throw new Error('Invalid portfolio description');
  if ((value.completedPeriod?.trim().length ?? 0) > 40) throw new Error('Invalid portfolio period');
}

export function validateCertificate(value: ProviderCertificateInput) {
  if (value.title.trim().length < 2 || value.title.trim().length > 100) throw new Error('Invalid certificate title');
  if ((value.issuer?.trim().length ?? 0) > 100) throw new Error('Invalid certificate issuer');
}
