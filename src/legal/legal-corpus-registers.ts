/**
 * WPS-024 — the registers and the platform documents.
 *
 * A register is a published inventory. Its value is entirely in being complete
 * and current, which is why each of these has a machine-readable counterpart
 * in the database (`private.subprocessors`, `private.processing_activities`,
 * `private.privacy_retention_rules`) and the regression suite asserts the two
 * agree. A register that drifts from what the system actually does is worse
 * than no register, because it is read as a guarantee.
 *
 * Two entries below say "approved, not yet in use". That is not a hedge — it
 * is the accurate state, and stating it is what makes the register worth
 * reading. Someone can see what is coming before it arrives, which is exactly
 * what a subprocessor register is for.
 */

import type { LegalDocument } from './legal-types.ts';

const PUBLISHED = '2026-08-06';

function initial(summaryEn: string, summaryAr: string) {
  return {
    version: '1.0',
    publishedAt: PUBLISHED,
    effectiveAt: PUBLISHED,
    supersedesVersion: null,
    changeClass: 'initial' as const,
    changeSummary: { en: summaryEn, ar: summaryAr },
    authoritativeLanguage: 'en' as const,
    requiresAcceptance: false,
    arabicIsSummary: true,
  };
}

export const subprocessorRegister: LegalDocument = {
  key: 'subprocessor_register',
  category: 'register',
  audience: 'public',
  sortOrder: 19,
  ...initial(
    'First published version of the subprocessor register.',
    'أول نسخة منشورة من سجل المعالِجات الفرعية.',
  ),
  en: {
    title: 'Subprocessor Register',
    summary: 'Every supplier that processes personal data for Warsha, what it processes, where, and whether it is in use yet.',
    sections: [
      {
        heading: 'How to read this register',
        body: [
          'A subprocessor is a supplier that processes personal data on Warsha\'s behalf. Every one is listed here before it processes anything.',
          'Each entry states its status. "In use" means it is processing data now. "Approved, not yet in use" means a governance decision has been taken and the integration has not been built — no data has reached it.',
          'Adding a subprocessor, or moving one from approved to in use, is a material change to the Privacy Policy. You are told who, for what, and where, before it takes effect.',
        ],
      },
      {
        heading: 'Supabase — in use',
        body: [
          'Purpose: the database, authentication, file storage and realtime messaging that the platform runs on.',
          'Data: all personal data Warsha holds — accounts, bookings, messages, payments, addresses, identity documents and criminal-record certificates.',
          'Location: managed cloud infrastructure. The region in force is recorded in the operational configuration.',
          'Safeguards: access enforced in the database on every table; identity documents in private storage reached only through short-lived links; staff access logged.',
        ],
      },
      {
        heading: 'Expo Application Services — in use, limited',
        body: [
          'Purpose: building and distributing the mobile applications.',
          'Data: build artefacts and crash diagnostics where you have not turned diagnostics off. No account data, no bookings, no messages, no documents.',
          'Over-the-air updates are configured but not enabled in this version, so no update channel is serving this application.',
        ],
      },
      {
        heading: 'Google Cloud Vision — approved, not yet in use',
        body: [
          'Purpose: extracting the text printed on a worker\'s National ID so the worker does not have to type it.',
          'Data, when in use: the identity document image, server-side only. Never called from a phone. Only extracted fields return to the device; the raw response is not retained.',
          'Status: no document has been sent. Identity fields are entered by hand in this version.',
          'Conditions of engagement: provider terms must prohibit using Warsha data to improve the provider\'s own models. Turning this on requires a new version of the OCR Usage Policy, the AI Usage Policy and the Privacy Policy, and renewed acceptance from affected workers.',
        ],
      },
      {
        heading: 'Google Maps Platform — approved, not yet in use',
        body: [
          'Purpose: displaying a map, searching an address, and converting between an address and coordinates.',
          'Data, when in use: the address text you search and the coordinates of the pin you are placing. Not a movement history — Warsha collects no background location.',
          'Status: not integrated. Address search and device positioning report as unavailable, and manual pin placement is the working path. Warsha does not display a map that pretends to be live when no provider is configured.',
          'Turning this on requires a new version of the Location Data Policy and the Privacy Policy, and renewed acceptance.',
        ],
      },
      {
        heading: 'Payments',
        body: [
          'No payment gateway is engaged. Production payment processing is disabled in this version and no card data is processed by any supplier on Warsha\'s behalf.',
          'Engaging a gateway will be a material change, will add an entry here, and will require renewed acceptance before any payment is processed through it.',
        ],
      },
      {
        heading: 'Not used',
        body: [
          'Warsha uses no advertising network, no analytics supplier that identifies you, no data broker, no email marketing platform, and no supplier that receives identity documents other than as stated above.',
        ],
      },
    ],
  },
  ar: {
    title: 'سجل المعالِجات الفرعية',
    summary:
      'ملخّص عربي كامل للسجل. النص الإنجليزي هو الحاكم. كل مورد بيعالج بيانات شخصية لورشة، وبيعالج إيه، وفين، وإذا كان مستخدم لسه ولا لأ.',
    sections: [
      {
        heading: 'تقرا السجل ده إزاي',
        body: [
          'المعالِج الفرعي مورد بيعالج بيانات شخصية نيابةً عن ورشة. كل واحد مذكور هنا قبل ما يعالج أي حاجة.',
          'كل مدخل بيوضّح حالته. «مستخدم» يعني بيعالج بيانات دلوقتي. «معتمد ومش مستخدم لسه» يعني قرار حوكمة اتاخد والدمج ما اتبناش — مفيش بيانات وصلت له.',
          'إضافة معالِج فرعي، أو نقل واحد من معتمد لمستخدم، تعديل جوهري لسياسة الخصوصية. بيتقالك مين وليه وفين، قبل ما يسري.',
        ],
      },
      {
        heading: 'Supabase — مستخدم',
        body: [
          'الغرض: قاعدة البيانات والمصادقة وتخزين الملفات والرسائل الفورية اللي المنصة شغالة عليها.',
          'البيانات: كل البيانات الشخصية اللي ورشة بتحتفظ بيها — الحسابات والحجوزات والرسايل والمدفوعات والعناوين ومستندات الهوية والفيش والتشبيه.',
          'الموقع: بنية سحابية مُدارة. المنطقة السارية مسجّلة في الإعدادات التشغيلية.',
          'الضمانات: الوصول مفروض في قاعدة البيانات على كل جدول؛ مستندات الهوية في تخزين خاص بيتوصله بس من خلال روابط قصيرة العمر؛ وصول الفريق بيتسجّل.',
        ],
      },
      {
        heading: 'Expo Application Services — مستخدم بشكل محدود',
        body: [
          'الغرض: بناء وتوزيع تطبيقات الموبايل.',
          'البيانات: مخرجات البناء وتشخيص الأعطال لو ما قفلتش التشخيص. مفيش بيانات حسابات ولا حجوزات ولا رسايل ولا مستندات.',
          'التحديثات الفورية مضبوطة لكن مش مفعّلة في النسخة دي، فمفيش قناة تحديث بتخدم التطبيق ده.',
        ],
      },
      {
        heading: 'Google Cloud Vision — معتمد ومش مستخدم لسه',
        body: [
          'الغرض: استخراج النص المطبوع على بطاقة الصنايعي علشان ما يضطرش يكتبه.',
          'البيانات، لما يتستخدم: صورة مستند الهوية، من الخادم بس. مش بيتنادى من تليفون أبداً. البيانات المستخرجة بس هي اللي بترجع للجهاز؛ والرد الخام مش بيتحفظ.',
          'الحالة: مفيش مستند اتبعت. بيانات الهوية بتتكتب بالإيد في النسخة دي.',
          'شروط التعاقد: شروط المزوّد لازم تمنع استخدام بيانات ورشة في تحسين نماذج المزوّد نفسه. تشغيل ده بيتطلب نسخة جديدة من سياسة التعرف الضوئي وسياسة الذكاء الاصطناعي وسياسة الخصوصية، وموافقة متجدّدة من الصنايعية المتأثرين.',
        ],
      },
      {
        heading: 'Google Maps Platform — معتمد ومش مستخدم لسه',
        body: [
          'الغرض: عرض خريطة، والبحث عن عنوان، والتحويل بين العنوان والإحداثيات.',
          'البيانات، لما يتستخدم: نص العنوان اللي بتدوّر عليه وإحداثيات الدبوس اللي بتحطّه. مش تاريخ تحركات — ورشة مش بتجمع موقع في الخلفية.',
          'الحالة: مش مدمج. البحث بالعنوان وتحديد موقع الجهاز بيتقالهم غير متاحين، وحطّ الدبوس اليدوي هو المسار الشغال. ورشة مش بتعرض خريطة بتدّعي إنها حية والمزوّد مش مضبوط.',
          'تشغيل ده بيتطلب نسخة جديدة من سياسة بيانات الموقع وسياسة الخصوصية، وموافقة متجدّدة.',
        ],
      },
      {
        heading: 'المدفوعات',
        body: [
          'مفيش بوابة دفع متعاقد معاها. معالجة المدفوعات الإنتاجية معطّلة في النسخة دي ومفيش بيانات كروت بتتعالج من أي مورد نيابةً عن ورشة.',
          'التعاقد مع بوابة هيبقى تعديل جوهري، وهيضيف مدخل هنا، وهيتطلب موافقة متجدّدة قبل ما أي دفعة تتعالج من خلاله.',
        ],
      },
      {
        heading: 'غير مستخدم',
        body: [
          'ورشة مش بتستخدم أي شبكة إعلانات، ولا مورد تحليلات بيحدّد هويتك، ولا وسيط بيانات، ولا منصة تسويق بالإيميل، ولا أي مورد بيستلم مستندات هوية غير المذكور فوق.',
        ],
      },
    ],
  },
};

