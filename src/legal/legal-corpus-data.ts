/**
 * WPS-024 — the data-processing documents.
 *
 * These describe machine processing, location handling, retention and cookies.
 * Arabic here is a faithful summary rather than a full parallel text, and the
 * reader is told so on the page. The line is drawn deliberately: text a person
 * is asked to AGREE to is published in full in both languages (see
 * `legal-corpus-agreements.ts` and `legal-corpus-conduct.ts`); text that
 * EXPLAINS how a system works carries a complete Arabic summary and names
 * English as authoritative. Publishing a machine-assisted Arabic rendering of
 * a technical policy and calling it binding would be worse than either.
 *
 * The hardest thing to get right in this file is tense. Google Cloud Vision
 * and Google Maps Platform are the approved providers; neither is integrated
 * in this version. So these documents say "approved, not yet in use", name the
 * governance that turns one on, and are explicit that switching one on is a
 * material change requiring a new version and renewed acceptance. A privacy
 * document written in the present tense about processing that does not happen
 * is a false statement about someone's personal data, and the fact that it
 * would become true later does not make it true now.
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

export const aiUsagePolicy: LegalDocument = {
  key: 'ai_usage_policy',
  category: 'privacy',
  audience: 'all',
  sortOrder: 13,
  ...initial(
    'First published version of the AI usage policy.',
    'أول نسخة منشورة من سياسة استخدام الذكاء الاصطناعي.',
  ),
  en: {
    title: 'AI Usage Policy',
    summary:
      'Where Warsha uses machine processing, what it is never allowed to decide, and the governance that would be required before your documents could ever train a model.',
    sections: [
      {
        heading: '1. Where machine processing is used',
        body: [
          'One place is approved: extracting the text printed on a worker\'s identity document so the worker does not have to type it. That is described in the OCR Usage Policy.',
          'The approved provider is Google Cloud Vision, called server-side only. As at this version it is not yet integrated: no document has been sent to it, and identity fields are entered by hand. The Subprocessor Register records it as approved and not yet in use.',
          'Turning it on is a material change under section 11 of the governance framework. It requires a new version of this policy, the OCR Usage Policy and the Privacy Policy, an updated Subprocessor Register, a governance decision, and renewed acceptance from affected workers before their documents are processed by it.',
          'Warsha uses no other machine learning. There is no automated ranking model, no automated pricing model, no automated content moderation model, and no generative feature.',
        ],
      },
      {
        heading: '2. What machine processing may never decide',
        body: [
          'These are absolute limits, enforced in the platform rather than stated as an intention:',
          'A low-confidence or ambiguous extraction never produces a rejection. Confidence values are internal, never shown to the person, never shown to a customer, and never a reason for a decision.',
        ],
        bullets: [
          'Whether an identity document is genuine.',
          'Whether a document belongs to the person who submitted it.',
          'Whether a document has been altered.',
          'Whether a criminal record makes someone eligible to work.',
          'Whether an account is suspended, restricted or closed.',
          'The outcome of an appeal.',
        ],
      },
      {
        heading: '3. Human decision-making',
        body: [
          'Every adverse decision about a person on Warsha is made by a person, recorded with the evidence they actually saw, and open to appeal to a different person.',
          'Machine output may be shown to a reviewer as information. It is never presented as a recommendation, a score, or a conclusion, because a reviewer shown a score decides the score rather than the case.',
        ],
      },
      {
        heading: '4. Training',
        body: [
          'Identity documents, criminal-record certificates and the fields extracted from them are not used to train, fine-tune, evaluate or improve any machine-learning model. Not by Warsha, and not by a provider on Warsha\'s behalf.',
          'This is not a current preference that a future team could quietly reverse. Changing it requires all of the following, and the platform is built so that none can be skipped:',
        ],
        bullets: [
          'A recorded governance decision, taken by people with the authority to take it.',
          'An updated version of this policy, the Privacy Policy and the Worker Verification Policy.',
          'An updated Subprocessor Register and Data Processing Register.',
          'Notice to every affected person, in advance, stating what would be used and for what.',
          'Explicit, separately recorded consent from each person whose documents would be included, where consent is the basis relied on.',
          'A versioned rollout, so that it is always known which documents were in scope from which date.',
        ],
      },
      {
        heading: '5. Provider terms',
        body: [
          'Where a provider is engaged, Warsha will only engage one whose terms prohibit using Warsha\'s data to improve the provider\'s own models, and the register records that this was checked.',
          'A provider that requires such use is not eligible to be a Warsha subprocessor for identity data.',
        ],
      },
      {
        heading: '6. Future features',
        body: [
          'Warsha may add machine-assisted features later — better search, fraud signals, help-centre assistance.',
          'Each would require its own entry in this policy, its own governance decision, and its own assessment of what it may and may not decide. None may cross the limits in section 2, and none may take a decision about a person without a human confirming it.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة استخدام الذكاء الاصطناعي',
    summary:
      'ملخّص عربي كامل للسياسة. النص الإنجليزي هو الحاكم. ورشة بتستخدم المعالجة الآلية فين، وممنوع عليها تقرّر إيه، والحوكمة المطلوبة قبل ما مستنداتك تدرّب أي نموذج.',
    sections: [
      {
        heading: '١. المعالجة الآلية بتُستخدم فين',
        body: [
          'في مكان واحد متوافق عليه: استخراج النص المطبوع على مستند هوية الصنايعي علشان ما يضطرش يكتبه. ده موصوف في سياسة استخدام التعرف الضوئي.',
          'المزوّد المعتمد هو Google Cloud Vision، وبيتنادى من الخادم بس. لحد النسخة دي هو لسه مش مدمج: مفيش مستند اتبعت له، وبيانات الهوية بتتكتب بالإيد. سجل المعالِجات الفرعية بيسجّله كمعتمد ومش مستخدم لسه.',
          'تشغيله تعديل جوهري تحت البند ١١ من إطار الحوكمة. بيتطلب نسخة جديدة من السياسة دي ومن سياسة التعرف الضوئي ومن سياسة الخصوصية، وسجل معالِجات فرعية محدّث، وقرار حوكمة، وموافقة متجدّدة من الصنايعية المتأثرين قبل ما مستنداتهم تتعالج بيه.',
          'ورشة مش بتستخدم أي تعلّم آلي تاني. مفيش نموذج ترتيب آلي، ولا نموذج تسعير آلي، ولا نموذج مراجعة محتوى آلي، ولا أي خاصية توليدية.',
        ],
      },
      {
        heading: '٢. ممنوع على المعالجة الآلية تقرّر إيه',
        body: [
          'دي حدود مطلقة، مفروضة في المنصة مش مجرد نية معلنة:',
          'الاستخراج منخفض الثقة أو الملتبس مش بيُنتج رفض أبداً. قيم الثقة داخلية، ومش بتتعرض على الشخص، ولا على عميل، ولا بتبقى سبب لأي قرار.',
        ],
        bullets: [
          'إذا كان مستند الهوية سليم.',
          'إذا كان المستند بتاع الشخص اللي قدّمه.',
          'إذا كان المستند اتعدّل.',
          'إذا كان السجل الجنائي بيخلّي حد مؤهل للشغل.',
          'إذا كان الحساب هيتوقف أو يتقيّد أو يتقفل.',
          'نتيجة الاستئناف.',
        ],
      },
      {
        heading: '٣. القرار البشري',
        body: [
          'كل قرار سلبي عن شخص في ورشة بياخده شخص، ومتسجّل بالأدلة اللي شافها فعلاً، ومفتوح للاستئناف قدام شخص تاني.',
          'مخرجات الآلة ممكن تتعرض على المراجع كمعلومة. مش بتتعرض أبداً كتوصية أو درجة أو استنتاج، لأن المراجع اللي بتتعرض عليه درجة بيقرّر الدرجة مش الحالة.',
        ],
      },
      {
        heading: '٤. التدريب',
        body: [
          'مستندات الهوية والفيش والتشبيه والبيانات المستخرجة منهم مش بتُستخدم في تدريب أو ضبط أو تقييم أو تحسين أي نموذج تعلّم آلي. لا من ورشة ولا من مزوّد نيابةً عن ورشة.',
          'ده مش تفضيل حالي ممكن فريق مستقبلي يعكسه بهدوء. تغييره بيتطلب كل اللي جاي، والمنصة مبنية بحيث مفيش واحدة فيهم ممكن تتخطّى:',
        ],
        bullets: [
          'قرار حوكمة متسجّل، بياخده ناس عندهم صلاحية أخذه.',
          'نسخة محدّثة من السياسة دي ومن سياسة الخصوصية ومن سياسة التحقق من الصنايعي.',
          'سجل معالِجات فرعية وسجل معالجة بيانات محدّثين.',
          'إخطار لكل شخص متأثر، مقدماً، بيوضّح هيتستخدم إيه ولإيه.',
          'موافقة صريحة ومسجّلة على حدة من كل شخص هتتضمّن مستنداته، لما الموافقة تكون هي الأساس المعتمد.',
          'طرح مُصدَر بنسخ، علشان يفضل معروف دايماً أنهي مستندات كانت في النطاق من أنهي تاريخ.',
        ],
      },
      {
        heading: '٥. شروط المزوّد',
        body: [
          'لما يتم التعاقد مع مزوّد، ورشة هتتعاقد بس مع واحد شروطه بتمنع استخدام بيانات ورشة في تحسين نماذج المزوّد نفسه، والسجل بيسجّل إن ده اتفحص.',
          'المزوّد اللي بيشترط الاستخدام ده مش مؤهل يبقى معالِج فرعي لورشة لبيانات الهوية.',
        ],
      },
      {
        heading: '٦. الخصائص المستقبلية',
        body: [
          'ورشة ممكن تضيف خصائص بمساعدة الآلة بعدين — بحث أحسن، إشارات غش، مساعدة في مركز المساعدة.',
          'كل واحدة هتتطلب مدخل خاص بيها في السياسة دي، وقرار حوكمة خاص بيها، وتقييم خاص بيها لللي مسموح ومش مسموح تقرّره. مفيش واحدة ينفع تتخطّى حدود البند ٢، ومفيش واحدة تاخد قرار عن شخص من غير إنسان يأكّده.',
        ],
      },
    ],
  },
};

export const ocrUsagePolicy: LegalDocument = {
  key: 'ocr_usage_policy',
  category: 'privacy',
  audience: 'worker',
  sortOrder: 14,
  ...initial(
    'First published version of the OCR usage policy.',
    'أول نسخة منشورة من سياسة استخدام التعرف الضوئي على الحروف.',
  ),
  en: {
    title: 'OCR Usage Policy',
    summary:
      'What text extraction from your identity document is for, where it runs, what it is never allowed to decide, and what is kept afterwards.',
    sections: [
      {
        heading: '1. Current state',
        body: [
          'As at this version, no text extraction is performed. Identity fields are entered by hand and confirmed by you.',
          'The approved provider is Google Cloud Vision. It is recorded in the Subprocessor Register as approved and not yet in use. This policy governs it from the version that turns it on, and turning it on requires a new version of this policy, the Privacy Policy and the Worker Verification Policy, together with renewed acceptance.',
          'The rest of this policy describes how extraction will operate. It is published now so that the rules are settled before the capability exists, rather than written to fit whatever gets built.',
        ],
      },
      {
        heading: '2. What it is for',
        body: [
          'One purpose: reading the text printed on your National ID so it can be pre-filled into the form you are about to complete.',
          'It saves you typing an identity number from a photograph. That is the entire benefit, and it is the entire justification for processing the document this way.',
        ],
      },
      {
        heading: '3. Where it runs',
        body: [
          'Server-side only. Your document is sent from Warsha\'s server to the provider, never from your phone.',
          'Provider credentials exist only on the server and are never present in the application, so a copy of the Warsha app cannot be taken apart to obtain them.',
          'Only the extracted fields come back to your device. The provider\'s raw response never reaches it.',
          'In mock mode — used for development and demonstration — no external call is made at all.',
        ],
      },
      {
        heading: '4. You confirm everything',
        body: [
          'Extracted values are candidates. They are shown to you, you check them against the document in your hand, and you correct anything wrong.',
          'Nothing is treated as a fact about you until you confirm it. An unconfirmed extraction has no effect on your account.',
          'Confidence scores are internal. You will never be shown one, a customer will never be shown one, and no decision is ever made on one.',
        ],
      },
      {
        heading: '5. What extraction may never decide',
        body: [
          'Extraction never determines whether a document is genuine, whether it is yours, whether it has been altered, or whether you are eligible to work. Those are human decisions and the Worker Verification Policy sets out how they are made.',
          'A poor-quality scan produces a request to retake the photograph, never a rejection of you.',
          'Warsha does not extract, infer or store a gender or sex marker from an identity document. There is no product purpose for it that has been documented and approved, and processing a special category of data because it happens to be printed on a card is not a reason.',
          'The Egyptian National ID encodes a governorate of issue. Warsha does not treat that as your current address, your residence, or your service area. Where you live and where you work are things you tell Warsha, not things it deduces from a number.',
        ],
      },
      {
        heading: '6. What is kept',
        body: ['After extraction, Warsha keeps:'],
        bullets: [
          'The extracted field values, as candidates, until you confirm your fields.',
          'A confidence value per field, internal only.',
          'A hash of the document, so it can be shown later that the document reviewed is the document submitted.',
          'The provider name and version.',
          'The timestamp.',
        ],
      },
      {
        heading: '7. What is not kept',
        body: [
          'The provider\'s raw response is not retained. It is a second copy of your identity document in another form, and keeping it would double the exposure for no benefit that the extracted fields do not already give.',
          'Your document is not retained by the provider beyond the call, and a provider that requires otherwise is not eligible.',
          'Your document is never used to train a model. See the AI Usage Policy.',
        ],
      },
      {
        heading: '8. Changes',
        body: [
          'Introducing extraction, changing provider, changing what is extracted, or changing what is retained is a material change: a new version, a change summary, an updated Subprocessor Register, and renewed acceptance before your documents are processed under it.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة استخدام التعرف الضوئي على الحروف',
    summary:
      'ملخّص عربي كامل للسياسة. النص الإنجليزي هو الحاكم. استخراج النص من مستند هويتك بيتعمل لإيه، وبيشتغل فين، وممنوع عليه يقرّر إيه، وبيتحفظ إيه بعده.',
    sections: [
      {
        heading: '١. الوضع الحالي',
        body: [
          'لحد النسخة دي، مفيش أي استخراج نص بيتعمل. بيانات الهوية بتتكتب بالإيد وبتأكّدها إنت.',
          'المزوّد المعتمد هو Google Cloud Vision. مسجّل في سجل المعالِجات الفرعية كمعتمد ومش مستخدم لسه. السياسة دي بتحكمه من النسخة اللي بتشغّله، وتشغيله بيتطلب نسخة جديدة من السياسة دي ومن سياسة الخصوصية ومن سياسة التحقق من الصنايعي، مع موافقة متجدّدة.',
          'باقي السياسة بيوصف الاستخراج هيشتغل إزاي. بيتنشر دلوقتي علشان القواعد تتحسم قبل ما القدرة توجد، بدل ما تتكتب على مقاس اللي هيتبني.',
        ],
      },
      {
        heading: '٢. بيتعمل لإيه',
        body: [
          'غرض واحد: قراية النص المطبوع على بطاقتك علشان يتحطّ مبدئياً في الاستمارة اللي هتكمّلها.',
          'بيوفّرلك كتابة رقم هوية من صورة. دي كل الفايدة، ودي كل مبرّر معالجة المستند بالطريقة دي.',
        ],
      },
      {
        heading: '٣. بيشتغل فين',
        body: [
          'على الخادم بس. مستندك بيتبعت من خادم ورشة للمزوّد، مش من تليفونك أبداً.',
          'بيانات اعتماد المزوّد موجودة على الخادم بس ومش موجودة في التطبيق أبداً، فنسخة من تطبيق ورشة مش ممكن تتفكّك علشان تجيبها.',
          'البيانات المستخرجة بس هي اللي بترجع لجهازك. رد المزوّد الخام مش بيوصله أبداً.',
          'في وضع المحاكاة — المستخدم للتطوير والعرض — مفيش أي اتصال خارجي بيتعمل خالص.',
        ],
      },
      {
        heading: '٤. إنت بتأكّد كل حاجة',
        body: [
          'القيم المستخرجة مرشحات. بتتعرض عليك، وبتراجعها مقابل المستند اللي في إيدك، وبتصحّح أي حاجة غلط.',
          'مفيش حاجة بتتعامل كحقيقة عنك قبل ما تأكّدها. الاستخراج غير المؤكَّد مالوش أي أثر على حسابك.',
          'درجات الثقة داخلية. مش هتتعرض عليك أبداً، ولا على عميل أبداً، ومفيش قرار بيتاخد عليها أبداً.',
        ],
      },
      {
        heading: '٥. ممنوع على الاستخراج يقرّر إيه',
        body: [
          'الاستخراج مش بيحدّد أبداً إذا كان المستند سليم، ولا إذا كان بتاعك، ولا إذا كان اتعدّل، ولا إذا كنت مؤهل للشغل. دي قرارات بشرية وسياسة التحقق من الصنايعي بتوضّح بتتاخد إزاي.',
          'المسح ضعيف الجودة بيُنتج طلب إعادة تصوير، مش رفض ليك أبداً.',
          'ورشة مش بتستخرج ولا بتستنتج ولا بتخزّن النوع أو مؤشّر الجنس من مستند هوية. مفيش غرض منتجي موثّق ومعتمد ليه، ومعالجة فئة خاصة من البيانات لمجرد إنها مطبوعة على كارت مش سبب.',
          'بطاقة الرقم القومي المصرية بترمّز محافظة الإصدار. ورشة مش بتعامل ده كعنوانك الحالي ولا محل إقامتك ولا منطقة خدمتك. إنت بتسكن فين وبتشتغل فين حاجات إنت بتقولها لورشة، مش حاجات بتستنتجها من رقم.',
        ],
      },
      {
        heading: '٦. اللي بيتحفظ',
        body: ['بعد الاستخراج، ورشة بتحتفظ بـ:'],
        bullets: [
          'قيم البيانات المستخرجة، كمرشحات، لحد ما تأكّد بياناتك.',
          'قيمة ثقة لكل بيان، داخلية بس.',
          'بصمة للمستند، علشان يتثبت بعدين إن المستند اللي اتراجع هو المستند اللي اتقدّم.',
          'اسم المزوّد ونسخته.',
          'التوقيت.',
        ],
      },
      {
        heading: '٧. اللي مش بيتحفظ',
        body: [
          'رد المزوّد الخام مش بيتحفظ. هو نسخة تانية من مستند هويتك بشكل تاني، وحفظه كان هيضاعف التعرض من غير فايدة البيانات المستخرجة مش مدياها بالفعل.',
          'مستندك مش بيتحفظ عند المزوّد بعد الاتصال، والمزوّد اللي بيشترط غير كده مش مؤهل.',
          'مستندك مش بيُستخدم في تدريب نموذج أبداً. شوف سياسة استخدام الذكاء الاصطناعي.',
        ],
      },
      {
        heading: '٨. التعديلات',
        body: [
          'إدخال الاستخراج، أو تغيير المزوّد، أو تغيير المستخرَج، أو تغيير المحفوظ تعديل جوهري: نسخة جديدة وملخّص تغيير وسجل معالِجات فرعية محدّث وموافقة متجدّدة قبل ما مستنداتك تتعالج تحته.',
        ],
      },
    ],
  },
};

export const locationDataPolicy: LegalDocument = {
  key: 'location_data_policy',
  category: 'privacy',
  audience: 'all',
  sortOrder: 15,
  ...initial(
    'First published version of the location data policy.',
    'أول نسخة منشورة من سياسة بيانات الموقع.',
  ),
  en: {
    title: 'Location Data Policy',
    summary:
      'What Warsha does with location, why a map pin is required, why device location never is, and who sees your address.',
    sections: [
      {
        heading: '1. What Warsha collects',
        body: [
          'The addresses you save and, for each one, a map pin you have confirmed.',
          'Device location, only if you allow it and only while you are actively choosing an address.',
          'Warsha does not collect location in the background, does not collect it while the application is closed, does not build a movement history, and does not use location for advertising.',
        ],
      },
      {
        heading: '2. Why a confirmed pin is required',
        body: [
          'A written address in Egypt is often not enough to find a building. A pin is, and the difference is a worker arriving or a worker circling a street.',
          'So a confirmed pin is required before a real booking. It is the only location requirement, and it is a product requirement rather than a data-collection one: Warsha needs the point on the map, not your movements.',
        ],
      },
      {
        heading: '3. Why device location is never required',
        body: [
          'Granting location permission is always optional. You can place and adjust the pin by hand, and every address flow supports doing so.',
          'If the detected position is wrong, you can correct it, and correcting it is not treated as an error on your part.',
          'Denying location permission never blocks booking, never blocks worker onboarding, and never produces a worse experience beyond the extra seconds of placing a pin yourself.',
        ],
      },
      {
        heading: '4. Who sees your address',
        body: [
          'A worker sees the detail needed to reach you, released at the point in the booking where they need it. Before that they see the area, not the address.',
          'After the booking ends, that access ends.',
          'Warsha staff see an address where a support case or a dispute requires it, and that access follows the capability rules in the Privacy Policy.',
          'Your address is never public, never on a profile, and never in a notification.',
        ],
      },
      {
        heading: '5. Maps and geocoding',
        body: [
          'The approved map and geocoding provider is Google Maps Platform. As at this version it is not integrated: address search and device positioning report as unavailable, and manual pin placement is the working path.',
          'Warsha does not display a map surface that pretends to be live when no provider is configured. A fake map that returns a plausible pin would be worse than no map, because someone would rely on it.',
          'Introducing the provider is a material change and an addition to the Subprocessor Register, requiring a new version of this policy and the Privacy Policy, and renewed acceptance.',
        ],
      },
      {
        heading: '6. Retention and control',
        body: [
          'Addresses are kept while your account is open and you keep them, and you can delete one at any time.',
          'The location consent is separate from every other consent, is off until you turn it on, and can be withdrawn at any time from the privacy centre without giving a reason.',
          'Withdrawing it stops device positioning. It does not delete addresses you have already saved; delete those yourself if you want them gone.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة بيانات الموقع',
    summary:
      'ملخّص عربي كامل للسياسة. النص الإنجليزي هو الحاكم. ورشة بتعمل إيه بالموقع، وليه دبوس الخريطة مطلوب، وليه موقع الجهاز مش مطلوب أبداً، ومين بيشوف عنوانك.',
    sections: [
      {
        heading: '١. ورشة بتجمع إيه',
        body: [
          'العناوين اللي بتحفظها، ولكل واحد دبوس خريطة إنت أكّدته.',
          'موقع الجهاز، بس لو سمحت بيه وبس وإنت بتختار عنوان فعلياً.',
          'ورشة مش بتجمع الموقع في الخلفية، ولا والتطبيق مقفول، ولا بتبني تاريخ تحركات، ولا بتستخدم الموقع في الإعلانات.',
        ],
      },
      {
        heading: '٢. ليه الدبوس المؤكَّد مطلوب',
        body: [
          'العنوان المكتوب في مصر كتير مش كفاية علشان تلاقي عمارة. الدبوس كفاية، والفرق هو صنايعي بيوصل أو صنايعي بيلف في شارع.',
          'فالدبوس المؤكَّد مطلوب قبل أي حجز حقيقي. وهو مطلب الموقع الوحيد، ومطلب منتجي مش مطلب جمع بيانات: ورشة محتاجة النقطة على الخريطة، مش تحركاتك.',
        ],
      },
      {
        heading: '٣. ليه موقع الجهاز مش مطلوب أبداً',
        body: [
          'إذن الموقع اختياري دايماً. تقدر تحطّ الدبوس وتظبّطه بإيدك، وكل مسار عنوان بيدعم كده.',
          'لو الموقع المكتشف غلط، تقدر تصحّحه، والتصحيح مش بيتعامل كخطأ منك.',
          'رفض إذن الموقع مش بيمنع الحجز أبداً، ولا بيمنع تسجيل الصنايعي، ولا بيدّي تجربة أسوأ أبعد من الثواني الزيادة بتاعة حطّ الدبوس بنفسك.',
        ],
      },
      {
        heading: '٤. مين بيشوف عنوانك',
        body: [
          'الصنايعي بيشوف التفاصيل المحتاجها علشان يوصلك، بتتاح في وقت الحجز اللي محتاجها فيه. قبل كده بيشوف المنطقة مش العنوان.',
          'بعد ما الحجز يخلص، الوصول ده بينتهي.',
          'فريق ورشة بيشوف العنوان لما حالة دعم أو نزاع تتطلب كده، والوصول ده بيتبع قواعد الصلاحيات في سياسة الخصوصية.',
          'عنوانك مش عام أبداً، ولا على ملف، ولا في إشعار.',
        ],
      },
      {
        heading: '٥. الخرايط والترميز الجغرافي',
        body: [
          'مزوّد الخرايط والترميز الجغرافي المعتمد هو Google Maps Platform. لحد النسخة دي مش مدمج: البحث بالعنوان وتحديد موقع الجهاز بيتقالهم غير متاحين، وحطّ الدبوس اليدوي هو المسار الشغال.',
          'ورشة مش بتعرض واجهة خريطة بتدّعي إنها حية والمزوّد مش مضبوط. الخريطة المزيّفة اللي بترجّع دبوس معقول كانت هتبقى أسوأ من مفيش خريطة، لأن حد كان هيعتمد عليها.',
          'إدخال المزوّد تعديل جوهري وإضافة لسجل المعالِجات الفرعية، بيتطلب نسخة جديدة من السياسة دي ومن سياسة الخصوصية، وموافقة متجدّدة.',
        ],
      },
      {
        heading: '٦. الاحتفاظ والتحكم',
        body: [
          'العناوين بتتحفظ طول ما حسابك مفتوح وإنت محتفظ بيها، وتقدر تحذف أي واحد في أي وقت.',
          'موافقة الموقع منفصلة عن أي موافقة تانية، ومقفولة لحد ما تفتحها، وتقدر تسحبها في أي وقت من مركز الخصوصية من غير ما تدّي سبب.',
          'سحبها بيوقف تحديد موقع الجهاز. مش بيحذف العناوين اللي حفظتها بالفعل؛ احذفها بنفسك لو عايزها تروح.',
        ],
      },
    ],
  },
};

export const dataProcessingPolicy: LegalDocument = {
  key: 'data_processing_policy',
  category: 'privacy',
  audience: 'all',
  sortOrder: 16,
  ...initial(
    'First published version of the data processing policy.',
    'أول نسخة منشورة من سياسة معالجة البيانات.',
  ),
  en: {
    title: 'Data Processing Policy',
    summary:
      'The rules Warsha follows when it processes personal data, and how a new processing activity gets approved.',
    sections: [
      {
        heading: '1. Relationship to other documents',
        body: [
          'The Privacy Policy tells a person what happens to their data. This policy is the internal standard that makes that true: it governs how Warsha decides to process anything at all.',
          'The Data Processing Register is the inventory produced by applying this policy. Every activity in the register was approved under these rules.',
        ],
      },
      {
        heading: '2. Principles',
        body: ['Every processing activity must satisfy all of these before it exists:'],
        bullets: [
          'A stated purpose. Not "analytics" — what decision does this let someone make.',
          'Minimisation. The narrowest data that serves the purpose, and no field collected because it might be useful later.',
          'A recorded basis, and where the basis is consent, a real choice with a real off switch that does not degrade anything else.',
          'A retention trigger and period, or an explicit statement that neither has been settled and the item is under manual review.',
          'A named access rule: which capability may read it, and whether that read is logged.',
          'An entry in the Data Processing Register before processing begins, not after.',
        ],
      },
      {
        heading: '3. Special categories',
        body: [
          'Identity documents and criminal-record certificates are treated as the most sensitive data Warsha holds, and carry additional rules: private storage only, capability-gated access, every access logged, never exported, never used for training, and offence detail confined to a private reviewer record no client can read.',
          'Warsha does not process health data, biometric data, religious affiliation, political opinion, or a sex marker. Where such a value appears on a document it is not extracted, not inferred and not stored.',
        ],
      },
      {
        heading: '4. Lawful basis',
        body: [
          'Egyptian data protection law and its executive regulations continue to develop. Warsha records the basis it proposes for each activity and marks it as pending legal review where it has not been confirmed.',
          'This is deliberate. Asserting a settled legal characterisation that has not been obtained would be a claim about compliance rather than a description of practice, and a person reading it could not tell the difference.',
        ],
      },
      {
        heading: '5. Subprocessors',
        body: [
          'A supplier that processes personal data on Warsha\'s behalf is a subprocessor and must be in the Subprocessor Register before it processes anything.',
          'Engaging one requires: a purpose, a data-category list, a location, a written agreement, a check that the supplier\'s terms prohibit using Warsha data to improve the supplier\'s own models, and a governance decision.',
          'Adding a subprocessor is always a material change to the Privacy Policy. Users are told who, for what and where, before it takes effect.',
        ],
      },
      {
        heading: '6. Staff access',
        body: [
          'Access follows capability, not seniority or job title. Holding a senior role does not by itself grant sight of an identity document.',
          'The most sensitive capabilities require re-authentication, and the most consequential decisions require a second person.',
          'Access to sensitive records is logged whether or not anything was found, because a log that only records discoveries cannot show that a lookup was improper.',
        ],
      },
      {
        heading: '7. Changing this policy',
        body: [
          'A change to what may be processed, on what basis, by whom, or with which supplier requires a governance decision and a new version of this policy, and where it affects a person, a material update to the Privacy Policy with renewed acceptance.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة معالجة البيانات',
    summary:
      'ملخّص عربي كامل للسياسة. النص الإنجليزي هو الحاكم. القواعد اللي ورشة بتتبعها لما بتعالج بيانات شخصية، وطريقة اعتماد أي نشاط معالجة جديد.',
    sections: [
      {
        heading: '١. العلاقة بالمستندات التانية',
        body: [
          'سياسة الخصوصية بتقول للشخص بيحصل إيه لبياناته. السياسة دي هي المعيار الداخلي اللي بيخلّي ده صح: بتنظّم ورشة بتقرّر تعالج أي حاجة إزاي أصلاً.',
          'سجل معالجة البيانات هو الجرد الناتج عن تطبيق السياسة دي. كل نشاط في السجل اتعتمد تحت القواعد دي.',
        ],
      },
      {
        heading: '٢. المبادئ',
        body: ['كل نشاط معالجة لازم يستوفي كل دول قبل ما يوجد:'],
        bullets: [
          'غرض معلن. مش «تحليلات» — ده بيسمح لمين ياخد أنهي قرار.',
          'التقليل. أضيق بيانات بتخدم الغرض، ومفيش بيان بيتجمع لأنه ممكن يفيد بعدين.',
          'أساس مسجّل، ولما الأساس يكون الموافقة، اختيار حقيقي بمفتاح إيقاف حقيقي مش بيقلّل أي حاجة تانية.',
          'مُحفّز ومدة احتفاظ، أو بيان صريح إن مفيش منهم اتحسم وإن البند تحت المراجعة اليدوية.',
          'قاعدة وصول مسمّاة: أنهي صلاحية تقدر تقراه، وإذا كانت القراية دي بتتسجّل.',
          'مدخل في سجل معالجة البيانات قبل ما المعالجة تبدأ، مش بعدها.',
        ],
      },
      {
        heading: '٣. الفئات الخاصة',
        body: [
          'مستندات الهوية والفيش والتشبيه بتتعامل كأكتر بيانات حساسة ورشة بتحتفظ بيها، وليها قواعد إضافية: تخزين خاص بس، ووصول محكوم بالصلاحية، وكل وصول بيتسجّل، ومش بتتصدّر أبداً، ومش بتُستخدم للتدريب أبداً، وتفاصيل المخالفات محصورة في سجل مراجع خاص مفيش عميل يقدر يقراه.',
          'ورشة مش بتعالج بيانات صحية ولا بيومترية ولا انتماء ديني ولا رأي سياسي ولا مؤشّر جنس. لما قيمة زي دي تظهر على مستند مش بتتستخرج ولا بتتستنتج ولا بتتخزن.',
        ],
      },
      {
        heading: '٤. الأساس القانوني',
        body: [
          'قانون حماية البيانات المصري ولائحته التنفيذية لسه بيتطوّروا. ورشة بتسجّل الأساس اللي بتقترحه لكل نشاط وبتعلّمه كقيد المراجعة القانونية لما ما يكونش اتأكّد.',
          'ده مقصود. ادّعاء تكييف قانوني محسوم ما اتحصلش عليه كان هيبقى ادّعاء امتثال مش وصف ممارسة، والشخص اللي بيقراه ما كانش هيقدر يفرّق.',
        ],
      },
      {
        heading: '٥. المعالِجات الفرعية',
        body: [
          'المورد اللي بيعالج بيانات شخصية نيابةً عن ورشة معالِج فرعي ولازم يكون في سجل المعالِجات الفرعية قبل ما يعالج أي حاجة.',
          'التعاقد مع واحد بيتطلب: غرض، وقايمة فئات بيانات، وموقع، واتفاق مكتوب، وفحص إن شروط المورد بتمنع استخدام بيانات ورشة في تحسين نماذج المورد نفسه، وقرار حوكمة.',
          'إضافة معالِج فرعي دايماً تعديل جوهري لسياسة الخصوصية. المستخدمين بيتقالهم مين وليه وفين، قبل ما يسري.',
        ],
      },
      {
        heading: '٦. وصول الفريق',
        body: [
          'الوصول بيتبع الصلاحية، مش الأقدمية ولا المسمى الوظيفي. حمل دور كبير مش بيمنح لوحده الاطّلاع على مستند هوية.',
          'أكتر الصلاحيات حساسية بتتطلب إعادة توثيق، وأكتر القرارات أثراً بتتطلب شخص تاني.',
          'الوصول للسجلات الحساسة بيتسجّل سواء اتلاقى حاجة أو لأ، لأن السجل اللي بيسجّل الاكتشافات بس مش قادر يوضّح إن استعلام كان غير سليم.',
        ],
      },
      {
        heading: '٧. تعديل السياسة دي',
        body: [
          'أي تعديل في المسموح معالجته أو على أي أساس أو من مين أو مع أنهي مورد بيتطلب قرار حوكمة ونسخة جديدة من السياسة دي، ولما يأثّر على شخص، تحديث جوهري لسياسة الخصوصية بموافقة متجدّدة.',
        ],
      },
    ],
  },
};

export const dataRetentionPolicy: LegalDocument = {
  key: 'data_retention_policy',
  category: 'privacy',
  audience: 'all',
  sortOrder: 17,
  ...initial(
    'First published version of the data retention policy.',
    'أول نسخة منشورة من سياسة الاحتفاظ بالبيانات.',
  ),
  en: {
    title: 'Data Retention Policy',
    summary: 'How Warsha decides how long to keep something, and what happens when a period has not been settled.',
    sections: [
      {
        heading: '1. The rule',
        body: [
          'Everything Warsha holds has a retention trigger and a period, or an explicit statement that neither has been settled.',
          'The Data Retention Register is the inventory. This policy is how entries get into it.',
        ],
      },
      {
        heading: '2. Triggers, not calendars',
        body: [
          'Retention runs from an event, not from a date on a calendar: account closure, booking completion, dispute resolution, field confirmation.',
          'This matters because "kept for two years" is ambiguous about when the two years start, and an ambiguous retention rule is one nobody can execute or audit.',
        ],
      },
      {
        heading: '3. When a period is unsettled',
        body: [
          'Several categories Warsha holds — identity documents, criminal-record certificates, financial records — may be subject to statutory retention periods under Egyptian law that have not been established by advice for this platform.',
          'Where that is so, the register records the period as a proposal, records that no statutory basis is claimed, marks it pending legal review, sets the action at expiry to manual review rather than deletion, and leaves the rule disabled so that nothing can execute against it.',
          'The alternative — writing a plausible number and letting an automated job delete records against it — risks destroying evidence someone is entitled to, or that Warsha is required to keep. A proposal marked as a proposal is honest. A guess presented as a legal period is not.',
        ],
      },
      {
        heading: '4. Minimum periods that are set',
        body: [
          'A worker\'s original identity document and criminal-record certificate are retained for at least one year from upload, so that a safety report, a dispute or an audit arising afterwards can be examined against what was actually submitted.',
          'This is a floor set by Warsha for evidential reasons. It is not a claim about a statutory requirement.',
        ],
      },
      {
        heading: '5. What survives an account',
        body: [
          'Records concerning two people — bookings, payments, disputes, reviews — survive one of them leaving, because the other may still need them and because a financial record with one side deleted is not a record.',
          'Surviving records are anonymised: personal identifiers are removed or replaced, and what remains is the transaction rather than the person.',
          'The register states, per category, whether the treatment on closure is deletion, anonymisation, or preservation.',
        ],
      },
      {
        heading: '6. Legal holds',
        body: [
          'Where a record is subject to a legal hold, retention is suspended for it and deletion is refused, including a deletion the person has requested.',
          'The person is told their request is blocked and why, in the terms Warsha is permitted to use.',
        ],
      },
      {
        heading: '7. Execution',
        body: [
          'A retention rule executes only when it is enabled, has passed legal review, and has a defined action. As at this version no rule created by Warsha is enabled.',
          'Every rule supports a dry run that reports what it would affect without touching anything, and a rule is examined that way before it is ever enabled.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الاحتفاظ بالبيانات',
    summary:
      'ملخّص عربي كامل للسياسة. النص الإنجليزي هو الحاكم. ورشة بتقرّر تحتفظ بحاجة قد إيه إزاي، وبيحصل إيه لما مدة ما تكونش اتحسمت.',
    sections: [
      {
        heading: '١. القاعدة',
        body: [
          'كل حاجة ورشة بتحتفظ بيها ليها مُحفّز احتفاظ ومدة، أو بيان صريح إن مفيش منهم اتحسم.',
          'سجل الاحتفاظ بالبيانات هو الجرد. والسياسة دي هي طريقة دخول المدخلات فيه.',
        ],
      },
      {
        heading: '٢. مُحفّزات مش تقاويم',
        body: [
          'الاحتفاظ بيمشي من حدث، مش من تاريخ في تقويم: قفل الحساب، إتمام الحجز، حل النزاع، تأكيد البيان.',
          'ده مهم لأن «بيتحفظ سنتين» ملتبس عن السنتين بيبدأوا إمتى، وقاعدة الاحتفاظ الملتبسة محدش يقدر ينفّذها ولا يدقّقها.',
        ],
      },
      {
        heading: '٣. لما المدة ما تكونش محسومة',
        body: [
          'كذا فئة ورشة بتحتفظ بيها — مستندات الهوية، والفيش والتشبيه، والسجلات المالية — ممكن تكون خاضعة لمدد احتفاظ قانونية تحت القانون المصري ما اتحدّدتش باستشارة للمنصة دي.',
          'لما ده يكون الحال، السجل بيسجّل المدة كاقتراح، وبيسجّل إن مفيش أساس قانوني مُدّعى، وبيعلّمها قيد المراجعة القانونية، وبيحطّ الإجراء عند الانتهاء كمراجعة يدوية مش حذف، وبيسيب القاعدة معطّلة علشان مفيش حاجة تقدر تتنفّذ عليها.',
          'البديل — كتابة رقم معقول والسماح لمهمة آلية تحذف سجلات بناءً عليه — بيخاطر بإتلاف أدلة حد له حق فيها، أو ورشة مُلزَمة تحتفظ بيها. الاقتراح المعلّم كاقتراح أمين. التخمين المقدَّم كمدة قانونية لأ.',
        ],
      },
      {
        heading: '٤. الحدود الدنيا المحدّدة',
        body: [
          'مستند الهوية الأصلي للصنايعي والفيش والتشبيه بيتحفظوا سنة على الأقل من الرفع، علشان أي بلاغ أمان أو نزاع أو تدقيق بيظهر بعدين يتفحص مقابل اللي اتقدّم فعلاً.',
          'ده حد أدنى حطّته ورشة لأسباب إثباتية. مش ادّعاء بمطلب قانوني.',
        ],
      },
      {
        heading: '٥. اللي بيعيش بعد الحساب',
        body: [
          'السجلات اللي بتخصّ شخصين — الحجوزات والمدفوعات والنزاعات والمراجعات — بتعيش بعد رحيل واحد فيهم، لأن التاني ممكن لسه محتاجها ولأن السجل المالي بطرف محذوف مش سجل.',
          'السجلات الباقية بتتجهّل: المعرّفات الشخصية بتتشال أو تتبدّل، واللي بيفضل هو المعاملة مش الشخص.',
          'السجل بيوضّح، لكل فئة، إذا كان التعامل عند القفل حذف ولا تجهيل ولا حفظ.',
        ],
      },
      {
        heading: '٦. الحجز القانوني',
        body: [
          'لما سجل يكون خاضع لحجز قانوني، الاحتفاظ بيتوقف بالنسبة له والحذف بيترفض، بما في ذلك الحذف اللي الشخص طلبه.',
          'الشخص بيتقاله إن طلبه محجوب وليه، بالصيغة المسموح لورشة تستخدمها.',
        ],
      },
      {
        heading: '٧. التنفيذ',
        body: [
          'قاعدة الاحتفاظ بتتنفّذ بس لما تكون مفعّلة وعدّت المراجعة القانونية وليها إجراء محدّد. لحد النسخة دي مفيش قاعدة أنشأتها ورشة مفعّلة.',
          'كل قاعدة بتدعم تشغيل تجريبي بيقول هتأثّر على إيه من غير ما يمسّ حاجة، والقاعدة بتتفحص بالطريقة دي قبل ما تتفعّل أصلاً.',
        ],
      },
    ],
  },
};

export const cookiePolicy: LegalDocument = {
  key: 'cookie_policy',
  category: 'privacy',
  audience: 'public',
  sortOrder: 18,
  ...initial('First published version of the cookie policy.', 'أول نسخة منشورة من سياسة الكوكيز.'),
  en: {
    title: 'Cookie Policy (Web)',
    summary: 'What the Warsha web application stores in your browser, and what it does not.',
    sections: [
      {
        heading: '1. Scope',
        body: [
          'This policy covers the Warsha web application. The mobile applications do not use cookies; they store the equivalent data in the operating system\'s own secure storage, and the same rules apply to it.',
        ],
      },
      {
        heading: '2. What is stored',
        body: ['Warsha stores only what the application needs to work:'],
        bullets: [
          'Your session, so that you stay signed in. Removing it signs you out.',
          'Your language choice, so the application opens in the language you last used.',
          'Your appearance choice — light, dark, or follow the system.',
          'Short-lived values needed for a specific operation, such as protecting a form submission.',
        ],
      },
      {
        heading: '3. What is not stored',
        body: [
          'No advertising cookie. No tracking pixel. No third-party analytics cookie. No cross-site identifier. No social network embed that would set one.',
          'Warsha does not track you across other websites and does not allow anyone else to do so through Warsha.',
        ],
      },
      {
        heading: '4. Why there is no cookie banner',
        body: [
          'A consent banner exists to obtain permission for storage that is not strictly necessary. Warsha sets none, so there is nothing to ask about.',
          'If Warsha ever introduces non-essential storage, this policy changes materially, a banner appears, and the storage does not happen until you have agreed to it. That is the sequence, and it does not run in the other order.',
        ],
      },
      {
        heading: '5. Controlling it',
        body: [
          'Your browser can clear or block this storage. Blocking the session value signs you out and keeps you signed out; blocking the others costs you your language and appearance preferences.',
          'Signing out from within the application clears the session value.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الكوكيز (الويب)',
    summary:
      'ملخّص عربي كامل للسياسة. النص الإنجليزي هو الحاكم. تطبيق ورشة على الويب بيخزّن إيه في متصفحك، ومش بيخزّن إيه.',
    sections: [
      {
        heading: '١. النطاق',
        body: [
          'السياسة دي بتغطّي تطبيق ورشة على الويب. تطبيقات الموبايل مش بتستخدم كوكيز؛ بتخزّن البيانات المكافئة في التخزين الآمن بتاع نظام التشغيل، ونفس القواعد بتسري عليه.',
        ],
      },
      {
        heading: '٢. اللي بيتخزن',
        body: ['ورشة بتخزّن بس اللي التطبيق محتاجه علشان يشتغل:'],
        bullets: [
          'جلستك، علشان تفضل داخل على حسابك. شيلها بتخرّجك.',
          'اختيار لغتك، علشان التطبيق يفتح باللغة اللي استخدمتها آخر مرة.',
          'اختيار المظهر — فاتح أو غامق أو تبع النظام.',
          'قيم قصيرة العمر لازمة لعملية معيّنة، زي حماية إرسال استمارة.',
        ],
      },
      {
        heading: '٣. اللي مش بيتخزن',
        body: [
          'مفيش كوكي إعلانات. ولا بكسل تتبع. ولا كوكي تحليلات طرف تالت. ولا معرّف عبر المواقع. ولا تضمين شبكة اجتماعية كان هيحطّ واحد.',
          'ورشة مش بتتبعك عبر مواقع تانية ومش بتسمح لأي حد يعمل كده من خلال ورشة.',
        ],
      },
      {
        heading: '٤. ليه مفيش لافتة كوكيز',
        body: [
          'لافتة الموافقة موجودة علشان تاخد إذن لتخزين مش ضروري تماماً. ورشة مش بتحطّ ولا واحد، فمفيش حاجة نسأل عنها.',
          'لو ورشة يوماً ما أدخلت تخزين غير ضروري، السياسة دي بتتغيّر جوهرياً، وبتظهر لافتة، والتخزين مش بيحصل قبل ما توافق. ده الترتيب، ومش بيمشي بالعكس.',
        ],
      },
      {
        heading: '٥. التحكم فيه',
        body: [
          'متصفحك يقدر يمسح أو يمنع التخزين ده. منع قيمة الجلسة بيخرّجك وبيخلّيك بره؛ ومنع الباقي بيكلّفك تفضيلات اللغة والمظهر.',
          'الخروج من جوه التطبيق بيمسح قيمة الجلسة.',
        ],
      },
    ],
  },
};
