import type { Locale } from './preferences.ts';

/**
 * Every word the public website says, in both languages.
 *
 * Arabic here is Egyptian and written to be read, not decoded — the same
 * register the mobile application uses. A literal translation of English
 * marketing copy reads like a translation, which is its own kind of telling
 * somebody they were an afterthought.
 *
 * No component may hold a bare string. That rule is enforced by
 * `scripts/web-platform.test.mts`, because the failure mode is not a missing
 * translation somebody notices — it is one English word left in the middle of
 * an Arabic page, which nobody reports and everybody sees.
 */

const baseCopy = {
  en: {
    brand: 'Warsha',
    skipToContent: 'Skip to content',

    navFind: 'Find a professional',
    navServices: 'Services',
    navHow: 'How Warsha works',
    navWorker: 'Work with Warsha',
    navTrust: 'Trust & safety',
    navHelp: 'Help',
    navPrimary: 'Primary',
    navMenu: 'Menu',
    signIn: 'Sign in',
    createAccount: 'Create account',
    homeAria: 'Warsha home',

    languageLabel: 'Language',
    languageEnglish: 'English',
    languageArabic: 'العربية',
    languageFrench: 'Français',
    appearanceLabel: 'Appearance',
    appearanceSystem: 'System',
    appearanceLight: 'Light',
    appearanceDark: 'Dark',

    heroImageAlt: 'An electrician fitting a wall socket in a home.',
    heroEyebrow: 'Home services in Egypt',
    heroTitle: 'Get it fixed, at a price you agreed first.',
    heroBody:
      'Warsha connects people who need home repairs and maintenance with skilled '
      + 'professionals. You describe the job, they quote, and you decide before any '
      + 'work begins.',
    heroPostJob: 'Post a job',
    heroWork: 'Work with Warsha',
    servicesCardAction: 'Request help',
    servicesCtaTitle: 'Not sure which service fits?',
    servicesCtaBody: 'Describe the work in your own words. You can choose a broad category and let professionals quote the right approach.',
    servicesCtaAction: 'Post a job',
    heroNote:
      'Warsha is in closed testing. Accounts created now are real accounts on the '
      + 'live service.',

    howTitle: 'How it works',
    howLead: 'Four steps, and the third one is the one that matters.',
    step1Title: 'Describe the job',
    step1Body: 'Say what needs doing and where. Photographs help, and are optional.',
    step2Title: 'Receive quotes',
    step2Body:
      'Professionals who cover your area and trade respond with a price for the work.',
    step3Title: 'Agree before work starts',
    step3Body:
      'You accept a quote before anybody is booked. The agreed price is recorded.',
    step4Title: 'Track it to completion',
    step4Body:
      'Follow the job through to completion, with the conversation kept in one place.',

    workerEyebrow: 'For professionals',
    workerTitle: 'Quote the work you want, at your price.',
    workerLead:
      'Warsha sends you requests that match your trade and the areas you cover. '
      + 'You choose which to quote.',
    workerCta: 'Start your application',
    worker1Title: 'Work that matches your trade',
    worker1Body: 'You see requests for the trades you registered and the areas you cover.',
    worker2Title: 'You set the price',
    worker2Body:
      'You quote each job yourself. Nothing is assigned to you at a price you did not set.',
    worker3Title: 'Verification you complete once',
    worker3Body:
      'Identity and trade checks are completed once, then reviewed by a person.',

    legalHomeTitle: 'Read before you sign up',
    legalHomeLead:
      'Every agreement Warsha asks you to accept is readable in full, in English and '
      + 'Arabic, before you create an account.',
    legalUntranslatedHeading: 'Not yet published in French',
    legalUntranslatedNote: 'The title and summary of this document are translated. The full text below is the English version, which is the text that governs. Warsha does not publish a machine translation of a document you can be held to.',
    legalVersion: 'Version',

    footerBlurb:
      'Home repairs and maintenance in Egypt, with the price agreed before the work starts.',
    footerWarsha: 'Warsha',
    footerServices: 'Services',
    footerLegal: 'Legal',
    footerPreferences: 'Preferences',
    footerAbout: 'About',
    footerHowItWorks: 'How it works',
    footerContact: 'Contact',
    footerAllServices: 'All services',
    footerCategories: 'Categories',
    footerBecomeWorker: 'Become a worker',
    footerLegalCentre: 'Legal centre',
    footerPrivacy: 'Privacy Policy',
    footerTerms: 'Terms of Service',
    footerLocation: 'Location Data Policy',

    legalCentreTitle: 'Legal centre',
    legalCentreLead:
      'Every agreement and policy, in full, in both languages. Nothing here is behind a sign-in.',
    legalMandatoryHeading: 'Agreements you accept',
    legalMandatoryNote:
      'Warsha records the exact version and the hash of the text shown when you accept '
      + 'one of these. Acceptance records are append-only and are never edited.',
    legalReferenceHeading: 'Policies and registers',
    legalReferenceNote:
      'These describe how Warsha operates. They do not require acceptance.',
    legalAudienceEveryone: 'everyone',
    legalEffective: 'effective',
    legalAcceptanceRequired: 'acceptance required',
    fingerprintHeading: 'Document fingerprint',
    fingerprintNote:
      'Warsha records the exact version and the hash of the text shown when an '
      + 'agreement is accepted. These are the hashes for version',

    signInTitle: 'Sign in to Warsha',
    signInEyebrow: 'Welcome back',
    signInLead:
      'Choose how you use Warsha. Your account works the same on the web and in the app.',
    signInIdentity: 'Email or phone number',
    signInIdentityHint: 'Use the email address or the phone number you registered with. Warsha works out the rest.',
    signInOneAccount: 'One sign-in for everyone',
    signInOneAccountBody: 'Whether you hire professionals, do the work, or both, you sign in the same way. Warsha resolves what your account can do after you are signed in — you never have to declare it first.',
    signInCustomer: 'I need work done',
    signInCustomerBody:
      'Sign in with the email address and password you registered with.',
    signInWorker: 'I do the work',
    signInWorkerBody:
      'Sign in with the phone number and password you registered with. No email is involved.',
    signInCustomerPending: 'Customer sign-in — coming to the web',
    signInWorkerPending: 'Professional sign-in — coming to the web',
    signInFootNote: 'Do not have an account yet?',
    signInFootLink: 'Create one',
    signInFootTail:
      'Accounts created in the Warsha app work here, and accounts created here work in the app.',

    createTitle: 'How do you want to use Warsha?',
    createEyebrow: 'Create an account',
    createLead:
      'Pick the one that describes you. You can read every required agreement in full '
      + 'before you agree to anything.',
    createCustomerBody:
      'Describe a job, receive quotes, and agree a price before the work starts. You '
      + 'register with an email address and confirm it before signing in.',
    createWorkerBody:
      'Register your trades, complete verification, and quote the jobs you want. You '
      + 'register with a phone number and password — no email is needed.',
    createRequiredHeading: 'You will be asked to accept',
    createCustomerPending: 'Customer signup — coming to the web',
    createWorkerPending: 'Professional application — coming to the web',
    createFootNote:
      'Applying as a professional starts a verification process. It does not make you a '
      + 'worker on Warsha, and approval is not automatic. Already have an account?',
  },

  ar: {
    brand: 'ورشة',
    skipToContent: 'تخطَّ إلى المحتوى',

    navFind: 'دوّر على صنايعي',
    navServices: 'الخدمات',
    navHow: 'ورشة بتشتغل إزاي',
    navWorker: 'اشتغل مع ورشة',
    navTrust: 'الأمان والثقة',
    navHelp: 'المساعدة',
    navPrimary: 'التنقل الرئيسي',
    navMenu: 'القائمة',
    signIn: 'تسجيل الدخول',
    createAccount: 'إنشاء حساب',
    homeAria: 'الصفحة الرئيسية لورشة',

    languageLabel: 'اللغة',
    languageEnglish: 'English',
    languageArabic: 'العربية',
    languageFrench: 'Français',
    appearanceLabel: 'المظهر',
    appearanceSystem: 'حسب الجهاز',
    appearanceLight: 'فاتح',
    appearanceDark: 'داكن',

    heroImageAlt: 'كهربائي بيركّب علبة كهربا في شقة.',
    heroEyebrow: 'خدمات المنزل في مصر',
    heroTitle: 'صلّح اللي محتاج تصليح، بسعر اتفقت عليه الأول.',
    heroBody:
      'ورشة بتوصّل اللي محتاج تصليح أو صيانة في بيته بصنايعية شاطرين. إنت بتوصف '
      + 'الشغل، وهما بيقدّموا سعر، وإنت اللي بتقرر قبل ما أي شغل يبدأ.',
    heroPostJob: 'اطلب صنايعي',
    heroWork: 'اشتغل مع ورشة',
    servicesCardAction: 'اطلب مساعدة',
    servicesCtaTitle: 'مش عارف تختار خدمة إيه؟',
    servicesCtaBody: 'اوصف الشغل بطريقتك. اختار التصنيف الأقرب وسيب الصنايعية يقدّموا الحل المناسب.',
    servicesCtaAction: 'اطلب صنايعي',
    heroNote:
      'ورشة لسه في مرحلة تجربة مغلقة. الحسابات اللي بتتعمل دلوقتي حسابات حقيقية على '
      + 'الخدمة الفعلية.',

    howTitle: 'بتشتغل إزاي',
    howLead: 'أربع خطوات، والتالتة هي المهمة.',
    step1Title: 'اوصف الشغل',
    step1Body: 'قول محتاج إيه وفين. الصور بتساعد، وهي اختيارية.',
    step2Title: 'استنى العروض',
    step2Body: 'الصنايعية اللي بيغطوا منطقتك ومهنتك بيبعتوا سعر للشغل.',
    step3Title: 'الاتفاق قبل ما الشغل يبدأ',
    step3Body: 'إنت بتقبل العرض قبل ما حد يتحجز. السعر المتفق عليه بيتسجّل.',
    step4Title: 'تابع لحد ما يخلص',
    step4Body: 'تابع الشغل لحد ما يكمل، والكلام كله محفوظ في مكان واحد.',

    workerEyebrow: 'للصنايعية',
    workerTitle: 'قدّم سعرك على الشغل اللي يناسبك.',
    workerLead:
      'ورشة بتبعتلك الطلبات اللي تناسب مهنتك والمناطق اللي بتغطيها. وإنت بتختار '
      + 'تقدّم سعر على إيه.',
    workerCta: 'ابدأ طلبك',
    worker1Title: 'شغل يناسب مهنتك',
    worker1Body: 'بتشوف الطلبات الخاصة بالمهن اللي سجّلتها والمناطق اللي بتغطيها.',
    worker2Title: 'إنت اللي بتحدد السعر',
    worker2Body: 'إنت بتسعّر كل شغلانة بنفسك. مفيش حاجة بتتحطلك بسعر إنت ما حددتوش.',
    worker3Title: 'توثيق بتعمله مرة واحدة',
    worker3Body: 'التحقق من الهوية والمهنة بيتعمل مرة واحدة، وبعدين حد بيراجعه.',

    legalHomeTitle: 'اقرأ قبل ما تسجّل',
    legalHomeLead:
      'كل اتفاقية ورشة بتطلب منك توافق عليها تقدر تقراها كاملة، بالعربي والإنجليزي، '
      + 'قبل ما تعمل حساب.',
    legalUntranslatedHeading: 'لسه ماتنشرش بالفرنساوي',
    legalUntranslatedNote: 'عنوان المستند ده وملخصه مترجمين. النص الكامل تحت هو النسخة الإنجليزية، وهي النص الملزم. ورشة ما بتنشرش ترجمة آلية لمستند ممكن تتحاسب عليه.',
    legalVersion: 'نسخة',

    footerBlurb: 'تصليح وصيانة المنازل في مصر، بسعر متفق عليه قبل ما الشغل يبدأ.',
    footerWarsha: 'ورشة',
    footerServices: 'الخدمات',
    footerLegal: 'القانوني',
    footerPreferences: 'التفضيلات',
    footerAbout: 'عن ورشة',
    footerHowItWorks: 'بتشتغل إزاي',
    footerContact: 'تواصل معنا',
    footerAllServices: 'كل الخدمات',
    footerCategories: 'التصنيفات',
    footerBecomeWorker: 'ابقى صنايعي في ورشة',
    footerLegalCentre: 'المركز القانوني',
    footerPrivacy: 'سياسة الخصوصية',
    footerTerms: 'شروط الاستخدام',
    footerLocation: 'سياسة بيانات الموقع',

    legalCentreTitle: 'المركز القانوني',
    legalCentreLead:
      'كل الاتفاقيات والسياسات، كاملة، وباللغتين. مفيش حاجة هنا محتاجة تسجيل دخول.',
    legalMandatoryHeading: 'الاتفاقيات اللي بتوافق عليها',
    legalMandatoryNote:
      'ورشة بتسجّل النسخة بالظبط وبصمة النص اللي اتعرض عليك وقت الموافقة. سجلات '
      + 'الموافقة بتتضاف بس وما بتتعدلش أبدًا.',
    legalReferenceHeading: 'السياسات والسجلات',
    legalReferenceNote: 'دي بتوضح ورشة بتشتغل إزاي. مش محتاجة موافقة.',
    legalAudienceEveryone: 'الجميع',
    legalEffective: 'سارية من',
    legalAcceptanceRequired: 'مطلوب الموافقة',
    fingerprintHeading: 'بصمة المستند',
    fingerprintNote:
      'ورشة بتسجّل النسخة بالظبط وبصمة النص اللي اتعرض وقت الموافقة على أي اتفاقية. '
      + 'دي البصمات الخاصة بالنسخة',

    signInTitle: 'ادخل على ورشة',
    signInEyebrow: 'أهلًا بعودتك',
    signInLead: 'اختار إنت بتستخدم ورشة إزاي. حسابك بيشتغل نفس الشيء على الويب والتطبيق.',
    signInIdentity: 'البريد الإلكتروني أو رقم التليفون',
    signInIdentityHint: 'استخدم البريد الإلكتروني أو رقم التليفون اللي سجّلت بيه. ورشة هتعرف الباقي.',
    signInOneAccount: 'تسجيل دخول واحد للكل',
    signInOneAccountBody: 'سواء بتطلب صنايعية، أو بتشتغل، أو الاتنين، بتسجّل الدخول بنفس الطريقة. ورشة بتحدد حسابك بيعمل إيه بعد ما تدخل — مش لازم تقول ده بنفسك الأول.',
    signInCustomer: 'محتاج حد يشتغل عندي',
    signInCustomerBody: 'ادخل بالإيميل والباسورد اللي سجّلت بيهم.',
    signInWorker: 'أنا اللي بشتغل',
    signInWorkerBody: 'ادخل برقم التليفون والباسورد اللي سجّلت بيهم. من غير إيميل خالص.',
    signInCustomerPending: 'دخول العملاء — جاي قريب على الويب',
    signInWorkerPending: 'دخول الصنايعية — جاي قريب على الويب',
    signInFootNote: 'لسه ما عندكش حساب؟',
    signInFootLink: 'اعمل واحد',
    signInFootTail:
      'الحسابات اللي اتعملت في تطبيق ورشة بتشتغل هنا، واللي بيتعمل هنا بيشتغل في التطبيق.',

    createTitle: 'عايز تستخدم ورشة إزاي؟',
    createEyebrow: 'إنشاء حساب',
    createLead:
      'اختار الوصف اللي يناسبك. تقدر تقرا كل اتفاقية مطلوبة كاملة قبل ما توافق على أي حاجة.',
    createCustomerBody:
      'اوصف الشغل، استنى العروض، واتفق على السعر قبل ما الشغل يبدأ. بتسجّل بإيميل '
      + 'وبتأكده قبل ما تدخل.',
    createWorkerBody:
      'سجّل مهنتك، كمّل التوثيق، وقدّم سعرك على الشغل اللي يناسبك. بتسجّل برقم '
      + 'تليفون وباسورد — من غير إيميل.',
    createRequiredHeading: 'هيتطلب منك توافق على',
    createCustomerPending: 'تسجيل العملاء — جاي قريب على الويب',
    createWorkerPending: 'طلب الصنايعية — جاي قريب على الويب',
    createFootNote:
      'التقديم كصنايعي بيبدأ عملية توثيق. ده ما بيخليكش صنايعي في ورشة، والقبول مش '
      + 'تلقائي. عندك حساب بالفعل؟',
  },
} as const;