export const dataProcessingRegister: LegalDocument = {
  key: 'data_processing_register',
  category: 'register',
  audience: 'public',
  sortOrder: 20,
  ...initial(
    'First published version of the data processing register.',
    'أول نسخة منشورة من سجل معالجة البيانات.',
  ),
  en: {
    title: 'Data Processing Register',
    summary: 'Every processing activity Warsha performs, its purpose, its data, its proposed basis and its review status.',
    sections: [
      {
        heading: 'How to read this register',
        body: [
          'Each activity states a purpose, the categories of data it uses, who the data concerns, who receives it, and the basis Warsha proposes for it.',
          'A basis marked "pending legal review" means Warsha has recorded the basis it proposes and has not obtained confirmation. As at this version, every basis is pending. Warsha states that rather than asserting a settled position it does not hold.',
          'The machine-readable register in the platform is the authoritative inventory; this document is its published form, and the regression suite asserts the two agree.',
        ],
      },
      {
        heading: 'Account and authentication',
        body: [
          'Purpose: create and secure an account, sign a person in, and recover access.',
          'Data: name, phone number, optional email, authentication state.',
          'Subjects: customers, workers, staff. Recipients: Supabase. Basis: performance of the agreement (pending review).',
        ],
      },
      {
        heading: 'Worker verification',
        body: [
          'Purpose: establish who a worker is before they enter a customer\'s home.',
          'Data: National ID images, identity fields, criminal-record certificate, reviewer assessments.',
          'Subjects: workers. Recipients: Supabase; verification staff holding the specific capability. Basis: substantial public interest in safety, and performance of the agreement (both pending review).',
          'Retention: original document at least one year from upload. Offence detail confined to a private reviewer record, never exported, never returned to a client.',
        ],
      },
      {
        heading: 'Bookings and job execution',
        body: [
          'Purpose: arrange, perform, track and complete work.',
          'Data: booking details, scheduling, addresses and confirmed pins, job records and photographs.',
          'Subjects: customers and workers. Basis: performance of the agreement (pending review).',
        ],
      },
      {
        heading: 'Messaging',
        body: [
          'Purpose: let the two sides of a booking communicate, and provide evidence for a dispute.',
          'Data: message content and metadata within a booking.',
          'Basis: performance of the agreement, and legitimate interest in dispute resolution (pending review). Messages are not read routinely; access for a report or dispute is logged.',
        ],
      },
      {
        heading: 'Payments and earnings',
        body: [
          'Purpose: collect payment, calculate commission, record earnings, make payouts, process refunds.',
          'Data: amounts, methods, ledger entries, payout records. No full card number.',
          'Basis: performance of the agreement, and legal obligation for financial records (pending review).',
        ],
      },
      {
        heading: 'Trust, safety and moderation',
        body: [
          'Purpose: prevent and respond to harm, fraud and abuse.',
          'Data: reports, moderation records, trust state, enforcement decisions and their evidence.',
          'Basis: legitimate interest in user safety, and legal obligation where reporting is required (pending review).',
        ],
      },
      {
        heading: 'Reviews and reputation',
        body: [
          'Purpose: let customers see how a worker has performed.',
          'Data: ratings, review text, replies, aggregate scores.',
          'Recipients: other users, for the public parts. Basis: performance of the agreement (pending review).',
        ],
      },
      {
        heading: 'Support',
        body: [
          'Purpose: answer questions and resolve problems.',
          'Data: support conversations, case records, and the account context an agent needs.',
          'Basis: performance of the agreement (pending review). An agent sees the case, not identity documents.',
        ],
      },
      {
        heading: 'Notifications',
        body: [
          'Purpose: tell someone something they need to know about their account or a booking.',
          'Data: event type, target account, delivery state. Payloads carry a state and nothing more — no identity number, no filename, no offence text, no address, no staff note.',
          'Basis: performance of the agreement for service messages; consent for optional messages (pending review).',
        ],
      },
      {
        heading: 'Consent and agreements',
        body: [
          'Purpose: record which version of which document a person accepted, in which language, and when.',
          'Data: account, document key, version, decision, timestamp, language, acceptance hash, source surface, role.',
          'Basis: legal obligation to demonstrate consent, and performance of the agreement (pending review). Records are append-only and are never rewritten.',
        ],
      },
      {
        heading: 'Diagnostics',
        body: [
          'Purpose: find and fix faults.',
          'Data: application version, platform, crash traces. No message content, no addresses, no identity data.',
          'Basis: consent. Off unless turned on, and withdrawable at any time.',
        ],
      },
    ],
  },
  ar: {
    title: 'سجل معالجة البيانات',
    summary:
      'ملخّص عربي كامل للسجل. النص الإنجليزي هو الحاكم. كل نشاط معالجة بتعمله ورشة، وغرضه، وبياناته، وأساسه المقترح، وحالة مراجعته.',
    sections: [
      {
        heading: 'تقرا السجل ده إزاي',
        body: [
          'كل نشاط بيوضّح غرض، وفئات البيانات اللي بيستخدمها، والبيانات بتخصّ مين، ومين بيستلمها، والأساس اللي ورشة بتقترحه ليه.',
          'الأساس المعلّم «قيد المراجعة القانونية» معناه إن ورشة سجّلت الأساس اللي بتقترحه وما حصلتش على تأكيد. لحد النسخة دي، كل أساس قيد المراجعة. ورشة بتقول كده بدل ما تدّعي موقف محسوم مش عندها.',
          'السجل القابل للقراءة الآلية في المنصة هو الجرد الحاكم؛ والمستند ده صيغته المنشورة، وحزمة الاختبارات بتتأكد إن الاتنين متطابقين.',
        ],
      },
      {
        heading: 'الحساب والمصادقة',
        body: [
          'الغرض: إنشاء وتأمين حساب، وتسجيل دخول الشخص، واستعادة الوصول.',
          'البيانات: الاسم ورقم التليفون والإيميل الاختياري وحالة المصادقة.',
          'الأشخاص: العملاء والصنايعية والفريق. المستلمون: Supabase. الأساس: تنفيذ الاتفاق (قيد المراجعة).',
        ],
      },
      {
        heading: 'التحقق من الصنايعي',
        body: [
          'الغرض: إثبات الصنايعي مين قبل ما يدخل بيت عميل.',
          'البيانات: صور البطاقة وبيانات الهوية والفيش والتشبيه وتقييمات المراجعين.',
          'الأشخاص: الصنايعية. المستلمون: Supabase؛ وفريق التحقق اللي عنده الصلاحية المحدّدة. الأساس: مصلحة عامة جوهرية في الأمان، وتنفيذ الاتفاق (الاتنين قيد المراجعة).',
          'الاحتفاظ: المستند الأصلي سنة على الأقل من الرفع. تفاصيل المخالفات محصورة في سجل مراجع خاص، مش بتتصدّر أبداً، ومش بترجع لأي عميل.',
        ],
      },
      {
        heading: 'الحجوزات وتنفيذ الشغل',
        body: [
          'الغرض: ترتيب وأداء ومتابعة وإتمام الشغل.',
          'البيانات: تفاصيل الحجز والمواعيد والعناوين والدبابيس المؤكَّدة وسجلات الشغل والصور.',
          'الأشخاص: العملاء والصنايعية. الأساس: تنفيذ الاتفاق (قيد المراجعة).',
        ],
      },
      {
        heading: 'الرسايل',
        body: [
          'الغرض: تخلّي طرفي الحجز يتواصلوا، وتوفّر أدلة لأي نزاع.',
          'البيانات: محتوى الرسايل وبياناتها الوصفية جوه الحجز.',
          'الأساس: تنفيذ الاتفاق، ومصلحة مشروعة في حل النزاعات (قيد المراجعة). الرسايل مش بتتقرا بشكل روتيني؛ والوصول لبلاغ أو نزاع بيتسجّل.',
        ],
      },
      {
        heading: 'المدفوعات والأرباح',
        body: [
          'الغرض: تحصيل الدفع، وحساب العمولة، وتسجيل الأرباح، وعمل التحويلات، ومعالجة الاستردادات.',
          'البيانات: المبالغ والطرق وقيود الدفتر وسجلات التحويل. مفيش رقم كارت كامل.',
          'الأساس: تنفيذ الاتفاق، والالتزام القانوني بالسجلات المالية (قيد المراجعة).',
        ],
      },
      {
        heading: 'الثقة والأمان والمراجعة',
        body: [
          'الغرض: منع الضرر والغش والإساءة والرد عليهم.',
          'البيانات: البلاغات وسجلات المراجعة وحالة الثقة وقرارات الإنفاذ وأدلتها.',
          'الأساس: مصلحة مشروعة في أمان المستخدمين، والتزام قانوني لما الإبلاغ يكون مطلوب (قيد المراجعة).',
        ],
      },
      {
        heading: 'المراجعات والسمعة',
        body: [
          'الغرض: تخلّي العملاء يشوفوا الصنايعي أدّى إزاي.',
          'البيانات: التقييمات ونص المراجعات والردود والدرجات المجمّعة.',
          'المستلمون: المستخدمون التانيون، للأجزاء العامة. الأساس: تنفيذ الاتفاق (قيد المراجعة).',
        ],
      },
      {
        heading: 'الدعم',
        body: [
          'الغرض: الرد على الأسئلة وحل المشاكل.',
          'البيانات: محادثات الدعم وسجلات الحالات وسياق الحساب اللي الموظف محتاجه.',
          'الأساس: تنفيذ الاتفاق (قيد المراجعة). الموظف بيشوف الحالة، مش مستندات الهوية.',
        ],
      },
      {
        heading: 'الإشعارات',
        body: [
          'الغرض: إبلاغ حد بحاجة محتاج يعرفها عن حسابه أو عن حجز.',
          'البيانات: نوع الحدث والحساب المستهدف وحالة التسليم. الحمولات بتحمل حالة وبس — مفيش رقم هوية ولا اسم ملف ولا نص مخالفة ولا عنوان ولا ملاحظة فريق.',
          'الأساس: تنفيذ الاتفاق لرسايل الخدمة؛ والموافقة للرسايل الاختيارية (قيد المراجعة).',
        ],
      },
      {
        heading: 'الموافقات والاتفاقات',
        body: [
          'الغرض: تسجيل أنهي نسخة من أنهي مستند وافق عليها الشخص، وبأي لغة، وإمتى.',
          'البيانات: الحساب ومفتاح المستند والنسخة والقرار والتوقيت واللغة وبصمة الموافقة وسطح المصدر والدور.',
          'الأساس: التزام قانوني بإثبات الموافقة، وتنفيذ الاتفاق (قيد المراجعة). السجلات بتتضاف بس ومش بتتعاد كتابتها أبداً.',
        ],
      },
      {
        heading: 'التشخيص',
        body: [
          'الغرض: إيجاد الأعطال وإصلاحها.',
          'البيانات: نسخة التطبيق والمنصة وآثار الأعطال. مفيش محتوى رسايل ولا عناوين ولا بيانات هوية.',
          'الأساس: الموافقة. مقفول غير لما يتفتح، وقابل للسحب في أي وقت.',
        ],
      },
    ],
  },
};

