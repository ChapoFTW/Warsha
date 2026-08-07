/**
 * WPS-024 — the four documents a person is asked to accept.
 *
 * Everything here is binding text. Three rules govern how it is written:
 *
 * 1. It describes what Warsha actually does today. Where a capability is
 *    approved but not built — an OCR provider, a map provider — the text says
 *    it will apply from the version that introduces it, and the register
 *    carries the approval. A privacy notice describing processing that does
 *    not happen is a false disclosure, which is worse than a missing one.
 * 2. It states no number that has not been set. `private.payment_configuration`
 *    ships with a null commission and a disabled gateway, so no commission
 *    percentage, cancellation fee or payout period appears below. The
 *    mechanism binds; the figure is published separately and changing it is a
 *    material change under section 11 of WPS-024.
 * 3. It claims no legal status Warsha has not obtained. No regulatory
 *    approval, no licence, no certification and no compliance finding is
 *    asserted anywhere in this corpus.
 *
 * Arabic here is a full section-parallel text, not a summary, because these
 * four are the documents people are asked to agree to and most of the people
 * asked read Arabic. English governs, and the reader is told so in both.
 */

import type { LegalDocument } from './legal-types.ts';

const PUBLISHED = '2026-08-06';

export const customerTerms: LegalDocument = {
  key: 'customer_terms',
  version: '1.0',
  category: 'agreement',
  audience: 'customer',
  authoritativeLanguage: 'en',
  requiresAcceptance: true,
  publishedAt: PUBLISHED,
  effectiveAt: PUBLISHED,
  supersedesVersion: null,
  changeClass: 'initial',
  changeSummary: {
    en: 'First published version of the Warsha customer agreement.',
    ar: 'أول نسخة منشورة من اتفاق العميل مع ورشة.',
  },
  arabicIsSummary: false,
  sortOrder: 1,
  en: {
    title: 'Customer Terms and Conditions',
    summary:
      'The agreement between you and Warsha when you use Warsha to find and book a tradesperson.',
    sections: [
      {
        heading: '1. Who this agreement is between',
        body: [
          'This agreement is between you, the person using Warsha to book work, and Warsha, the operator of the Warsha application and platform.',
          'It applies from the moment you accept it and for as long as you hold a Warsha account. If you do not accept it, you cannot book work through Warsha, but you can still read this document, contact us, and — if you already have an account — export your data or close your account.',
          'A separate agreement, the Worker Terms and Conditions, governs anyone offering work through Warsha. If you hold both a customer and a worker account, both agreements apply to you, and each is accepted separately.',
        ],
      },
      {
        heading: '2. What Warsha is, and what it is not',
        body: [
          'Warsha is a marketplace. It introduces customers to independent tradespeople — plumbers, electricians, carpenters and other trades — and provides the tools to arrange, track, communicate about and pay for that work.',
          'Warsha does not perform the work. The person who arrives at your home is an independent contractor running their own business. They are not employed by Warsha, not an agent of Warsha, and not supervised by Warsha while they work.',
          'This distinction has consequences you should understand before you book, and they are set out in section 8.',
        ],
      },
      {
        heading: '3. Your account',
        body: [
          'You must be at least 18 years old to hold a Warsha account.',
          'You are responsible for what happens through your account. Keep your sign-in details to yourself, and tell us promptly if you think somebody else has access to it.',
          'The information you give us must be accurate. In particular, the address and map pin you confirm are what a worker will use to reach you; an inaccurate one wastes somebody\'s morning and may leave you liable for a wasted-visit charge under the Cancellation Policy.',
          'One account per person. Creating additional accounts to evade a suspension, a rating, or a restriction is a breach of this agreement.',
        ],
      },
      {
        heading: '4. Booking work',
        body: [
          'When you request a booking you are making an offer to the worker you selected. A booking becomes binding when that worker accepts it, and not before. Until then either side can withdraw without consequence.',
          'The price shown before you confirm is the price agreed for the scope described. Work outside that scope — a second fault found once the panel is open, a part the job turns out to need — is a change to the booking. A worker must tell you and you must agree before the extra work starts. You are not obliged to accept a change, and refusing one is not a cancellation of the original booking.',
          'You are responsible for giving the worker safe and lawful access to the place the work happens, and for telling them anything about the site that affects how the work can be done safely.',
        ],
      },
      {
        heading: '5. Prices, payment and receipts',
        body: [
          'Prices are shown in Egyptian Pounds and include any Warsha service fee applicable to you, which is displayed before you confirm.',
          'Warsha supports payment in cash directly to the worker and, where enabled for your account, payment by card through the application. Which methods are available is shown at the point of booking. Warsha does not accept payment outside the methods it displays, and a worker asking you to pay through another channel is acting against the Worker Terms — please report it.',
          'Where a payment passes through Warsha, Warsha collects it as the worker\'s limited payment agent. Your payment obligation to the worker is discharged when Warsha receives the money, even if Warsha has not yet settled with the worker.',
          'A record of every booking and payment is available in the application. If a figure looks wrong, raise it through support before it becomes a dispute; most are resolved the same way.',
        ],
      },
      {
        heading: '6. Cancellation and refunds',
        body: [
          'Cancellations are governed by the Cancellation Policy and refunds by the Refund Policy. Both are part of this agreement and are available in the application at all times.',
          'In outline: you may cancel a booking free of charge until it is confirmed, and after that a charge may apply depending on how close to the appointment you cancel and whether the worker has already travelled. Any fee schedule that applies to you is displayed before you cancel — never afterwards.',
          'If the work was not done, was not done properly, or was not what was agreed, you are entitled to a resolution. That is a right under this agreement, not a discretionary gesture, and section 7 explains how to claim it.',
        ],
      },
      {
        heading: '7. Problems, disputes and complaints',
        body: [
          'Raise a problem through the booking itself, as early as you can. Warsha will ask both sides for their account and any evidence, and will reach a decision.',
          'Warsha\'s decision determines what Warsha does — whether it refunds, withholds, or releases a payment it holds, and what happens to either account. It does not determine your legal rights against the worker, and nothing in this agreement removes any right you have under Egyptian law.',
          'You may appeal a decision under the Appeals Policy. An appeal is considered by someone other than the person who made the original decision.',
        ],
      },
      {
        heading: '8. What Warsha is responsible for, and what it is not',
        body: [
          'Warsha is responsible for operating the platform: for the bookings, payments and records it handles, for verifying workers to the standard set out in the Worker Verification Policy, for the security of the information you give it, and for acting on reports of harm.',
          'Warsha is not responsible for the work itself. The quality, safety, timeliness and legality of what a tradesperson does is theirs. Warsha checks who they are before they can take work; it does not certify their competence, guarantee their workmanship, or supervise them on site.',
          'Warsha does not exclude or limit its liability for death or personal injury caused by its own negligence, for fraud, or for anything else that cannot lawfully be limited. Subject to that, Warsha is not liable for indirect or consequential loss, and its liability arising from a booking is limited to the value of that booking together with any amount recoverable under this agreement.',
          'Nothing in this section affects your rights against the worker directly.',
        ],
      },
      {
        heading: '9. How you must behave',
        body: [
          'The Acceptable Use Policy and the Content Policy are part of this agreement and set out what is not allowed on Warsha. In short: no harassment, no discrimination, no threats, no fraud, no attempts to take a relationship off the platform to avoid its protections, and nothing unlawful.',
          'Workers are people doing a job in your home. Treat them accordingly. Warsha will act on reports of abuse in either direction.',
        ],
      },
      {
        heading: '10. Your information',
        body: [
          'The Privacy Policy explains what Warsha collects, why, who it is shared with and what you can do about it. It is a separate document you accept separately.',
          'Two points are worth stating here because they affect a booking directly. Your exact address and coordinates are private, and a worker sees the detail needed to reach you only at the point in a booking where they need it. And your messages with a worker are retained so that a dispute can be decided on evidence rather than on recollection.',
        ],
      },
      {
        heading: '11. Suspension and closing your account',
        body: [
          'You may close your account at any time from the privacy centre. Closing it does not cancel bookings that are already confirmed and does not extinguish money you owe or are owed.',
          'Warsha may suspend or close an account that breaches this agreement, that presents a risk to someone\'s safety, or that Warsha is required to act on. Where it is possible to tell you the reason, Warsha will. Where a suspension follows a safety report, Warsha may act first and explain afterwards.',
          'A suspension may be appealed under the Appeals Policy.',
        ],
      },
      {
        heading: '12. Changes to this agreement',
        body: [
          'Warsha may publish a new version of this agreement. Every version has a number, a publication date and an effective date, and every previous version stays available in the application.',
          'A change that affects your rights, your obligations, what you pay, how your data is processed, how disputes are handled, or how an account can be suspended is a material change. Material changes require your acceptance before you can keep booking, and you will be shown a plain-language summary of what changed.',
          'Corrections that do not change any of those things — a fixed typo, a clearer sentence, a renumbered clause — do not require you to accept again. They still appear in the Version History with the date they were made.',
          'If you decline a material change, you keep access to your records, your export, your support cases and your ability to close your account. You will be told exactly which functionality stops working, before you decide.',
        ],
      },
      {
        heading: '13. Governing law',
        body: [
          'This agreement is governed by the laws of the Arab Republic of Egypt, and the Egyptian courts have jurisdiction over any dispute arising from it.',
          'If any part of this agreement is found unenforceable, the rest continues to apply.',
        ],
      },
      {
        heading: '14. Languages',
        body: [
          'This agreement is published in English and Arabic. Both texts are complete and are intended to say the same thing.',
          'Where they differ, the English text governs. Warsha records which language you read when you accepted, so that if a difference is ever found, it is known which text you actually saw.',
        ],
      },
      {
        heading: '15. Contacting us',
        body: [
          'Support requests go through the Help Centre in the application, which routes them to the team that can act on them.',
          'The Legal Contact document lists the routes for legal notices, privacy requests, and security reports, and the response expectations for each.',
        ],
      },
    ],
  },
  ar: {
    title: 'شروط وأحكام العميل',
    summary: 'الاتفاق بينك وبين ورشة لما تستخدم ورشة علشان تلاقي صنايعي وتحجزه.',
    sections: [
      {
        heading: '١. الاتفاق ده بين مين ومين',
        body: [
          'الاتفاق ده بينك، الشخص اللي بيستخدم ورشة علشان يحجز شغل، وبين ورشة، مشغّل تطبيق ومنصة ورشة.',
          'بيسري من لحظة موافقتك عليه وطول ما عندك حساب في ورشة. لو مش موافق، مش هتقدر تحجز شغل من خلال ورشة، لكن هتفضل تقدر تقرا المستند ده، وتتواصل معانا، ولو عندك حساب بالفعل تقدر تصدّر بياناتك أو تقفل حسابك.',
          'في اتفاق منفصل، شروط وأحكام الصنايعي، بينظّم أي حد بيقدّم شغل من خلال ورشة. لو عندك حساب عميل وحساب صنايعي، الاتفاقين الاتنين بيسروا عليك، وكل واحد بيتقبل لوحده.',
        ],
      },
      {
        heading: '٢. ورشة إيه، وورشة مش إيه',
        body: [
          'ورشة سوق. بتعرّف العملاء على صنايعية مستقلين — سباكين وكهربائيين ونجارين وحرف تانية — وبتوفّر الأدوات اللي بترتّب الشغل وتتابعه وتتواصل بخصوصه وتدفع تمنه.',
          'ورشة مش بتعمل الشغل. الشخص اللي بيوصل بيتك متعاقد مستقل بيدير شغله بنفسه. هو مش موظف عند ورشة، ولا وكيل عن ورشة، ولا تحت إشراف ورشة وهو بيشتغل.',
          'الفرق ده ليه نتايج المفروض تفهمها قبل ما تحجز، وموجودة في البند ٨.',
        ],
      },
      {
        heading: '٣. حسابك',
        body: [
          'لازم يكون عندك ١٨ سنة على الأقل علشان يبقى عندك حساب في ورشة.',
          'إنت مسؤول عن اللي بيحصل من خلال حسابك. خلّي بيانات دخولك لنفسك، وبلّغنا بسرعة لو حسّيت إن حد تاني وصل ليها.',
          'المعلومات اللي بتديهالنا لازم تكون صحيحة. تحديداً العنوان ودبوس الخريطة اللي بتأكّده هما اللي الصنايعي هيستخدمهم علشان يوصلك؛ العنوان الغلط بيضيّع صبحية حد، وممكن يخلّيك مسؤول عن رسم زيارة ضايعة حسب سياسة الإلغاء.',
          'حساب واحد للشخص الواحد. إنشاء حسابات إضافية علشان تتهرّب من إيقاف أو تقييم أو قيد بيعتبر مخالفة للاتفاق ده.',
        ],
      },
      {
        heading: '٤. حجز الشغل',
        body: [
          'لما تطلب حجز إنت بتقدّم عرض للصنايعي اللي اخترته. الحجز بيبقى ملزم لما الصنايعي يقبله، مش قبل كده. لحد اللحظة دي أي طرف يقدر يتراجع من غير أي نتيجة.',
          'السعر المعروض قبل ما تأكّد هو السعر المتفق عليه للنطاق الموصوف. أي شغل بره النطاق ده — عطل تاني بيظهر بعد ما اللوحة تتفتح، أو قطعة الشغلانة طلعت محتاجاها — بيعتبر تعديل على الحجز. لازم الصنايعي يقولك ولازم إنت توافق قبل ما الشغل الزيادة يبدأ. مش مُلزم توافق، ورفضك مش إلغاء للحجز الأصلي.',
          'إنت مسؤول عن إنك تدّي الصنايعي وصول آمن وقانوني للمكان اللي الشغل بيحصل فيه، وإنك تقوله أي حاجة عن المكان بتأثّر على إن الشغل يتعمل بأمان.',
        ],
      },
      {
        heading: '٥. الأسعار والدفع والإيصالات',
        body: [
          'الأسعار معروضة بالجنيه المصري وشاملة أي رسم خدمة من ورشة بيسري عليك، وبيتعرض قبل ما تأكّد.',
          'ورشة بتدعم الدفع كاش للصنايعي مباشرة، ولو مفعّل لحسابك، الدفع بالكارت من خلال التطبيق. الطرق المتاحة بتتعرض وقت الحجز. ورشة مش بتقبل دفع بره الطرق اللي بتعرضها، والصنايعي اللي بيطلب منك تدفع من قناة تانية بيخالف شروط الصنايعي — من فضلك بلّغ.',
          'لما الدفع يمرّ من خلال ورشة، ورشة بتحصّله كوكيل دفع محدود عن الصنايعي. التزامك بالدفع للصنايعي بيتخلّص لما ورشة تستلم الفلوس، حتى لو ورشة لسه ما سوّتش مع الصنايعي.',
          'سجل كل حجز وكل دفعة متاح في التطبيق. لو رقم شكله غلط، اطرحه على الدعم قبل ما يبقى نزاع؛ أغلبها بتتحل بالطريقة دي.',
        ],
      },
      {
        heading: '٦. الإلغاء والاسترداد',
        body: [
          'الإلغاء بتنظّمه سياسة الإلغاء والاسترداد بتنظّمه سياسة الاسترداد. الاتنين جزء من الاتفاق ده ومتاحين في التطبيق في أي وقت.',
          'باختصار: تقدر تلغي الحجز من غير أي رسم لحد ما يتأكّد، وبعد كده ممكن يسري رسم حسب قربك من الميعاد وحسب لو الصنايعي كان اتحرك بالفعل. أي جدول رسوم بيسري عليك بيتعرض قبل ما تلغي — مش بعد كده أبداً.',
          'لو الشغل ما اتعملش، أو ما اتعملش صح، أو ما كانش زي المتفق عليه، ليك الحق في حل. ده حق في الاتفاق ده، مش مجاملة تقديرية، والبند ٧ بيشرح تطلبه إزاي.',
        ],
      },
      {
        heading: '٧. المشاكل والنزاعات والشكاوى',
        body: [
          'اطرح المشكلة من خلال الحجز نفسه، بأسرع ما تقدر. ورشة هتسأل الطرفين عن روايتهم وأي أدلة، وهتوصل لقرار.',
          'قرار ورشة بيحدّد ورشة هتعمل إيه — تسترد ولا تحجز ولا تفرج عن دفعة معاها، وإيه اللي هيحصل لأي حساب. مش بيحدّد حقوقك القانونية تجاه الصنايعي، ومفيش حاجة في الاتفاق ده بتشيل أي حق ليك تحت القانون المصري.',
          'تقدر تستأنف القرار حسب سياسة الاستئناف. الاستئناف بينظر فيه حد غير اللي أخد القرار الأصلي.',
        ],
      },
      {
        heading: '٨. ورشة مسؤولة عن إيه، ومش مسؤولة عن إيه',
        body: [
          'ورشة مسؤولة عن تشغيل المنصة: عن الحجوزات والمدفوعات والسجلات اللي بتتعامل معاها، وعن التحقق من الصنايعية بالمستوى الموجود في سياسة التحقق من الصنايعي، وعن أمان المعلومات اللي بتديهالها، وعن التصرف تجاه بلاغات الضرر.',
          'ورشة مش مسؤولة عن الشغل نفسه. جودة وأمان وتوقيت وقانونية اللي الصنايعي بيعمله مسؤوليته هو. ورشة بتتأكد من هويته قبل ما ياخد شغل؛ مش بتشهد على كفاءته، ولا بتضمن جودة صنعته، ولا بتشرف عليه في الموقع.',
          'ورشة مش بتستبعد ولا بتحدّ مسؤوليتها عن الوفاة أو الإصابة الشخصية الناتجة عن إهمالها هي، ولا عن الغش، ولا عن أي حاجة مش ممكن قانوناً تتحدّ. مع مراعاة كده، ورشة مش مسؤولة عن الخسارة غير المباشرة أو التبعية، ومسؤوليتها الناشئة عن حجز محدودة بقيمة الحجز ده مع أي مبلغ مستحق تحت الاتفاق ده.',
          'مفيش حاجة في البند ده بتأثّر على حقوقك تجاه الصنايعي مباشرة.',
        ],
      },
      {
        heading: '٩. إزاي لازم تتصرف',
        body: [
          'سياسة الاستخدام المقبول وسياسة المحتوى جزء من الاتفاق ده وبيحدّدوا اللي مش مسموح بيه في ورشة. باختصار: ممنوع التحرش ولا التمييز ولا التهديد ولا الغش ولا محاولات نقل العلاقة بره المنصة علشان التهرّب من حمايتها، ولا أي حاجة مخالفة للقانون.',
          'الصنايعية ناس بتعمل شغلها في بيتك. عاملهم على الأساس ده. ورشة هتتصرف تجاه بلاغات الإساءة في الاتجاهين.',
        ],
      },
      {
        heading: '١٠. معلوماتك',
        body: [
          'سياسة الخصوصية بتشرح ورشة بتجمع إيه وليه، وبتشاركه مع مين، وإنت تقدر تعمل إيه. دي مستند منفصل بتوافق عليه لوحده.',
          'في نقطتين تستاهلوا الذكر هنا لأنهم بيأثّروا على الحجز مباشرة. عنوانك بالظبط وإحداثياتك خاصين، والصنايعي بيشوف التفاصيل اللي محتاجها علشان يوصلك في وقت الحجز اللي محتاجها فيه بس. ورسايلك مع الصنايعي بتتحفظ علشان أي نزاع يتحكم فيه بالأدلة مش بالذاكرة.',
        ],
      },
      {
        heading: '١١. الإيقاف وقفل الحساب',
        body: [
          'تقدر تقفل حسابك في أي وقت من مركز الخصوصية. القفل مش بيلغي الحجوزات المؤكدة بالفعل ومش بيسقط فلوس عليك أو ليك.',
          'ورشة ممكن توقف أو تقفل حساب بيخالف الاتفاق ده، أو بيمثّل خطر على أمان حد، أو ورشة مُلزَمة تتصرف تجاهه. لما يكون ممكن نقولك السبب هنقولك. لما الإيقاف يكون بعد بلاغ أمان، ممكن ورشة تتصرف الأول وتشرح بعدين.',
          'الإيقاف ممكن يتستأنف حسب سياسة الاستئناف.',
        ],
      },
      {
        heading: '١٢. تعديلات الاتفاق ده',
        body: [
          'ورشة ممكن تنشر نسخة جديدة من الاتفاق ده. كل نسخة ليها رقم وتاريخ نشر وتاريخ سريان، وكل نسخة قديمة بتفضل متاحة في التطبيق.',
          'أي تعديل بيمسّ حقوقك أو التزاماتك أو اللي بتدفعه أو طريقة معالجة بياناتك أو طريقة التعامل مع النزاعات أو طريقة إيقاف الحساب بيعتبر تعديل جوهري. التعديلات الجوهرية بتحتاج موافقتك قبل ما تكمل حجز، وهيتعرض عليك ملخّص بلغة واضحة لللي اتغيّر.',
          'التصحيحات اللي مش بتغيّر أي حاجة من دول — غلطة إملائية اتصلّحت، جملة بقت أوضح، بند اترقّم من جديد — مش بتحتاج موافقة تاني. وبرضه بتظهر في سجل النسخ بتاريخ التعديل.',
          'لو رفضت تعديل جوهري، بتفضل واصل لسجلاتك وتصديرك وطلبات دعمك وقدرتك تقفل حسابك. وهيتقالك بالظبط إيه اللي هيبطّل يشتغل، قبل ما تقرّر.',
        ],
      },
      {
        heading: '١٣. القانون الحاكم',
        body: [
          'الاتفاق ده بتحكمه قوانين جمهورية مصر العربية، والمحاكم المصرية هي المختصة بأي نزاع ناشئ عنه.',
          'لو أي جزء من الاتفاق ده اتلاقى غير قابل للتنفيذ، الباقي بيفضل سارياً.',
        ],
      },
      {
        heading: '١٤. اللغات',
        body: [
          'الاتفاق ده منشور بالإنجليزي والعربي. النصّين كاملين والمقصود إنهم يقولوا نفس الكلام.',
          'لو اختلفوا، النص الإنجليزي هو الحاكم. ورشة بتسجّل اللغة اللي قريت بيها وقت الموافقة، علشان لو اتلاقى فرق يوماً ما، يبقى معروف إنت شفت أنهي نص فعلاً.',
        ],
      },
      {
        heading: '١٥. التواصل معانا',
        body: [
          'طلبات الدعم بتروح من خلال مركز المساعدة في التطبيق، اللي بيوجّهها للفريق اللي يقدر يتصرف فيها.',
          'مستند جهة الاتصال القانونية فيه طرق التواصل للإخطارات القانونية وطلبات الخصوصية وبلاغات الأمان، وتوقعات الرد لكل واحدة.',
        ],
      },
    ],
  },
};

