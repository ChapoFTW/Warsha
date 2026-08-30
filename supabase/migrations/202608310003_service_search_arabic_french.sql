-- Arabic and French service names, so an Arabic customer can search in Arabic.
--
-- `search_providers` matched `provider_profiles.search_document` (built from
-- display_name, profession_key, about and location_label), the provider's
-- skills and specialties, `services.name` and `service_categories.id`. Every
-- one of those is Latin text. The Arabic and French service vocabulary existed
-- only in `src/services/specific-services.ts` and `src/i18n/translations.ts`,
-- on the client, where the server could not reach it.
--
-- So the search worked in English and returned nothing in Arabic:
--
--     "electrical"  -> Dalia Aziz
--     "سباكة"        -> (nothing)
--
-- For a marketplace whose customers speak Arabic first, that is not a missing
-- nicety; it is the search not working.
--
-- Nothing is invented here. These are the same strings the clients already
-- render, moved to where the query runs. The English `name` column is
-- unchanged and remains the display value for surfaces that use it; these two
-- columns exist to be searched.

alter table public.services
  add column if not exists name_ar text,
  add column if not exists name_fr text;

alter table public.service_categories
  add column if not exists name_ar text,
  add column if not exists name_fr text;

comment on column public.services.name_ar is
  'Searchable Arabic name. Imported from the client catalogue; display still '
  'resolves through specificServiceLabel.';
comment on column public.services.name_fr is
  'Searchable French name. Imported from the client catalogue; display still '
  'resolves through specificServiceLabel.';