export const dataRetentionRegister: LegalDocument = {
  key: 'data_retention_register',
  category: 'register',
  audience: 'public',
  sortOrder: 21,
  ...initial(
    'First published version of the data retention register.',
    'أول نسخة منشورة من سجل الاحتفاظ بالبيانات.',
  ),
  en: {
    title: 'Data Retention Register',
    summary: 'How long each category is kept, what triggers the clock, and what happens at the end of it.',
    sections: [
      {
        heading: 'How to read this register',
        body: [
          'Each entry has a trigger — the event the period runs from — a period, an action at expiry, and a review status.',
          '"Pending legal review" means the period is a proposal Warsha has recorded, with no statutory basis claimed. Where that is the status, the action at expiry is manual review rather than deletion, and the rule is disabled so nothing can execute against it.',
          'As at this version, no retention rule created by Warsha is enabled. Nothing is being deleted automatically.',
        ],
      },
      {
        heading: 'Identity documents',
        body: [
          'Trigger: upload. Minimum: one year, set by Warsha for evidential reasons and not claimed as a statutory period.',
          'Longer retention on worker account closure is proposed and pending legal review; the action at expiry is manual review.',
          'Treatment: never exported. Reduced review copy used for ordinary review; original opened only when necessary, and every open logged.',
        ],
      },
      {
        heading: 'Criminal-record certificates',
        body: [
          'Trigger: worker account closure. Period: proposed, pending legal review, no statutory basis claimed. Action at expiry: manual review.',
          'Treatment: never exported. Offence detail confined to a private reviewer record.',
        ],
      },
      {
        heading: 'Extraction candidates',
        body: [
          'Trigger: the worker confirming their identity fields. Proposed period: short, pending review. Action at expiry: delete.',
          'Unconfirmed machine output should not outlive the confirmation it existed to help with.',
        ],
      },
      {
        heading: 'Bookings, payments and disputes',
        body: [
          'Trigger: completion or resolution. Retained beyond account closure because the record concerns two people and may be needed by the other, and because financial records carry obligations.',
          'Treatment on account closure: anonymised. The transaction survives; the person does not.',
        ],
      },
      {
        heading: 'Messages',
        body: [
          'Trigger: booking completion. Retained long enough for a dispute raised afterwards to be decided on evidence.',
          'Treatment on account closure: anonymised.',
        ],
      },
      {
        heading: 'Consent and agreement acceptances',
        body: [
          'Trigger: none while the account exists. Acceptance records are append-only and are retained as long as the obligation to demonstrate consent lasts.',
          'A withdrawal appends a new decision; the earlier record is never edited or removed. Treatment on account closure: preserved, minimised.',
        ],
      },
      {
        heading: 'Support cases',
        body: [
          'Trigger: case closure. Retained so a reopened matter has its history.',
          'Treatment on account closure: anonymised.',
        ],
      },
      {
        heading: 'Diagnostics',
        body: ['Trigger: collection. Short retention. Action at expiry: delete. Contains no personal content.'],
      },
      {
        heading: 'Legal holds',
        body: [
          'A record under legal hold is exempt from every rule above. Retention is suspended and deletion is refused, including a deletion the person requested, and they are told their request is blocked.',
        ],
      },
    ],
  },
  ar: {
    title: 'سجل الاحتفاظ بالبيانات',
    summary:
      'ملخّص عربي كامل للسجل. النص الإنجليزي هو الحاكم. كل فئة بتتحفظ قد إيه، وإيه اللي بيبدأ العدّاد، وبيحصل إيه في آخره.',
    sections: [
      {
        heading: 'تقرا السجل ده إزاي',
        body: [
          'كل مدخل ليه مُحفّز — الحدث اللي المدة بتمشي منه — ومدة، وإجراء عند الانتهاء، وحالة مراجعة.',
          '«قيد المراجعة القانونية» معناها إن المدة اقتراح سجّلته ورشة، من غير ادّعاء أساس قانوني. لما دي تكون الحالة، الإجراء عند الانتهاء بيبقى مراجعة يدوية مش حذف، والقاعدة بتبقى معطّلة علشان مفيش حاجة تقدر تتنفّذ عليها.',
          'لحد النسخة دي، مفيش قاعدة احتفاظ أنشأتها ورشة مفعّلة. مفيش حاجة بتتحذف آلياً.',
        ],
      },
      {
        heading: 'مستندات الهوية',
        body: [
          'المُحفّز: الرفع. الحد الأدنى: سنة، حطّتها ورشة لأسباب إثباتية ومش مُدّعاة كمدة قانونية.',
          'الاحتفاظ الأطول عند قفل حساب الصنايعي مقترَح وقيد المراجعة القانونية؛ والإجراء عند الانتهاء مراجعة يدوية.',
          'التعامل: مش بتتصدّر أبداً. نسخة مراجعة مصغّرة بتُستخدم في المراجعة العادية؛ والأصل بيتفتح بس عند الضرورة، وكل فتح بيتسجّل.',
        ],
      },
      {
        heading: 'الفيش والتشبيه',
        body: [
          'المُحفّز: قفل حساب الصنايعي. المدة: مقترَحة، قيد المراجعة القانونية، مفيش أساس قانوني مُدّعى. الإجراء عند الانتهاء: مراجعة يدوية.',
          'التعامل: مش بتتصدّر أبداً. تفاصيل المخالفات محصورة في سجل مراجع خاص.',
        ],
      },
      {
        heading: 'مرشحات الاستخراج',
        body: [
          'المُحفّز: تأكيد الصنايعي لبيانات هويته. المدة المقترَحة: قصيرة، قيد المراجعة. الإجراء عند الانتهاء: حذف.',
          'مخرجات الآلة غير المؤكَّدة المفروض ما تعيشش أكتر من التأكيد اللي وُجدت علشانه.',
        ],
      },
      {
        heading: 'الحجوزات والمدفوعات والنزاعات',
        body: [
          'المُحفّز: الإتمام أو الحل. بتتحفظ بعد قفل الحساب لأن السجل بيخصّ شخصين وممكن التاني يحتاجه، ولأن السجلات المالية عليها التزامات.',
          'التعامل عند قفل الحساب: تجهيل. المعاملة بتفضل؛ الشخص لأ.',
        ],
      },
      {
        heading: 'الرسايل',
        body: [
          'المُحفّز: إتمام الحجز. بتتحفظ مدة كافية علشان النزاع اللي بيتطرح بعدين يتحكم فيه بالأدلة.',
          'التعامل عند قفل الحساب: تجهيل.',
        ],
      },
      {
        heading: 'الموافقات وقبول الاتفاقات',
        body: [
          'المُحفّز: مفيش طول ما الحساب موجود. سجلات القبول بتتضاف بس وبتتحفظ طول ما الالتزام بإثبات الموافقة قايم.',
          'السحب بيضيف قرار جديد؛ والسجل الأقدم مش بيتعدّل ولا بيتشال أبداً. التعامل عند قفل الحساب: محفوظ بأقل قدر.',
        ],
      },
      {
        heading: 'حالات الدعم',
        body: [
          'المُحفّز: قفل الحالة. بتتحفظ علشان الموضوع اللي بيتفتح تاني يكون له تاريخه.',
          'التعامل عند قفل الحساب: تجهيل.',
        ],
      },
      {
        heading: 'التشخيص',
        body: ['المُحفّز: الجمع. احتفاظ قصير. الإجراء عند الانتهاء: حذف. مفيهوش محتوى شخصي.'],
      },
      {
        heading: 'الحجوزات القانونية',
        body: [
          'السجل تحت الحجز القانوني مستثنى من كل قاعدة فوق. الاحتفاظ بيتوقف والحذف بيترفض، بما في ذلك الحذف اللي الشخص طلبه، وبيتقاله إن طلبه محجوب.',
        ],
      },
    ],
  },
};

