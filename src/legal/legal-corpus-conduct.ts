/**
 * WPS-024 — the conduct and commerce documents.
 *
 * Every document in this file is incorporated by reference into the Customer
 * Terms or the Worker Terms, which makes it binding text. Binding text is
 * published in full in both languages; the informational and technical
 * documents in the other corpus files carry Arabic summaries instead, and say
 * so on the page rather than in a footnote.
 *
 * No figure appears here that has not been configured. Cancellation windows,
 * wasted-visit charges and refund proportions are governed by the schedule the
 * application displays, and `private.payment_configuration` currently holds
 * none. Publishing "20% within 2 hours" because it sounds plausible would put
 * a number in a binding document that no system enforces, which is worse than
 * saying it is displayed at the point of use — which is true, and testable.
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
  };
}

export const acceptableUsePolicy: LegalDocument = {
  key: 'acceptable_use_policy',
  category: 'conduct',
  audience: 'all',
  requiresAcceptance: false,
  arabicIsSummary: false,
  sortOrder: 5,
  ...initial(
    'First published version of the acceptable use policy.',
    'أول نسخة منشورة من سياسة الاستخدام المقبول.',
  ),
  en: {
    title: 'Acceptable Use Policy',
    summary: 'What is not allowed on Warsha, by anyone, and what happens when it is done anyway.',
    sections: [
      {
        heading: '1. Scope',
        body: [
          'This policy applies to everyone on Warsha — customers, workers, and anyone acting through an account. It forms part of both the Customer Terms and the Worker Terms.',
          'It covers conduct. What you may publish is in the Content Policy; how safety reports are handled is in the Trust and Safety Policy.',
        ],
      },
      {
        heading: '2. Never acceptable',
        body: ['The following end an account, usually immediately:'],
        bullets: [
          'Violence, or a threat of it, against anyone.',
          'Sexual harassment, unwanted sexual attention, or any sexual conduct involving a minor.',
          'Discrimination or abuse based on religion, gender, origin, disability, or any comparable characteristic — including refusing or cancelling a booking on that basis.',
          'Impersonating another person, or using someone else\'s verified identity.',
          'Anything unlawful under Egyptian law.',
        ],
      },
      {
        heading: '3. Not acceptable',
        body: ['The following lead to a warning, a restriction, or a suspension depending on what happened and how often:'],
        bullets: [
          'Abusive, insulting or intimidating language.',
          'Persistent contact after being asked to stop.',
          'Deliberately inaccurate information — a false address, a trade you cannot perform, an invented fault.',
          'Manipulating ratings, reviews, referrals or promotions, including through accounts you control or coordinate.',
          'Asking someone to complete a booking off-platform to avoid fees, verification or dispute handling.',
          'Using another user\'s contact details for anything other than the booking they relate to.',
          'Attempting to access data, accounts or functionality you are not entitled to, or probing the platform for weaknesses outside the Security Disclosure Policy.',
        ],
      },
      {
        heading: '4. How Warsha responds',
        body: [
          'Warsha weighs what happened, what harm it caused or risked, whether it was deliberate, and whether it has happened before. A first careless breach and a deliberate repeated one are not the same thing and are not treated the same way.',
          'Responses range from a warning, through a restriction on specific functionality, to suspension and permanent closure. Where money is involved, an open dispute is resolved before an account is closed.',
          'Where safety is credibly at issue, Warsha may act first and investigate immediately afterwards. Acting first is not a finding, and Warsha will not describe it to anyone as one.',
        ],
      },
      {
        heading: '5. Appeals',
        body: [
          'Every enforcement decision may be appealed under the Appeals Policy, and an appeal is decided by someone other than the person who decided originally.',
          'An appeal does not usually lift a suspension while it is being considered, but it is considered promptly, and a suspension found to be unjustified is reversed with the record corrected.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الاستخدام المقبول',
    summary: 'اللي مش مسموح بيه في ورشة، من أي حد، واللي بيحصل لما يتعمل برضه.',
    sections: [
      {
        heading: '١. النطاق',
        body: [
          'السياسة دي بتسري على كل حد في ورشة — العملاء والصنايعية وأي حد بيتصرف من خلال حساب. وهي جزء من شروط العميل ومن شروط الصنايعي.',
          'بتغطّي السلوك. اللي ينفع تنشره في سياسة المحتوى؛ وطريقة التعامل مع بلاغات الأمان في سياسة الثقة والأمان.',
        ],
      },
      {
        heading: '٢. مرفوض تماماً',
        body: ['الحاجات دي بتنهي الحساب، وغالباً فوراً:'],
        bullets: [
          'العنف، أو التهديد بيه، ضد أي حد.',
          'التحرش الجنسي، أو أي اهتمام جنسي غير مرغوب، أو أي سلوك جنسي بيشمل قاصر.',
          'التمييز أو الإساءة على أساس الدين أو النوع أو الأصل أو الإعاقة أو أي صفة مشابهة — بما في ذلك رفض أو إلغاء حجز على الأساس ده.',
          'انتحال شخصية حد تاني، أو استخدام هوية متحقق منها بتاعة حد تاني.',
          'أي حاجة مخالفة للقانون المصري.',
        ],
      },
      {
        heading: '٣. غير مقبول',
        body: ['الحاجات دي بتأدي لتنبيه أو تقييد أو إيقاف حسب اللي حصل وحسب تكراره:'],
        bullets: [
          'لغة مسيئة أو مهينة أو مخيفة.',
          'التواصل المتكرر بعد ما يتطلب منك تبطّل.',
          'معلومات غير صحيحة بشكل متعمّد — عنوان غلط، أو صنعة مش بتعرفها، أو عطل متخترع.',
          'التلاعب في التقييمات أو المراجعات أو الدعوات أو العروض، بما في ذلك من خلال حسابات بتتحكم فيها أو بتنسّقها.',
          'إنك تطلب من حد يكمّل حجز بره المنصة علشان التهرّب من الرسوم أو التحقق أو التعامل مع النزاعات.',
          'استخدام بيانات تواصل مستخدم تاني في أي حاجة غير الحجز المرتبط بيها.',
          'محاولة الوصول لبيانات أو حسابات أو وظايف مش من حقك، أو فحص المنصة عن ثغرات بره سياسة الإفصاح الأمني.',
        ],
      },
      {
        heading: '٤. ورشة بتردّ إزاي',
        body: [
          'ورشة بتوزن اللي حصل، والضرر اللي سبّبه أو عرّض ليه، وإذا كان متعمّد، وإذا كان حصل قبل كده. المخالفة الأولى بإهمال والمخالفة المتعمّدة المتكررة مش نفس الحاجة ومش بيتعاملوا بنفس الطريقة.',
          'الردود بتتراوح من تنبيه، لتقييد وظيفة معيّنة، للإيقاف والقفل الدائم. لما يكون في فلوس، النزاع المفتوح بيتحل قبل ما الحساب يتقفل.',
          'لما يكون الأمان محل شك ذي مصداقية، ممكن ورشة تتصرف الأول وتحقق فوراً بعدها. التصرف الأول مش إثبات، وورشة مش هتوصفه لأي حد كده.',
        ],
      },
      {
        heading: '٥. الاستئناف',
        body: [
          'كل قرار إنفاذ ممكن يتستأنف حسب سياسة الاستئناف، والاستئناف بيقرّره حد غير اللي قرّر أصلاً.',
          'الاستئناف عادةً مش بيرفع الإيقاف أثناء النظر فيه، لكنه بيتنظر بسرعة، والإيقاف اللي بيتلاقى إنه مش مبرّر بيترجع مع تصحيح السجل.',
        ],
      },
    ],
  },
};

export const workerCodeOfConduct: LegalDocument = {
  key: 'worker_code_of_conduct',
  category: 'conduct',
  audience: 'worker',
  requiresAcceptance: false,
  arabicIsSummary: false,
  sortOrder: 6,
  ...initial(
    'First published version of the worker code of conduct.',
    'أول نسخة منشورة من ميثاق سلوك الصنايعي.',
  ),
  en: {
    title: 'Worker Code of Conduct',
    summary: 'The standard Warsha holds workers to, in the customer\'s home and on the platform.',
    sections: [
      {
        heading: '1. Before the job',
        body: [
          'Accept only work you are competent to do and licensed to do where a licence is required.',
          'Read the booking. If the description does not match your trade or the price does not match the scope, say so before accepting rather than after arriving.',
          'Confirm the appointment and keep it. If you cannot, cancel as early as you can — a customer told the night before can find someone else; one told on the morning cannot.',
        ],
      },
      {
        heading: '2. At the property',
        body: [
          'Arrive at the agreed time or tell the customer you are late, before the time passes.',
          'Identify yourself. The customer is expecting the person on the profile.',
          'The home is not yours. Ask before moving belongings, use protection where you are working, and leave the site clean.',
          'Behave professionally toward everyone present. Many customers are alone when a worker arrives, and a great deal rests on how you conduct yourself.',
          'Work safely. Isolate supplies before working on them, do not improvise around a safety measure, and stop if the site is not safe to continue on.',
        ],
      },
      {
        heading: '3. Scope, price and extra work',
        body: [
          'Do what was agreed, for what was agreed.',
          'If you find something outside the scope, stop, explain it, and give a price. Start only once the customer has agreed. Extra work done without agreement is not chargeable, however necessary it was.',
          'Charge for materials at what they cost. Marking up a part and calling it the price is a form of the dishonesty the Worker Terms end an account for.',
        ],
      },
      {
        heading: '4. After the job',
        body: [
          'Complete the booking in the application, with the record the job requires.',
          'If the customer is unhappy, deal with it. Most complaints are about a small thing that becomes a dispute only because nobody addressed it.',
          'You may respond publicly to a review, once. Give your side of what happened; do not identify the customer or attack them.',
        ],
      },
      {
        heading: '5. Staying on the platform',
        body: [
          'Take payment only through the methods Warsha displays.',
          'Do not ask a customer to cancel and arrange privately. It removes their dispute rights and your payment record, and it is a breach that ends accounts.',
          'Do not use a customer\'s address or phone number for anything other than the booking.',
          'Do not send someone else in your place. The person who arrives must be the person Warsha verified.',
        ],
      },
      {
        heading: '6. When this is breached',
        body: [
          'Warsha weighs the seriousness, the harm and the pattern. A first lapse is usually a conversation; a repeated one is a restriction; conduct that puts someone at risk is a suspension while it is examined.',
          'Every decision may be appealed under the Appeals Policy, and money you have already earned for work you actually completed is dealt with under section 9 of the Worker Terms.',
        ],
      },
    ],
  },
  ar: {
    title: 'ميثاق سلوك الصنايعي',
    summary: 'المستوى اللي ورشة بتلزم بيه الصنايعية، في بيت العميل وعلى المنصة.',
    sections: [
      {
        heading: '١. قبل الشغلانة',
        body: [
          'اقبل بس الشغل اللي إنت كفء لعمله ومرخّص ليه لما الترخيص يكون مطلوب.',
          'اقرا الحجز. لو الوصف مش مطابق لصنعتك أو السعر مش مطابق للنطاق، قول كده قبل ما تقبل مش بعد ما توصل.',
          'أكّد الميعاد والتزم بيه. لو مش هتقدر، ألغِ بأسرع ما تقدر — العميل اللي بيتقاله بليلة يقدر يلاقي حد تاني؛ اللي بيتقاله الصبح مش هيقدر.',
        ],
      },
      {
        heading: '٢. في المكان',
        body: [
          'اوصل في الميعاد المتفق عليه أو قول للعميل إنك متأخر، قبل ما الميعاد يعدّي.',
          'عرّف بنفسك. العميل مستني الشخص اللي في الملف.',
          'البيت مش بتاعك. استأذن قبل ما تحرّك حاجات، واستخدم حماية في مكان شغلك، وسيب الموقع نضيف.',
          'اتصرف باحتراف مع كل الموجودين. كتير من العملاء بيكونوا لوحدهم لما الصنايعي يوصل، وحاجات كتير معلّقة على تصرفك.',
          'اشتغل بأمان. اعزل المصادر قبل الشغل عليها، وما تتحايلش على إجراء أمان، ووقّف لو الموقع مش آمن للاستمرار.',
        ],
      },
      {
        heading: '٣. النطاق والسعر والشغل الزيادة',
        body: [
          'اعمل اللي اتفقت عليه، بالسعر اللي اتفقت عليه.',
          'لو لقيت حاجة بره النطاق، وقّف، واشرحها، وادّي سعر. ابدأ بس بعد ما العميل يوافق. الشغل الزيادة اللي بيتعمل من غير اتفاق مش قابل للتحصيل، مهما كان ضرورياً.',
          'حصّل تمن الخامات باللي كلّفته. إن قطعة تتزوّد ويتقال ده السعر ده شكل من عدم الأمانة اللي شروط الصنايعي بتنهي الحساب بسببه.',
        ],
      },
      {
        heading: '٤. بعد الشغلانة',
        body: [
          'اقفل الحجز في التطبيق، بالسجل اللي الشغلانة بتطلبه.',
          'لو العميل مش مبسوط، اتعامل مع ده. أغلب الشكاوى بتكون عن حاجة صغيرة بتبقى نزاع بس لأن محدش اتعامل معاها.',
          'تقدر ترد علناً على مراجعة، مرة واحدة. قول وجهة نظرك في اللي حصل؛ ما تحدّدش هوية العميل ولا تهاجمه.',
        ],
      },
      {
        heading: '٥. الاستمرار على المنصة',
        body: [
          'خُد الدفع بس من خلال الطرق اللي ورشة بتعرضها.',
          'ما تطلبش من عميل يلغي ويرتّب على جنب. ده بيشيل حقوقه في النزاع وسجل دفعك، وهو مخالفة بتنهي الحسابات.',
          'ما تستخدمش عنوان العميل ولا رقمه في أي حاجة غير الحجز.',
          'ما تبعتش حد تاني بدالك. الشخص اللي بيوصل لازم يكون الشخص اللي ورشة اتحققت منه.',
        ],
      },
      {
        heading: '٦. لما ده يتخالف',
        body: [
          'ورشة بتوزن الخطورة والضرر والنمط. الزلة الأولى عادةً بتبقى محادثة؛ المتكررة بتبقى تقييد؛ والسلوك اللي بيحطّ حد في خطر بيبقى إيقاف أثناء الفحص.',
          'كل قرار ممكن يتستأنف حسب سياسة الاستئناف، والفلوس اللي كسبتها بالفعل مقابل شغل عملته فعلاً بيتعامل معاها البند ٩ من شروط الصنايعي.',
        ],
      },
    ],
  },
};

export const contentPolicy: LegalDocument = {
  key: 'content_policy',
  category: 'conduct',
  audience: 'all',
  requiresAcceptance: false,
  arabicIsSummary: false,
  sortOrder: 7,
  ...initial('First published version of the content policy.', 'أول نسخة منشورة من سياسة المحتوى.'),
  en: {
    title: 'Content Policy',
    summary: 'What you may publish on Warsha — reviews, profiles, photographs and messages — and what is removed.',
    sections: [
      {
        heading: '1. What this covers',
        body: [
          'Everything you put on Warsha that another person can see: your profile and photographs, portfolio images, reviews and replies, and messages within a booking.',
          'You keep ownership of what you publish. The Intellectual Property Policy sets out the licence Warsha needs to display it.',
        ],
      },
      {
        heading: '2. Reviews',
        body: [
          'Review the work: what was booked, what was done, how it went. That is what a review is for and what the next customer needs.',
          'Warsha does not remove a review for being unfavourable and does not edit one. It removes reviews that break this policy.',
          'A review is removed if it contains abuse or a slur, contains someone\'s personal information, concerns something other than the work, is written by someone with an undisclosed interest, or is part of a coordinated attempt to move a rating.',
          'A worker may reply publicly to a review once. A reply is subject to this policy like anything else.',
        ],
      },
      {
        heading: '3. Photographs and profiles',
        body: [
          'A profile photograph must show your face and be recent. It is how a customer knows the right person arrived.',
          'Portfolio photographs must be of your own work. Publishing someone else\'s work as yours is misrepresentation and is treated as such.',
          'Do not publish a photograph of a customer\'s home, or anything identifying it, without their agreement. A completed job is not consent to photograph where it happened.',
          'No photograph may show a person who has not agreed to appear, a child, a document, a number plate, or anything that identifies an address.',
        ],
      },
      {
        heading: '4. Messages',
        body: [
          'Messages within a booking are for the booking. They are retained so that a dispute can be decided on what was actually said.',
          'The Acceptable Use Policy applies to them. Warsha does not read messages routinely; it reads them when a report or a dispute requires it, and that access is logged.',
        ],
      },
      {
        heading: '5. Never permitted',
        body: ['Anywhere on Warsha:'],
        bullets: [
          'Sexual content, or any content sexualising a minor.',
          'Content promoting violence, or a threat against a person.',
          'Content attacking someone for their religion, gender, origin or disability.',
          'Another person\'s identity document, phone number, address or financial details.',
          'Content that is unlawful under Egyptian law.',
        ],
      },
      {
        heading: '6. Removal and appeal',
        body: [
          'Content that breaks this policy is removed and the account is dealt with under the Acceptable Use Policy.',
          'You are told what was removed and why. You may appeal under the Appeals Policy, and content removed in error is restored.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة المحتوى',
    summary: 'اللي ينفع تنشره في ورشة — المراجعات والملفات والصور والرسايل — واللي بيتشال.',
    sections: [
      {
        heading: '١. ده بيغطّي إيه',
        body: [
          'كل اللي بتحطّه في ورشة وحد تاني يقدر يشوفه: ملفك وصورك، وصور أعمالك، والمراجعات والردود، والرسايل جوه الحجز.',
          'إنت بتفضل مالك اللي بتنشره. سياسة الملكية الفكرية بتحدّد الترخيص اللي ورشة محتاجاه علشان تعرضه.',
        ],
      },
      {
        heading: '٢. المراجعات',
        body: [
          'راجع الشغل: اتحجز إيه، اتعمل إيه، مشيت إزاي. ده الغرض من المراجعة وده اللي العميل الجاي محتاجه.',
          'ورشة مش بتشيل مراجعة لأنها مش في الصالح ومش بتعدّل فيها. بتشيل المراجعات اللي بتخالف السياسة دي.',
          'المراجعة بتتشال لو فيها إساءة أو سبّ، أو فيها معلومات شخصية لحد، أو بتخصّ حاجة غير الشغل، أو مكتوبة من حد عنده مصلحة غير معلنة، أو جزء من محاولة منسّقة لتحريك تقييم.',
          'الصنايعي يقدر يرد علناً على مراجعة مرة واحدة. الرد خاضع للسياسة دي زي أي حاجة تانية.',
        ],
      },
      {
        heading: '٣. الصور والملفات',
        body: [
          'الصورة الشخصية لازم توضّح وشك وتكون حديثة. دي طريقة العميل إنه يعرف إن الشخص الصح وصل.',
          'صور الأعمال لازم تكون لشغلك إنت. نشر شغل حد تاني على إنه بتاعك تضليل وبيتعامل كده.',
          'ما تنشرش صورة لبيت عميل، ولا أي حاجة بتحدّده، من غير موافقته. الشغلانة اللي خلصت مش موافقة على تصوير المكان اللي حصلت فيه.',
          'مفيش صورة ينفع توضّح شخص ما وافقش يظهر، ولا طفل، ولا مستند، ولا لوحة عربية، ولا أي حاجة بتحدّد عنوان.',
        ],
      },
      {
        heading: '٤. الرسايل',
        body: [
          'الرسايل جوه الحجز للحجز. بتتحفظ علشان النزاع يتحكم فيه باللي اتقال فعلاً.',
          'سياسة الاستخدام المقبول بتسري عليها. ورشة مش بتقرا الرسايل بشكل روتيني؛ بتقراها لما بلاغ أو نزاع يتطلب كده، والوصول ده بيتسجّل.',
        ],
      },
      {
        heading: '٥. ممنوع تماماً',
        body: ['في أي مكان في ورشة:'],
        bullets: [
          'محتوى جنسي، أو أي محتوى بيجنّس قاصر.',
          'محتوى بيروّج للعنف، أو تهديد لشخص.',
          'محتوى بيهاجم حد لدينه أو نوعه أو أصله أو إعاقته.',
          'مستند هوية أو رقم تليفون أو عنوان أو بيانات مالية لشخص تاني.',
          'محتوى مخالف للقانون المصري.',
        ],
      },
      {
        heading: '٦. الإزالة والاستئناف',
        body: [
          'المحتوى اللي بيخالف السياسة دي بيتشال والحساب بيتعامل معاه تحت سياسة الاستخدام المقبول.',
          'بيتقالك اتشال إيه وليه. تقدر تستأنف حسب سياسة الاستئناف، والمحتوى اللي اتشال بالغلط بيترجع.',
        ],
      },
    ],
  },
};

export const intellectualPropertyPolicy: LegalDocument = {
  key: 'intellectual_property_policy',
  category: 'conduct',
  audience: 'all',
  requiresAcceptance: false,
  arabicIsSummary: false,
  sortOrder: 8,
  ...initial(
    'First published version of the copyright and intellectual property policy.',
    'أول نسخة منشورة من سياسة حقوق النشر والملكية الفكرية.',
  ),
  en: {
    title: 'Copyright and Intellectual Property Policy',
    summary: 'Who owns what on Warsha, the licence Warsha needs to show your content, and how to report infringement.',
    sections: [
      {
        heading: '1. What you own',
        body: [
          'You own what you create and publish on Warsha: your photographs, your portfolio, your profile text, your reviews.',
          'Publishing it here does not transfer ownership to Warsha and never will.',
        ],
      },
      {
        heading: '2. The licence Warsha needs',
        body: [
          'To show your content to other users, Warsha needs your permission to host, display, resize and cache it. By publishing it you grant Warsha a non-exclusive, royalty-free licence to do exactly that, for as long as the content is on Warsha and for the period afterwards needed to remove it from backups.',
          'The licence is limited to operating and promoting the Warsha service. It does not permit Warsha to sell your photographs, license them onward, or use them in a way that suggests you endorse something you did not.',
          'It ends when you remove the content or close your account, except where the content is evidence in an open dispute or where a record must be kept for a period stated in the Data Retention Register.',
        ],
      },
      {
        heading: '3. What Warsha owns',
        body: [
          'The Warsha name, logo, wordmark, motto — YOUR WORK, OUR MISSION / شغلك مهمتنا — application, design and software are Warsha\'s.',
          'You may not copy them, use them to suggest a relationship you do not have, or alter the logo. The brand guidelines govern how the mark may be reproduced where reproduction is permitted at all.',
        ],
      },
      {
        heading: '4. Only publish what is yours',
        body: [
          'Do not publish photographs, text, logos or designs you do not own or have permission to use. Publishing another worker\'s completed job as your own is both an infringement and a misrepresentation, and is treated as the latter.',
        ],
      },
      {
        heading: '5. Reporting infringement',
        body: [
          'If something on Warsha infringes your rights, report it through the Legal Contact route with enough detail to identify the content and the right you hold.',
          'Warsha will examine it, remove content where the claim is made out, and tell the person who published it what was removed and why so they can respond.',
          'A person whose content is removed may appeal under the Appeals Policy. Repeated infringement ends an account.',
          'A knowingly false infringement report is itself a breach of the Acceptable Use Policy.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة حقوق النشر والملكية الفكرية',
    summary: 'مين بيملك إيه في ورشة، والترخيص اللي ورشة محتاجاه علشان تعرض محتواك، وطريقة الإبلاغ عن التعدي.',
    sections: [
      {
        heading: '١. إنت بتملك إيه',
        body: [
          'إنت بتملك اللي بتنشئه وبتنشره في ورشة: صورك، وأعمالك، ونص ملفك، ومراجعاتك.',
          'نشره هنا مش بينقل الملكية لورشة ومش هينقلها أبداً.',
        ],
      },
      {
        heading: '٢. الترخيص اللي ورشة محتاجاه',
        body: [
          'علشان تعرض محتواك للمستخدمين التانيين، ورشة محتاجة إذنك إنها تستضيفه وتعرضه وتغيّر حجمه وتخزّنه مؤقتاً. بنشرك ليه إنت بتمنح ورشة ترخيص غير حصري بدون مقابل يعمل ده بالظبط، طول ما المحتوى في ورشة وللمدة اللازمة بعدها لإزالته من النسخ الاحتياطية.',
          'الترخيص محدود بتشغيل خدمة ورشة والترويج لها. مش بيسمح لورشة تبيع صورك أو ترخّصها لغيرها أو تستخدمها بطريقة توحي إنك بتؤيّد حاجة ما أيّدتهاش.',
          'بينتهي لما تشيل المحتوى أو تقفل حسابك، إلا لو المحتوى دليل في نزاع مفتوح أو لما يكون لازم يتحفظ سجل لمدة مذكورة في سجل الاحتفاظ بالبيانات.',
        ],
      },
      {
        heading: '٣. ورشة بتملك إيه',
        body: [
          'اسم ورشة وشعارها وعلامتها اللفظية وشعارها النصي — YOUR WORK, OUR MISSION / شغلك مهمتنا — والتطبيق والتصميم والبرمجيات ملك ورشة.',
          'مش مسموح تنسخهم، ولا تستخدمهم علشان توحي بعلاقة مش موجودة، ولا تعدّل الشعار. إرشادات العلامة بتنظّم طريقة إعادة إنتاج العلامة لما إعادة الإنتاج تكون مسموحة أصلاً.',
        ],
      },
      {
        heading: '٤. انشر اللي بتاعك بس',
        body: [
          'ما تنشرش صور أو نصوص أو شعارات أو تصميمات مش بتملكها أو معندكش إذن باستخدامها. نشر شغلانة صنايعي تاني خلصها على إنها بتاعتك تعدّي وتضليل في نفس الوقت، وبيتعامل على إنه التاني.',
        ],
      },
      {
        heading: '٥. الإبلاغ عن التعدي',
        body: [
          'لو في حاجة في ورشة بتتعدّى على حقوقك، بلّغ من خلال قناة التواصل القانوني بتفاصيل كافية لتحديد المحتوى والحق اللي بتملكه.',
          'ورشة هتفحصه، وهتشيل المحتوى لما تثبت المطالبة، وهتقول للناشر اتشال إيه وليه علشان يقدر يرد.',
          'الشخص اللي محتواه اتشال يقدر يستأنف حسب سياسة الاستئناف. التعدي المتكرر بينهي الحساب.',
          'بلاغ التعدي الكاذب عن علم هو نفسه مخالفة لسياسة الاستخدام المقبول.',
        ],
      },
    ],
  },
};

export const trustSafetyPolicy: LegalDocument = {
  key: 'trust_safety_policy',
  category: 'safety',
  audience: 'all',
  requiresAcceptance: false,
  arabicIsSummary: false,
  sortOrder: 9,
  ...initial(
    'First published version of the trust and safety policy.',
    'أول نسخة منشورة من سياسة الثقة والأمان.',
  ),
  en: {
    title: 'Trust and Safety Policy',
    summary: 'How Warsha prevents harm, what happens when you report it, and what Warsha will and will not do.',
    sections: [
      {
        heading: '1. What Warsha does before harm',
        body: [
          'Every worker is identity-checked before taking work, and every worker submits an official criminal-record certificate. The Worker Verification Policy sets out exactly what that establishes and what it does not.',
          'A customer\'s exact address is released to a worker only at the point in a booking where they need it.',
          'Messages stay on the platform so that a dispute or a report has evidence behind it.',
          'Warsha does not claim this prevents every harm. It reduces the ones that come from not knowing who someone is.',
        ],
      },
      {
        heading: '2. Reporting',
        body: [
          'Report from the booking, the profile, or the Help Centre. A report is confidential: the person reported is not told who reported them, and Warsha does not disclose it.',
          'If someone is in immediate danger, contact the emergency services first. Warsha is not an emergency service and cannot act at that speed.',
          'You may report a booking you were not part of, and you may report anonymously; an anonymous report is harder to act on but is still examined.',
        ],
      },
      {
        heading: '3. What Warsha does with a report',
        body: [
          'A safety report is triaged on the seriousness of what is alleged, not on the order it arrived in.',
          'Where there is a credible risk to someone, Warsha may restrict or suspend an account immediately, before it has established what happened. This is a precaution, not a finding, and Warsha will not describe it as one to anyone.',
          'Warsha examines the record: the booking, the messages, the reports, and where relevant the verification. Both sides are asked for their account where doing so does not put anyone at risk.',
          'A decision is recorded with its reason and its evidence. The person affected is told the outcome and enough of the reason to answer it.',
        ],
      },
      {
        heading: '4. What Warsha will not do',
        body: [
          'It will not publish a finding about an individual to other users.',
          'It will not disclose a reporter\'s identity to the person reported.',
          'It will not decide a safety outcome automatically. A person decides, and an adverse decision requires a person to confirm.',
          'It will not use a safety report as a reason to withhold money earned for work actually completed, beyond what an open dispute requires.',
        ],
      },
      {
        heading: '5. Working with the authorities',
        body: [
          'Warsha will respond to lawful requests from Egyptian authorities and will report where the law requires it.',
          'It will tell the person affected when it is permitted to.',
          'It will not hand over more than the request covers.',
        ],
      },
      {
        heading: '6. Appeals',
        body: [
          'Any account action taken under this policy may be appealed under the Appeals Policy, and an appeal is decided by someone other than the person who decided originally.',
          'A suspension found to be unjustified is reversed and the record is corrected, not merely closed.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الثقة والأمان',
    summary: 'ورشة بتمنع الضرر إزاي، وبيحصل إيه لما تبلّغ، وورشة هتعمل إيه ومش هتعمل إيه.',
    sections: [
      {
        heading: '١. ورشة بتعمل إيه قبل الضرر',
        body: [
          'كل صنايعي بيتحقق من هويته قبل ما ياخد شغل، وكل صنايعي بيقدّم فيش وتشبيه رسمي. سياسة التحقق من الصنايعي بتحدّد بالظبط ده بيثبت إيه ومش بيثبت إيه.',
          'عنوان العميل بالظبط بيتاح للصنايعي بس في وقت الحجز اللي محتاجه فيه.',
          'الرسايل بتفضل على المنصة علشان أي نزاع أو بلاغ يكون وراه أدلة.',
          'ورشة مش بتدّعي إن ده بيمنع كل ضرر. بيقلّل الضرر اللي بييجي من عدم معرفة الشخص مين.',
        ],
      },
      {
        heading: '٢. الإبلاغ',
        body: [
          'بلّغ من الحجز أو الملف أو مركز المساعدة. البلاغ سري: الشخص المُبلَّغ عنه مش بيتقاله مين بلّغ، وورشة مش بتفصح عن ده.',
          'لو حد في خطر فوري، اتصل بخدمات الطوارئ الأول. ورشة مش خدمة طوارئ ومش قادرة تتصرف بالسرعة دي.',
          'تقدر تبلّغ عن حجز ما كنتش طرف فيه، وتقدر تبلّغ بشكل مجهول؛ البلاغ المجهول أصعب في التصرف بناءً عليه لكن بيتفحص برضه.',
        ],
      },
      {
        heading: '٣. ورشة بتعمل إيه بالبلاغ',
        body: [
          'بلاغ الأمان بيتفرز على خطورة المُدّعى، مش على ترتيب وصوله.',
          'لما يكون في خطر ذي مصداقية على حد، ممكن ورشة تقيّد أو توقف حساب فوراً، قبل ما تثبت اللي حصل. ده احتياط مش إثبات، وورشة مش هتوصفه كده لأي حد.',
          'ورشة بتفحص السجل: الحجز والرسايل والبلاغات، ولما يكون له علاقة، التحقق. الطرفين بيتسألوا عن روايتهم لما ده ما يحطّش حد في خطر.',
          'القرار بيتسجّل بسببه وبأدلته. الشخص المتأثر بيتقاله النتيجة وقدر كافي من السبب علشان يرد عليه.',
        ],
      },
      {
        heading: '٤. ورشة مش هتعمل إيه',
        body: [
          'مش هتنشر نتيجة عن فرد للمستخدمين التانيين.',
          'مش هتفصح عن هوية المُبلِّغ للشخص المُبلَّغ عنه.',
          'مش هتقرّر نتيجة أمان آلياً. شخص بيقرّر، والقرار السلبي بيتطلب شخص يأكّده.',
          'مش هتستخدم بلاغ أمان كسبب لحجز فلوس اتكسبت مقابل شغل اتعمل فعلاً، أبعد من اللي النزاع المفتوح بيتطلبه.',
        ],
      },
      {
        heading: '٥. التعامل مع الجهات',
        body: [
          'ورشة هترد على الطلبات القانونية من الجهات المصرية وهتبلّغ لما القانون يطلب.',
          'هتقول للشخص المتأثر لما يكون مسموح لها.',
          'مش هتسلّم أكتر من اللي الطلب بيغطّيه.',
        ],
      },
      {
        heading: '٦. الاستئناف',
        body: [
          'أي إجراء على حساب اتاخد تحت السياسة دي ممكن يتستأنف حسب سياسة الاستئناف، والاستئناف بيقرّره حد غير اللي قرّر أصلاً.',
          'الإيقاف اللي بيتلاقى إنه مش مبرّر بيترجع والسجل بيتصحّح، مش بس بيتقفل.',
        ],
      },
    ],
  },
};

export const appealsPolicy: LegalDocument = {
  key: 'appeals_policy',
  category: 'safety',
  audience: 'all',
  requiresAcceptance: false,
  arabicIsSummary: false,
  sortOrder: 10,
  ...initial('First published version of the appeals policy.', 'أول نسخة منشورة من سياسة الاستئناف.'),
  en: {
    title: 'Appeals Policy',
    summary: 'How to challenge a Warsha decision, who decides the appeal, and what an appeal can change.',
    sections: [
      {
        heading: '1. What can be appealed',
        body: ['Any decision Warsha makes about you or your account:'],
        bullets: [
          'A verification decision — a rejection, a correction request, a deactivation.',
          'An enforcement decision — a warning, a restriction, a suspension, a closure.',
          'Content removal.',
          'A dispute outcome.',
          'A withheld payout.',
        ],
      },
      {
        heading: '2. Who decides',
        body: [
          'Someone other than the person who made the original decision. Where the decision was serious enough to require separation, the system enforces it: the original decision-maker cannot record the appeal outcome, and this is not left to the reviewer to remember.',
          'No appeal outcome is decided by an automated system. A person decides, and a person is accountable for it.',
        ],
      },
      {
        heading: '3. How to appeal',
        body: [
          'Appeal from the notice you received or from the Help Centre, within a reasonable time of the decision.',
          'Say what you think is wrong and add anything the original decision did not have. An appeal that repeats the original submission with no new information is considered, but the outcome is usually the same, because nothing has changed.',
          'You will be told the appeal was received and when to expect an outcome.',
        ],
      },
      {
        heading: '4. What happens',
        body: [
          'The reviewer examines the original decision, the evidence recorded with it, and what you have added. Every adverse decision on Warsha must have recorded evidence, so there is always something for an appeal to examine.',
          'The outcome is one of: upheld, reversed, or varied. You are given the outcome and a reason.',
          'A reversal is a correction, not a gesture. The record is corrected, any restriction is lifted, and money withheld only because of the decision is released.',
        ],
      },
      {
        heading: '5. While the appeal is open',
        body: [
          'A suspension normally stays in place while an appeal is considered, because the reason for it — a safety concern, a fraud finding — does not pause.',
          'Where a restriction is not about safety, Warsha will lift it during an appeal where it can.',
          'You keep access to your records, your export, your support cases and your ability to close your account throughout.',
        ],
      },
      {
        heading: '6. Limits',
        body: [
          'One appeal per decision. A second appeal is considered only where genuinely new information appears.',
          'An appeal decides what Warsha does. It does not decide your legal rights, and nothing in this policy limits any right you have under Egyptian law.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الاستئناف',
    summary: 'تعترض إزاي على قرار من ورشة، ومين بيقرّر الاستئناف، والاستئناف يقدر يغيّر إيه.',
    sections: [
      {
        heading: '١. اللي ممكن يتستأنف',
        body: ['أي قرار ورشة بتاخده عنك أو عن حسابك:'],
        bullets: [
          'قرار تحقق — رفض، أو طلب تصحيح، أو إلغاء تفعيل.',
          'قرار إنفاذ — تنبيه، أو تقييد، أو إيقاف، أو قفل.',
          'إزالة محتوى.',
          'نتيجة نزاع.',
          'تحويل محجوز.',
        ],
      },
      {
        heading: '٢. مين بيقرّر',
        body: [
          'حد غير اللي أخد القرار الأصلي. لما القرار يكون خطير بما يكفي لطلب الفصل، النظام بيفرضه: صاحب القرار الأصلي مش قادر يسجّل نتيجة الاستئناف، وده مش متروك للمراجع إنه يفتكره.',
          'مفيش نتيجة استئناف بيقرّرها نظام آلي. شخص بيقرّر، وشخص مسؤول عنها.',
        ],
      },
      {
        heading: '٣. تستأنف إزاي',
        body: [
          'استأنف من الإشعار اللي وصلك أو من مركز المساعدة، خلال وقت معقول من القرار.',
          'قول إيه اللي شايفه غلط وضيف أي حاجة ما كانتش مع القرار الأصلي. الاستئناف اللي بيكرّر التقديم الأصلي من غير معلومة جديدة بيتنظر فيه، لكن النتيجة عادةً بتبقى نفسها، لأن مفيش حاجة اتغيّرت.',
          'هيتقالك إن الاستئناف وصل وإمتى تتوقّع نتيجة.',
        ],
      },
      {
        heading: '٤. بيحصل إيه',
        body: [
          'المراجع بيفحص القرار الأصلي والأدلة المسجّلة معاه واللي إنت ضفته. كل قرار سلبي في ورشة لازم يكون له أدلة مسجّلة، فدايماً في حاجة الاستئناف يفحصها.',
          'النتيجة واحدة من: تأييد، أو إلغاء، أو تعديل. بتتقالك النتيجة وسبب.',
          'الإلغاء تصحيح مش مجاملة. السجل بيتصحّح، وأي تقييد بيترفع، والفلوس المحجوزة بسبب القرار بس بتتفرج.',
        ],
      },
      {
        heading: '٥. أثناء الاستئناف',
        body: [
          'الإيقاف عادةً بيفضل قايم أثناء النظر في الاستئناف، لأن سببه — قلق أمان أو نتيجة غش — مش بيتوقف.',
          'لما التقييد ما يكونش عن الأمان، ورشة هترفعه أثناء الاستئناف لما تقدر.',
          'بتفضل واصل لسجلاتك وتصديرك وطلبات دعمك وقدرتك تقفل حسابك طول المدة.',
        ],
      },
      {
        heading: '٦. الحدود',
        body: [
          'استئناف واحد للقرار الواحد. الاستئناف التاني بيتنظر فيه بس لما تظهر معلومة جديدة فعلاً.',
          'الاستئناف بيقرّر ورشة تعمل إيه. مش بيقرّر حقوقك القانونية، ومفيش حاجة في السياسة دي بتحدّ أي حق ليك تحت القانون المصري.',
        ],
      },
    ],
  },
};

export const cancellationPolicy: LegalDocument = {
  key: 'cancellation_policy',
  category: 'commerce',
  audience: 'all',
  requiresAcceptance: false,
  arabicIsSummary: false,
  sortOrder: 11,
  ...initial(
    'First published version of the cancellation policy.',
    'أول نسخة منشورة من سياسة الإلغاء.',
  ),
  en: {
    title: 'Cancellation Policy',
    summary: 'When a booking can be cancelled, by whom, and what it costs.',
    sections: [
      {
        heading: '1. Before a worker accepts',
        body: [
          'A booking request is not yet an agreement. Either side may withdraw with no charge and no consequence until the worker accepts it.',
        ],
      },
      {
        heading: '2. A customer cancelling an accepted booking',
        body: [
          'You may cancel at any time. Whether a charge applies depends on how close to the appointment you cancel and whether the worker has already travelled or bought materials for it.',
          'Any charge that applies to your booking is shown to you before you confirm the cancellation, with the amount and the reason. Warsha does not apply a cancellation charge that was not displayed before you cancelled — if the schedule cannot be shown, no charge is made.',
          'The fee schedule is published in the application. Introducing one, or changing one, is a material change under the Customer Terms: it requires a new version and your acceptance, and it never applies to a booking made before it took effect.',
          'A cancellation because the worker did not arrive, arrived unable to do the work, or asked you to pay outside the platform carries no charge. Record the reason when you cancel.',
        ],
      },
      {
        heading: '3. A worker cancelling',
        body: [
          'You may decline any booking before accepting it, with no consequence.',
          'After accepting, cancel as early as you can. Late cancellations are recorded, and a pattern of them is dealt with under the Worker Code of Conduct — not because a cancellation is wrong, but because the cost of a late one falls on the customer.',
          'Cancelling because the site is unsafe, the work is outside your trade, or the customer\'s conduct makes the job impossible is not held against you. Record the reason.',
        ],
      },
      {
        heading: '4. A wasted visit',
        body: [
          'If a worker arrives at the agreed time and the work cannot go ahead because nobody is there, there is no access, or the job is materially different from what was booked, that is a wasted visit.',
          'A wasted-visit charge may apply. It is shown in the application, and where no charge is configured, none is made.',
          'Record it in the booking at the time. A wasted visit claimed a day later, with nothing recorded, is very hard for anyone to resolve fairly.',
        ],
      },
      {
        heading: '5. Warsha cancelling',
        body: [
          'Warsha may cancel a booking where an account involved is suspended, where there is a credible safety concern, or where it is required to.',
          'Where Warsha cancels for a reason that is not the customer\'s, the customer is not charged and anything already paid is refunded in full under the Refund Policy.',
        ],
      },
      {
        heading: '6. Disputes about a cancellation',
        body: [
          'Raise it in the booking. Warsha will look at the record — the timings, the messages, what was noted at the time — and decide.',
          'The decision may be appealed under the Appeals Policy.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الإلغاء',
    summary: 'الحجز ينفع يتلغي إمتى، ومن مين، وبيكلّف كام.',
    sections: [
      {
        heading: '١. قبل ما الصنايعي يقبل',
        body: [
          'طلب الحجز لسه مش اتفاق. أي طرف يقدر يتراجع من غير أي رسم ومن غير أي نتيجة لحد ما الصنايعي يقبله.',
        ],
      },
      {
        heading: '٢. العميل بيلغي حجز مقبول',
        body: [
          'تقدر تلغي في أي وقت. إذا كان في رسم بيسري ده بيعتمد على قربك من الميعاد وعلى إذا كان الصنايعي اتحرك بالفعل أو اشترى خامات ليه.',
          'أي رسم بيسري على حجزك بيتعرض عليك قبل ما تأكّد الإلغاء، بالمبلغ والسبب. ورشة مش بتطبّق رسم إلغاء ما اتعرضش قبل ما تلغي — لو الجدول مش ممكن يتعرض، مفيش رسم بيتحصّل.',
          'جدول الرسوم منشور في التطبيق. إدخال واحد أو تغيير واحد تعديل جوهري تحت شروط العميل: بيحتاج نسخة جديدة وموافقتك، ومش بيسري أبداً على حجز اتعمل قبل سريانه.',
          'الإلغاء بسبب إن الصنايعي ما جاش، أو جه مش قادر يعمل الشغل، أو طلب منك تدفع بره المنصة مفيش عليه رسم. سجّل السبب وإنت بتلغي.',
        ],
      },
      {
        heading: '٣. الصنايعي بيلغي',
        body: [
          'تقدر ترفض أي حجز قبل ما تقبله، من غير أي نتيجة.',
          'بعد القبول، ألغِ بأسرع ما تقدر. الإلغاءات المتأخرة بتتسجّل، ونمط منها بيتعامل معاه ميثاق سلوك الصنايعي — مش لأن الإلغاء غلط، لكن لأن تكلفة الإلغاء المتأخر بتقع على العميل.',
          'الإلغاء لأن الموقع مش آمن، أو الشغل بره صنعتك، أو سلوك العميل بيخلّي الشغلانة مستحيلة مش بيتحسب عليك. سجّل السبب.',
        ],
      },
      {
        heading: '٤. الزيارة الضايعة',
        body: [
          'لو الصنايعي وصل في الميعاد المتفق عليه والشغل ما ينفعش يمشي لأن محدش موجود، أو مفيش وصول، أو الشغلانة مختلفة جوهرياً عن المحجوز، دي زيارة ضايعة.',
          'ممكن يسري رسم زيارة ضايعة. بيتعرض في التطبيق، ولما مفيش رسم مضبوط، مفيش رسم بيتحصّل.',
          'سجّلها في الحجز في وقتها. الزيارة الضايعة اللي بتتدّعى بعد يوم من غير أي حاجة متسجّلة صعب جداً على أي حد يحلها بعدل.',
        ],
      },
      {
        heading: '٥. ورشة بتلغي',
        body: [
          'ورشة ممكن تلغي حجز لما حساب طرف فيه يكون موقوف، أو لما يكون في قلق أمان ذي مصداقية، أو لما تكون مُلزَمة.',
          'لما ورشة تلغي لسبب مش من العميل، العميل مش بيتحمّل رسم وأي حاجة اتدفعت بترجع بالكامل حسب سياسة الاسترداد.',
        ],
      },
      {
        heading: '٦. النزاع حول الإلغاء',
        body: [
          'اطرحه في الحجز. ورشة هتبص على السجل — المواعيد والرسايل واللي اتسجّل وقتها — وهتقرّر.',
          'القرار ممكن يتستأنف حسب سياسة الاستئناف.',
        ],
      },
    ],
  },
};

export const refundPolicy: LegalDocument = {
  key: 'refund_policy',
  category: 'commerce',
  audience: 'all',
  requiresAcceptance: false,
  arabicIsSummary: false,
  sortOrder: 12,
  ...initial('First published version of the refund policy.', 'أول نسخة منشورة من سياسة الاسترداد.'),
  en: {
    title: 'Refund Policy',
    summary: 'When you get your money back, how much, how long it takes, and what happens to the worker.',
    sections: [
      {
        heading: '1. When a refund is due',
        body: ['You are entitled to a refund, in whole or in part, where:'],
        bullets: [
          'The work was not done.',
          'The work was not what was booked.',
          'The work was done so badly it has to be redone, and the worker will not or cannot put it right.',
          'You were charged for materials that were not supplied, or for work you did not agree to.',
          'Warsha cancelled the booking for a reason that was not yours.',
          'You were charged a cancellation or wasted-visit fee that should not have applied.',
        ],
      },
      {
        heading: '2. What a refund does not cover',
        body: [
          'Work that was done as agreed but that you later decided you did not want.',
          'A result you are unhappy with where the work itself was done properly and to the scope agreed.',
          'A fault that appears later and is unrelated to the work done.',
          'None of these is a bar to raising it. Warsha will look at what happened; this section describes what a refund is for, not a refusal to consider a case.',
        ],
      },
      {
        heading: '3. How to claim',
        body: [
          'Raise it from the booking, as soon as you can and while the evidence is still there. Photographs of the problem help more than a description of it.',
          'Warsha will ask the worker for their account. Most cases resolve at this point, because most are a misunderstanding rather than a dispute.',
          'If they do not, Warsha decides on the record: the booking, the messages, the photographs, and what each side says.',
        ],
      },
      {
        heading: '4. Partial refunds',
        body: [
          'Where part of the work was done properly, the refund reflects that. Warsha refunds the part that was not delivered rather than treating the whole booking as a failure.',
          'Where a refund is made, Warsha\'s commission on the refunded amount is reversed proportionally. Warsha does not keep a commission on money it has returned to a customer.',
        ],
      },
      {
        heading: '5. How you are paid back',
        body: [
          'A payment made through Warsha is refunded to the method you paid with.',
          'Where you paid a worker in cash, Warsha cannot reverse a transaction it never held. It will arrange settlement with the worker and, where that fails, deal with the worker\'s account under the Worker Terms. You will be told which is happening.',
          'Timing depends on the method and the bank. The application shows the state of a refund at every stage.',
        ],
      },
      {
        heading: '6. What happens to the worker',
        body: [
          'A refund is not automatically a finding against a worker. Work that could not be completed for a reason that is nobody\'s fault still results in a refund.',
          'Where a refund follows a finding of poor work or dishonesty, that is dealt with separately under the Worker Terms and the Code of Conduct.',
          'A worker may appeal a refund decision under the Appeals Policy, as may a customer.',
        ],
      },
      {
        heading: '7. Your other rights',
        body: [
          'This policy describes what Warsha does. It does not limit any right you have under Egyptian law, including any right you have directly against the worker.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الاسترداد',
    summary: 'بتاخد فلوسك إمتى، وكام، وبتاخد قد إيه، وبيحصل إيه للصنايعي.',
    sections: [
      {
        heading: '١. الاسترداد بيستحق إمتى',
        body: ['ليك حق في استرداد، كلي أو جزئي، لما:'],
        bullets: [
          'الشغل ما اتعملش.',
          'الشغل ما كانش اللي اتحجز.',
          'الشغل اتعمل بشكل سيء لدرجة إنه لازم يتعاد، والصنايعي مش هيصلّحه أو مش قادر.',
          'اتحمّلت تمن خامات ما اتوردتش، أو شغل ما وافقتش عليه.',
          'ورشة ألغت الحجز لسبب مش منك.',
          'اتحمّلت رسم إلغاء أو زيارة ضايعة ما كانش المفروض يسري.',
        ],
      },
      {
        heading: '٢. الاسترداد مش بيغطّي إيه',
        body: [
          'شغل اتعمل زي المتفق عليه لكن قرّرت بعدين إنك مش عايزه.',
          'نتيجة مش مبسوط منها والشغل نفسه اتعمل صح وفي حدود النطاق المتفق عليه.',
          'عطل بيظهر بعدين وملهوش علاقة بالشغل اللي اتعمل.',
          'مفيش واحدة من دول بتمنعك من إنك تطرحها. ورشة هتبص على اللي حصل؛ البند ده بيوصف الاسترداد لإيه، مش رفض للنظر في حالة.',
        ],
      },
      {
        heading: '٣. تطلب إزاي',
        body: [
          'اطرحه من الحجز، بأسرع ما تقدر والأدلة لسه موجودة. صور المشكلة بتساعد أكتر من وصفها.',
          'ورشة هتسأل الصنايعي عن روايته. أغلب الحالات بتتحل عند النقطة دي، لأن أغلبها سوء فهم مش نزاع.',
          'لو ما اتحلتش، ورشة بتقرّر على السجل: الحجز والرسايل والصور واللي كل طرف بيقوله.',
        ],
      },
      {
        heading: '٤. الاسترداد الجزئي',
        body: [
          'لما جزء من الشغل يكون اتعمل صح، الاسترداد بيعكس ده. ورشة بترد الجزء اللي ما اتسلّمش بدل ما تعامل الحجز كله كفشل.',
          'لما يتم استرداد، عمولة ورشة على المبلغ المسترد بتتعكس بالتناسب. ورشة مش بتحتفظ بعمولة على فلوس ردّتها لعميل.',
        ],
      },
      {
        heading: '٥. بتترد ليك إزاي',
        body: [
          'الدفعة اللي اتعملت من خلال ورشة بترجع للطريقة اللي دفعت بيها.',
          'لما تكون دفعت للصنايعي كاش، ورشة مش قادرة تعكس معاملة ما مرّتش بيها أصلاً. هترتّب التسوية مع الصنايعي، ولو ده فشل، هتتعامل مع حساب الصنايعي تحت شروط الصنايعي. هيتقالك أنهي واحدة بتحصل.',
          'التوقيت بيعتمد على الطريقة وعلى البنك. التطبيق بيوضّح حالة الاسترداد في كل مرحلة.',
        ],
      },
      {
        heading: '٦. بيحصل إيه للصنايعي',
        body: [
          'الاسترداد مش تلقائياً إثبات ضد الصنايعي. الشغل اللي ما قدرش يكمل لسبب مش ذنب حد بيأدي لاسترداد برضه.',
          'لما الاسترداد يجي بعد إثبات شغل سيء أو عدم أمانة، ده بيتعامل معاه بشكل منفصل تحت شروط الصنايعي وميثاق السلوك.',
          'الصنايعي يقدر يستأنف قرار استرداد حسب سياسة الاستئناف، وكذلك العميل.',
        ],
      },
      {
        heading: '٧. حقوقك التانية',
        body: [
          'السياسة دي بتوصف اللي ورشة بتعمله. مش بتحدّ أي حق ليك تحت القانون المصري، بما في ذلك أي حق ليك تجاه الصنايعي مباشرة.',
        ],
      },
    ],
  },
};