export const workerTerms: LegalDocument = {
  key: 'worker_terms',
  version: '1.0',
  category: 'agreement',
  audience: 'worker',
  authoritativeLanguage: 'en',
  requiresAcceptance: true,
  publishedAt: PUBLISHED,
  effectiveAt: PUBLISHED,
  supersedesVersion: null,
  changeClass: 'initial',
  changeSummary: {
    en: 'First published version of the Warsha worker agreement.',
    ar: 'أول نسخة منشورة من اتفاق الصنايعي مع ورشة.',
  },
  arabicIsSummary: false,
  sortOrder: 2,
  en: {
    title: 'Worker Terms and Conditions',
    summary:
      'The agreement between you and Warsha when you offer your trade through Warsha. It covers verification, conduct, payment, suspension and appeals.',
    sections: [
      {
        heading: '1. Who this agreement is between',
        body: [
          'This agreement is between you, an independent tradesperson offering work through Warsha, and Warsha, the operator of the Warsha application and platform.',
          'It applies in addition to the Worker Code of Conduct, the Worker Verification Policy, the Acceptable Use Policy, the Content Policy, the Trust and Safety Policy, the Appeals Policy, the Cancellation Policy and the Refund Policy. Those documents form part of this agreement and are available in the application at all times.',
          'If you also book work as a customer, the Customer Terms apply to that separately and are accepted separately.',
        ],
      },
      {
        heading: '2. You are independent',
        body: [
          'You are an independent contractor. This agreement does not create employment, partnership, agency or a joint venture between you and Warsha.',
          'You decide whether to accept a job, when you work, which jobs you take, what you charge within the limits the platform displays, and how you carry out your trade. Warsha does not direct your method, set your hours, require exclusivity, or supervise you on site.',
          'You provide your own tools, transport and materials unless a specific booking says otherwise. You are responsible for your own insurance, for any licence or permit your trade requires, and for the safety of your work.',
          'You are responsible for your own taxes. Warsha does not withhold income tax on your behalf and does not file returns for you. Warsha will make your earnings records available so you can meet your obligations, and will comply with any reporting requirement placed on it by law.',
        ],
      },
      {
        heading: '3. Getting verified',
        body: [
          'Before you can take work you must complete verification. The Worker Verification Policy sets out exactly what is required, how each item is handled and who can see it. In summary, you must:',
          'The identity check exists so that a customer letting a stranger into their home knows Warsha established who that person is. It protects them, and it protects every honest worker on the platform from the ones who are not.',
        ],
        bullets: [
          'Verify your phone number.',
          'Provide the front and back of your Egyptian National ID.',
          'Confirm the identity fields — your legal name, date of birth and identity number — are correct. You confirm them; nothing is taken as correct without you saying so.',
          'Obtain an official criminal-record certificate (فيش وتشبيه) yourself from the competent authority and upload it. Warsha does not obtain it for you and has no access to any government system.',
          'Complete your profile: a photograph, a description of your work, the trades you offer and the area you cover.',
          'Accept this agreement and the notice covering how your documents are processed.',
        ],
      },
      {
        heading: '4. Provisional activation and later review',
        body: [
          'Once you have submitted your documents, confirmed your details and accepted this agreement, your account becomes provisionally active and you can start taking work. You do not wait for a member of staff.',
          'Your submission then enters a review queue, and a member of Warsha staff examines it afterwards. This is a deliberate choice: making every new worker wait days for a manual review costs honest people income for no safety benefit that the review could not deliver just as well a day later.',
          'Provisional activation is not a finding that your documents are genuine, that your identity is confirmed, or that your record is clear. It means your submission is complete enough to begin. Your profile shows customers that your review is still in progress; Warsha will not describe you as fully verified until it is.',
          'After review, staff may confirm your verification, ask you to correct something, suspend your account while a question is resolved, or deactivate it. Any of those may happen after you have already worked, and section 9 explains what that means for money you have earned.',
          'No automated system makes any of those decisions. Text extraction from your documents is assistance for filling in a form, nothing more, and it is explained in the OCR Usage Policy.',
        ],
      },
      {
        heading: '5. Your documents',
        body: [
          'Your National ID images and your criminal-record certificate are stored privately. They are never public, never carry a public link, and are never included in a data export.',
          'Only staff holding the specific capability to review them can open them, and every single access is recorded with who opened it, when, and under which capability. That record is kept whether or not anything was found.',
          'Warsha holds your original document and a reduced copy used for ordinary review, so that most review work does not require opening the original at all.',
          'Your documents are not used to train any machine-learning model. That is a hard rule in this version of the platform, not a current preference: the AI Usage Policy sets out the governance that would have to be completed, and the consent that would have to be obtained, before it could ever change.',
          'The Data Retention Register states how long each item is held. Where a retention period has not yet been settled by legal advice, the register says so rather than inventing one.',
        ],
      },
      {
        heading: '6. How you must work',
        body: [
          'The Worker Code of Conduct sets out the standard in detail. The core of it is this: turn up when you said you would, do what you agreed for what you agreed, tell the customer before doing anything extra, treat their home and their family with respect, and work safely.',
          'You must hold any licence or certification your trade legally requires, and you must not offer a trade you are not competent to perform.',
          'You must not ask a customer to pay outside the methods Warsha displays, ask them to cancel a booking and arrange it privately, or use a customer\'s contact details for anything other than the job. These protect the customer\'s recourse and your own — a job arranged off-platform has no dispute process, no payment record and no protection for either of you.',
          'You must not send anyone else to do a job in your place. The person the customer sees must be the person Warsha verified.',
        ],
      },
      {
        heading: '7. Bookings and cancellation',
        body: [
          'You are free to decline any booking. Declining is not held against you as a breach of this agreement, though a pattern of accepting and then cancelling is, because it is the customer who bears the cost of it.',
          'Once you accept a booking, it is a commitment. If you cannot make it, cancel as early as you can so the customer can find someone else, and where a cancellation fee applies under the Cancellation Policy it is shown to you before you confirm the cancellation.',
          'If you arrive and the work cannot be done for a reason that is not yours — nobody home, no access, a fault outside your trade — record it in the booking. The Cancellation Policy sets out what you are entitled to in that situation.',
        ],
      },
      {
        heading: '8. Payment, commission and payouts',
        body: [
          'You are paid for the work you do, less Warsha\'s commission.',
          'The commission rate applicable to you is displayed in the application before you accept a job. Warsha does not deduct a commission you have not been shown. Changing the commission rate, the way it is calculated, or the terms on which it is charged is a material change to this agreement: it requires a new version, a change summary, and your acceptance before it applies to work you take afterwards. It is never applied retroactively to a job you already accepted.',
          'Where a customer pays through Warsha, Warsha collects that payment as your limited payment agent, deducts commission, and credits the balance to your earnings. Where a customer pays you in cash, you have already been paid and the commission is settled against your account under the cash settlement terms displayed in the application.',
          'Earnings become available for withdrawal after the release period shown in the application, which exists so that a dispute raised shortly after a job can still be resolved against the money it concerns. Minimum withdrawal amounts and payout timing are displayed in the application.',
          'Warsha may withhold a payout where a dispute is open on the job it relates to, where there is a credible report of fraud, or where it is legally required to. Withholding is not a penalty and is not permanent; you will be told what is happening and the Appeals Policy applies.',
          'Every movement on your account is recorded in a ledger you can see. If a figure looks wrong, raise it — an error in your favour is as much an error.',
        ],
      },
      {
        heading: '9. If something is found after you have worked',
        body: [
          'If a review after your provisional activation finds a problem, what happens depends on what it is.',
          'A correctable problem — a blurred photograph, an expired document, a mismatched field — means you are asked to fix it. You may be restricted from taking new work until you do; work already booked is normally allowed to complete.',
          'A serious finding — a document that is not genuine, an identity that is not yours, a record that fails the eligibility policy — means suspension while it is examined, and may mean deactivation. Warsha will tell you the outcome and a reason you can act on. It will not publish it to customers.',
          'Money you have already earned for work you have actually completed remains yours, and Warsha will pay it out, except to the extent it is subject to an open dispute, a refund, or a finding of fraud. Warsha does not use a verification finding as a reason to keep money for work that was genuinely done.',
          'Every adverse decision may be appealed under the Appeals Policy, and an appeal is decided by someone other than the person who made the original decision.',
        ],
      },
      {
        heading: '10. Fraud and dishonesty',
        body: [
          'The following end an account, and Warsha will report them where the law requires it:',
          'If Warsha suspends you on suspicion of one of these, you will be told what is alleged in enough detail to answer it, unless telling you would defeat an investigation or put someone at risk.',
        ],
        bullets: [
          'Submitting a forged, altered or borrowed identity document or certificate.',
          'Working under someone else\'s verified account, or letting someone work under yours.',
          'Inventing work, inflating a price after the fact, or charging for materials not supplied.',
          'Manipulating reviews, ratings or referrals, including through accounts you control.',
          'Taking a customer off-platform to avoid commission, dispute handling or verification.',
        ],
      },
      {
        heading: '11. Ratings, reviews and your profile',
        body: [
          'Customers rate the work. Warsha does not remove a review because it is unfavourable, and does not alter one. It removes reviews that break the Content Policy — abuse, personal information, or a review of something other than the work.',
          'You may respond to any review publicly, once. Use it to give your side, not to identify or attack the customer.',
          'What appears on your public profile is set out in the Privacy Policy. Your identity documents, your certificate, your address, your phone number and your review history with Warsha staff are never part of it.',
        ],
      },
      {
        heading: '12. Suspension, deactivation and leaving',
        body: [
          'You may stop taking work at any time, and may close your account from the privacy centre. Closing your account does not cancel bookings you have already accepted and does not extinguish money owed in either direction.',
          'Warsha may suspend or deactivate your account for a breach of this agreement, a verification finding, a credible safety report, or a legal requirement. Where a customer\'s safety is credibly at issue, Warsha may suspend first and investigate immediately afterwards.',
          'A suspension is not a finding. Warsha will not describe a suspended worker to customers as having done anything, because at the point of suspension that has not been established.',
        ],
      },
      {
        heading: '13. Changes to this agreement',
        body: [
          'Warsha may publish a new version. Every version has a number, a publication date, an effective date and a summary of what changed, and every previous version stays available.',
          'A change to commission, payment or refund obligations, identity or criminal-record processing, machine processing of your documents, subprocessors, data retention, dispute rules, eligibility to work, suspension or termination, or limitation of liability is a material change. It requires a new version and your acceptance before you can keep taking work.',
          'Editorial corrections do not require you to accept again, and Warsha will not ask you to, because an agreement that asks for consent every week teaches everyone to stop reading it.',
          'If you decline a material change you keep access to your earnings records, your payout of money already earned, your export, your support cases, the appeals process and your ability to close your account. You will be shown precisely which functionality stops, before you decide. Declining is never recorded as acceptance.',
          'A change required urgently for safety or by law may restrict the affected functionality immediately. It is still versioned, still summarised, still audited, and still appealable.',
        ],
      },
      {
        heading: '14. Liability',
        body: [
          'You are responsible for the work you do and for any loss or injury it causes. You indemnify Warsha against claims arising from your work, your breach of this agreement, or your failure to hold a licence your trade requires.',
          'Warsha does not exclude liability for death or personal injury caused by its own negligence, for fraud, or for anything else that cannot lawfully be excluded. Subject to that, Warsha is not liable to you for indirect or consequential loss, including lost earnings from a suspension later found to be unjustified, beyond the earnings actually withheld.',
        ],
      },
      {
        heading: '15. Governing law and languages',
        body: [
          'This agreement is governed by the laws of the Arab Republic of Egypt and the Egyptian courts have jurisdiction over any dispute arising from it.',
          'It is published in English and Arabic. Both texts are complete. Where they differ the English text governs, and Warsha records which language you read when you accepted so that any difference can be traced to what you actually saw.',
        ],
      },
    ],
  },
  ar: {
    title: 'شروط وأحكام الصنايعي',
    summary:
      'الاتفاق بينك وبين ورشة لما تقدّم صنعتك من خلال ورشة. بيغطّي التحقق والسلوك والدفع والإيقاف والاستئناف.',
    sections: [
      {
        heading: '١. الاتفاق ده بين مين ومين',
        body: [
          'الاتفاق ده بينك، كصنايعي مستقل بيقدّم شغل من خلال ورشة، وبين ورشة، مشغّل تطبيق ومنصة ورشة.',
          'بيسري بالإضافة لميثاق سلوك الصنايعي وسياسة التحقق من الصنايعي وسياسة الاستخدام المقبول وسياسة المحتوى وسياسة الثقة والأمان وسياسة الاستئناف وسياسة الإلغاء وسياسة الاسترداد. المستندات دي جزء من الاتفاق ده ومتاحة في التطبيق في أي وقت.',
          'لو بتحجز شغل كعميل كمان، شروط العميل بتسري على ده لوحده وبتتقبل لوحدها.',
        ],
      },
      {
        heading: '٢. إنت مستقل',
        body: [
          'إنت متعاقد مستقل. الاتفاق ده مش بينشئ علاقة توظيف ولا شراكة ولا وكالة ولا مشروع مشترك بينك وبين ورشة.',
          'إنت اللي بتقرّر تقبل الشغلانة ولا لأ، وإمتى تشتغل، وأنهي شغلانات تاخد، وبتتقاضى كام في حدود اللي المنصة بتعرضه، وبتنفّذ صنعتك إزاي. ورشة مش بتوجّه طريقتك ولا بتحدّد ساعاتك ولا بتطلب حصرية ولا بتشرف عليك في الموقع.',
          'إنت بتوفّر عدّتك ومواصلاتك وخاماتك إلا لو حجز معيّن قال غير كده. إنت مسؤول عن تأمينك، وعن أي ترخيص أو تصريح صنعتك بتطلبه، وعن أمان شغلك.',
          'إنت مسؤول عن ضرايبك. ورشة مش بتخصم ضريبة دخل نيابة عنك ومش بتقدّم إقرارات عنك. ورشة هتوفّرلك سجلات أرباحك علشان تقدر تلتزم، وهتلتزم بأي مطلب إبلاغ القانون بيفرضه عليها.',
        ],
      },
      {
        heading: '٣. التحقق',
        body: [
          'قبل ما تقدر تاخد شغل لازم تكمّل التحقق. سياسة التحقق من الصنايعي بتحدّد بالظبط المطلوب إيه، وكل حاجة بتتعامل إزاي، ومين يقدر يشوفها. باختصار، لازم:',
          'التحقق من الهوية موجود علشان العميل اللي بيدخّل غريب بيته يعرف إن ورشة أثبتت الشخص ده مين. بيحميه هو، وبيحمي كل صنايعي أمين على المنصة من اللي مش أمين.',
        ],
        bullets: [
          'تأكّد رقم تليفونك.',
          'تقدّم وش وضهر بطاقة الرقم القومي المصرية.',
          'تأكّد إن بيانات الهوية — اسمك القانوني وتاريخ ميلادك ورقم هويتك — صحيحة. إنت اللي بتأكّدها؛ مفيش حاجة بتتاخد على إنها صح من غير ما تقولها إنت.',
          'تجيب فيش وتشبيه رسمي بنفسك من الجهة المختصة وترفعه. ورشة مش بتجيبه لك ومعندهاش أي وصول لأي نظام حكومي.',
          'تكمّل ملفك: صورة، ووصف لشغلك، والحرف اللي بتقدّمها، والمنطقة اللي بتغطيها.',
          'توافق على الاتفاق ده وعلى الإشعار الخاص بمعالجة مستنداتك.',
        ],
      },
      {
        heading: '٤. التفعيل المبدئي والمراجعة بعدين',
        body: [
          'بمجرد ما تقدّم مستنداتك وتأكّد بياناتك وتوافق على الاتفاق ده، حسابك بيبقى مفعّل مبدئياً وتقدر تبدأ تاخد شغل. مش هتستنى حد من الفريق.',
          'بعدين طلبك بيدخل طابور مراجعة، وحد من فريق ورشة بيفحصه بعد كده. ده اختيار مقصود: إن كل صنايعي جديد يستنى أيام لمراجعة يدوية بيكلّف ناس أمينة دخلها من غير فايدة أمان ما كانتش المراجعة هتحققها كويس برضه بعد يوم.',
          'التفعيل المبدئي مش إثبات إن مستنداتك سليمة، ولا إن هويتك اتأكّدت، ولا إن سجلك نضيف. معناه إن طلبك كامل بما يكفي للبداية. ملفك بيوضّح للعملاء إن مراجعتك لسه جارية؛ ورشة مش هتوصفك بإنك متحقق بالكامل قبل ما تخلص.',
          'بعد المراجعة، الفريق ممكن يأكّد تحققك، أو يطلب منك تصحّح حاجة، أو يوقف حسابك لحد ما سؤال يتحل، أو يلغي تفعيله. أي واحدة من دول ممكن تحصل بعد ما تكون اشتغلت بالفعل، والبند ٩ بيشرح ده معناه إيه للفلوس اللي كسبتها.',
          'مفيش نظام آلي بياخد أي قرار من دول. استخراج النص من مستنداتك مساعدة في ملء استمارة وبس، وموضّح في سياسة استخدام التعرف الضوئي على الحروف.',
        ],
      },
      {
        heading: '٥. مستنداتك',
        body: [
          'صور بطاقتك والفيش والتشبيه بتتخزن بشكل خاص. مش عامة أبداً، ومفيش ليها لينك عام أبداً، ومش بتتضمّن في أي تصدير بيانات أبداً.',
          'الفريق اللي عنده الصلاحية المحدّدة لمراجعتها بس هو اللي يقدر يفتحها، وكل مرة وصول بتتسجّل بمين فتح وإمتى وتحت أنهي صلاحية. السجل ده بيتحفظ سواء اتلاقى حاجة أو لأ.',
          'ورشة بتحتفظ بالمستند الأصلي وبنسخة مصغّرة بتُستخدم في المراجعة العادية، علشان أغلب شغل المراجعة ما يحتاجش فتح الأصل خالص.',
          'مستنداتك مش بتُستخدم في تدريب أي نموذج تعلّم آلي. دي قاعدة صارمة في النسخة دي من المنصة، مش تفضيل حالي: سياسة استخدام الذكاء الاصطناعي بتحدّد الحوكمة اللي لازم تكتمل، والموافقة اللي لازم تتاخد، قبل ما ده يتغيّر أصلاً.',
          'سجل الاحتفاظ بالبيانات بيوضّح كل حاجة بتتحفظ قد إيه. لما مدة احتفاظ ما تكونش اتحدّدت باستشارة قانونية، السجل بيقول كده بدل ما يخترع مدة.',
        ],
      },
      {
        heading: '٦. إزاي لازم تشتغل',
        body: [
          'ميثاق سلوك الصنايعي بيحدّد المستوى بالتفصيل. جوهره كالتالي: احضر في الميعاد اللي قلته، اعمل اللي اتفقت عليه بالسعر اللي اتفقت عليه، قول للعميل قبل ما تعمل أي حاجة زيادة، عامل بيته وأهله باحترام، واشتغل بأمان.',
          'لازم تكون حامل أي ترخيص أو شهادة صنعتك بتطلبها قانوناً، ولازم ما تقدّمش صنعة مش كفء لأدائها.',
          'ممنوع تطلب من عميل يدفع بره الطرق اللي ورشة بتعرضها، أو تطلب منه يلغي الحجز ويرتّبه على جنب، أو تستخدم بيانات تواصله في أي حاجة غير الشغلانة. دي بتحمي حق العميل في الرجوع وحقك إنت — الشغلانة المرتّبة بره المنصة مفيش لها آلية نزاع ولا سجل دفع ولا حماية لأي واحد فيكم.',
          'ممنوع تبعت حد تاني يعمل الشغلانة بدالك. الشخص اللي العميل بيشوفه لازم يكون الشخص اللي ورشة اتحققت منه.',
        ],
      },
      {
        heading: '٧. الحجوزات والإلغاء',
        body: [
          'إنت حر ترفض أي حجز. الرفض مش بيتحسب عليك كمخالفة للاتفاق ده، لكن نمط القبول وبعدين الإلغاء بيتحسب، لأن العميل هو اللي بيتحمّل تكلفته.',
          'بمجرد ما تقبل حجز، ده التزام. لو مش هتقدر توصل، ألغِ بأسرع ما تقدر علشان العميل يلاقي حد تاني، ولو في رسم إلغاء بيسري حسب سياسة الإلغاء بيتعرض عليك قبل ما تأكّد الإلغاء.',
          'لو وصلت والشغل ما ينفعش يتعمل لسبب مش منك — محدش في البيت، مفيش وصول، عطل بره صنعتك — سجّل كده في الحجز. سياسة الإلغاء بتحدّد إيه المستحق ليك في الحالة دي.',
        ],
      },
      {
        heading: '٨. الدفع والعمولة والتحويلات',
        body: [
          'بتتقاضى مقابل الشغل اللي بتعمله، ناقص عمولة ورشة.',
          'نسبة العمولة اللي بتسري عليك بتتعرض في التطبيق قبل ما تقبل الشغلانة. ورشة مش بتخصم عمولة ما اتعرضتش عليك. تغيير نسبة العمولة أو طريقة حسابها أو شروط تحصيلها بيعتبر تعديل جوهري للاتفاق ده: بيحتاج نسخة جديدة وملخّص تغيير وموافقتك قبل ما يسري على شغل بتاخده بعد كده. ومش بيتطبّق بأثر رجعي على شغلانة قبلتها بالفعل أبداً.',
          'لما العميل يدفع من خلال ورشة، ورشة بتحصّل الدفعة دي كوكيل دفع محدود عنك، وبتخصم العمولة، وبتضيف الباقي لأرباحك. لما العميل يدفعلك كاش، إنت اتقاضيت بالفعل والعمولة بتتسوّى على حسابك حسب شروط تسوية الكاش المعروضة في التطبيق.',
          'الأرباح بتبقى متاحة للسحب بعد مدة الإفراج المعروضة في التطبيق، وهي موجودة علشان النزاع اللي بيتطرح بعد الشغلانة بشوية يفضل ممكن يتحل على الفلوس اللي بيخصّها. الحد الأدنى للسحب ومواعيد التحويل معروضين في التطبيق.',
          'ورشة ممكن تحجز تحويل لما يكون في نزاع مفتوح على الشغلانة المرتبطة بيه، أو في بلاغ غش ذي مصداقية، أو لما تكون مُلزَمة قانوناً. الحجز مش عقوبة ومش دائم؛ هيتقالك اللي بيحصل وسياسة الاستئناف بتسري.',
          'كل حركة على حسابك متسجّلة في دفتر تقدر تشوفه. لو رقم شكله غلط، اطرحه — الغلط اللي في صالحك غلط برضه.',
        ],
      },
      {
        heading: '٩. لو اتلاقى حاجة بعد ما اشتغلت',
        body: [
          'لو مراجعة بعد تفعيلك المبدئي لاقت مشكلة، اللي بيحصل بيعتمد على المشكلة إيه.',
          'المشكلة القابلة للتصحيح — صورة مش واضحة، مستند منتهي، بيان مش متطابق — معناها إنك بتتطلب تصلّحها. ممكن تتقيّد من أخذ شغل جديد لحد ما تصلّح؛ الشغل المحجوز بالفعل عادةً بيتسمح له يكمل.',
          'النتيجة الخطيرة — مستند مش سليم، هوية مش بتاعتك، سجل مش مستوفي سياسة الأهلية — معناها إيقاف أثناء الفحص، وممكن تعني إلغاء التفعيل. ورشة هتقولك النتيجة وسبب تقدر تتصرف بناءً عليه. ومش هتنشره للعملاء.',
          'الفلوس اللي كسبتها بالفعل مقابل شغل عملته فعلاً بتفضل بتاعتك، وورشة هتحوّلها، إلا في حدود ما تكون محل نزاع مفتوح أو استرداد أو نتيجة غش مثبتة. ورشة مش بتستخدم نتيجة تحقق كسبب علشان تحتفظ بفلوس شغل اتعمل فعلاً.',
          'كل قرار سلبي ممكن يتستأنف حسب سياسة الاستئناف، والاستئناف بيقرّره حد غير اللي أخد القرار الأصلي.',
        ],
      },
      {
        heading: '١٠. الغش وعدم الأمانة',
        body: [
          'الحاجات دي بتنهي الحساب، وورشة هتبلّغ عنها لما القانون يطلب كده:',
          'لو ورشة أوقفتك للاشتباه في واحدة من دول، هيتقالك المُدّعى بتفصيل كافي للرد عليه، إلا لو ده هيفسد تحقيق أو يحطّ حد في خطر.',
        ],
        bullets: [
          'تقديم مستند هوية أو شهادة مزوّرة أو معدّلة أو مستعارة.',
          'الشغل تحت حساب متحقق بتاع حد تاني، أو السماح لحد يشتغل تحت حسابك.',
          'اختراع شغل، أو تضخيم سعر بعد الواقعة، أو تحصيل تمن خامات ما اتوردتش.',
          'التلاعب في التقييمات أو الترشيحات أو الدعوات، بما في ذلك من خلال حسابات إنت بتتحكم فيها.',
          'نقل عميل بره المنصة للتهرّب من العمولة أو التعامل مع النزاعات أو التحقق.',
        ],
      },
      {
        heading: '١١. التقييمات والمراجعات وملفك',
        body: [
          'العملاء بيقيّموا الشغل. ورشة مش بتشيل مراجعة لأنها مش في صالحك، ومش بتعدّل فيها. بتشيل المراجعات اللي بتخالف سياسة المحتوى — إساءة، أو معلومات شخصية، أو مراجعة لحاجة غير الشغل.',
          'تقدر ترد على أي مراجعة علناً، مرة واحدة. استخدمها تقول وجهة نظرك، مش علشان تحدّد هوية العميل أو تهاجمه.',
          'اللي بيظهر على ملفك العام موضّح في سياسة الخصوصية. مستندات هويتك والفيش وعنوانك ورقم تليفونك وسجل مراجعتك مع فريق ورشة مش جزء منه أبداً.',
        ],
      },
      {
        heading: '١٢. الإيقاف وإلغاء التفعيل والرحيل',
        body: [
          'تقدر تبطّل تاخد شغل في أي وقت، وتقدر تقفل حسابك من مركز الخصوصية. قفل حسابك مش بيلغي حجوزات قبلتها بالفعل ومش بيسقط فلوس مستحقة في أي اتجاه.',
          'ورشة ممكن توقف أو تلغي تفعيل حسابك بسبب مخالفة للاتفاق ده، أو نتيجة تحقق، أو بلاغ أمان ذي مصداقية، أو مطلب قانوني. لما يكون أمان عميل محل شك ذي مصداقية، ممكن ورشة توقف الأول وتحقق فوراً بعدها.',
          'الإيقاف مش إثبات. ورشة مش هتوصف صنايعي موقوف للعملاء بإنه عمل حاجة، لأن في لحظة الإيقاف ده ما اتثبتش.',
        ],
      },
      {
        heading: '١٣. تعديلات الاتفاق ده',
        body: [
          'ورشة ممكن تنشر نسخة جديدة. كل نسخة ليها رقم وتاريخ نشر وتاريخ سريان وملخّص لللي اتغيّر، وكل نسخة قديمة بتفضل متاحة.',
          'أي تعديل في العمولة أو التزامات الدفع أو الاسترداد أو معالجة الهوية أو الفيش أو المعالجة الآلية لمستنداتك أو المعالِجات الفرعية أو مدد الاحتفاظ أو قواعد النزاع أو أهلية الشغل أو الإيقاف أو الإنهاء أو حدود المسؤولية بيعتبر تعديل جوهري. بيحتاج نسخة جديدة وموافقتك قبل ما تكمل تاخد شغل.',
          'التصحيحات التحريرية مش بتحتاج موافقة تاني، وورشة مش هتطلبها، لأن الاتفاق اللي بيطلب موافقة كل أسبوع بيعلّم الكل يبطّل يقرا.',
          'لو رفضت تعديل جوهري بتفضل واصل لسجلات أرباحك، ولتحويل الفلوس اللي كسبتها بالفعل، ولتصديرك، ولطلبات دعمك، ولآلية الاستئناف، ولقدرتك تقفل حسابك. وهيتعرض عليك بالظبط إيه اللي هيقف، قبل ما تقرّر. الرفض مش بيتسجّل كموافقة أبداً.',
          'التعديل المطلوب بشكل عاجل لأسباب أمان أو بحكم القانون ممكن يقيّد الوظيفة المتأثرة فوراً. وبرضه بيتعمله نسخة وملخّص وتدقيق وبيفضل قابل للاستئناف.',
        ],
      },
      {
        heading: '١٤. المسؤولية',
        body: [
          'إنت مسؤول عن الشغل اللي بتعمله وعن أي خسارة أو إصابة بيسبّبها. وبتعوّض ورشة عن المطالبات الناشئة عن شغلك أو مخالفتك للاتفاق ده أو عدم حملك ترخيص صنعتك بتطلبه.',
          'ورشة مش بتستبعد المسؤولية عن الوفاة أو الإصابة الشخصية الناتجة عن إهمالها هي، ولا عن الغش، ولا عن أي حاجة مش ممكن قانوناً تتستبعد. مع مراعاة كده، ورشة مش مسؤولة تجاهك عن الخسارة غير المباشرة أو التبعية، بما فيها الأرباح الفايتة من إيقاف اتلاقى بعدين إنه مش مبرّر، أبعد من الأرباح المحجوزة فعلاً.',
        ],
      },
      {
        heading: '١٥. القانون الحاكم واللغات',
        body: [
          'الاتفاق ده بتحكمه قوانين جمهورية مصر العربية والمحاكم المصرية هي المختصة بأي نزاع ناشئ عنه.',
          'منشور بالإنجليزي والعربي. النصّين كاملين. لو اختلفوا النص الإنجليزي هو الحاكم، وورشة بتسجّل اللغة اللي قريت بيها وقت الموافقة علشان أي اختلاف يترجع للنص اللي شفته فعلاً.',
        ],
      },
    ],
  },
};