export const incidentResponsePolicy: LegalDocument = {
  key: 'incident_response_policy',
  category: 'platform',
  audience: 'public',
  sortOrder: 22,
  ...initial(
    'First published version of the incident response policy.',
    'أول نسخة منشورة من سياسة الاستجابة للحوادث.',
  ),
  en: {
    title: 'Incident Response Policy',
    summary: 'What Warsha does when something goes wrong with data or security, and when it will tell you.',
    sections: [
      {
        heading: '1. What counts as an incident',
        body: [
          'Unauthorised access to personal data. Loss or corruption of it. A weakness that exposed it, whether or not anyone used the weakness. A supplier telling Warsha that one of these happened to them.',
          'A service outage is not an incident under this policy unless data was affected.',
        ],
      },
      {
        heading: '2. What happens first',
        body: [
          'Contain: stop the exposure. This comes before understanding it, because an exposure that is still open is getting worse while it is being analysed.',
          'Preserve: keep the logs and evidence needed to establish what happened, before anything is changed.',
          'Assess: what data, whose, how much, and for how long.',
        ],
      },
      {
        heading: '3. Telling people',
        body: [
          'Warsha tells affected people when their data was involved, without waiting for the investigation to be complete. A notification that arrives after everything is understood arrives too late to act on.',
          'A notification says what happened, what data was involved, what Warsha has done, and what you should do. It does not minimise, and it does not describe an incident as a "technical issue" when it was an exposure.',
          'Where the law requires notifying an authority, Warsha does so within the time the law allows.',
          'Where telling someone immediately would make the exposure worse — an open weakness that would be exploited — Warsha may delay the detail while still telling people that something has happened and what to do.',
        ],
      },
      {
        heading: '4. Afterwards',
        body: [
          'Every incident produces a written record: what happened, why, what was done, and what has changed so it does not happen the same way again.',
          'Where the cause was a design weakness rather than a mistake, the fix is to the design.',
        ],
      },
      {
        heading: '5. What Warsha does not claim',
        body: [
          'Warsha has not undergone penetration testing and holds no security certification. It does not claim either, and will not until it has.',
          'Stating this is part of the policy rather than an omission from it, because a security posture that is overstated is one people rely on.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الاستجابة للحوادث',
    summary:
      'ملخّص عربي كامل للسياسة. النص الإنجليزي هو الحاكم. ورشة بتعمل إيه لما حاجة تحصل في البيانات أو الأمان، وهتقولك إمتى.',
    sections: [
      {
        heading: '١. إيه اللي بيتحسب حادث',
        body: [
          'وصول غير مصرّح به لبيانات شخصية. فقدها أو تلفها. ثغرة عرّضتها، سواء حد استغل الثغرة أو لأ. مورد بيقول لورشة إن واحدة من دول حصلت عنده.',
          'انقطاع الخدمة مش حادث تحت السياسة دي إلا لو البيانات اتأثرت.',
        ],
      },
      {
        heading: '٢. بيحصل إيه الأول',
        body: [
          'الاحتواء: وقّف التعرض. ده بييجي قبل فهمه، لأن التعرض اللي لسه مفتوح بيبقى أسوأ وهو بيتحلّل.',
          'الحفظ: احتفظ بالسجلات والأدلة اللازمة لإثبات اللي حصل، قبل ما أي حاجة تتغيّر.',
          'التقييم: أنهي بيانات، بتاعة مين، قد إيه، ولمدة قد إيه.',
        ],
      },
      {
        heading: '٣. إبلاغ الناس',
        body: [
          'ورشة بتبلّغ المتأثرين لما بياناتهم تكون طرف، من غير ما تستنى التحقيق يخلص. الإشعار اللي بيوصل بعد ما كل حاجة تتفهم بيوصل متأخر أوي على التصرف.',
          'الإشعار بيقول حصل إيه، وأنهي بيانات كانت طرف، وورشة عملت إيه، وإنت تعمل إيه. مش بيقلّل، ومش بيوصف حادث بإنه «مشكلة فنية» وهو كان تعرض.',
          'لما القانون يطلب إبلاغ جهة، ورشة بتعمل كده خلال المدة اللي القانون بيسمح بيها.',
          'لما إبلاغ حد فوراً هيخلّي التعرض أسوأ — ثغرة مفتوحة هتتستغل — ممكن ورشة تأخّر التفاصيل وهي لسه بتقول للناس إن حاجة حصلت وإنهم يعملوا إيه.',
        ],
      },
      {
        heading: '٤. بعدين',
        body: [
          'كل حادث بيُنتج سجل مكتوب: حصل إيه، وليه، واتعمل إيه، واتغيّر إيه علشان ما يحصلش بنفس الطريقة تاني.',
          'لما السبب يكون ضعف في التصميم مش غلطة، الإصلاح بيبقى في التصميم.',
        ],
      },
      {
        heading: '٥. ورشة مش بتدّعي إيه',
        body: [
          'ورشة ما خضعتش لاختبار اختراق ومعندهاش شهادة أمان. مش بتدّعي أي واحدة، ومش هتدّعي لحد ما يحصل.',
          'ذكر ده جزء من السياسة مش نقص فيها، لأن الوضع الأمني المبالغ فيه هو اللي الناس بتعتمد عليه.',
        ],
      },
    ],
  },
};

export const securityDisclosurePolicy: LegalDocument = {
  key: 'security_disclosure_policy',
  category: 'platform',
  audience: 'public',
  sortOrder: 23,
  ...initial(
    'First published version of the security disclosure policy.',
    'أول نسخة منشورة من سياسة الإفصاح الأمني.',
  ),
  en: {
    title: 'Security Disclosure Policy',
    summary: 'How to report a security weakness in Warsha, what is in scope, and what Warsha promises in return.',
    sections: [
      {
        heading: '1. Reporting',
        body: [
          'Report through the security route in the Legal Contact document. Include what you found, how to reproduce it, and what it lets someone do.',
          'Report before publishing. Warsha will acknowledge, keep you informed, and agree a disclosure timeline with you.',
        ],
      },
      {
        heading: '2. What Warsha promises',
        body: [
          'Warsha will not pursue legal action against someone who reports in good faith, stays within the rules below, and gives Warsha a reasonable chance to fix the problem before publishing.',
          'Warsha will acknowledge the report, tell you what it found, and tell you when it is fixed.',
          'Warsha will credit you if you want to be credited.',
          'Warsha operates no paid bug bounty. It says so rather than leaving it ambiguous.',
        ],
      },
      {
        heading: '3. Rules',
        body: ['Testing must stay within these limits:'],
        bullets: [
          'Use only accounts you own. Do not access, modify or download another person\'s data.',
          'If you reach real personal data, stop immediately, do not save it, and say so in your report.',
          'No denial of service, no load testing, no spam, and nothing that degrades the service for other people.',
          'No social engineering of Warsha staff, workers or customers, and no physical intrusion.',
          'Do not use an automated scanner against production.',
        ],
      },
      {
        heading: '4. Scope',
        body: [
          'In scope: the Warsha applications, the API, authentication, access control, and anything that exposes personal data.',
          'Out of scope: findings against a supplier\'s own infrastructure — report those to the supplier. Also out of scope: missing hardening headers with no demonstrated impact, and reports produced solely by a scanner with no analysis.',
        ],
      },
      {
        heading: '5. What Warsha does not claim',
        body: [
          'Warsha has not commissioned a penetration test and holds no security certification. This policy is a channel for reports, not evidence of an assessment.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الإفصاح الأمني',
    summary:
      'ملخّص عربي كامل للسياسة. النص الإنجليزي هو الحاكم. تبلّغ عن ثغرة أمنية في ورشة إزاي، وإيه اللي في النطاق، وورشة بتوعد بإيه في المقابل.',
    sections: [
      {
        heading: '١. الإبلاغ',
        body: [
          'بلّغ من خلال قناة الأمان في مستند جهة الاتصال القانونية. اذكر لقيت إيه، وتتكرّر إزاي، وبتسمح لحد يعمل إيه.',
          'بلّغ قبل النشر. ورشة هتأكّد الاستلام، وهتفضل تبلّغك، وهتتفق معاك على جدول إفصاح.',
        ],
      },
      {
        heading: '٢. ورشة بتوعد بإيه',
        body: [
          'ورشة مش هتتخذ إجراء قانوني ضد حد بلّغ بحسن نية، والتزم بالقواعد تحت، وإدّى ورشة فرصة معقولة تصلّح المشكلة قبل النشر.',
          'ورشة هتأكّد استلام البلاغ، وهتقولك لقت إيه، وهتقولك لما يتصلّح.',
          'ورشة هتنسب الفضل ليك لو عايز.',
          'ورشة مش بتشغّل برنامج مكافآت ثغرات مدفوع. بتقول كده بدل ما تسيبها ملتبسة.',
        ],
      },
      {
        heading: '٣. القواعد',
        body: ['الاختبار لازم يفضل في الحدود دي:'],
        bullets: [
          'استخدم بس حسابات إنت بتملكها. ما توصلش ولا تعدّل ولا تنزّل بيانات حد تاني.',
          'لو وصلت لبيانات شخصية حقيقية، وقّف فوراً، وما تحفظهاش، وقول كده في بلاغك.',
          'مفيش حجب خدمة، ولا اختبار حمل، ولا سبام، ولا أي حاجة بتقلّل الخدمة للناس التانية.',
          'مفيش هندسة اجتماعية على فريق ورشة أو الصنايعية أو العملاء، ومفيش اقتحام مادي.',
          'ما تستخدمش فاحص آلي على الإنتاج.',
        ],
      },
      {
        heading: '٤. النطاق',
        body: [
          'في النطاق: تطبيقات ورشة، وواجهة البرمجة، والمصادقة، والتحكم في الوصول، وأي حاجة بتكشف بيانات شخصية.',
          'بره النطاق: النتايج ضد بنية مورد نفسه — بلّغها للمورد. وبره النطاق كمان: ترويسات التحصين الناقصة من غير أثر مثبت، والبلاغات المُنتَجة من فاحص بس من غير تحليل.',
        ],
      },
      {
        heading: '٥. ورشة مش بتدّعي إيه',
        body: [
          'ورشة ما كلّفتش باختبار اختراق ومعندهاش شهادة أمان. السياسة دي قناة للبلاغات، مش دليل على تقييم.',
        ],
      },
    ],
  },
};

export const accessibilityStatement: LegalDocument = {
  key: 'accessibility_statement',
  category: 'platform',
  audience: 'public',
  sortOrder: 24,
  ...initial(
    'First published version of the accessibility statement.',
    'أول نسخة منشورة من بيان إمكانية الوصول.',
  ),
  en: {
    title: 'Accessibility Statement',
    summary: 'What Warsha does to be usable by everyone, what has been verified, and what has not.',
    sections: [
      {
        heading: '1. What Warsha aims for',
        body: [
          'Warsha aims to be usable by people who use a screen reader, need larger text, need higher contrast, or cannot use precise touch gestures.',
          'This statement says what has been done and what has been checked. It distinguishes between the two, because a claim of accessibility that has not been tested with the people concerned is not worth much.',
        ],
      },
      {
        heading: '2. What is built in',
        body: [
          'Text scales with the system text-size setting.',
          'Light, dark and follow-the-system appearance, with colour contrast checked across every role in both themes by an automated gate that runs on every change.',
          'Screen headings are marked as headings, so a screen reader can navigate by them.',
          'Interactive elements carry accessible labels and meet a minimum touch target size.',
          'Full right-to-left support for Arabic, including layout direction, not only translated text.',
          'Colour is never the only way information is conveyed.',
        ],
      },
      {
        heading: '3. What has been verified',
        body: [
          'Automated checks run on every change: colour contrast across all interface roles in both themes, and interface completeness in both languages.',
          'These catch a real class of problems. They do not establish that the application is usable with a screen reader, which requires testing with a screen reader.',
        ],
      },
      {
        heading: '4. What has not been verified',
        body: [
          'No testing with assistive technology on a physical device has been carried out for this version. No conformance with WCAG or any other standard is claimed, at any level.',
          'This is a gap, and it is stated as one. Warsha would rather record an untested area than publish a conformance claim it cannot support.',
        ],
      },
      {
        heading: '5. Telling us about a problem',
        body: [
          'If something is unusable for you, report it through the Help Centre or the Legal Contact route. Say what you were trying to do and what technology you were using.',
          'Accessibility reports are treated as defects, not as feature requests.',
        ],
      },
    ],
  },
  ar: {
    title: 'بيان إمكانية الوصول',
    summary:
      'ملخّص عربي كامل للبيان. النص الإنجليزي هو الحاكم. ورشة بتعمل إيه علشان تبقى قابلة للاستخدام من الكل، وإيه اللي اتتحقق منه، وإيه اللي لأ.',
    sections: [
      {
        heading: '١. ورشة بتهدف لإيه',
        body: [
          'ورشة بتهدف تبقى قابلة للاستخدام من الناس اللي بتستخدم قارئ شاشة، أو محتاجة خط أكبر، أو تباين أعلى، أو مش قادرة تستخدم إيماءات لمس دقيقة.',
          'البيان ده بيقول اتعمل إيه واتفحص إيه. وبيفرّق بين الاتنين، لأن ادّعاء إمكانية الوصول من غير اختبار مع الناس المعنيين ما بيسواش كتير.',
        ],
      },
      {
        heading: '٢. المبني جوه',
        body: [
          'النص بيكبر مع إعداد حجم الخط في النظام.',
          'مظهر فاتح وغامق وتبع النظام، مع فحص تباين الألوان لكل دور في المظهرين ببوابة آلية بتشتغل مع كل تعديل.',
          'عناوين الشاشات معلّمة كعناوين، علشان قارئ الشاشة يقدر يتنقّل بيها.',
          'العناصر التفاعلية عليها تسميات وصول وبتحقّق حد أدنى لمساحة اللمس.',
          'دعم كامل للاتجاه من اليمين للشمال في العربي، بما في ذلك اتجاه التخطيط مش النص المترجم بس.',
          'اللون مش أبداً الطريقة الوحيدة لتوصيل المعلومة.',
        ],
      },
      {
        heading: '٣. اللي اتتحقق منه',
        body: [
          'فحوص آلية بتشتغل مع كل تعديل: تباين الألوان عبر كل أدوار الواجهة في المظهرين، واكتمال الواجهة باللغتين.',
          'دي بتمسك فئة حقيقية من المشاكل. لكن مش بتثبت إن التطبيق قابل للاستخدام بقارئ شاشة، وده بيتطلب اختبار بقارئ شاشة.',
        ],
      },
      {
        heading: '٤. اللي ما اتتحققش منه',
        body: [
          'مفيش اختبار بتقنيات مساعدة على جهاز حقيقي اتعمل للنسخة دي. ومفيش ادّعاء مطابقة لـ WCAG ولا أي معيار تاني، على أي مستوى.',
          'دي فجوة، ومذكورة كفجوة. ورشة تفضّل تسجّل منطقة ما اتختبرتش على إنها تنشر ادّعاء مطابقة مش قادرة تدعمه.',
        ],
      },
      {
        heading: '٥. بلّغنا عن مشكلة',
        body: [
          'لو في حاجة مش قابلة للاستخدام بالنسبة لك، بلّغ من مركز المساعدة أو من قناة التواصل القانوني. قول كنت بتحاول تعمل إيه وكنت بتستخدم أي تقنية.',
          'بلاغات إمكانية الوصول بتتعامل كعيوب، مش كطلبات خصائص.',
        ],
      },
    ],
  },
};

export const versionHistory: LegalDocument = {
  key: 'version_history',
  category: 'platform',
  audience: 'public',
  sortOrder: 25,
  ...initial('First published version of the version history.', 'أول نسخة منشورة من سجل النسخ.'),
  en: {
    title: 'Version History',
    summary: 'Every version of every Warsha legal document, when it was published, and what changed.',
    sections: [
      {
        heading: 'How versioning works',
        body: [
          'Every document has a version, a publication date and an effective date. When a new version is published the previous one is marked superseded and stays readable — it is never deleted, because someone accepted it and is entitled to see what they accepted.',
          'Every version carries a hash of its text. When you accept a document, Warsha records the version, the language you read, and that hash, so an acceptance always names an exact text rather than a document that may since have changed.',
        ],
      },
      {
        heading: 'Change classes',
        body: [
          'Editorial — a typo, a clearer sentence, a renumbered clause. Nothing about rights or obligations changes. No renewed acceptance.',
          'Non-material — a clarification that does not change rights, obligations, payments, data processing, dispute handling or worker eligibility. No renewed acceptance.',
          'Material — a change to any of those things. A new version, a change summary, and renewed acceptance before the affected functionality continues.',
          'Urgent — a change required immediately for safety or by law. It may restrict the affected functionality straight away, and is still versioned, summarised, audited and appealable.',
          'Warsha does not force renewed acceptance for a typographical correction. Asking for consent for everything trains people to tap past the things that matter.',
        ],
      },
      {
        heading: 'Declining a material change',
        body: [
          'Declining is recorded truthfully as a decline. It is never recorded as acceptance, and a decline never silently becomes one through inactivity.',
          'You are shown, before you decide, exactly which functionality stops working.',
          'You keep access to your records, your export, your support cases, the appeals process and your ability to close your account.',
          'Your previous acceptances are preserved. Declining a new version does not erase the fact that you accepted the old one.',
        ],
      },
      {
        heading: 'Version 1.0 — 6 August 2026',
        body: [
          'First publication of the complete Warsha legal corpus: 26 documents covering the customer and worker agreements, privacy, verification, conduct, commerce, machine processing, the three registers, and the platform statements.',
          'No previous version exists, so every document is classed "initial" and every person is asked to accept the documents that apply to them for the first time.',
          'The current version of every document is listed in the legal centre in the application, with its publication date and its change class.',
        ],
      },
    ],
  },
  ar: {
    title: 'سجل النسخ',
    summary:
      'ملخّص عربي كامل للسجل. النص الإنجليزي هو الحاكم. كل نسخة من كل مستند قانوني في ورشة، واتنشرت إمتى، واتغيّر إيه.',
    sections: [
      {
        heading: 'الإصدار بيشتغل إزاي',
        body: [
          'كل مستند ليه نسخة وتاريخ نشر وتاريخ سريان. لما نسخة جديدة تتنشر، القديمة بتتعلّم كمُستبدَلة وبتفضل مقروءة — ومش بتتحذف أبداً، لأن حد وافق عليها وله حق يشوف وافق على إيه.',
          'كل نسخة بتحمل بصمة لنصها. لما توافق على مستند، ورشة بتسجّل النسخة واللغة اللي قريت بيها والبصمة دي، علشان الموافقة دايماً تسمّي نص بعينه مش مستند ممكن يكون اتغيّر بعد كده.',
        ],
      },
      {
        heading: 'فئات التعديل',
        body: [
          'تحريري — غلطة إملائية، أو جملة أوضح، أو بند اترقّم من جديد. مفيش حاجة في الحقوق أو الالتزامات بتتغيّر. مفيش موافقة متجدّدة.',
          'غير جوهري — توضيح مش بيغيّر الحقوق أو الالتزامات أو المدفوعات أو معالجة البيانات أو التعامل مع النزاعات أو أهلية الصنايعي. مفيش موافقة متجدّدة.',
          'جوهري — تعديل في أي حاجة من دول. نسخة جديدة وملخّص تغيير وموافقة متجدّدة قبل ما الوظيفة المتأثرة تكمل.',
          'عاجل — تعديل مطلوب فوراً لأسباب أمان أو بحكم القانون. ممكن يقيّد الوظيفة المتأثرة على طول، وبرضه بيتعمله نسخة وملخّص وتدقيق وبيفضل قابل للاستئناف.',
          'ورشة مش بتفرض موافقة متجدّدة لتصحيح إملائي. طلب الموافقة على كل حاجة بيعلّم الناس يعدّوا على اللي بيهم.',
        ],
      },
      {
        heading: 'رفض تعديل جوهري',
        body: [
          'الرفض بيتسجّل بأمانة كرفض. مش بيتسجّل كموافقة أبداً، والرفض مش بيبقى موافقة بهدوء بمرور الوقت.',
          'بيتعرض عليك، قبل ما تقرّر، بالظبط أنهي وظيفة هتبطّل تشتغل.',
          'بتفضل واصل لسجلاتك وتصديرك وطلبات دعمك وآلية الاستئناف وقدرتك تقفل حسابك.',
          'موافقاتك السابقة بتتحفظ. رفض نسخة جديدة مش بيمسح إنك وافقت على القديمة.',
        ],
      },
      {
        heading: 'النسخة ١٫٠ — ٦ أغسطس ٢٠٢٦',
        body: [
          'أول نشر للمجموعة القانونية الكاملة بتاعة ورشة: ٢٦ مستند بتغطّي اتفاقات العميل والصنايعي والخصوصية والتحقق والسلوك والتجارة والمعالجة الآلية والسجلات التلاتة وبيانات المنصة.',
          'مفيش نسخة سابقة، فكل مستند مصنّف «أولي» وكل شخص بيتطلب منه يوافق على المستندات اللي بتخصّه لأول مرة.',
          'النسخة الحالية لكل مستند مذكورة في المركز القانوني في التطبيق، بتاريخ نشرها وفئة تعديلها.',
        ],
      },
    ],
  },
};

export const legalContact: LegalDocument = {
  key: 'legal_contact',
  category: 'platform',
  audience: 'public',
  sortOrder: 26,
  ...initial('First published version of the legal contact page.', 'أول نسخة منشورة من صفحة التواصل القانوني.'),
  en: {
    title: 'Legal Contact',
    summary: 'Where to send a legal notice, a privacy request, a security report or a rights complaint, and what to expect.',
    sections: [
      {
        heading: 'Choosing a route',
        body: [
          'Each route below reaches the people who can act on that kind of request and records it so it can be tracked. Sending a privacy request to the support queue works but is slower, because it has to be re-routed.',
        ],
      },
      {
        heading: 'Privacy requests',
        body: [
          'Use the privacy centre in the application. It handles seeing what is stored, correcting it, exporting it, changing a consent, deactivating an account and requesting deletion, and it records each request against your account.',
          'Requests that cannot be completed automatically — a deletion blocked by a legal hold, a correction to a verified identity field — are routed to a person, and you are told why and what happens next.',
        ],
      },
      {
        heading: 'Support and complaints',
        body: [
          'Use the Help Centre in the application. It routes to the team that can act and keeps the case history.',
          'A complaint about a decision is an appeal. Use the appeal route on the decision notice, which sends it to someone other than the person who decided.',
        ],
      },
      {
        heading: 'Security reports',
        body: [
          'Use the security route and follow the Security Disclosure Policy.',
          'Report before publishing, do not access anyone else\'s data, and Warsha will acknowledge, keep you informed and agree a disclosure timeline.',
        ],
      },
      {
        heading: 'Legal notices and rights complaints',
        body: [
          'Formal legal notices, infringement claims under the Copyright and Intellectual Property Policy, and requests from an authority use the legal route.',
          'Include what you are claiming, the right you hold, and enough detail to identify the content, account or booking concerned. A notice without enough detail to identify what it concerns cannot be acted on.',
        ],
      },
      {
        heading: 'What to expect',
        body: [
          'Every request is acknowledged, recorded, and given an outcome.',
          'A response time is shown on the route you use, so the expectation is set at the point of asking rather than promised here in the abstract and missed.',
          'A request that Warsha cannot grant gets a reason, not silence. Where a refusal can be appealed, the response says how.',
        ],
      },
      {
        heading: 'Emergencies',
        body: [
          'Warsha is not an emergency service. If someone is in immediate danger, contact the Egyptian emergency services first.',
          'Report it to Warsha afterwards so the account can be dealt with under the Trust and Safety Policy.',
        ],
      },
    ],
  },
  ar: {
    title: 'التواصل القانوني',
    summary:
      'ملخّص عربي كامل للصفحة. النص الإنجليزي هو الحاكم. تبعت فين الإخطار القانوني أو طلب الخصوصية أو بلاغ الأمان أو شكوى الحقوق، وتتوقّع إيه.',
    sections: [
      {
        heading: 'اختيار القناة',
        body: [
          'كل قناة تحت بتوصل للناس اللي يقدروا يتصرفوا في نوع الطلب ده وبتسجّله علشان يتتابع. بعت طلب خصوصية لطابور الدعم بيشتغل لكن أبطأ، لأنه لازم يتحوّل.',
        ],
      },
      {
        heading: 'طلبات الخصوصية',
        body: [
          'استخدم مركز الخصوصية في التطبيق. بيتعامل مع رؤية المتخزن وتصحيحه وتصديره وتغيير موافقة وإيقاف حساب وطلب حذف، وبيسجّل كل طلب على حسابك.',
          'الطلبات اللي مش ممكن تكتمل آلياً — حذف محجوب بحجز قانوني، أو تصحيح بيان هوية متحقق منه — بتتوجّه لشخص، وبيتقالك ليه وهيحصل إيه بعد كده.',
        ],
      },
      {
        heading: 'الدعم والشكاوى',
        body: [
          'استخدم مركز المساعدة في التطبيق. بيوجّه للفريق اللي يقدر يتصرف وبيحتفظ بتاريخ الحالة.',
          'الشكوى من قرار هي استئناف. استخدم قناة الاستئناف على إشعار القرار، اللي بتبعتها لحد غير اللي قرّر.',
        ],
      },
      {
        heading: 'بلاغات الأمان',
        body: [
          'استخدم قناة الأمان واتبع سياسة الإفصاح الأمني.',
          'بلّغ قبل النشر، وما توصلش لبيانات حد تاني، وورشة هتأكّد الاستلام وهتفضل تبلّغك وهتتفق على جدول إفصاح.',
        ],
      },
      {
        heading: 'الإخطارات القانونية وشكاوى الحقوق',
        body: [
          'الإخطارات القانونية الرسمية، ومطالبات التعدي تحت سياسة حقوق النشر والملكية الفكرية، وطلبات الجهات بتستخدم القناة القانونية.',
          'اذكر بتطالب بإيه، والحق اللي بتملكه، وتفاصيل كافية لتحديد المحتوى أو الحساب أو الحجز المعني. الإخطار اللي مفيهوش تفاصيل كافية لتحديد موضوعه مش ممكن يتصرف فيه.',
        ],
      },
      {
        heading: 'تتوقّع إيه',
        body: [
          'كل طلب بيتأكّد استلامه وبيتسجّل وبياخد نتيجة.',
          'وقت الرد بيتعرض على القناة اللي بتستخدمها، علشان التوقّع يتحدّد وقت الطلب بدل ما يتوعد بيه هنا بشكل مجرّد ويتخلف.',
          'الطلب اللي ورشة مش قادرة تلبّيه بياخد سبب، مش صمت. ولما الرفض يكون قابل للاستئناف، الرد بيقول إزاي.',
        ],
      },
      {
        heading: 'الطوارئ',
        body: [
          'ورشة مش خدمة طوارئ. لو حد في خطر فوري، اتصل بخدمات الطوارئ المصرية الأول.',
          'بلّغ ورشة بعدها علشان الحساب يتعامل معاه تحت سياسة الثقة والأمان.',
        ],
      },
    ],
  },
};