update public.services s
set name_ar = v.name_ar, name_fr = v.name_fr
from (values
  ('plumbing-leak-repair', 'إصلاح تسريب', 'Réparation de fuite'),
  ('plumbing-blocked-drain', 'مواسير مسدودة', 'Canalisation bouchée'),
  ('plumbing-toilet-repair', 'إصلاح تواليت', 'Réparation de WC'),
  ('plumbing-toilet-install', 'تركيب تواليت', 'Installation de WC'),
  ('plumbing-tap-repair', 'حنفية بتنقط', 'Réparation de robinet'),
  ('plumbing-tap-install', 'تركيب حنفية', 'Installation de robinet'),
  ('plumbing-sink-repair', 'إصلاح حوض', 'Réparation d’évier'),
  ('plumbing-sink-install', 'تركيب حوض', 'Installation d’évier'),
  ('plumbing-shower-repair', 'إصلاح دش', 'Réparation de douche'),
  ('plumbing-shower-install', 'تركيب دش', 'Installation de douche'),
  ('plumbing-pipe-repair', 'إصلاح مواسير', 'Réparation de tuyauterie'),
  ('plumbing-pipe-replace', 'تغيير مواسير', 'Remplacement de tuyauterie'),
  ('plumbing-water-pressure', 'ضعف ضغط المياه', 'Pression d’eau faible'),
  ('plumbing-water-tank', 'توصيل تانك مياه', 'Raccordement de réservoir'),
  ('plumbing-inspection', 'معاينة سباكة', 'Diagnostic plomberie'),
  ('electrical-outage', 'انقطاع أو عطل كهرباء', 'Panne de courant'),
  ('electrical-short-circuit', 'ماس كهربائي', 'Court-circuit'),
  ('electrical-socket-repair', 'إصلاح بريزة', 'Réparation de prise'),
  ('electrical-socket-install', 'تركيب بريزة', 'Installation de prise'),
  ('electrical-switch-repair', 'إصلاح مفتاح نور', 'Réparation d’interrupteur'),
  ('electrical-switch-install', 'تركيب مفتاح نور', 'Installation d’interrupteur'),
  ('electrical-lighting-repair', 'إصلاح إضاءة', 'Réparation d’éclairage'),
  ('electrical-light-install', 'تركيب وحدة إضاءة', 'Pose de luminaire'),
  ('electrical-chandelier', 'تركيب نجفة', 'Pose de lustre'),
  ('electrical-breaker', 'مشكلة في القاطع', 'Problème de disjoncteur'),
  ('electrical-panel', 'أعمال لوحة كهرباء', 'Travaux sur tableau électrique'),
  ('electrical-wiring', 'تمديد أو تغيير أسلاك', 'Câblage ou recâblage'),
  ('electrical-fan', 'تركيب أو إصلاح مروحة', 'Pose ou réparation de ventilateur'),
  ('electrical-inspection', 'معاينة كهرباء', 'Diagnostic électrique'),
  ('cleaning-regular', 'تنظيف منزل دوري', 'Ménage régulier'),
  ('cleaning-deep', 'تنظيف عميق', 'Nettoyage en profondeur'),
  ('cleaning-move-in', 'تنظيف قبل السكن', 'Nettoyage avant emménagement'),
  ('cleaning-post-construction', 'تنظيف بعد التشطيب', 'Nettoyage après travaux'),
  ('cleaning-sofa', 'تنظيف كنب ومفروشات', 'Nettoyage de canapé'),
  ('cleaning-carpet', 'تنظيف سجاد', 'Nettoyage de tapis'),
  ('cleaning-windows', 'تنظيف شبابيك', 'Nettoyage de vitres'),
  ('cleaning-kitchen', 'تنظيف مطبخ', 'Nettoyage de cuisine'),
  ('cleaning-bathroom', 'تنظيف حمام', 'Nettoyage de salle de bain'),
  ('cleaning-water-tank', 'تنظيف تانك المياه', 'Nettoyage de réservoir d’eau'),
  ('ac-not-cooling', 'التكييف مش بيبرد', 'Climatiseur ne refroidit pas'),
  ('ac-service', 'صيانة تكييف', 'Entretien de climatiseur'),
  ('ac-cleaning', 'تنظيف تكييف', 'Nettoyage de climatiseur'),
  ('ac-install', 'تركيب تكييف', 'Installation de climatiseur'),
  ('ac-removal', 'فك تكييف', 'Dépose de climatiseur'),
  ('ac-relocation', 'نقل تكييف', 'Déplacement de climatiseur'),
  ('ac-gas-recharge', 'شحن فريون', 'Recharge de gaz'),
  ('ac-water-leak', 'التكييف بينقط مياه', 'Fuite d’eau du climatiseur'),
  ('ac-noise', 'صوت غريب', 'Bruit anormal'),
  ('ac-control-fault', 'عطل كهربائي أو ريموت', 'Panne électrique ou commande'),
  ('appliance-washing-machine', 'تصليح غسالة', 'Réparation de lave-linge'),
  ('appliance-fridge', 'تصليح تلاجة', 'Réparation de réfrigérateur'),
  ('appliance-freezer', 'تصليح ديب فريزر', 'Réparation de congélateur'),
  ('appliance-oven', 'تصليح فرن أو بوتاجاز', 'Réparation de four ou cuisinière'),
  ('appliance-dishwasher', 'تصليح غسالة أطباق', 'Réparation de lave-vaisselle'),
  ('appliance-dryer', 'تصليح مجفف', 'Réparation de sèche-linge'),
  ('appliance-microwave', 'تصليح ميكروويف', 'Réparation de micro-ondes'),
  ('appliance-water-dispenser', 'تصليح كولدير', 'Réparation de fontaine à eau'),
  ('appliance-install', 'تركيب جهاز', 'Installation d’appareil'),
  ('appliance-inspection', 'كشف عطل جهاز', 'Diagnostic d’appareil'),
  ('carpentry-door-repair', 'إصلاح باب خشب', 'Réparation de porte en bois'),
  ('carpentry-door-install', 'تركيب باب خشب', 'Pose de porte en bois'),
  ('carpentry-furniture-repair', 'تصليح أثاث', 'Réparation de meuble'),
  ('carpentry-furniture-assembly', 'تركيب أثاث', 'Montage de meuble'),
  ('carpentry-wardrobe', 'أعمال دولاب', 'Travaux d’armoire'),
  ('carpentry-kitchen-cabinets', 'مطبخ خشب', 'Meubles de cuisine'),
  ('carpentry-shelving', 'أرفف وتخزين', 'Étagères et rangement'),
  ('carpentry-custom', 'نجارة حسب الطلب', 'Menuiserie sur mesure'),
  ('carpentry-lock-fitting', 'تركيب كالون ومقابض', 'Pose de quincaillerie'),
  ('carpentry-upholstery', 'تنجيد', 'Tapisserie'),
  ('painting-room', 'دهان غرفة', 'Peinture d’une pièce'),
  ('painting-apartment', 'دهان شقة كاملة', 'Peinture d’appartement'),
  ('painting-touch-up', 'ترقيع ولمسات', 'Retouches'),
  ('painting-wall-prep', 'تجهيز حوائط', 'Préparation des murs'),
  ('painting-decorative', 'تشطيبات ديكورية', 'Finitions décoratives'),
  ('painting-wallpaper', 'تركيب ورق حائط', 'Pose de papier peint'),
  ('painting-exterior', 'دهان خارجي', 'Peinture extérieure'),
  ('painting-damp-treatment', 'معالجة رطوبة أو عفن', 'Traitement d’humidité'),
  ('moving-apartment', 'نقل عفش شقة', 'Déménagement d’appartement'),
  ('moving-single-item', 'نقل قطعة واحدة', 'Transport d’un seul objet'),
  ('moving-furniture-inside', 'ترتيب أثاث جوه البيت', 'Déplacement de meubles'),
  ('moving-packing', 'مساعدة في التغليف', 'Aide à l’emballage'),
  ('moving-disassembly', 'فك وتركيب أثاث', 'Démontage et remontage'),
  ('moving-lift', 'ونش رفع عفش', 'Monte-meubles'),
  ('moving-office', 'نقل مكتب', 'Déménagement de bureau'),
  ('pest-cockroaches', 'صراصير', 'Cafards'),
  ('pest-bedbugs', 'بق الفراش', 'Punaises de lit'),
  ('pest-rodents', 'فئران', 'Souris ou rats'),
  ('pest-ants', 'نمل', 'Fourmis'),
  ('pest-mosquitoes', 'ناموس أو ذباب', 'Moustiques ou mouches'),
  ('pest-termites', 'نمل أبيض', 'Termites'),
  ('pest-general-spray', 'رش وقائي شامل', 'Traitement préventif'),
  ('pest-inspection', 'معاينة حشرات', 'Inspection antiparasitaire'),
  ('water-heater-no-hot-water', 'مفيش مية سخنة', 'Pas d’eau chaude'),
  ('water-heater-gas-repair', 'تصليح سخان غاز', 'Réparation de chauffe-eau à gaz'),
  ('water-heater-electric-repair', 'تصليح سخان كهربا', 'Réparation de chauffe-eau électrique'),
  ('water-heater-install', 'تركيب سخان', 'Installation de chauffe-eau'),
  ('water-heater-replace', 'تغيير سخان', 'Remplacement de chauffe-eau'),
  ('water-heater-leak', 'السخان بينقط', 'Chauffe-eau qui fuit'),
  ('water-heater-descale', 'تنظيف وإزالة ترسيبات', 'Détartrage et entretien'),
  ('water-heater-thermostat', 'مشكلة ترموستات', 'Problème de thermostat'),
  ('flooring-ceramic-install', 'تركيب سيراميك', 'Pose de carrelage'),
  ('flooring-porcelain-install', 'تركيب بورسلين', 'Pose de grès cérame'),
  ('flooring-marble', 'أعمال رخام', 'Travaux de marbre'),
  ('flooring-parquet', 'تركيب باركيه', 'Pose de parquet'),
  ('flooring-tile-repair', 'بلاط مكسور أو فاضي', 'Carreaux fissurés ou descellés'),
  ('flooring-grout', 'سد فواصل البلاط', 'Jointoiement'),
  ('flooring-skirting', 'وزر أرضيات', 'Plinthes'),
  ('flooring-removal', 'إزالة أرضية قديمة', 'Dépose d’ancien sol'),
  ('renovation-plastering', 'محارة', 'Enduit'),
  ('renovation-gypsum-ceiling', 'أسقف جبس بورد', 'Faux plafond en plaques'),
  ('renovation-gypsum-decor', 'ديكورات جبس', 'Décoration en plâtre'),
  ('renovation-wall-build', 'بناء أو هدم حائط', 'Création ou démolition de mur'),
  ('renovation-bathroom', 'تجديد حمام', 'Rénovation de salle de bain'),
  ('renovation-kitchen', 'تجديد مطبخ', 'Rénovation de cuisine'),
  ('renovation-full-apartment', 'تشطيب شقة كاملة', 'Finition complète d’appartement'),
  ('renovation-crack-repair', 'إصلاح شروخ', 'Réparation de fissures'),
  ('renovation-waterproofing', 'عزل مائي', 'Étanchéité'),
  ('renovation-inspection', 'معاينة وتقدير تكلفة', 'Visite et devis'),
  ('alumetal-window-install', 'تركيب شباك ألوميتال', 'Pose de fenêtre en aluminium'),
  ('alumetal-window-repair', 'إصلاح شباك ألوميتال', 'Réparation de fenêtre en aluminium'),
  ('alumetal-door-install', 'تركيب باب ألوميتال', 'Pose de porte en aluminium'),
  ('alumetal-door-repair', 'إصلاح باب ألوميتال', 'Réparation de porte en aluminium'),
  ('alumetal-glass-replace', 'تغيير زجاج', 'Remplacement de vitrage'),
  ('alumetal-kitchen', 'مطبخ ألوميتال', 'Cuisine en aluminium'),
  ('alumetal-shower-cabin', 'كابينة شاور', 'Cabine de douche'),
  ('alumetal-mosquito-net', 'سلك ناموس', 'Moustiquaires'),
  ('alumetal-shutter', 'أعمال سكريتة', 'Volet roulant'),
  ('satellite-dish-install', 'تركيب دش', 'Installation de parabole'),
  ('satellite-signal-fix', 'مفيش إشارة أو ضعيفة', 'Signal absent ou faible'),
  ('satellite-receiver', 'ضبط ريسيفر', 'Configuration du récepteur'),
  ('satellite-channel-tuning', 'ضبط القنوات', 'Réglage des chaînes'),
  ('satellite-tv-mount', 'تعليق تلفزيون على الحائط', 'Fixation murale de téléviseur'),
  ('satellite-tv-setup', 'تركيب وضبط تلفزيون', 'Installation de téléviseur'),
  ('satellite-relocate', 'نقل دش أو ريسيفر', 'Déplacement de parabole'),
  ('locksmith-locked-out', 'الباب اتقفل عليا', 'Porte claquée'),
  ('locksmith-lock-change', 'تغيير كالون', 'Changement de serrure'),
  ('locksmith-lock-repair', 'إصلاح كالون', 'Réparation de serrure'),
  ('locksmith-lock-install', 'تركيب كالون جديد', 'Pose de serrure'),
  ('locksmith-key-copy', 'نسخ مفاتيح', 'Reproduction de clés'),
  ('locksmith-broken-key', 'مفتاح مكسور جوه الكالون', 'Clé cassée dans la serrure'),
  ('locksmith-safe', 'فتح أو إصلاح خزنة', 'Ouverture ou réparation de coffre'),
  ('locksmith-security-upgrade', 'تحسين تأمين الباب', 'Renforcement de sécurité'),
  ('gardening-maintenance', 'العناية بالحديقة', 'Entretien de jardin'),
  ('gardening-planting', 'زراعة نباتات', 'Plantation'),
  ('gardening-pruning', 'تقليم', 'Taille'),
  ('gardening-lawn', 'العناية بالنجيلة', 'Entretien de pelouse'),
  ('gardening-irrigation', 'تركيب ري', 'Système d’arrosage'),
  ('gardening-balcony', 'نباتات بلكونة', 'Plantes de balcon'),
  ('gardening-clearance', 'تنظيف الحديقة', 'Débarras de jardin'),
  ('barber-haircut', 'قص شعر', 'Coupe de cheveux'),
  ('barber-beard-trim', 'تظبيط دقن', 'Taille de barbe'),
  ('barber-shave', 'حلاقة ذقن', 'Rasage'),
  ('barber-haircut-and-beard', 'قص شعر ودقن', 'Coupe et barbe'),
  ('barber-kids', 'قص شعر أطفال', 'Coupe enfant'),
  ('barber-hair-wash', 'غسيل وتصفيف', 'Shampooing et coiffage'),
  ('barber-group', 'زيارة منزلية لأكتر من شخص', 'Visite à domicile pour plusieurs'),
  ('hair-cut', 'قص شعر', 'Coupe'),
  ('hair-blow-dry', 'سشوار وتصفيف', 'Brushing et coiffage'),
  ('hair-colour', 'صبغة', 'Coloration'),
  ('hair-highlights', 'هاي لايت', 'Mèches'),
  ('hair-treatment', 'علاج شعر', 'Soin capillaire'),
  ('hair-keratin', 'كيراتين أو فرد', 'Kératine ou lissage'),
  ('hair-bridal', 'تسريحة عروسة أو مناسبة', 'Coiffure de mariée ou d’occasion'),
  ('hair-updo', 'تسريحة مرفوعة', 'Chignon'),
  ('hair-kids', 'قص شعر أطفال', 'Coupe enfant'),
  ('styling-occasion', 'تنسيق إطلالة مناسبة', 'Style pour une occasion'),
  ('styling-wardrobe-review', 'مراجعة الدولاب', 'Audit de garde-robe'),
  ('styling-shopping', 'تسوق شخصي', 'Accompagnement shopping'),
  ('styling-colour-analysis', 'تحليل الألوان', 'Analyse colorimétrique'),
  ('styling-wedding', 'تنسيق إطلالة فرح', 'Style de mariage'),
  ('styling-capsule', 'تخطيط دولاب أساسي', 'Garde-robe capsule')
) as v(translation_key, name_ar, name_fr)
where s.translation_key = v.translation_key;