export const privacyPolicy: LegalDocument = {
  key: 'privacy_policy',
  version: '1.0',
  category: 'privacy',
  audience: 'all',
  authoritativeLanguage: 'en',
  requiresAcceptance: true,
  publishedAt: PUBLISHED,
  effectiveAt: PUBLISHED,
  supersedesVersion: null,
  changeClass: 'initial',
  changeSummary: {
    en: 'First published version of the Warsha privacy policy.',
    ar: 'أول نسخة منشورة من سياسة الخصوصية بتاعة ورشة.',
  },
  arabicIsSummary: false,
  sortOrder: 3,
  en: {
    title: 'Privacy Policy',
    summary:
      'What Warsha collects, why it collects it, who can see it, how long it is kept, and what you can do about all of that.',
    sections: [
      {
        heading: '1. Scope',
        body: [
          'This policy covers the Warsha application and platform, for customers and for workers. It is the document that governs; where any other Warsha text describes data handling, this one prevails.',
          'It describes what Warsha does today. Where a capability has been approved but is not yet in use, this policy says so explicitly and names the version that would introduce it. Warsha does not describe processing it does not perform.',
        ],
      },
      {
        heading: '2. What Warsha collects',
        body: [
          'Account and identity. Your name, phone number, and email address if you provide one. Workers additionally provide National ID images, the identity fields printed on them, and an official criminal-record certificate.',
          'Location. The addresses you save, and the map pin you confirm for each. A pin is required before a real booking because an approximate address sends someone to the wrong building. Device location is optional; you can always place the pin by hand, and Warsha never collects location in the background or while the application is closed.',
          'Bookings and work. What you booked, from whom, when, for how much, what happened, and the messages exchanged about it.',
          'Payments. Amounts, methods, ledger entries, payouts and refunds. Warsha does not store your full card number.',
          'Reviews and reports. Ratings and reviews you write or receive, and any report you make or that is made about you.',
          'Support. Your conversations with support, and the case record.',
          'Device and diagnostics. Application version, platform, and crash reports if you have not turned them off. These contain no message content and no addresses.',
        ],
      },
      {
        heading: '3. Why Warsha collects it, and on what basis',
        body: [
          'To provide the service you asked for: your account, your bookings, your messages, your payments. Without this there is no product.',
          'To keep people safe: verifying workers before they enter a home, investigating reports, detecting fraud, and enforcing the Trust and Safety Policy.',
          'To meet obligations: keeping the financial and dispute records that operating a marketplace requires, and responding to lawful requests.',
          'With your consent, and only where you have given it: optional marketing messages, referral notifications, diagnostics and device location. Each is a separate choice in the privacy centre, each is off until you turn it on, and turning one off does not turn off anything else.',
          'A note on lawful basis. Egyptian data protection law and its executive regulations continue to develop. This policy describes Warsha\'s actual purposes honestly rather than asserting a legal characterisation that has not been settled by advice. The Data Processing Register records the basis proposed for each activity and marks it as pending legal review where it is. Warsha would rather tell you what it does and say that the legal classification is unsettled than tell you a classification and be wrong.',
        ],
      },
      {
        heading: '4. Identity documents and criminal-record certificates',
        body: [
          'This is the most sensitive information Warsha holds, and it is handled differently from everything else.',
          'You obtain your criminal-record certificate yourself from the competent Egyptian authority and upload it. Warsha has no integration with the Ministry of Interior, no access to any government system, and no ability to look your record up. It sees what you upload and nothing else.',
          'Documents are stored in private storage. There is no public link. They are never included in a data export, because a copy of your identity document sitting in your downloads folder is a copy outside anyone\'s control.',
          'Only staff holding the specific capability to review them can open them. Every access is recorded — who, when, under which capability — and that log is kept whether or not anything was found. Opening a certificate requires a stronger capability than opening an ID, and re-authentication.',
          'Offence detail from a certificate is never stored alongside your account record. It exists only in a separate reviewer assessment that no client application can read and that is never returned to any device.',
          'No machine decides anything here. Text extraction helps you fill in a form; the OCR Usage Policy explains it in full. No automated system determines whether a document is genuine, whether an identity is yours, or whether a record makes you eligible to work. Those are human decisions, and an adverse one always requires a person to confirm it.',
          'Your documents are not used to train machine-learning models. See the AI Usage Policy for the governance that would have to be completed before that could ever change, and for the consent that would be required.',
        ],
      },
      {
        heading: '5. Who can see what',
        body: [
          'Other users. A customer sees a worker\'s profile, trades, area, ratings and reviews. A worker sees the customer\'s first name, the booking, and the address detail needed to reach them — released at the point in the booking where they need it, not before. Neither sees the other\'s full contact details outside an active booking.',
          'Warsha staff. Access follows capability, not job title. A support agent handling your case sees your case; they do not see your identity documents. Every staff view of sensitive information is logged and reviewable.',
          'Service providers. Warsha uses a small number of suppliers to run the platform. Every one is listed in the Subprocessor Register with what it processes and where. The register also lists suppliers that have been approved but are not yet in use, marked as such, so you can see what is coming before it arrives.',
          'Nobody else. Warsha does not sell your information, does not share it for advertising, and does not allow third parties to track you across other applications.',
          'Legal requests. Warsha will disclose information where the law requires it. It will tell you when it is permitted to.',
        ],
      },
      {
        heading: '6. How long it is kept',
        body: [
          'The Data Retention Register lists each category with its trigger and period.',
          'Where a period has not yet been settled, the register says so and the item is marked for manual review rather than automatic deletion. Warsha would rather hold something a while longer under review than delete a record it turns out to be required to keep, or claim a statutory period that does not exist.',
          'Booking, payment and dispute records outlive an account, because they concern two people and one of them may still need them.',
          'When you close your account, your personal identifiers are removed or replaced and the records that must survive are anonymised. What that means in practice for each category is in the register.',
        ],
      },
      {
        heading: '7. What you can do',
        body: [
          'From the privacy centre in the application you can:',
          'Warsha will not degrade your experience, hide functionality, or ask you repeatedly to reverse a privacy choice you have made.',
        ],
        bullets: [
          'See what is stored about you.',
          'Correct it.',
          'Export it, in a machine-readable form. Identity documents and certificates are excluded, and the export tells you so.',
          'Change any optional consent, at any time, without giving a reason.',
          'Deactivate your account temporarily.',
          'Ask for your account to be deleted, with a cooling-off period during which you can change your mind.',
          'Clear your local history.',
        ],
      },
      {
        heading: '8. Security',
        body: [
          'Access to data is enforced in the database itself, on every table, so that a mistake in an application cannot expose a record the database would refuse to return.',
          'Sensitive documents are in private storage reached only through short-lived links issued to a reviewer with the right capability.',
          'Staff actions on sensitive data are audited.',
          'No system is perfect. If Warsha discovers a breach affecting you it will tell you what happened, what it concerns, and what to do, under the Incident Response Policy. Warsha does not claim to have undergone penetration testing or any security certification, and will not until it has.',
        ],
      },
      {
        heading: '9. Children',
        body: [
          'Warsha is not for anyone under 18. Warsha does not knowingly collect information from children, and will delete it if it learns it has.',
        ],
      },
      {
        heading: '10. Changes to this policy',
        body: [
          'Every version of this policy is numbered, dated and kept. The Version History lists all of them.',
          'A change to what is collected, why, who it is shared with, how long it is kept, whether documents are used for machine learning, or which suppliers process it is a material change: it requires a new version and your acceptance before the affected functionality continues.',
          'Editorial changes do not require you to accept again. They still appear in the Version History.',
          'Adding a subprocessor is always treated as material. You will be told who, for what, and where, before it takes effect.',
        ],
      },
      {
        heading: '11. Contact',
        body: [
          'Privacy requests go through the privacy centre, which routes them to the people who can act on them and records them.',
          'The Legal Contact document lists the routes and the response expectations for privacy, legal and security matters.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الخصوصية',
    summary:
      'ورشة بتجمع إيه، وبتجمعه ليه، ومين يقدر يشوفه، وبيتحفظ قد إيه، وإنت تقدر تعمل إيه في ده كله.',
    sections: [
      {
        heading: '١. النطاق',
        body: [
          'السياسة دي بتغطّي تطبيق ومنصة ورشة، للعملاء وللصنايعية. وهي المستند الحاكم؛ لو أي نص تاني في ورشة وصف التعامل مع البيانات، ده هو اللي بيسود.',
          'بتوصف اللي ورشة بتعمله النهارده. لو في قدرة اتوافق عليها لكن لسه مش مستخدمة، السياسة دي بتقول كده صراحةً وبتسمّي النسخة اللي هتدخّلها. ورشة مش بتوصف معالجة مش بتعملها.',
        ],
      },
      {
        heading: '٢. ورشة بتجمع إيه',
        body: [
          'الحساب والهوية. اسمك ورقم تليفونك وإيميلك لو قدّمته. الصنايعية بيقدّموا كمان صور بطاقة الرقم القومي، وبيانات الهوية المطبوعة عليها، وفيش وتشبيه رسمي.',
          'الموقع. العناوين اللي بتحفظها، ودبوس الخريطة اللي بتأكّده لكل واحد. الدبوس مطلوب قبل أي حجز حقيقي لأن العنوان التقريبي بيبعت حد للعمارة الغلط. موقع الجهاز اختياري؛ تقدر دايماً تحطّ الدبوس بإيدك، وورشة مش بتجمع الموقع في الخلفية ولا والتطبيق مقفول أبداً.',
          'الحجوزات والشغل. حجزت إيه، من مين، إمتى، بكام، حصل إيه، والرسايل المتبادلة بخصوصه.',
          'المدفوعات. المبالغ والطرق وقيود الدفتر والتحويلات والاستردادات. ورشة مش بتخزّن رقم كارتك كامل.',
          'المراجعات والبلاغات. التقييمات والمراجعات اللي بتكتبها أو بتستلمها، وأي بلاغ بتعمله أو بيتعمل عنك.',
          'الدعم. محادثاتك مع الدعم، وسجل الحالة.',
          'الجهاز والتشخيص. نسخة التطبيق والمنصة وتقارير الأعطال لو ما قفلتهاش. مفيهاش محتوى رسايل ولا عناوين.',
        ],
      },
      {
        heading: '٣. ورشة بتجمعه ليه، وعلى أي أساس',
        body: [
          'علشان تقدّم الخدمة اللي طلبتها: حسابك وحجوزاتك ورسايلك ومدفوعاتك. من غير ده مفيش منتج.',
          'علشان تحافظ على أمان الناس: التحقق من الصنايعية قبل ما يدخلوا بيت، وفحص البلاغات، وكشف الغش، وتطبيق سياسة الثقة والأمان.',
          'علشان تلتزم: الاحتفاظ بالسجلات المالية وسجلات النزاعات اللي تشغيل سوق بيتطلبها، والرد على الطلبات القانونية.',
          'بموافقتك، ولما تكون إديتها بس: رسايل التسويق الاختيارية، وإشعارات الدعوات، والتشخيص، وموقع الجهاز. كل واحدة اختيار منفصل في مركز الخصوصية، وكل واحدة مقفولة لحد ما تفتحها، وقفل واحدة مش بيقفل غيرها.',
          'ملحوظة عن الأساس القانوني. قانون حماية البيانات المصري ولائحته التنفيذية لسه بيتطوّروا. السياسة دي بتوصف أغراض ورشة الفعلية بأمانة بدل ما تدّعي تكييف قانوني ما اتحسمش باستشارة. سجل معالجة البيانات بيسجّل الأساس المقترَح لكل نشاط وبيعلّمه كقيد المراجعة القانونية لما يكون كده. ورشة تفضّل تقولك بتعمل إيه وتقول إن التصنيف القانوني مش محسوم، على إنها تقولك تصنيف ويطلع غلط.',
        ],
      },
      {
        heading: '٤. مستندات الهوية والفيش والتشبيه',
        body: [
          'دي أكتر معلومات حساسة ورشة بتحتفظ بيها، وبتتعامل بشكل مختلف عن أي حاجة تانية.',
          'إنت بتجيب الفيش والتشبيه بنفسك من الجهة المصرية المختصة وبترفعه. ورشة مفيش عندها أي ربط مع وزارة الداخلية، ولا أي وصول لأي نظام حكومي، ولا أي قدرة تستعلم عن سجلك. بتشوف اللي بترفعه وبس.',
          'المستندات بتتخزن في تخزين خاص. مفيش لينك عام. ومش بتتضمّن في تصدير بيانات أبداً، لأن نسخة من مستند هويتك قاعدة في مجلد التنزيلات نسخة بره سيطرة أي حد.',
          'الفريق اللي عنده الصلاحية المحدّدة للمراجعة بس هو اللي يقدر يفتحها. كل وصول بيتسجّل — مين وإمتى وتحت أنهي صلاحية — والسجل ده بيتحفظ سواء اتلاقى حاجة أو لأ. فتح فيش بيتطلب صلاحية أقوى من فتح بطاقة، وإعادة توثيق.',
          'تفاصيل المخالفات من الفيش مش بتتخزن جنب سجل حسابك أبداً. بتوجد بس في تقييم مراجع منفصل مفيش تطبيق عميل يقدر يقراه ومش بيترجّع لأي جهاز أبداً.',
          'مفيش ماكينة بتقرّر أي حاجة هنا. استخراج النص بيساعدك تملا استمارة؛ سياسة استخدام التعرف الضوئي بتشرحها بالكامل. مفيش نظام آلي بيحدّد إذا كان المستند سليم، ولا إذا كانت الهوية بتاعتك، ولا إذا كان السجل بيخلّيك مؤهل للشغل. دي قرارات بشرية، والقرار السلبي دايماً بيتطلب شخص يأكّده.',
          'مستنداتك مش بتُستخدم في تدريب نماذج تعلّم آلي. شوف سياسة استخدام الذكاء الاصطناعي علشان الحوكمة اللي لازم تكتمل قبل ما ده يتغيّر أصلاً، والموافقة اللي هتكون مطلوبة.',
        ],
      },
      {
        heading: '٥. مين يقدر يشوف إيه',
        body: [
          'المستخدمين التانيين. العميل بيشوف ملف الصنايعي وحرفه ومنطقته وتقييماته ومراجعاته. الصنايعي بيشوف اسم العميل الأول والحجز وتفاصيل العنوان اللي محتاجها علشان يوصله — بتتاح في وقت الحجز اللي محتاجها فيه، مش قبل كده. ولا واحد فيهم بيشوف بيانات تواصل التاني كاملة بره حجز نشط.',
          'فريق ورشة. الوصول بيتبع الصلاحية مش المسمى الوظيفي. موظف الدعم اللي بيتعامل مع حالتك بيشوف حالتك؛ مش بيشوف مستندات هويتك. كل اطّلاع من الفريق على معلومة حساسة بيتسجّل وقابل للمراجعة.',
          'مقدّمو الخدمات. ورشة بتستخدم عدد صغير من الموردين علشان تشغّل المنصة. كل واحد مذكور في سجل المعالِجات الفرعية بالمعالجة اللي بيعملها وفين. السجل بيذكر كمان الموردين اللي اتوافق عليهم ولسه مش مستخدمين، معلّمين كده، علشان تشوف الجاي قبل ما يوصل.',
          'محدش غير كده. ورشة مش بتبيع معلوماتك، ومش بتشاركها للإعلانات، ومش بتسمح لأطراف تالتة تتبعك في تطبيقات تانية.',
          'الطلبات القانونية. ورشة هتفصح عن المعلومات لما القانون يطلب. وهتقولك لما يكون مسموح لها.',
        ],
      },
      {
        heading: '٦. بيتحفظ قد إيه',
        body: [
          'سجل الاحتفاظ بالبيانات بيسرد كل فئة بمُحفّزها ومدتها.',
          'لما المدة ما تكونش اتحسمت، السجل بيقول كده والبند بيتعلّم للمراجعة اليدوية بدل الحذف الآلي. ورشة تفضّل تحتفظ بحاجة مدة أطول شوية تحت المراجعة على إنها تحذف سجل يطلع مطلوب منها تحتفظ بيه، أو تدّعي مدة قانونية مش موجودة.',
          'سجلات الحجز والدفع والنزاع بتعيش بعد الحساب، لأنها بتخصّ شخصين وواحد فيهم ممكن لسه محتاجها.',
          'لما تقفل حسابك، معرّفاتك الشخصية بتتشال أو تتبدّل والسجلات اللي لازم تفضل بتتجهّل. ده معناه إيه عملياً لكل فئة موجود في السجل.',
        ],
      },
      {
        heading: '٧. إنت تقدر تعمل إيه',
        body: [
          'من مركز الخصوصية في التطبيق تقدر:',
          'ورشة مش هتقلّل تجربتك، ولا تخبّي وظايف، ولا تطلب منك بشكل متكرّر تتراجع عن اختيار خصوصية أخدته.',
        ],
        bullets: [
          'تشوف المتخزن عنك.',
          'تصحّحه.',
          'تصدّره، بصيغة تقراها الآلة. مستندات الهوية والفيش مستبعدة، والتصدير بيقولك كده.',
          'تغيّر أي موافقة اختيارية، في أي وقت، من غير ما تدّي سبب.',
          'توقف حسابك مؤقتاً.',
          'تطلب حذف حسابك، مع مدة تهدئة تقدر خلالها تغيّر رأيك.',
          'تمسح سجلك المحلي.',
        ],
      },
      {
        heading: '٨. الأمان',
        body: [
          'الوصول للبيانات بيتفرض في قاعدة البيانات نفسها، على كل جدول، علشان غلطة في تطبيق ما تقدرش تكشف سجل قاعدة البيانات كانت هترفض ترجّعه.',
          'المستندات الحساسة في تخزين خاص بيتوصله بس من خلال روابط قصيرة العمر بتتصدر لمراجع عنده الصلاحية الصح.',
          'تصرفات الفريق على البيانات الحساسة بتتدقّق.',
          'مفيش نظام كامل. لو ورشة اكتشفت اختراق بيأثّر عليك هتقولك حصل إيه وبيخصّ إيه وتعمل إيه، حسب سياسة الاستجابة للحوادث. ورشة مش بتدّعي إنها خضعت لاختبار اختراق ولا أي شهادة أمان، ومش هتدّعي لحد ما يحصل.',
        ],
      },
      {
        heading: '٩. الأطفال',
        body: [
          'ورشة مش لأي حد تحت ١٨ سنة. ورشة مش بتجمع معلومات من أطفال عن علم، وهتحذفها لو عرفت إنها عملت كده.',
        ],
      },
      {
        heading: '١٠. تعديلات السياسة دي',
        body: [
          'كل نسخة من السياسة دي مرقّمة ومؤرّخة ومحفوظة. سجل النسخ بيسردهم كلهم.',
          'أي تعديل في المجموع إيه، أو ليه، أو بيتشارك مع مين، أو بيتحفظ قد إيه، أو إذا كانت المستندات بتُستخدم في التعلّم الآلي، أو أنهي موردين بيعالجوه بيعتبر تعديل جوهري: بيحتاج نسخة جديدة وموافقتك قبل ما الوظيفة المتأثرة تكمل.',
          'التعديلات التحريرية مش بتحتاج موافقة تاني. وبرضه بتظهر في سجل النسخ.',
          'إضافة معالِج فرعي بتتعامل دايماً كتعديل جوهري. هيتقالك مين وليه وفين، قبل ما يسري.',
        ],
      },
      {
        heading: '١١. التواصل',
        body: [
          'طلبات الخصوصية بتروح من خلال مركز الخصوصية، اللي بيوجّهها للناس اللي يقدروا يتصرفوا فيها وبيسجّلها.',
          'مستند جهة الاتصال القانونية فيه الطرق وتوقعات الرد لمسائل الخصوصية والقانون والأمان.',
        ],
      },
    ],
  },
};

export const workerVerificationPolicy: LegalDocument = {
  key: 'worker_verification_policy',
  version: '1.0',
  category: 'privacy',
  audience: 'worker',
  authoritativeLanguage: 'en',
  requiresAcceptance: true,
  publishedAt: PUBLISHED,
  effectiveAt: PUBLISHED,
  supersedesVersion: null,
  changeClass: 'initial',
  changeSummary: {
    en: 'First published version of the worker verification policy.',
    ar: 'أول نسخة منشورة من سياسة التحقق من الصنايعي.',
  },
  arabicIsSummary: false,
  sortOrder: 4,
  en: {
    title: 'Worker Verification Policy',
    summary:
      'Exactly what Warsha asks a worker for, what it does with it, who sees it, what it decides and what it cannot decide.',
    sections: [
      {
        heading: '1. Why verification exists',
        body: [
          'A customer booking through Warsha is letting a stranger into their home, often when they are alone in it. Verification is the only thing standing between that customer and someone who is not who they say they are.',
          'It also protects you. A platform where anyone can claim any identity is a platform where the honest majority carries the reputation of the dishonest few.',
        ],
      },
      {
        heading: '2. What is required',
        body: [
          'Every item below is required before an account may take work.',
        ],
        bullets: [
          'A verified phone number.',
          'The front and back of a valid Egyptian National ID.',
          'Your confirmation of the identity fields — legal name, date of birth, identity number, expiry date.',
          'An official criminal-record certificate (فيش وتشبيه), obtained by you and uploaded by you.',
          'A profile photograph showing your face.',
          'Your trades and service area.',
          'Acceptance of the Worker Terms and of this policy.',
        ],
      },
      {
        heading: '3. The criminal-record certificate',
        body: [
          'You obtain the certificate yourself, from the competent Egyptian authority, through the ordinary public process. Warsha plays no part in it.',
          'Warsha has no integration with the Ministry of Interior. It has no API, no privileged access and no ability to look up your record, confirm a certificate\'s authenticity with the issuer, or obtain one on your behalf. If any Warsha screen ever appears to suggest otherwise, this policy governs and that screen is wrong.',
          'Warsha accepts a PDF, JPEG or PNG, captured or uploaded. The size limit is shown at the point of upload.',
          'A certificate must be legible and current. If it is not, you will be asked for another; that request is not a finding about you.',
        ],
      },
      {
        heading: '4. Eligibility',
        body: [
          'Whether a record affects eligibility is decided under a written, versioned eligibility policy, reviewed by a person, against the version in force on the day of the decision.',
          'Warsha does not operate a rule that any offence within a fixed recent period automatically disqualifies a worker. Such a rule is easy to write and hard to defend, and it would end livelihoods on an arithmetic nobody had examined.',
          'The eligibility policy in force is recorded with its version and its review status. As at this version, no eligibility policy has been through legal review, and Warsha states that rather than implying an approval it has not obtained.',
          'No adverse eligibility decision is ever made automatically. A person makes it, a person confirms it, and the reason is recorded in a form that can be shown to you and examined on appeal.',
        ],
      },
      {
        heading: '5. Machine assistance, and its limits',
        body: [
          'Text extracted from a document is used for one thing: pre-filling the form you then check. You confirm every field. An unconfirmed extraction is never treated as a fact about you.',
          'Extraction confidence is internal. It is never shown to you, never shown to a customer, and never used as a reason for any decision.',
          'No automated process determines whether a document is genuine, whether it is yours, whether it has been altered, or whether your record makes you eligible. Each of those is a human judgement, and each adverse one requires a human to confirm it. A low-confidence or ambiguous extraction never produces a rejection.',
          'The OCR Usage Policy and the AI Usage Policy set this out in full, including what would have to happen before any of it changed.',
        ],
      },
      {
        heading: '6. Provisional activation',
        body: [
          'When your submission is complete you become provisionally active immediately and can take work. Staff review happens afterwards.',
          'Provisional activation means your submission is complete. It is not a finding that your documents are genuine or your record is clear, and Warsha does not describe you to customers as fully verified until review is done.',
          'Review may confirm your verification, ask for a correction, suspend your account, or deactivate it. Section 9 of the Worker Terms explains what each means for work you have already done and money you have already earned.',
        ],
      },
      {
        heading: '7. Who can see your documents',
        body: [
          'Only staff holding the specific capability. Reviewing an identity document and opening a criminal-record certificate are separate capabilities, and the second is the more restricted of the two and requires re-authentication.',
          'Every access is logged with the reviewer, the time and the capability used, whether or not anything was found.',
          'A reviewer sees what they need for the decision in front of them. They do not see your unrelated account history, your messages, or your payment records.',
          'Offence detail is recorded only in a private reviewer assessment. It is never stored on your account record, never returned to any application, and never included in a notification.',
        ],
      },
      {
        heading: '8. Corrections, rejection and appeal',
        body: [
          'If something is wrong you are told what, in terms you can act on. "Your document was rejected" is not a reason; "the back of your ID is cut off at the bottom edge" is.',
          'A rejection is never recorded without evidence of what the reviewer actually saw. That evidence is kept, and it is what an appeal examines.',
          'You may appeal any adverse decision. An appeal is decided by someone other than the person who made the original decision — that separation is enforced by the system, not by convention.',
          'A rejection is not permanent unless it is a finding of fraud. If the reason was a correctable problem, correct it and resubmit.',
        ],
      },
      {
        heading: '9. Retention',
        body: [
          'Your original document is retained for at least one year from upload, so that a dispute, a safety report or an audit arising after the fact can be examined against what was actually submitted.',
          'A reduced copy is held for ordinary review, so that most review work does not require opening the original.',
          'Extraction candidates are superseded once you confirm your fields.',
          'Raw provider responses are not retained. What is kept is the extracted fields, a confidence value, a hash of the document, the provider version and the timestamp — enough to audit what happened, not a second copy of your document in another form.',
          'Longer periods are in the Data Retention Register. Where one has not been settled by legal advice, the register says so.',
        ],
      },
      {
        heading: '10. Changes',
        body: [
          'A change to what is required, how documents are processed, who can see them, how long they are kept, or how eligibility is decided is a material change requiring a new version and your acceptance.',
          'Introducing an external processor for extraction is a material change and an addition to the Subprocessor Register. You will be told before it takes effect.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة التحقق من الصنايعي',
    summary:
      'بالظبط ورشة بتطلب إيه من الصنايعي، وبتعمل بيه إيه، ومين بيشوفه، وبتقرّر إيه ومش بتقدر تقرّر إيه.',
    sections: [
      {
        heading: '١. التحقق موجود ليه',
        body: [
          'العميل اللي بيحجز من خلال ورشة بيدخّل غريب بيته، كتير وهو لوحده فيه. التحقق هو الحاجة الوحيدة الواقفة بين العميل ده وبين حد مش اللي بيدّعيه.',
          'وبيحميك إنت كمان. المنصة اللي أي حد يقدر يدّعي فيها أي هوية هي منصة الأغلبية الأمينة فيها بتشيل سمعة القلة غير الأمينة.',
        ],
      },
      {
        heading: '٢. المطلوب إيه',
        body: ['كل بند تحت مطلوب قبل ما أي حساب ياخد شغل.'],
        bullets: [
          'رقم تليفون متحقق منه.',
          'وش وضهر بطاقة رقم قومي مصرية سارية.',
          'تأكيدك لبيانات الهوية — الاسم القانوني وتاريخ الميلاد ورقم الهوية وتاريخ الانتهاء.',
          'فيش وتشبيه رسمي، إنت اللي بتجيبه وإنت اللي بترفعه.',
          'صورة شخصية بتوضّح وشك.',
          'حرفك ومنطقة خدمتك.',
          'الموافقة على شروط الصنايعي وعلى السياسة دي.',
        ],
      },
      {
        heading: '٣. الفيش والتشبيه',
        body: [
          'إنت بتجيب الشهادة بنفسك، من الجهة المصرية المختصة، من خلال الإجراء العام العادي. ورشة مالهاش أي دور فيه.',
          'ورشة مفيش عندها ربط مع وزارة الداخلية. مفيش واجهة برمجية ولا وصول متميّز ولا أي قدرة تستعلم عن سجلك أو تأكّد سلامة شهادة مع جهة إصدارها أو تجيب واحدة نيابةً عنك. لو أي شاشة في ورشة يوماً ما بدت بتوحي بغير كده، السياسة دي هي الحاكمة والشاشة دي غلط.',
          'ورشة بتقبل PDF أو JPEG أو PNG، مصوّر أو مرفوع. حد الحجم بيتعرض وقت الرفع.',
          'الشهادة لازم تكون واضحة وحديثة. لو مش كده، هيتطلب منك واحدة تانية؛ الطلب ده مش إثبات حاجة عنك.',
        ],
      },
      {
        heading: '٤. الأهلية',
        body: [
          'إذا كان السجل بيأثّر على الأهلية بيتقرّر تحت سياسة أهلية مكتوبة ومُصدَرة بنسخ، بيراجعها شخص، مقابل النسخة السارية يوم القرار.',
          'ورشة مش بتشغّل قاعدة إن أي مخالفة خلال مدة حديثة ثابتة بتسقط أهلية الصنايعي تلقائياً. القاعدة دي سهل تتكتب وصعب تتدافع عنها، وكانت هتنهي أرزاق بحسبة محدش فحصها.',
          'سياسة الأهلية السارية متسجّلة بنسختها وبحالة مراجعتها. لحد النسخة دي، مفيش سياسة أهلية عدّت مراجعة قانونية، وورشة بتقول كده بدل ما توحي بموافقة ما حصلتش عليها.',
          'مفيش قرار أهلية سلبي بيتاخد آلياً أبداً. شخص بياخده، وشخص بيأكّده، والسبب بيتسجّل بصيغة ممكن تتعرض عليك وتتفحص في الاستئناف.',
        ],
      },
      {
        heading: '٥. المساعدة الآلية وحدودها',
        body: [
          'النص المستخرج من مستند بيتستخدم في حاجة واحدة: ملء مبدئي للاستمارة اللي بتراجعها بعد كده. إنت بتأكّد كل بيان. الاستخراج غير المؤكَّد مش بيتعامل كحقيقة عنك أبداً.',
          'ثقة الاستخراج داخلية. مش بتتعرض عليك أبداً، ولا على عميل، ولا بتُستخدم كسبب لأي قرار.',
          'مفيش عملية آلية بتحدّد إذا كان المستند سليم، ولا إذا كان بتاعك، ولا إذا كان اتعدّل، ولا إذا كان سجلك بيخلّيك مؤهل. كل واحدة من دول حكم بشري، وكل قرار سلبي منها بيتطلب إنسان يأكّده. الاستخراج منخفض الثقة أو الملتبس مش بيُنتج رفض أبداً.',
          'سياسة استخدام التعرف الضوئي وسياسة استخدام الذكاء الاصطناعي بيوضّحوا ده بالكامل، بما فيه اللي لازم يحصل قبل ما أي حاجة منه تتغيّر.',
        ],
      },
      {
        heading: '٦. التفعيل المبدئي',
        body: [
          'لما طلبك يكتمل بتبقى مفعّل مبدئياً على طول وتقدر تاخد شغل. مراجعة الفريق بتحصل بعدين.',
          'التفعيل المبدئي معناه إن طلبك كامل. مش إثبات إن مستنداتك سليمة ولا إن سجلك نضيف، وورشة مش بتوصفك للعملاء كمتحقق بالكامل قبل ما المراجعة تخلص.',
          'المراجعة ممكن تأكّد تحققك، أو تطلب تصحيح، أو توقف حسابك، أو تلغي تفعيله. البند ٩ من شروط الصنايعي بيشرح كل واحدة معناها إيه للشغل اللي عملته والفلوس اللي كسبتها.',
        ],
      },
      {
        heading: '٧. مين يقدر يشوف مستنداتك',
        body: [
          'الفريق اللي عنده الصلاحية المحدّدة بس. مراجعة مستند هوية وفتح فيش وتشبيه صلاحيتين منفصلتين، والتانية أضيق وبتتطلب إعادة توثيق.',
          'كل وصول بيتسجّل بالمراجع والوقت والصلاحية المستخدمة، سواء اتلاقى حاجة أو لأ.',
          'المراجع بيشوف اللي محتاجه للقرار اللي قدامه. مش بيشوف سجل حسابك غير المتعلق، ولا رسايلك، ولا سجلات دفعك.',
          'تفاصيل المخالفات بتتسجّل بس في تقييم مراجع خاص. مش بتتخزن على سجل حسابك أبداً، ولا بترجع لأي تطبيق، ولا بتتضمّن في إشعار.',
        ],
      },
      {
        heading: '٨. التصحيح والرفض والاستئناف',
        body: [
          'لو في حاجة غلط بيتقالك إيه، بصيغة تقدر تتصرف بناءً عليها. «مستندك اترفض» ده مش سبب؛ «ضهر البطاقة مقطوع من الحافة السفلية» ده سبب.',
          'الرفض مش بيتسجّل من غير دليل على اللي المراجع شافه فعلاً. الدليل ده بيتحفظ، وهو اللي الاستئناف بيفحصه.',
          'تقدر تستأنف أي قرار سلبي. الاستئناف بيقرّره حد غير اللي أخد القرار الأصلي — الفصل ده بيفرضه النظام، مش العُرف.',
          'الرفض مش دائم إلا لو كان إثبات غش. لو السبب كان مشكلة قابلة للتصحيح، صلّحها وقدّم تاني.',
        ],
      },
      {
        heading: '٩. الاحتفاظ',
        body: [
          'مستندك الأصلي بيتحفظ سنة على الأقل من الرفع، علشان أي نزاع أو بلاغ أمان أو تدقيق بيظهر بعدين يتفحص مقابل اللي اتقدّم فعلاً.',
          'نسخة مصغّرة بتتحفظ للمراجعة العادية، علشان أغلب شغل المراجعة ما يحتاجش فتح الأصل.',
          'مرشحات الاستخراج بتتجاوَز بمجرد ما تأكّد بياناتك.',
          'ردود المزوّد الخام مش بتتحفظ. اللي بيتحفظ هو البيانات المستخرجة وقيمة ثقة وبصمة للمستند ونسخة المزوّد والتوقيت — كفاية لتدقيق اللي حصل، مش نسخة تانية من مستندك بشكل تاني.',
          'المدد الأطول في سجل الاحتفاظ بالبيانات. لما واحدة ما تكونش اتحسمت باستشارة قانونية، السجل بيقول كده.',
        ],
      },
      {
        heading: '١٠. التعديلات',
        body: [
          'أي تعديل في المطلوب، أو طريقة معالجة المستندات، أو مين يقدر يشوفها، أو مدة حفظها، أو طريقة تقرير الأهلية بيعتبر تعديل جوهري بيحتاج نسخة جديدة وموافقتك.',
          'إدخال معالِج خارجي للاستخراج تعديل جوهري وإضافة لسجل المعالِجات الفرعية. هيتقالك قبل ما يسري.',
        ],
      },
    ],
  },
};
