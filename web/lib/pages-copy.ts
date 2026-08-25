import type { Locale } from './preferences.ts';

/**
 * The body content of the public content pages, in every supported language.
 *
 * Structured rather than stored as markup so that a translation cannot quietly
 * change a page's shape — every language renders the same headings, lists and
 * cards, and a missing section is a type error rather than a short page in
 * Arabic that nobody notices.
 */

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: readonly string[] }
  | { kind: 'card'; title: string; text: string }
  | { kind: 'note'; text: string };

export type PageContent = {
  title: string;
  lead: string;
  description: string;
  blocks: readonly Block[];
};

export type PageSlug =
  | 'how-it-works' | 'services' | 'categories' | 'become-a-worker'
  | 'trust-and-safety' | 'about' | 'contact' | 'help';

const en: Record<PageSlug, PageContent> = {
  'how-it-works': {
    title: 'How Warsha works',
    lead: 'A job on Warsha moves through four states, and you agree the price before the third.',
    description: 'How a job works on Warsha: describe it, receive quotes, agree a price, and track it to completion.',
    blocks: [
      { kind: 'heading', text: '1. You describe the job' },
      { kind: 'paragraph', text: 'You choose the trade, describe what needs doing, and say where. Photographs are optional and usually make quotes more accurate.' },
      { kind: 'heading', text: '2. Professionals quote' },
      { kind: 'paragraph', text: 'Warsha shows the request to workers whose registered trade and work area match it. Each decides whether to quote, and sets their own price.' },
      { kind: 'heading', text: '3. You accept a quote' },
      { kind: 'paragraph', text: 'Nothing is booked until you accept. The accepted price is recorded against the job, so there is a written record of what was agreed and by whom.' },
      { kind: 'heading', text: '4. The job runs to completion' },
      { kind: 'paragraph', text: 'The job moves through its states until it is complete, with messages kept against the job rather than scattered across personal phone numbers.' },
      { kind: 'heading', text: 'If something goes wrong' },
      { kind: 'paragraph', text: 'A job can be cancelled, and a dispute can be raised. Disputes are reviewed by a person, and an adverse decision can be appealed to somebody other than the person who made it.' },
      { kind: 'note', text: 'Warsha is in closed testing. Coverage depends on which professionals have completed verification, so a request may not always find a match yet.' },
    ],
  },
  services: {
    title: 'Find a professional',
    lead: 'Warsha covers home repair and maintenance trades. You describe the job; workers who cover it quote.',
    description: 'Home repair and maintenance trades available through Warsha in Egypt.',
    blocks: [
      { kind: 'note', text: 'Availability depends on verified professionals covering your area. Warsha does not publish worker counts or response times it cannot guarantee.' },
    ],
  },
  categories: {
    title: 'Service categories',
    lead: 'The trades a worker can register for, and the categories a request can be filed under.',
    description: 'Warsha service categories for home repair and maintenance work in Egypt.',
    blocks: [
      { kind: 'paragraph', text: 'A worker registers the trades they practise, and Warsha matches requests to those trades and to the areas they cover. A worker may register more than one trade, and each is verified on its own terms.' },
      { kind: 'heading', text: 'Where categories matter' },
      { kind: 'list', items: [
        'They decide which workers see a request.',
        'They decide which verification a worker must complete.',
        'They are recorded against the job, so history stays searchable.',
      ] },
      { kind: 'note', text: 'Categories are governed centrally rather than typed freely, so that a request and a worker registration can be matched reliably.' },
    ],
  },
  'become-a-worker': {
    title: 'Work with Warsha',
    lead: 'Quote the jobs you want, at the price you set. Verification is completed once and reviewed by a person.',
    description: 'Join Warsha as a professional: register your trades, complete verification, and quote work in your area.',
    blocks: [
      { kind: 'heading', text: 'How you join' },
      { kind: 'list', items: [
        'Register with your phone number and a password. No email is required.',
        'Tell Warsha which trades you practise and which areas you cover.',
        'Complete verification, including identity and any trade documents required.',
        'A person reviews your application. You are told the outcome and the reason.',
      ] },
      { kind: 'heading', text: 'How work reaches you' },
      { kind: 'paragraph', text: 'You see requests that match your registered trades and areas. You choose which to quote, and you set the price. Nothing is assigned to you at a price you did not set.' },
      { kind: 'heading', text: 'What Warsha does not do' },
      { kind: 'list', items: [
        'It does not guarantee a volume of work.',
        'It does not set your prices.',
        'It does not take a decision about your application without a stated reason.',
      ] },
      { kind: 'note', text: 'Applying starts a verification process. It does not make you a worker on Warsha, and approval is not automatic.' },
    ],
  },
  'trust-and-safety': {
    title: 'Trust & safety',
    lead: 'What Warsha checks, what it records, and what it will not claim.',
    description: 'How Warsha verifies professionals, records agreements, and handles disputes and appeals.',
    blocks: [
      { kind: 'heading', text: 'Professionals are verified before they work' },
      { kind: 'paragraph', text: 'A worker completes identity verification and any documents their trade requires. A person reviews the evidence and records a decision with a reason.' },
      { kind: 'heading', text: 'Agreements are recorded, not remembered' },
      { kind: 'paragraph', text: 'The accepted price, the agreed job, and the exact version of every legal document a person accepted are all recorded. Acceptance records are append-only: they can be added to and never edited, so a past agreement cannot be quietly rewritten.' },
      { kind: 'heading', text: 'Disputes are decided by people' },
      { kind: 'paragraph', text: 'A dispute is reviewed by a member of staff. An adverse decision may be appealed, and the appeal is decided by somebody other than the person who made the original decision. That separation is enforced by the system rather than by convention.' },
      { kind: 'heading', text: 'What Warsha does not claim' },
      { kind: 'list', items: [
        'It does not publish ratings or reviews it has not received.',
        'It does not guarantee response times.',
        'It does not claim coverage in areas where no verified worker operates.',
      ] },
    ],
  },
  about: {
    title: 'About Warsha',
    lead: 'Warsha is a marketplace for home repair and maintenance work in Egypt.',
    description: 'About Warsha, a home services marketplace operating in Egypt.',
    blocks: [
      { kind: 'paragraph', text: 'Warsha exists because arranging home repairs usually means asking around, taking a price on trust, and having no record of what was agreed. The result is that both sides carry risk they did not choose: the customer cannot tell who is competent, and the worker cannot prove they were.' },
      { kind: 'heading', text: 'What Warsha does about that' },
      { kind: 'list', items: [
        'Professionals are verified by a person before they take work.',
        'The price is agreed in writing before the job starts.',
        'The job, the messages, and the agreement stay in one place.',
        'Decisions that affect somebody carry a reason and can be appealed.',
      ] },
      { kind: 'heading', text: 'Where Warsha operates' },
      { kind: 'paragraph', text: 'Egypt. Warsha is in closed testing, and coverage follows the professionals who have completed verification rather than a map drawn in advance.' },
    ],
  },
  contact: {
    title: 'Contact Warsha',
    lead: 'Support runs inside the application, where it can see the job you are asking about.',
    description: 'How to reach Warsha support.',
    blocks: [
      { kind: 'heading', text: 'If you have an account' },
      { kind: 'paragraph', text: 'Open Support from your account. A case raised there is attached to your account and the relevant job, which means it can be answered without asking you to re-explain anything, and it leaves a record you can refer back to.' },
      { kind: 'heading', text: 'If you do not have an account' },
      { kind: 'paragraph', text: 'The Help section answers most questions about how Warsha works, what verification involves, and how agreements are recorded.' },
      { kind: 'heading', text: 'Privacy requests' },
      { kind: 'paragraph', text: 'Requests about your personal data — access, correction, export, or deletion — are handled through Privacy in your account, so that the request is bound to a verified identity rather than an email address anybody could send from.' },
    ],
  },
  help: {
    title: 'Help',
    lead: 'How Warsha works, what it records, and what to do when something is wrong.',
    description: 'Help and answers about using Warsha as a customer or a professional.',
    blocks: [
      { kind: 'card', title: 'Creating an account', text: 'Customers register with an email address and password, and confirm the address before signing in. Professionals register with a phone number and password.' },
      { kind: 'card', title: 'Agreeing a price', text: 'You accept a quote before a job is booked. The accepted price is recorded against the job.' },
      { kind: 'card', title: 'Verification', text: 'Professionals complete identity and trade verification once. A person reviews it and records a decision with a reason.' },
      { kind: 'card', title: 'Cancelling', text: 'A job can be cancelled, and the reason is recorded. Cancellation rules are set out in the Cancellation Policy.' },
      { kind: 'card', title: 'Disputes and appeals', text: 'Raise a dispute from the job. Adverse decisions can be appealed to somebody other than the original decision-maker.' },
      { kind: 'card', title: 'Your data', text: 'Access, export, correction, and deletion are available from Privacy inside your account.' },
    ],
  },
};

