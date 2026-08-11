import type { Locale } from './preferences.ts';

/**
 * The body content of the public content pages, in both languages.
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
      { kind: 'card', title: 'Plumbing', text: 'Leaks, blockages, taps, water heaters, and bathroom fittings.' },
      { kind: 'card', title: 'Electrical', text: 'Sockets, lighting, distribution boards, and fault finding.' },
      { kind: 'card', title: 'Air conditioning', text: 'Installation, servicing, cleaning, and repair.' },
      { kind: 'card', title: 'Carpentry', text: 'Doors, windows, cabinets, and fitted furniture repair.' },
      { kind: 'card', title: 'Painting', text: 'Interior and exterior painting and surface preparation.' },
      { kind: 'card', title: 'Appliance repair', text: 'Domestic appliances, including washing machines and refrigerators.' },
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
      { kind: 'card', title: 'سباكة', text: 'تسريبات، وسدد، حنفيات، سخانات، وتجهيزات الحمام.' },
      { kind: 'card', title: 'كهرباء', text: 'برايز، إنارة، لوحات توزيع، والكشف عن الأعطال.' },
      { kind: 'card', title: 'تكييف', text: 'تركيب، صيانة، تنظيف، وتصليح.' },
      { kind: 'card', title: 'نجارة', text: 'أبواب، شبابيك، دواليب، وتصليح الأثاث الثابت.' },
      { kind: 'card', title: 'دهانات', text: 'دهان داخلي وخارجي وتجهيز الأسطح.' },
      { kind: 'card', title: 'تصليح أجهزة', text: 'الأجهزة المنزلية، ومنها الغسالات والتلاجات.' },
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

export const pageContent: Record<Locale, Record<PageSlug, PageContent>> = { en, ar };

export const PAGE_SLUGS = Object.keys(en) as PageSlug[];