update public.service_categories c
set name_ar = v.name_ar, name_fr = v.name_fr
from (values
  ('plumbing', 'سباكة', 'Plomberie'),
  ('electrical', 'كهرباء', 'Électricité'),
  ('carpentry', 'نجارة', 'Menuiserie'),
  ('ac', 'صيانة تكييف', 'Climatisation'),
  ('cleaning', 'تنظيف', 'Nettoyage'),
  ('painting', 'نقاشة', 'Peinture'),
  ('appliance-repair', 'تصليح أجهزة منزلية', 'Réparation d''appareils'),
  ('satellite-tv-installation', 'تركيب دش وتلفزيون', 'Satellite et télévision'),
  ('pest-control', 'مكافحة حشرات', 'Désinsectisation'),
  ('moving-help', 'مساعدة في النقل', 'Aide au déménagement'),
  ('water-heater-repair', 'تصليح سخانات', 'Réparation de chauffe-eau'),
  ('flooring-tiling', 'أرضيات وبلاط', 'Sols et carrelage'),
  ('renovation-finishing', 'تشطيبات وترميم', 'Rénovation et finitions'),
  ('alumetal', 'ألوميتال', 'Alumetal'),
  ('locksmithing', 'أقفال ومفاتيح', 'Serrurerie'),
  ('gardening', 'تنسيق حدائق', 'Jardinage'),
  ('general-maintenance', 'صيانة عامة', 'Entretien général'),
  ('barber', 'حلاقة', 'Barbier'),
  ('hairdressing', 'كوافير', 'Coiffure'),
  ('personal-styling', 'تنسيق إطلالة', 'Conseil en image')
) as v(id, name_ar, name_fr)
where c.id = v.id;

-- A trigram index on each language, because the search matches with
-- `to_tsvector('simple', …)` per row rather than against a stored vector, and
-- these columns are short.
create index if not exists services_name_ar_idx
  on public.services using gin (to_tsvector('simple'::regconfig, coalesce(name_ar, '')));
create index if not exists services_name_fr_idx
  on public.services using gin (to_tsvector('simple'::regconfig, coalesce(name_fr, '')));