const ar: Record<PageSlug, PageContent> = {
  'how-it-works': {
    title: 'ورشة بتشتغل إزاي',
    lead: 'الشغلانة في ورشة بتعدّي بأربع مراحل، وإنت بتتفق على السعر قبل التالتة.',
    description: 'إزاي الشغل بيتم في ورشة: توصف الشغل، تستنى العروض، تتفق على السعر، وتتابع لحد ما يخلص.',
    blocks: [
      { kind: 'heading', text: '١. إنت بتوصف الشغل' },
      { kind: 'paragraph', text: 'بتختار المهنة، وتوصف المطلوب، وتقول فين. الصور اختيارية وغالبًا بتخلي العروض أدق.' },
      { kind: 'heading', text: '٢. الصنايعية بيقدّموا عروض' },
      { kind: 'paragraph', text: 'ورشة بتعرض الطلب على الصنايعية اللي مهنتهم ومنطقتهم بيوافقوا الطلب. وكل واحد بيقرر يقدّم سعر ولا لأ، وبيحدد سعره بنفسه.' },
      { kind: 'heading', text: '٣. إنت بتقبل العرض' },
      { kind: 'paragraph', text: 'مفيش حاجة بتتحجز غير لما توافق. السعر المقبول بيتسجّل على الشغلانة، فبيبقى فيه سجل مكتوب للي اتفقتوا عليه ومين وافق.' },
      { kind: 'heading', text: '٤. الشغل بيمشي لحد ما يخلص' },
      { kind: 'paragraph', text: 'الشغلانة بتعدّي بمراحلها لحد ما تكمل، والرسايل محفوظة على الشغلانة نفسها مش متفرقة على أرقام تليفونات شخصية.' },
      { kind: 'heading', text: 'لو حصلت مشكلة' },
      { kind: 'paragraph', text: 'الشغلانة ممكن تتلغي، وممكن ترفع نزاع. النزاعات بيراجعها حد من الفريق، والقرار اللي مش في صالحك ممكن تتظلم منه لحد تاني غير اللي أخد القرار الأول.' },
      { kind: 'note', text: 'ورشة لسه في تجربة مغلقة. التغطية بتعتمد على الصنايعية اللي كمّلوا التوثيق، فممكن الطلب ما يلاقيش حد مناسب لسه.' },
    ],
  },
  services: {
    title: 'دوّر على صنايعي',
    lead: 'ورشة بتغطي مهن التصليح والصيانة في البيت. إنت بتوصف الشغل، واللي بيغطيه بيقدّم سعر.',
    description: 'مهن التصليح والصيانة المتاحة من خلال ورشة في مصر.',
    blocks: [
      { kind: 'note', text: 'الإتاحة بتعتمد على الصنايعية الموثّقين اللي بيغطوا منطقتك. ورشة ما بتنشرش أعداد صنايعية ولا أوقات رد ما تقدرش تضمنها.' },
    ],
  },
  categories: {
    title: 'تصنيفات الخدمات',
    lead: 'المهن اللي الصنايعي يقدر يسجّلها، والتصنيفات اللي الطلب بيتسجّل تحتها.',
    description: 'تصنيفات خدمات ورشة لأعمال التصليح والصيانة المنزلية في مصر.',
    blocks: [
      { kind: 'paragraph', text: 'الصنايعي بيسجّل المهن اللي بيشتغلها، وورشة بتوصّل الطلبات بالمهن دي وبالمناطق اللي بيغطيها. وممكن يسجّل أكتر من مهنة، وكل واحدة بتتوثّق لوحدها.' },
      { kind: 'heading', text: 'التصنيفات مهمة فين' },
      { kind: 'list', items: [
        'بتحدد مين من الصنايعية هيشوف الطلب.',
        'بتحدد التوثيق المطلوب من الصنايعي.',
        'بتتسجّل على الشغلانة، فالتاريخ بيفضل قابل للبحث.',
      ] },
      { kind: 'note', text: 'التصنيفات متحكوم فيها مركزيًا مش مكتوبة بحرية، عشان الطلب وتسجيل الصنايعي يتوصّلوا ببعض بشكل مضمون.' },
    ],
  },
  'become-a-worker': {
    title: 'اشتغل مع ورشة',
    lead: 'قدّم سعرك على الشغل اللي يناسبك. التوثيق بتعمله مرة واحدة وبيراجعه حد من الفريق.',
    description: 'انضم لورشة كصنايعي: سجّل مهنتك، كمّل التوثيق، وقدّم عروضك على الشغل في منطقتك.',
    blocks: [
      { kind: 'heading', text: 'بتنضم إزاي' },
      { kind: 'list', items: [
        'سجّل برقم تليفونك وباسورد. مش محتاج إيميل.',
        'قول لورشة بتشتغل إيه وبتغطي أنهي مناطق.',
        'كمّل التوثيق، ويشمل الهوية وأي أوراق مطلوبة لمهنتك.',
        'حد من الفريق بيراجع طلبك. وهتعرف النتيجة والسبب.',
      ] },
      { kind: 'heading', text: 'الشغل بيوصلك إزاي' },
      { kind: 'paragraph', text: 'بتشوف الطلبات اللي تناسب مهنك ومناطقك المسجّلة. وإنت بتختار تقدّم سعر على إيه، وإنت اللي بتحدد السعر. مفيش حاجة بتتحطلك بسعر إنت ما حددتوش.' },
      { kind: 'heading', text: 'إيه اللي ورشة ما بتعملوش' },
      { kind: 'list', items: [
        'ما بتضمنش كمية شغل معينة.',
        'ما بتحددش أسعارك.',
        'ما بتاخدش قرار في طلبك من غير سبب مكتوب.',
      ] },
      { kind: 'note', text: 'التقديم بيبدأ عملية توثيق. ده ما بيخليكش صنايعي في ورشة، والقبول مش تلقائي.' },
    ],
  },
  'trust-and-safety': {
    title: 'الأمان والثقة',
    lead: 'ورشة بتتحقق من إيه، وبتسجّل إيه، وإيه اللي مش هتدّعيه.',
    description: 'إزاي ورشة بتوثّق الصنايعية، وبتسجّل الاتفاقات، وبتتعامل مع النزاعات والتظلمات.',
    blocks: [
      { kind: 'heading', text: 'الصنايعية بيتوثّقوا قبل ما يشتغلوا' },
      { kind: 'paragraph', text: 'الصنايعي بيكمّل التحقق من هويته وأي أوراق مطلوبة لمهنته. وحد من الفريق بيراجع الأدلة ويسجّل قرار مكتوب بسببه.' },
      { kind: 'heading', text: 'الاتفاقات بتتسجّل مش بتتفتكر' },
      { kind: 'paragraph', text: 'السعر المقبول، والشغل المتفق عليه، ونسخة كل مستند قانوني وافق عليه الشخص — كلها بتتسجّل. سجلات الموافقة بتتضاف بس: ممكن يتزاد عليها وما بتتعدلش أبدًا، فالاتفاق القديم ما ينفعش يتغيّر في السر.' },
      { kind: 'heading', text: 'النزاعات بيحكم فيها بشر' },
      { kind: 'paragraph', text: 'النزاع بيراجعه حد من الفريق. والقرار اللي مش في صالحك ممكن تتظلم منه، والتظلم بيحكم فيه حد تاني غير اللي أخد القرار الأصلي. والفصل ده النظام نفسه بيفرضه مش مجرد عُرف.' },
      { kind: 'heading', text: 'إيه اللي ورشة ما بتدّعيهوش' },
      { kind: 'list', items: [
        'ما بتنشرش تقييمات أو مراجعات ما وصلتهاش.',
        'ما بتضمنش وقت رد معين.',
        'ما بتدّعيش تغطية في مناطق مفيهاش صنايعي موثّق.',
      ] },
    ],
  },
  about: {
    title: 'عن ورشة',
    lead: 'ورشة سوق لأعمال التصليح والصيانة المنزلية في مصر.',
    description: 'عن ورشة، سوق خدمات منزلية بيشتغل في مصر.',
    blocks: [
      { kind: 'paragraph', text: 'ورشة موجودة لأن ترتيب تصليح في البيت عادةً معناه إنك تسأل الناس، وتاخد سعر على الثقة، ومن غير أي سجل للي اتفقتوا عليه. والنتيجة إن الطرفين بيشيلوا مخاطرة ما اختاروهاش: العميل ما يعرفش مين شاطر، والصنايعي ما يقدرش يثبت إنه شاطر.' },
      { kind: 'heading', text: 'ورشة بتعمل إيه في ده' },
      { kind: 'list', items: [
        'الصنايعية بيتوثّقوا بواسطة حد من الفريق قبل ما ياخدوا شغل.',
        'السعر بيتفق عليه مكتوب قبل ما الشغل يبدأ.',
        'الشغلانة والرسايل والاتفاق كلهم في مكان واحد.',
        'القرارات اللي بتأثر على حد بيبقى ليها سبب وممكن يتظلم منها.',
      ] },
      { kind: 'heading', text: 'ورشة بتشتغل فين' },
      { kind: 'paragraph', text: 'مصر. وورشة لسه في تجربة مغلقة، والتغطية بتمشي ورا الصنايعية اللي كمّلوا التوثيق مش ورا خريطة مرسومة من بدري.' },
    ],
  },
  contact: {
    title: 'تواصل مع ورشة',
    lead: 'الدعم بيشتغل جوه التطبيق، حيث يقدر يشوف الشغلانة اللي بتسأل عنها.',
    description: 'إزاي توصل لدعم ورشة.',
    blocks: [
      { kind: 'heading', text: 'لو عندك حساب' },
      { kind: 'paragraph', text: 'افتح الدعم من حسابك. الحالة اللي بترفعها من هناك بتبقى مربوطة بحسابك وبالشغلانة، يعني تتحل من غير ما تعيد الشرح، وبتسيب سجل ترجعله.' },
      { kind: 'heading', text: 'لو ما عندكش حساب' },
      { kind: 'paragraph', text: 'قسم المساعدة بيجاوب على أغلب الأسئلة عن ورشة بتشتغل إزاي، والتوثيق بيشمل إيه، والاتفاقات بتتسجّل إزاي.' },
      { kind: 'heading', text: 'طلبات الخصوصية' },
      { kind: 'paragraph', text: 'الطلبات الخاصة ببياناتك — الاطلاع أو التصحيح أو التصدير أو الحذف — بتتم من خلال الخصوصية في حسابك، عشان الطلب يبقى مربوط بهوية متحقق منها مش بإيميل أي حد يقدر يبعت منه.' },
    ],
  },
  help: {
    title: 'المساعدة',
    lead: 'ورشة بتشتغل إزاي، وبتسجّل إيه، وتعمل إيه لما حاجة تبقى غلط.',
    description: 'مساعدة وإجابات عن استخدام ورشة كعميل أو كصنايعي.',
    blocks: [
      { kind: 'card', title: 'إنشاء حساب', text: 'العملاء بيسجّلوا بإيميل وباسورد، وبيأكدوا الإيميل قبل الدخول. الصنايعية بيسجّلوا برقم تليفون وباسورد.' },
      { kind: 'card', title: 'الاتفاق على السعر', text: 'إنت بتقبل العرض قبل ما الشغلانة تتحجز. والسعر المقبول بيتسجّل على الشغلانة.' },
      { kind: 'card', title: 'التوثيق', text: 'الصنايعية بيكمّلوا توثيق الهوية والمهنة مرة واحدة. وحد من الفريق بيراجعه ويسجّل قرار بسببه.' },
      { kind: 'card', title: 'الإلغاء', text: 'الشغلانة ممكن تتلغي، والسبب بيتسجّل. وقواعد الإلغاء موضحة في سياسة الإلغاء.' },
      { kind: 'card', title: 'النزاعات والتظلمات', text: 'ارفع نزاع من الشغلانة. والقرارات اللي مش في صالحك ممكن تتظلم منها لحد تاني غير اللي أخد القرار.' },
      { kind: 'card', title: 'بياناتك', text: 'الاطلاع والتصدير والتصحيح والحذف كلها متاحة من الخصوصية جوه حسابك.' },
    ],
  },
};

