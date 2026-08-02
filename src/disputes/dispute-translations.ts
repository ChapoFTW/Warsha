import { useLocalization } from '@/src/i18n/localization';
import type { DisputeReason, DisputeState } from './dispute-types';

const copy = {
  en: {
    title: 'Dispute resolution', intro: 'Use this only when normal booking coordination cannot resolve a serious issue. Warsha reviews booking evidence fairly; opening a dispute does not automatically punish either person.',
    loading: 'Loading dispute', loadError: 'Could not load this dispute.', retry: 'Try again', open: 'Open a dispute', saveDraft: 'Save draft', submit: 'Submit for review', withdraw: 'Withdraw dispute', withdrawPrompt: 'Explain why you are withdrawing this dispute.',
    reason: 'What happened?', description: 'Describe what happened and the outcome you are asking for', descriptionHelp: 'Include facts that support staff review. Do not add phone numbers or unrelated personal information.',
    evidence: 'Evidence', evidenceHelp: 'Optional JPG, PNG, WebP, HEIC, or PDF. Up to 8 MB each and 10 files. Uploaded evidence is private and cannot be removed from the audit record.', addPhoto: 'Add photo', addFile: 'Add PDF', uploadFailed: 'Could not upload this evidence.', duplicateEvidence: 'This evidence is already attached.',
    timeline: 'Dispute timeline', linkedEvidence: 'Existing booking evidence', noEvidence: 'No private evidence uploaded yet.', noEvents: 'No submitted actions yet.', status: 'Status', eligibleUntil: 'Open until', actionFailed: 'Could not save this dispute update.',
    respond: 'Respond', response: 'Your response', acceptResponsibility: 'Accept responsibility', contest: 'Contest dispute', responseHelp: 'Your response is also added to the existing booking conversation.',
    waiting: 'Warsha support will review the booking record and may ask either person for more evidence.', reviewHold: 'An active submitted dispute may temporarily delay public review publication. It does not change review content or provider ranking.',
    resolution: 'Resolution', financialDelegation: 'Any money action is handled only by the existing Warsha financial workflow.', returnVisit: 'A return visit stays linked to this booking and its history.',
    source_bookingTimeline: 'Booking timeline', source_attachments: 'Booking attachments', source_messages: 'Conversation messages', source_operationEvents: 'Operational timeline, inspections, and checklists', source_progressPhotos: 'Progress photos', source_additionalWork: 'Additional-work records', source_returnVisits: 'Return visits', source_reviews: 'Review', source_reviewReplies: 'Provider reply', source_noShowReports: 'No-show reports', source_warrantyRecorded: 'Warranty record',
    reason_work_incomplete: 'Work incomplete', reason_poor_quality: 'Quality issue', reason_property_damage: 'Property damage', reason_incorrect_additional_work: 'Incorrect additional work', reason_pricing_disagreement: 'Price disagreement', reason_warranty_disagreement: 'Warranty disagreement', reason_worker_never_arrived: 'Worker did not arrive', reason_customer_unavailable: 'Customer unavailable', reason_safety_issue: 'Safety issue', reason_other: 'Other',
    state_draft: 'Draft', state_submitted: 'Submitted', state_waiting_customer: 'Waiting for customer', state_waiting_worker: 'Waiting for worker', state_waiting_staff: 'Waiting for support', state_under_review: 'Under review', state_resolved: 'Resolved', state_closed: 'Closed', state_rejected: 'Rejected', state_cancelled: 'Withdrawn',
    event_draft_created: 'Draft created', event_submitted: 'Dispute submitted', event_customer_response: 'Customer responded', event_worker_response: 'Worker responded', event_worker_accepted_responsibility: 'Worker accepted responsibility', event_worker_contested: 'Worker contested the dispute', event_evidence_submitted: 'Evidence added', event_assigned: 'Support case assigned', event_evidence_requested: 'More evidence requested', event_review_started: 'Support review started', event_staff_update: 'Support update', event_resolved: 'Dispute resolved', event_rejected: 'Dispute rejected', event_closed: 'Dispute closed', event_cancelled: 'Dispute withdrawn',
  },
  ar: {
    title: 'حل النزاع', intro: 'استخدم المسار ده بس لو تنسيق الحجز العادي مقدرش يحل مشكلة جدية. ورشة بتراجع أدلة الحجز بعدل، وفتح النزاع مش معناه عقوبة تلقائية لأي طرف.',
    loading: 'جاري تحميل النزاع', loadError: 'مقدرناش نحمل النزاع ده.', retry: 'حاول تاني', open: 'افتح نزاع', saveDraft: 'احفظ كمسودة', submit: 'ابعت للمراجعة', withdraw: 'اسحب النزاع', withdrawPrompt: 'اشرح ليه بتسحب النزاع.',
    reason: 'إيه اللي حصل؟', description: 'اشرح اللي حصل والنتيجة اللي بتطلبها', descriptionHelp: 'اكتب الوقائع اللي تساعد فريق الدعم. متكتبش أرقام تليفونات أو بيانات شخصية ملهاش علاقة.',
    evidence: 'الأدلة', evidenceHelp: 'اختياري: JPG أو PNG أو WebP أو HEIC أو PDF. كل ملف لحد ٨ ميجابايت وبحد أقصى ١٠ ملفات. الأدلة خاصة ومبتتمسحش من سجل المراجعة.', addPhoto: 'ضيف صورة', addFile: 'ضيف PDF', uploadFailed: 'مقدرناش نرفع الدليل ده.', duplicateEvidence: 'الدليل ده مرفوع قبل كده.',
    timeline: 'سجل النزاع', linkedEvidence: 'أدلة الحجز الموجودة', noEvidence: 'مفيش أدلة خاصة مرفوعة لسه.', noEvents: 'مفيش إجراءات مبعوتة لسه.', status: 'الحالة', eligibleUntil: 'متاح لحد', actionFailed: 'مقدرناش نحفظ تحديث النزاع.',
    respond: 'رد', response: 'ردك', acceptResponsibility: 'اقبل المسؤولية', contest: 'اعترض على النزاع', responseHelp: 'ردك بيتضاف كمان لمحادثة الحجز الموجودة.',
    waiting: 'فريق دعم ورشة هيراجع سجل الحجز وممكن يطلب أدلة زيادة من أي طرف.', reviewHold: 'النزاع المقدم ممكن يأخر نشر التقييم مؤقتًا. مش بيغير محتوى التقييم أو ترتيب الصنايعي.',
    resolution: 'القرار', financialDelegation: 'أي إجراء مالي بيتم بس عن طريق نظام ورشة المالي الموجود.', returnVisit: 'زيارة الرجوع بتفضل مربوطة بنفس الحجز وسجله.',
    source_bookingTimeline: 'سجل الحجز', source_attachments: 'مرفقات الحجز', source_messages: 'رسائل المحادثة', source_operationEvents: 'سجل التنفيذ والمعاينة وقوايم المراجعة', source_progressPhotos: 'صور تقدم الشغل', source_additionalWork: 'سجل الشغل الإضافي', source_returnVisits: 'زيارات الرجوع', source_reviews: 'التقييم', source_reviewReplies: 'رد الصنايعي', source_noShowReports: 'بلاغات عدم الحضور', source_warrantyRecorded: 'سجل الضمان',
    reason_work_incomplete: 'الشغل مكملش', reason_poor_quality: 'مشكلة في الجودة', reason_property_damage: 'تلف في الممتلكات', reason_incorrect_additional_work: 'شغل إضافي غير صحيح', reason_pricing_disagreement: 'خلاف على السعر', reason_warranty_disagreement: 'خلاف على الضمان', reason_worker_never_arrived: 'الصنايعي مجاش', reason_customer_unavailable: 'العميل مكنش متاح', reason_safety_issue: 'مشكلة أمان', reason_other: 'سبب تاني',
    state_draft: 'مسودة', state_submitted: 'اتقدم', state_waiting_customer: 'مستني العميل', state_waiting_worker: 'مستني الصنايعي', state_waiting_staff: 'مستني الدعم', state_under_review: 'تحت المراجعة', state_resolved: 'اتحل', state_closed: 'اتقفل', state_rejected: 'اترفض', state_cancelled: 'اتسحب',
    event_draft_created: 'اتعملت مسودة', event_submitted: 'النزاع اتقدم', event_customer_response: 'العميل رد', event_worker_response: 'الصنايعي رد', event_worker_accepted_responsibility: 'الصنايعي قبل المسؤولية', event_worker_contested: 'الصنايعي اعترض على النزاع', event_evidence_submitted: 'اتضاف دليل', event_assigned: 'اتعين فريق دعم للحالة', event_evidence_requested: 'اتطلبت أدلة زيادة', event_review_started: 'مراجعة الدعم بدأت', event_staff_update: 'تحديث من الدعم', event_resolved: 'النزاع اتحل', event_rejected: 'النزاع اترفض', event_closed: 'النزاع اتقفل', event_cancelled: 'النزاع اتسحب',
  },
} as const;

export type DisputeCopyKey = keyof typeof copy.en;
export function useDisputeText() { const { language } = useLocalization(); return (key: DisputeCopyKey) => copy[language][key]; }
export const disputeReasonKey = (reason: DisputeReason) => `reason_${reason}` as DisputeCopyKey;
export const disputeStateKey = (state: DisputeState) => `state_${state}` as DisputeCopyKey;
export function disputeEventKey(event: string): DisputeCopyKey | undefined {
  const key = `event_${event}` as DisputeCopyKey;
  return key in copy.en ? key : undefined;
}
