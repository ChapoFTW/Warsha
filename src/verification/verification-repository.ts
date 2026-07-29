import { Directory, File, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';

import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';
import { createMockNotification } from '@/src/notifications/notification-repository';
import { emitMockRealtime } from '@/src/realtime/realtime-service';

import {
  editableVerificationStatuses,
  normalizeNationalId,
  requiredIdentityDocumentTypes,
  type ProviderVerification,
  type VerificationDocument,
  type VerificationDocumentType,
  type VerificationStatus,
} from './verification-types';

type UploadInput = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export interface VerificationRepository {
  load(providerId: string): Promise<ProviderVerification>;
  upload(
    providerId: string,
    type: VerificationDocumentType,
    input: UploadInput,
  ): Promise<ProviderVerification>;
  remove(providerId: string, documentId: string): Promise<ProviderVerification>;
  submit(
    providerId: string,
    nationalId: string,
    hasSkillCertificate: boolean,
  ): Promise<ProviderVerification>;
  simulateReview?(
    providerId: string,
    status: 'approved' | 'rejected' | 'requires_resubmission',
  ): Promise<ProviderVerification>;
}

const MOCK_KEY = 'warsha:provider-verification:v1:mock-account';
const mockDirectory = new Directory(Paths.document, 'provider-verification');
const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

function emptyVerification(providerId: string): ProviderVerification {
  return {
    providerId,
    status: 'not_started',
    revision: 0,
    skillCertificateAnswer: 'not_answered',
    identityVerified: false,
    skillCertificateVerified: false,
    documents: [],
  };
}

function mapDocument(value: Record<string, unknown>): VerificationDocument {
  return {
    id: String(value.id),
    type: String(value.type) as VerificationDocumentType,
    status: String(value.status ?? 'pending') as VerificationDocument['status'],
    storagePath: typeof value.storagePath === 'string' ? value.storagePath : undefined,
    previewUrl: String(value.previewUrl ?? ''),
    mimeType: typeof value.mimeType === 'string' ? value.mimeType : undefined,
    fileSizeBytes: value.fileSizeBytes == null ? undefined : Number(value.fileSizeBytes),
    createdAt: String(value.createdAt ?? new Date().toISOString()),
  };
}

function mapVerification(value: Record<string, unknown>): ProviderVerification {
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    providerId: String(value.providerId ?? ''),
    status: String(value.status ?? 'not_started') as VerificationStatus,
    revision: Number(value.revision ?? 0),
    skillCertificateAnswer: String(
      value.skillCertificateAnswer ?? 'not_answered',
    ) as ProviderVerification['skillCertificateAnswer'],
    identityVerified: Boolean(value.identityVerified),
    skillCertificateVerified: Boolean(value.skillCertificateVerified),
    rejectionReason:
      typeof value.rejectionReason === 'string' ? value.rejectionReason : undefined,
    submittedAt: typeof value.submittedAt === 'string' ? value.submittedAt : undefined,
    reviewedAt: typeof value.reviewedAt === 'string' ? value.reviewedAt : undefined,
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : undefined,
    documents: Array.isArray(value.documents)
      ? value.documents.map(item => mapDocument(item as Record<string, unknown>))
      : [],
  };
}

async function readMock(providerId: string) {
  const raw = await Storage.getItem(MOCK_KEY);
  if (!raw) return emptyVerification(providerId);
  try {
    const saved = mapVerification(JSON.parse(raw) as Record<string, unknown>);
    return saved.providerId === providerId ? saved : emptyVerification(providerId);
  } catch {
    return emptyVerification(providerId);
  }
}

async function writeMock(value: ProviderVerification, table = 'provider_verifications') {
  await Storage.setItem(MOCK_KEY, JSON.stringify(value));
  emitMockRealtime({
    table: table as 'provider_verifications' | 'provider_profiles',
    event: 'UPDATE',
    id: value.id ?? value.providerId,
  });
}

