export type ReviewSort = 'newest' | 'highest_rated' | 'lowest_rated' | 'most_helpful';
export type ReviewVote = 'helpful' | 'not_helpful';
export type ReviewReportReason = 'spam' | 'abuse' | 'fake_review' | 'offensive_content';

export type ReviewDimensions = {
  professionalism: number;
  quality: number;
  punctuality: number;
  communication: number;
  value: number;
};

export type ReviewAttachment = {
  id: string;
  url: string;
  mimeType?: string;
  size?: number;
  storagePath?: string;
  contentHash?: string;
};

export type ProviderReply = { id: string; body: string; createdAt: string };

export type BookingReview = {
  id: string;
  bookingId: string;
  providerId: string;
  reviewerName: string;
  rating: number;
  dimensions: ReviewDimensions;
  comment: string;
  isAnonymous: boolean;
  createdAt: string;
  editedAt?: string;
  editDeadlineAt?: string;
  canEdit: boolean;
  attachments: ReviewAttachment[];
  reply?: ProviderReply;
  helpfulCount: number;
  notHelpfulCount: number;
  myVote?: ReviewVote;
};

export type ReputationBadges = {
  identityVerified: boolean;
  skillCertificateVerified: boolean;
  professionalCertificateVerified: boolean;
  topRated: boolean;
  fastResponder: boolean;
  experienced: boolean;
};

export type RatingSummary = {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  dimensions: ReviewDimensions;
  reviews: BookingReview[];
  completedJobs: number;
  responseRate?: number;
  responseSample: number;
  completionRate?: number;
  completionSample: number;
  repeatCustomerPercentage?: number;
  repeatCustomerSample: number;
  yearsOnPlatform: number;
  badges: ReputationBadges;
  confidence: { score: number; policyVersion: string; evidenceSufficient: boolean };
  sort: ReviewSort;
};

export type ReviewInput = {
  bookingId: string;
  providerId: string;
  rating: number;
  dimensions: ReviewDimensions;
  comment: string;
  isAnonymous: boolean;
  attachments: ReviewAttachment[];
  previousAttachmentPaths?: string[];
};

export type ReviewReport = {
  id: string;
  reviewId: string;
  reason: ReviewReportReason;
  status: 'submitted' | 'in_review' | 'resolved' | 'dismissed';
  createdAt: string;
};

export const emptyDimensions = (): ReviewDimensions => ({ professionalism: 0, quality: 0, punctuality: 0, communication: 0, value: 0 });