export const copy = {
  ...baseCopy,
  fr: {
    ...baseCopy.en,
    brand: 'Warsha', skipToContent: 'Aller au contenu',
    navFind: 'Trouver un professionnel', navServices: 'Services', navHow: 'Comment fonctionne Warsha', navWorker: 'Travailler avec Warsha', navTrust: 'Confiance et sécurité', navHelp: 'Aide', navPrimary: 'Navigation principale', navMenu: 'Menu', signIn: 'Se connecter', createAccount: 'Créer un compte', homeAria: 'Accueil Warsha',
    languageLabel: 'Langue', languageEnglish: 'English', languageArabic: 'العربية', languageFrench: 'Français', appearanceLabel: 'Apparence', appearanceSystem: 'Système', appearanceLight: 'Clair', appearanceDark: 'Sombre',
    heroImageAlt: 'Un électricien installe une prise murale dans un logement.', heroEyebrow: 'Services à domicile en Égypte', heroTitle: "Faites réparer, au prix convenu d'abord.", heroBody: 'Warsha met en relation les personnes qui ont besoin de réparations ou d’entretien avec des professionnels qualifiés. Vous décrivez le travail, ils proposent un devis et vous décidez avant le début.', heroPostJob: 'Publier une demande', heroWork: 'Travailler avec Warsha', servicesCardAction: 'Demander de l’aide', servicesCtaTitle: 'Vous ne savez pas quel service choisir ?', servicesCtaBody: 'Décrivez le travail avec vos propres mots. Choisissez la catégorie la plus proche et laissez les professionnels proposer la bonne approche.', servicesCtaAction: 'Publier une demande', heroNote: 'Warsha est en phase de test fermé. Les comptes créés maintenant sont de vrais comptes sur le service actif.',
    howTitle: 'Comment ça marche', howLead: 'Quatre étapes, avec votre accord avant le début des travaux.', step1Title: 'Décrivez le travail', step1Body: 'Indiquez ce qui doit être fait et où. Les photos sont utiles, mais facultatives.', step2Title: 'Recevez des devis', step2Body: 'Les professionnels du métier qui couvrent votre zone vous proposent un prix.', step3Title: 'Acceptez avant le début', step3Body: 'Vous acceptez un devis avant la réservation du professionnel. Le prix convenu est enregistré.', step4Title: "Suivez jusqu'à la fin", step4Body: 'Suivez le travail jusqu’à son achèvement, avec toute la conversation au même endroit.',
    workerEyebrow: 'Pour les professionnels', workerTitle: 'Proposez votre prix pour les travaux qui vous intéressent.', workerLead: 'Warsha vous envoie les demandes qui correspondent à votre métier et aux zones que vous couvrez. Vous choisissez celles auxquelles répondre.', workerCta: 'Commencer ma demande', worker1Title: 'Des travaux adaptés à votre métier', worker1Body: 'Vous voyez les demandes correspondant aux métiers et aux zones enregistrés.', worker2Title: 'Vous fixez le prix', worker2Body: 'Vous établissez chaque devis. Aucun travail ne vous est attribué à un prix que vous n’avez pas choisi.', worker3Title: 'Une vérification à effectuer une fois', worker3Body: 'Les contrôles d’identité et de métier sont effectués une fois, puis examinés par une personne.',
    legalUntranslatedHeading: 'Pas encore publié en français', legalUntranslatedNote: 'Le titre et le résumé de ce document sont traduits. Le texte intégral ci-dessous est la version anglaise, qui est le texte qui fait foi. Warsha ne publie pas de traduction automatique d’un document qui vous engage.',
    legalHomeTitle: 'À lire avant de vous inscrire', legalHomeLead: 'Chaque accord demandé par Warsha est consultable en entier avant la création du compte.', legalVersion: 'Version',
    footerBlurb: 'Réparations et entretien à domicile en Égypte, avec un prix convenu avant le début.', footerWarsha: 'Warsha', footerServices: 'Services', footerLegal: 'Mentions légales', footerPreferences: 'Préférences', footerAbout: 'À propos', footerHowItWorks: 'Comment ça marche', footerContact: 'Contact', footerAllServices: 'Tous les services', footerCategories: 'Catégories', footerBecomeWorker: 'Devenir professionnel', footerLegalCentre: 'Centre juridique', footerPrivacy: 'Politique de confidentialité', footerTerms: "Conditions d'utilisation", footerLocation: 'Politique relative aux données de localisation',
    legalCentreTitle: 'Centre juridique', legalCentreLead: 'Tous les accords et politiques sont consultables en entier, sans connexion.', legalMandatoryHeading: 'Accords à accepter', legalMandatoryNote: 'Warsha enregistre la version exacte et l’empreinte du texte affiché lors de votre acceptation. Les preuves d’acceptation sont immuables.', legalReferenceHeading: 'Politiques et registres', legalReferenceNote: 'Ces documents expliquent le fonctionnement de Warsha. Ils ne nécessitent pas votre acceptation.', legalAudienceEveryone: 'tout le monde', legalEffective: 'en vigueur', legalAcceptanceRequired: 'acceptation requise', fingerprintHeading: 'Empreinte du document', fingerprintNote: 'Warsha enregistre la version exacte et l’empreinte du texte affiché lors de l’acceptation. Empreintes de la version',
    signInTitle: 'Se connecter à Warsha', signInEyebrow: 'Heureux de vous revoir', signInLead: 'Utilisez le même compte sur le Web et dans l’application.', signInIdentity: 'Adresse e-mail ou numéro de téléphone', signInIdentityHint: 'Utilisez l’adresse e-mail ou le numéro de téléphone enregistré. Warsha détermine le type de compte.', signInOneAccount: 'Une connexion pour tous', signInOneAccountBody: 'Que vous demandiez un service, réalisiez le travail ou les deux, la connexion reste la même. Warsha détermine ensuite les possibilités de votre compte.', signInCustomer: "J'ai besoin d'un service", signInCustomerBody: 'Connectez-vous avec votre adresse e-mail et votre mot de passe.', signInWorker: 'Je réalise les travaux', signInWorkerBody: 'Connectez-vous avec votre numéro de téléphone et votre mot de passe. Aucun e-mail n’est utilisé.', signInCustomerPending: 'Connexion client — bientôt disponible sur le Web', signInWorkerPending: 'Connexion professionnel — bientôt disponible sur le Web', signInFootNote: "Vous n'avez pas encore de compte ?", signInFootLink: 'Créez-en un', signInFootTail: 'Les comptes créés dans l’application fonctionnent sur le Web, et inversement.',
    createTitle: 'Comment souhaitez-vous utiliser Warsha ?', createEyebrow: 'Créer un compte', createLead: 'Choisissez ce qui vous correspond. Vous pouvez lire chaque accord requis avant de l’accepter.', createCustomerBody: 'Décrivez un travail, recevez des devis et acceptez le prix avant le début. Vous vous inscrivez avec une adresse e-mail que vous devez confirmer.', createWorkerBody: 'Enregistrez vos métiers, terminez la vérification et répondez aux demandes qui vous intéressent. Vous vous inscrivez avec un numéro de téléphone et un mot de passe, sans e-mail.', createRequiredHeading: 'Vous devrez accepter', createCustomerPending: 'Inscription client — bientôt disponible sur le Web', createWorkerPending: 'Candidature professionnel — bientôt disponible sur le Web', createFootNote: 'La candidature comme professionnel déclenche une vérification. Elle ne vaut pas approbation automatique. Vous avez déjà un compte ?',
  },
} as const;

export type CopyKey = keyof typeof copy.en;

export function t(locale: Locale, key: CopyKey): string {
  return copy[locale][key];
}