const fr: Record<PageSlug, PageContent> = {
  'how-it-works': {
    title: 'Comment fonctionne Warsha',
    lead: 'Une demande avance en quatre étapes, avec votre accord sur le prix avant le début des travaux.',
    description: 'Décrivez le travail, recevez des devis, acceptez un prix et suivez le travail jusqu’à sa fin.',
    blocks: [
      { kind: 'heading', text: '1. Décrivez le travail' },
      { kind: 'paragraph', text: 'Choisissez le métier, expliquez le besoin et indiquez le lieu. Les photos sont facultatives, mais elles aident souvent à établir un devis précis.' },
      { kind: 'heading', text: '2. Recevez des devis' },
      { kind: 'paragraph', text: 'Les professionnels vérifiés dont le métier et la zone correspondent peuvent répondre avec leur prix et leurs conditions.' },
      { kind: 'heading', text: '3. Choisissez un devis' },
      { kind: 'paragraph', text: 'Aucun professionnel n’est réservé avant votre choix. Le devis accepté devient l’accord officiel du travail.' },
      { kind: 'heading', text: '4. Suivez le travail' },
      { kind: 'paragraph', text: 'La réservation, les messages, les étapes et les décisions restent réunis dans Warsha.' },
      { kind: 'heading', text: 'Si un problème survient' },
      { kind: 'paragraph', text: 'Une réservation peut être annulée et un litige peut être signalé. Chaque litige est examiné par une personne, et une décision défavorable peut être contestée auprès d’une autre personne.' },
      { kind: 'note', text: 'Warsha est actuellement en test fermé. La couverture dépend des professionnels qui ont terminé leur vérification ; une demande peut donc ne pas trouver de correspondant pour le moment.' },
    ],
  },
  services: {
    title: 'Trouver un professionnel',
    lead: 'Warsha couvre les métiers de réparation et d’entretien à domicile en Égypte.',
    description: 'Services de réparation et d’entretien à domicile proposés sur Warsha.',
    blocks: [
      { kind: 'note', text: 'La disponibilité dépend des professionnels vérifiés qui couvrent votre zone. Warsha ne publie pas de chiffres ou de délais qu’elle ne peut pas garantir.' },
    ],
  },
  categories: {
    title: 'Catégories de services',
    lead: 'Les métiers enregistrés par les professionnels et les catégories utilisées pour classer une demande.',
    description: 'Catégories officielles de services Warsha.',
    blocks: [
      { kind: 'paragraph', text: 'Le professionnel enregistre ses métiers. Warsha utilise ces métiers et ses zones de service pour lui proposer les demandes pertinentes.' },
      { kind: 'heading', text: 'Pourquoi les catégories comptent' },
      { kind: 'list', items: ['Elles déterminent quels professionnels voient une demande.', 'Elles déterminent les vérifications nécessaires.', 'Elles restent enregistrées dans l’historique du travail.'] },
      { kind: 'note', text: 'Les catégories sont choisies dans une liste officielle afin que les demandes et les métiers correspondent de façon fiable.' },
    ],
  },
  'become-a-worker': {
    title: 'Travailler avec Warsha',
    lead: 'Répondez aux travaux qui vous intéressent, à votre prix. Votre dossier est examiné par une personne.',
    description: 'Inscription, vérification et fonctionnement des opportunités pour les professionnels Warsha.',
    blocks: [
      { kind: 'heading', text: 'Comment commencer' },
      { kind: 'list', items: ['Inscrivez-vous avec votre numéro de téléphone et un mot de passe, sans e-mail.', 'Indiquez vos métiers et les zones couvertes.', 'Terminez les contrôles d’identité et de métier demandés.', 'Une personne examine votre dossier et enregistre une décision motivée.'] },
      { kind: 'heading', text: 'Comment les travaux vous parviennent' },
      { kind: 'paragraph', text: 'Vous voyez les demandes adaptées à vos métiers et zones enregistrés. Vous choisissez celles auxquelles répondre et fixez votre propre prix.' },
      { kind: 'heading', text: 'Ce que Warsha ne promet pas' },
      { kind: 'list', items: ['Un volume minimum de travaux.', 'Un prix imposé par la plateforme.', 'Une approbation automatique de votre dossier.'] },
      { kind: 'note', text: 'La candidature ouvre un processus de vérification. Elle ne vous donne pas automatiquement le statut de professionnel Warsha et son approbation n’est pas garantie.' },
    ],
  },
  'trust-and-safety': {
    title: 'Confiance et sécurité',
    lead: 'Ce que Warsha vérifie, ce qu’elle enregistre et ce qu’elle ne prétend pas garantir.',
    description: 'Vérification, accords enregistrés, litiges et recours sur Warsha.',
    blocks: [
      { kind: 'heading', text: 'Les professionnels sont vérifiés avant de travailler' },
      { kind: 'paragraph', text: 'Une personne examine l’identité et les justificatifs de métier requis, puis enregistre sa décision et son motif.' },
      { kind: 'heading', text: 'Les accords sont enregistrés' },
      { kind: 'paragraph', text: 'Le devis accepté, le travail convenu et la version des accords acceptés restent dans des historiques durables.' },
      { kind: 'heading', text: 'Les litiges sont examinés par une personne' },
      { kind: 'paragraph', text: 'Une décision défavorable peut faire l’objet d’un recours examiné par une autre personne autorisée.' },
      { kind: 'heading', text: 'Ce que Warsha ne prétend pas garantir' },
      { kind: 'list', items: ['Warsha ne publie pas d’avis qu’elle n’a pas reçus.', 'Warsha ne promet pas un délai de réponse fixe.', 'Warsha ne prétend pas couvrir une zone sans professionnel vérifié.'] },
    ],
  },
  about: {
    title: 'À propos de Warsha',
    lead: 'Warsha est une place de marché égyptienne pour les réparations et l’entretien à domicile.',
    description: 'À propos de Warsha et de son fonctionnement.',
    blocks: [
      { kind: 'paragraph', text: 'Warsha aide les clients et les professionnels à définir le travail, comparer les devis et conserver une trace claire de leur accord.' },
      { kind: 'heading', text: 'Ce que Warsha apporte' },
      { kind: 'list', items: ['Une vérification humaine des professionnels avant leur activation.', 'Un prix accepté par écrit avant le début.', 'Le travail, les messages et l’accord au même endroit.', 'Des décisions motivées avec une possibilité de recours lorsque le produit le prévoit.'] },
      { kind: 'heading', text: 'Où Warsha est disponible' },
      { kind: 'paragraph', text: 'En Égypte, dans le cadre d’un test fermé. La couverture suit les professionnels vérifiés réellement disponibles.' },
    ],
  },
  contact: {
    title: 'Contacter Warsha',
    lead: 'L’assistance fonctionne depuis votre compte afin de retrouver la demande ou le travail concerné.',
    description: 'Comment contacter l’assistance Warsha.',
    blocks: [
      { kind: 'heading', text: 'Si vous avez un compte' },
      { kind: 'paragraph', text: 'Ouvrez Assistance depuis votre compte. La demande reste associée à votre identité et au travail concerné, avec un historique consultable.' },
      { kind: 'heading', text: 'Si vous n’avez pas de compte' },
      { kind: 'paragraph', text: 'Le Centre d’aide répond aux questions courantes sur les comptes, les devis, les travaux et la vérification.' },
      { kind: 'heading', text: 'Demandes relatives à vos données' },
      { kind: 'paragraph', text: 'Consultez les options de confidentialité dans votre compte pour demander l’accès, la correction, l’export ou la suppression de vos données.' },
    ],
  },
  help: {
    title: "Centre d'aide", lead: 'Comprendre Warsha et savoir quoi faire en cas de problème.', description: 'Aide pour utiliser Warsha comme client ou professionnel.',
    blocks: [
      { kind: 'card', title: 'Créer un compte', text: 'Les clients utilisent une adresse e-mail confirmée et un mot de passe. Les professionnels utilisent un numéro de téléphone et un mot de passe, sans SMS.' },
      { kind: 'card', title: 'Accepter un prix', text: 'Vous choisissez un devis avant la création du travail. Le prix accepté est enregistré.' },
      { kind: 'card', title: 'Vérification', text: 'Les professionnels terminent les contrôles requis. Une personne examine ensuite le dossier.' },
      { kind: 'card', title: 'Annulation', text: 'Un travail peut être annulé selon son état. Le motif et l’historique restent enregistrés.' },
      { kind: 'card', title: 'Litiges et recours', text: 'Ouvrez un litige depuis le travail. Une décision défavorable peut faire l’objet d’un recours lorsque le produit l’autorise.' },
      { kind: 'card', title: 'Vos données', text: 'Les options d’accès, d’export, de correction et de suppression se trouvent dans la section Confidentialité du compte.' },
    ],
  },
};

export const pageContent: Record<Locale, Record<PageSlug, PageContent>> = { en, ar, fr };

export const PAGE_SLUGS = Object.keys(en) as PageSlug[];