function ensureMockDirectory() {
  if (!mockDirectory.exists) {
    mockDirectory.create({ idempotent: true, intermediates: true });
  }
}

function validatedFile(input: UploadInput) {
  const file = new File(input.uri);
  const mimeType = input.mimeType || file.type || 'image/jpeg';
  if (
    !file.exists ||
    !allowedMimeTypes.includes(mimeType) ||
    !file.size ||
    file.size > 8 * 1024 * 1024
  ) {
    throw new Error('Invalid verification image');
  }
  return { file, mimeType, size: file.size };
}

function extensionFor(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic') return 'heic';
  if (mimeType === 'image/heif') return 'heif';
  return 'jpg';
}

const mockRepository: VerificationRepository = {
  load: readMock,
  async upload(providerId, type, input) {
    const current = await readMock(providerId);
    if (!editableVerificationStatuses.includes(current.status)) {
      throw new Error('Verification documents are locked');
    }
    const { file, mimeType, size } = validatedFile(input);
    ensureMockDirectory();
    const id = `verification-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const destination = new File(
      mockDirectory,
      `${providerId}-${type}-${id}.${extensionFor(mimeType)}`,
    );
    file.copy(destination);
    const replaced = current.documents.find(document => document.type === type);
    if (replaced?.previewUrl) {
      try {
        const old = new File(replaced.previewUrl);
        if (old.exists) old.delete();
      } catch {
        // The replacement is already safe; stale local cleanup is best effort.
      }
    }
    const next: ProviderVerification = {
      ...current,
      status: 'draft',
      documents: [
        ...current.documents.filter(document => document.type !== type),
        {
          id,
          type,
          status: 'pending',
          previewUrl: destination.uri,
          mimeType,
          fileSizeBytes: size,
          createdAt: new Date().toISOString(),
        },
      ],
    };
    await writeMock(next);
    return next;
  },
  async remove(providerId, documentId) {
    const current = await readMock(providerId);
    if (!editableVerificationStatuses.includes(current.status)) {
      throw new Error('Verification documents are locked');
    }
    const document = current.documents.find(item => item.id === documentId);
    if (!document) throw new Error('Verification document not found');
    try {
      const file = new File(document.previewUrl);
      if (file.exists) file.delete();
    } catch {
      // Local metadata remains authoritative in mock mode.
    }
    const next = {
      ...current,
      status: 'draft' as const,
      documents: current.documents.filter(item => item.id !== documentId),
    };
    await writeMock(next);
    return next;
  },
  async submit(providerId, nationalId, hasSkillCertificate) {
    const current = await readMock(providerId);
    if (!editableVerificationStatuses.includes(current.status)) {
      throw new Error('Verification is already submitted');
    }
    if (normalizeNationalId(nationalId).length !== 14) {
      throw new Error('National ID must contain 14 digits');
    }
    if (
      requiredIdentityDocumentTypes.some(
        type => !current.documents.some(document => document.type === type),
      )
    ) {
      throw new Error('Required identity photos are missing');
    }
    if (
      hasSkillCertificate &&
      !current.documents.some(document => document.type === 'skill_certificate')
    ) {
      throw new Error('Skill Certificate photo is missing');
    }
    const next: ProviderVerification = {
      ...current,
      id: current.id ?? `mock-verification-${providerId}`,
      status: 'submitted',
      revision: current.revision + 1,
      skillCertificateAnswer: hasSkillCertificate ? 'yes' : 'no',
      rejectionReason: undefined,
      submittedAt: new Date().toISOString(),
      reviewedAt: undefined,
      expiresAt: undefined,
    };
    await writeMock(next);
    await createMockNotification(
      'verification_submitted',
      undefined,
      providerId,
      `verification:${next.revision}:submitted`,
    );
    return next;
  },
  async simulateReview(providerId, status) {
    const current = await readMock(providerId);
    if (current.status !== 'submitted' && current.status !== 'under_review') {
      throw new Error('Verification is not ready for review');
    }
    const approved = status === 'approved';
    const next: ProviderVerification = {
      ...current,
      status,
      identityVerified: approved,
      skillCertificateVerified:
        approved &&
        current.skillCertificateAnswer === 'yes' &&
        current.documents.some(document => document.type === 'skill_certificate'),
      rejectionReason:
        status === 'rejected'
          ? 'Please retake the front of your National ID in better light.'
          : status === 'requires_resubmission'
            ? 'Please add a clearer selfie.'
            : undefined,
      reviewedAt: new Date().toISOString(),
      expiresAt:
        status === 'approved'
          ? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
          : undefined,
    };
    await writeMock(next);
    const { providers } = await import('@/src/data/mock-data');
    const provider = providers.find(item => item.id === providerId);
    if (provider) {
      provider.verified = next.identityVerified;
      provider.skillCertificateVerified = next.skillCertificateVerified;
    }
    emitMockRealtime({ table: 'provider_profiles', event: 'UPDATE', id: providerId });
    await createMockNotification(
      status === 'requires_resubmission'
        ? 'verification_resubmission_requested'
        : `verification_${status}`,
      undefined,
      providerId,
      `verification:${next.revision}:${status}`,
    );
    return next;
  },
};

async function loadSupabase(): Promise<ProviderVerification> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('get_my_provider_verification');
  if (error) throw error;
  const mapped = mapVerification((data ?? {}) as Record<string, unknown>);
  const withPaths = mapped.documents.filter(document => document.storagePath);
  if (!withPaths.length) return mapped;
  const { data: signed, error: signedError } = await client.storage
    .from('verification-documents')
    .createSignedUrls(withPaths.map(document => document.storagePath!), 900);
  if (signedError) throw signedError;
  const urls = new Map(
    withPaths.map((document, index) => [
      document.id,
      signed?.[index]?.signedUrl ?? '',
    ]),
  );
  return {
    ...mapped,
    documents: mapped.documents.map(document => ({
      ...document,
      previewUrl: urls.get(document.id) ?? '',
    })),
  };
}

const supabaseRepository: VerificationRepository = {
  async load() {
    return loadSupabase();
  },
  async upload(providerId, type, input) {
    const { data: auth, error: authError } = await getSupabaseClient().auth.getUser();
    if (authError || !auth.user) throw authError ?? new Error('Authentication required');
    const { file, mimeType, size } = validatedFile(input);
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const path = `${auth.user.id}/${providerId}/${type}/${token}.${extensionFor(mimeType)}`;
    const client = getSupabaseClient();
    const { error: uploadError } = await client.storage
      .from('verification-documents')
      .upload(path, await file.arrayBuffer(), {
        contentType: mimeType,
        upsert: false,
      });
    if (uploadError) throw uploadError;
    const { error: registerError } = await client.rpc(
      'register_provider_verification_document',
      {
        p_document_type: type,
        p_storage_path: path,
        p_mime_type: mimeType,
        p_file_size_bytes: size,
      },
    );
    if (registerError) {
      await client.storage.from('verification-documents').remove([path]);
      throw registerError;
    }
    return loadSupabase();
  },
  async remove(_providerId, documentId) {
    const client = getSupabaseClient();
    const { data: path, error } = await client.rpc(
      'remove_provider_verification_document',
      { p_document_id: documentId },
    );
    if (error) throw error;
    if (typeof path === 'string') {
      await client.storage.from('verification-documents').remove([path]);
    }
    return loadSupabase();
  },
  async submit(_providerId, nationalId, hasSkillCertificate) {
    const { error } = await getSupabaseClient().rpc(
      'submit_provider_verification',
      {
        p_national_id: nationalId,
        p_has_skill_certificate: hasSkillCertificate,
      },
    );
    if (error) throw error;
    return loadSupabase();
  },
};

export const verificationRepository =
  environment.dataMode === 'supabase' ? supabaseRepository : mockRepository;
