import type { Language } from '../i18n/translations.ts';

import { isLegacyCategory, type ServiceCategoryId } from './service-catalogue.ts';

/**
 * The specific job a customer is asking for, inside a trade.
 *
 * ## What was wrong
 *
 * `public.services` stored a display string in `name` and nothing else. Five
 * rows existed in the entire product -- two for plumbing, one each for
 * electrical, cleaning and air conditioning, none for the other fifteen
 * categories -- and the request form rendered `service.name` directly. So an
 * Arabic customer choosing plumbing was offered "Home inspection" and "Leak
 * repair", in English, and a customer choosing anything else was offered
 * nothing at all.
 *
 * Both halves of that are the same mistake: a display string was being used as
 * data. `service_categories` had already solved it with `translation_key`, and
 * this is the same solution one level down.
 *
 * ## Identity
 *
 * `key` is the stable machine identity and is what the database stores in
 * `services.translation_key`. It is never shown to anybody.
 *
 * The row's `id` (a uuid) stays the primary key and stays what a request
 * references, so every request already written keeps working untouched. The key
 * is a label resolver, not a new identifier -- introducing a second identity for
 * the same row is how you end up with two of everything.
 *
 * ## Shape
 *
 * Labels live here rather than in `src/i18n/translations.ts` because that file
 * is one flat namespace and this is a hundred and seventy entries that only
 * mean anything in the context of a parent. `profession-taxonomy.ts` already
 * carries `{ key, categoryId, en, ar, fr }` for exactly this reason; this
 * follows it.
 *
 * Order is array order within a category: deterministic, and readable as
 * intent -- the common jobs first, the diagnostic "inspection" last, because
 * somebody who knows what they need should not have to scroll past a survey.
 *
 * ## No "Other X work"
 *
 * Deliberately absent. The field is optional and already offers "Any service in
 * this category", which is the honest way to say "I do not know" -- it stores
 * nothing and restricts nothing. An "Other plumbing work" entry beside it would
 * be a second way to say the same thing that also writes a meaningless id, and
 * the customer's own description is where the detail belongs.
 *
 * ## Arabic
 *
 * Egyptian customer terminology, not literal translation: a blocked drain is
 * `مواسير مسدودة`, a leaking tap is `حنفية بتنقط`, and the word for a lock is
 * `كالون` before it is `قفل`.
 */

export type SpecificService = {
  /** Stable machine identity. Stored in `services.translation_key`. */
  key: string;
  categoryId: ServiceCategoryId;
  en: string;
  ar: string;
  fr: string;
};

export const specificServices: readonly SpecificService[] = [
  // --- Plumbing ------------------------------------------------------------
  { key: 'plumbing-leak-repair', categoryId: 'plumbing', en: 'Leak repair', ar: 'إصلاح تسريب', fr: 'Réparation de fuite' },
  { key: 'plumbing-blocked-drain', categoryId: 'plumbing', en: 'Blocked drain', ar: 'مواسير مسدودة', fr: 'Canalisation bouchée' },
  { key: 'plumbing-toilet-repair', categoryId: 'plumbing', en: 'Toilet repair', ar: 'إصلاح تواليت', fr: 'Réparation de WC' },
  { key: 'plumbing-toilet-install', categoryId: 'plumbing', en: 'Toilet installation', ar: 'تركيب تواليت', fr: 'Installation de WC' },
  { key: 'plumbing-tap-repair', categoryId: 'plumbing', en: 'Tap repair', ar: 'حنفية بتنقط', fr: 'Réparation de robinet' },
  { key: 'plumbing-tap-install', categoryId: 'plumbing', en: 'Tap installation', ar: 'تركيب حنفية', fr: 'Installation de robinet' },
  { key: 'plumbing-sink-repair', categoryId: 'plumbing', en: 'Sink repair', ar: 'إصلاح حوض', fr: 'Réparation d’évier' },
  { key: 'plumbing-sink-install', categoryId: 'plumbing', en: 'Sink installation', ar: 'تركيب حوض', fr: 'Installation d’évier' },
  { key: 'plumbing-shower-repair', categoryId: 'plumbing', en: 'Shower repair', ar: 'إصلاح دش', fr: 'Réparation de douche' },
  { key: 'plumbing-shower-install', categoryId: 'plumbing', en: 'Shower installation', ar: 'تركيب دش', fr: 'Installation de douche' },
  { key: 'plumbing-pipe-repair', categoryId: 'plumbing', en: 'Pipe repair', ar: 'إصلاح مواسير', fr: 'Réparation de tuyauterie' },
  { key: 'plumbing-pipe-replace', categoryId: 'plumbing', en: 'Pipe replacement', ar: 'تغيير مواسير', fr: 'Remplacement de tuyauterie' },
  { key: 'plumbing-water-pressure', categoryId: 'plumbing', en: 'Low water pressure', ar: 'ضعف ضغط المياه', fr: 'Pression d’eau faible' },
  { key: 'plumbing-water-tank', categoryId: 'plumbing', en: 'Water tank connection', ar: 'توصيل تانك مياه', fr: 'Raccordement de réservoir' },
  { key: 'plumbing-inspection', categoryId: 'plumbing', en: 'Plumbing inspection', ar: 'معاينة سباكة', fr: 'Diagnostic plomberie' },

  // --- Electrical ----------------------------------------------------------
  { key: 'electrical-outage', categoryId: 'electrical', en: 'Power outage or fault', ar: 'انقطاع أو عطل كهرباء', fr: 'Panne de courant' },
  { key: 'electrical-short-circuit', categoryId: 'electrical', en: 'Short circuit', ar: 'ماس كهربائي', fr: 'Court-circuit' },
  { key: 'electrical-socket-repair', categoryId: 'electrical', en: 'Socket repair', ar: 'إصلاح بريزة', fr: 'Réparation de prise' },
  { key: 'electrical-socket-install', categoryId: 'electrical', en: 'Socket installation', ar: 'تركيب بريزة', fr: 'Installation de prise' },
  { key: 'electrical-switch-repair', categoryId: 'electrical', en: 'Switch repair', ar: 'إصلاح مفتاح نور', fr: 'Réparation d’interrupteur' },
  { key: 'electrical-switch-install', categoryId: 'electrical', en: 'Switch installation', ar: 'تركيب مفتاح نور', fr: 'Installation d’interrupteur' },
  { key: 'electrical-lighting-repair', categoryId: 'electrical', en: 'Lighting repair', ar: 'إصلاح إضاءة', fr: 'Réparation d’éclairage' },
  { key: 'electrical-light-install', categoryId: 'electrical', en: 'Light fixture installation', ar: 'تركيب وحدة إضاءة', fr: 'Pose de luminaire' },
  { key: 'electrical-chandelier', categoryId: 'electrical', en: 'Chandelier installation', ar: 'تركيب نجفة', fr: 'Pose de lustre' },
  { key: 'electrical-breaker', categoryId: 'electrical', en: 'Circuit breaker problem', ar: 'مشكلة في القاطع', fr: 'Problème de disjoncteur' },
  { key: 'electrical-panel', categoryId: 'electrical', en: 'Electrical panel work', ar: 'أعمال لوحة كهرباء', fr: 'Travaux sur tableau électrique' },
  { key: 'electrical-wiring', categoryId: 'electrical', en: 'Wiring or rewiring', ar: 'تمديد أو تغيير أسلاك', fr: 'Câblage ou recâblage' },
  { key: 'electrical-fan', categoryId: 'electrical', en: 'Fan installation or repair', ar: 'تركيب أو إصلاح مروحة', fr: 'Pose ou réparation de ventilateur' },
  { key: 'electrical-inspection', categoryId: 'electrical', en: 'Electrical inspection', ar: 'معاينة كهرباء', fr: 'Diagnostic électrique' },

  // --- Cleaning ------------------------------------------------------------
  { key: 'cleaning-regular', categoryId: 'cleaning', en: 'Regular home cleaning', ar: 'تنظيف منزل دوري', fr: 'Ménage régulier' },
  { key: 'cleaning-deep', categoryId: 'cleaning', en: 'Deep cleaning', ar: 'تنظيف عميق', fr: 'Nettoyage en profondeur' },
  { key: 'cleaning-move-in', categoryId: 'cleaning', en: 'Move-in cleaning', ar: 'تنظيف قبل السكن', fr: 'Nettoyage avant emménagement' },
  { key: 'cleaning-post-construction', categoryId: 'cleaning', en: 'After-renovation cleaning', ar: 'تنظيف بعد التشطيب', fr: 'Nettoyage après travaux' },
  { key: 'cleaning-sofa', categoryId: 'cleaning', en: 'Sofa and upholstery cleaning', ar: 'تنظيف كنب ومفروشات', fr: 'Nettoyage de canapé' },
  { key: 'cleaning-carpet', categoryId: 'cleaning', en: 'Carpet cleaning', ar: 'تنظيف سجاد', fr: 'Nettoyage de tapis' },
  { key: 'cleaning-windows', categoryId: 'cleaning', en: 'Window cleaning', ar: 'تنظيف شبابيك', fr: 'Nettoyage de vitres' },
  { key: 'cleaning-kitchen', categoryId: 'cleaning', en: 'Kitchen deep clean', ar: 'تنظيف مطبخ', fr: 'Nettoyage de cuisine' },
  { key: 'cleaning-bathroom', categoryId: 'cleaning', en: 'Bathroom deep clean', ar: 'تنظيف حمام', fr: 'Nettoyage de salle de bain' },
  { key: 'cleaning-water-tank', categoryId: 'cleaning', en: 'Water tank cleaning', ar: 'تنظيف تانك المياه', fr: 'Nettoyage de réservoir d’eau' },

  // --- Air conditioning ----------------------------------------------------
  { key: 'ac-not-cooling', categoryId: 'ac', en: 'AC not cooling', ar: 'التكييف مش بيبرد', fr: 'Climatiseur ne refroidit pas' },
  { key: 'ac-service', categoryId: 'ac', en: 'AC maintenance', ar: 'صيانة تكييف', fr: 'Entretien de climatiseur' },
  { key: 'ac-cleaning', categoryId: 'ac', en: 'AC cleaning', ar: 'تنظيف تكييف', fr: 'Nettoyage de climatiseur' },
  { key: 'ac-install', categoryId: 'ac', en: 'AC installation', ar: 'تركيب تكييف', fr: 'Installation de climatiseur' },
  { key: 'ac-removal', categoryId: 'ac', en: 'AC removal', ar: 'فك تكييف', fr: 'Dépose de climatiseur' },
  { key: 'ac-relocation', categoryId: 'ac', en: 'AC relocation', ar: 'نقل تكييف', fr: 'Déplacement de climatiseur' },
  { key: 'ac-gas-recharge', categoryId: 'ac', en: 'Refrigerant recharge', ar: 'شحن فريون', fr: 'Recharge de gaz' },
  { key: 'ac-water-leak', categoryId: 'ac', en: 'Water leaking from AC', ar: 'التكييف بينقط مياه', fr: 'Fuite d’eau du climatiseur' },
  { key: 'ac-noise', categoryId: 'ac', en: 'Strange noise', ar: 'صوت غريب', fr: 'Bruit anormal' },
  { key: 'ac-control-fault', categoryId: 'ac', en: 'Control or electrical fault', ar: 'عطل كهربائي أو ريموت', fr: 'Panne électrique ou commande' },

  // --- Appliance repair ----------------------------------------------------
  { key: 'appliance-washing-machine', categoryId: 'appliance-repair', en: 'Washing machine repair', ar: 'تصليح غسالة', fr: 'Réparation de lave-linge' },
  { key: 'appliance-fridge', categoryId: 'appliance-repair', en: 'Fridge repair', ar: 'تصليح تلاجة', fr: 'Réparation de réfrigérateur' },
  { key: 'appliance-freezer', categoryId: 'appliance-repair', en: 'Freezer repair', ar: 'تصليح ديب فريزر', fr: 'Réparation de congélateur' },
  { key: 'appliance-oven', categoryId: 'appliance-repair', en: 'Oven or cooker repair', ar: 'تصليح فرن أو بوتاجاز', fr: 'Réparation de four ou cuisinière' },
  { key: 'appliance-dishwasher', categoryId: 'appliance-repair', en: 'Dishwasher repair', ar: 'تصليح غسالة أطباق', fr: 'Réparation de lave-vaisselle' },
  { key: 'appliance-dryer', categoryId: 'appliance-repair', en: 'Dryer repair', ar: 'تصليح مجفف', fr: 'Réparation de sèche-linge' },
  { key: 'appliance-microwave', categoryId: 'appliance-repair', en: 'Microwave repair', ar: 'تصليح ميكروويف', fr: 'Réparation de micro-ondes' },
  { key: 'appliance-water-dispenser', categoryId: 'appliance-repair', en: 'Water dispenser repair', ar: 'تصليح كولدير', fr: 'Réparation de fontaine à eau' },
  { key: 'appliance-install', categoryId: 'appliance-repair', en: 'Appliance installation', ar: 'تركيب جهاز', fr: 'Installation d’appareil' },
  { key: 'appliance-inspection', categoryId: 'appliance-repair', en: 'Appliance diagnosis', ar: 'كشف عطل جهاز', fr: 'Diagnostic d’appareil' },

  // --- Carpentry -----------------------------------------------------------
  { key: 'carpentry-door-repair', categoryId: 'carpentry', en: 'Wooden door repair', ar: 'إصلاح باب خشب', fr: 'Réparation de porte en bois' },
  { key: 'carpentry-door-install', categoryId: 'carpentry', en: 'Wooden door installation', ar: 'تركيب باب خشب', fr: 'Pose de porte en bois' },
  { key: 'carpentry-furniture-repair', categoryId: 'carpentry', en: 'Furniture repair', ar: 'تصليح أثاث', fr: 'Réparation de meuble' },
  { key: 'carpentry-furniture-assembly', categoryId: 'carpentry', en: 'Furniture assembly', ar: 'تركيب أثاث', fr: 'Montage de meuble' },
  { key: 'carpentry-wardrobe', categoryId: 'carpentry', en: 'Wardrobe work', ar: 'أعمال دولاب', fr: 'Travaux d’armoire' },
  { key: 'carpentry-kitchen-cabinets', categoryId: 'carpentry', en: 'Kitchen cabinets', ar: 'مطبخ خشب', fr: 'Meubles de cuisine' },
  { key: 'carpentry-shelving', categoryId: 'carpentry', en: 'Shelving and storage', ar: 'أرفف وتخزين', fr: 'Étagères et rangement' },
  { key: 'carpentry-custom', categoryId: 'carpentry', en: 'Custom woodwork', ar: 'نجارة حسب الطلب', fr: 'Menuiserie sur mesure' },
  { key: 'carpentry-lock-fitting', categoryId: 'carpentry', en: 'Door hardware fitting', ar: 'تركيب كالون ومقابض', fr: 'Pose de quincaillerie' },
  { key: 'carpentry-upholstery', categoryId: 'carpentry', en: 'Upholstery work', ar: 'تنجيد', fr: 'Tapisserie' },

  // --- Painting ------------------------------------------------------------
  { key: 'painting-room', categoryId: 'painting', en: 'Room painting', ar: 'دهان غرفة', fr: 'Peinture d’une pièce' },
  { key: 'painting-apartment', categoryId: 'painting', en: 'Whole apartment painting', ar: 'دهان شقة كاملة', fr: 'Peinture d’appartement' },
  { key: 'painting-touch-up', categoryId: 'painting', en: 'Touch-ups and small repairs', ar: 'ترقيع ولمسات', fr: 'Retouches' },
  { key: 'painting-wall-prep', categoryId: 'painting', en: 'Wall preparation', ar: 'تجهيز حوائط', fr: 'Préparation des murs' },
  { key: 'painting-decorative', categoryId: 'painting', en: 'Decorative finishes', ar: 'تشطيبات ديكورية', fr: 'Finitions décoratives' },
  { key: 'painting-wallpaper', categoryId: 'painting', en: 'Wallpaper fitting', ar: 'تركيب ورق حائط', fr: 'Pose de papier peint' },
  { key: 'painting-exterior', categoryId: 'painting', en: 'Exterior painting', ar: 'دهان خارجي', fr: 'Peinture extérieure' },
  { key: 'painting-damp-treatment', categoryId: 'painting', en: 'Damp or mould treatment', ar: 'معالجة رطوبة أو عفن', fr: 'Traitement d’humidité' },

  // --- Moving --------------------------------------------------------------
  { key: 'moving-apartment', categoryId: 'moving-help', en: 'Apartment move', ar: 'نقل عفش شقة', fr: 'Déménagement d’appartement' },
  { key: 'moving-single-item', categoryId: 'moving-help', en: 'Single item move', ar: 'نقل قطعة واحدة', fr: 'Transport d’un seul objet' },
  { key: 'moving-furniture-inside', categoryId: 'moving-help', en: 'Moving furniture within the home', ar: 'ترتيب أثاث جوه البيت', fr: 'Déplacement de meubles' },
  { key: 'moving-packing', categoryId: 'moving-help', en: 'Packing help', ar: 'مساعدة في التغليف', fr: 'Aide à l’emballage' },
  { key: 'moving-disassembly', categoryId: 'moving-help', en: 'Furniture disassembly and reassembly', ar: 'فك وتركيب أثاث', fr: 'Démontage et remontage' },
  { key: 'moving-lift', categoryId: 'moving-help', en: 'Furniture lift or hoist', ar: 'ونش رفع عفش', fr: 'Monte-meubles' },
  { key: 'moving-office', categoryId: 'moving-help', en: 'Office move', ar: 'نقل مكتب', fr: 'Déménagement de bureau' },

  // --- Pest control --------------------------------------------------------
  { key: 'pest-cockroaches', categoryId: 'pest-control', en: 'Cockroaches', ar: 'صراصير', fr: 'Cafards' },
  { key: 'pest-bedbugs', categoryId: 'pest-control', en: 'Bedbugs', ar: 'بق الفراش', fr: 'Punaises de lit' },
  { key: 'pest-rodents', categoryId: 'pest-control', en: 'Mice or rats', ar: 'فئران', fr: 'Souris ou rats' },
  { key: 'pest-ants', categoryId: 'pest-control', en: 'Ants', ar: 'نمل', fr: 'Fourmis' },
  { key: 'pest-mosquitoes', categoryId: 'pest-control', en: 'Mosquitoes or flies', ar: 'ناموس أو ذباب', fr: 'Moustiques ou mouches' },
  { key: 'pest-termites', categoryId: 'pest-control', en: 'Termites', ar: 'نمل أبيض', fr: 'Termites' },
  { key: 'pest-general-spray', categoryId: 'pest-control', en: 'General preventive treatment', ar: 'رش وقائي شامل', fr: 'Traitement préventif' },
  { key: 'pest-inspection', categoryId: 'pest-control', en: 'Pest inspection', ar: 'معاينة حشرات', fr: 'Inspection antiparasitaire' },

  // --- Water heaters -------------------------------------------------------
  { key: 'water-heater-no-hot-water', categoryId: 'water-heater-repair', en: 'No hot water', ar: 'مفيش مية سخنة', fr: 'Pas d’eau chaude' },
  { key: 'water-heater-gas-repair', categoryId: 'water-heater-repair', en: 'Gas heater repair', ar: 'تصليح سخان غاز', fr: 'Réparation de chauffe-eau à gaz' },
  { key: 'water-heater-electric-repair', categoryId: 'water-heater-repair', en: 'Electric heater repair', ar: 'تصليح سخان كهربا', fr: 'Réparation de chauffe-eau électrique' },
  { key: 'water-heater-install', categoryId: 'water-heater-repair', en: 'Heater installation', ar: 'تركيب سخان', fr: 'Installation de chauffe-eau' },
  { key: 'water-heater-replace', categoryId: 'water-heater-repair', en: 'Heater replacement', ar: 'تغيير سخان', fr: 'Remplacement de chauffe-eau' },
  { key: 'water-heater-leak', categoryId: 'water-heater-repair', en: 'Heater leaking', ar: 'السخان بينقط', fr: 'Chauffe-eau qui fuit' },
  { key: 'water-heater-descale', categoryId: 'water-heater-repair', en: 'Descaling and servicing', ar: 'تنظيف وإزالة ترسيبات', fr: 'Détartrage et entretien' },
  { key: 'water-heater-thermostat', categoryId: 'water-heater-repair', en: 'Thermostat problem', ar: 'مشكلة ترموستات', fr: 'Problème de thermostat' },

  // --- Flooring and tiling -------------------------------------------------
  { key: 'flooring-ceramic-install', categoryId: 'flooring-tiling', en: 'Ceramic tiling', ar: 'تركيب سيراميك', fr: 'Pose de carrelage' },
  { key: 'flooring-porcelain-install', categoryId: 'flooring-tiling', en: 'Porcelain tiling', ar: 'تركيب بورسلين', fr: 'Pose de grès cérame' },
  { key: 'flooring-marble', categoryId: 'flooring-tiling', en: 'Marble work', ar: 'أعمال رخام', fr: 'Travaux de marbre' },
  { key: 'flooring-parquet', categoryId: 'flooring-tiling', en: 'Parquet fitting', ar: 'تركيب باركيه', fr: 'Pose de parquet' },
  { key: 'flooring-tile-repair', categoryId: 'flooring-tiling', en: 'Cracked or loose tiles', ar: 'بلاط مكسور أو فاضي', fr: 'Carreaux fissurés ou descellés' },
  { key: 'flooring-grout', categoryId: 'flooring-tiling', en: 'Grouting and sealing', ar: 'سد فواصل البلاط', fr: 'Jointoiement' },
  { key: 'flooring-skirting', categoryId: 'flooring-tiling', en: 'Skirting boards', ar: 'وزر أرضيات', fr: 'Plinthes' },
  { key: 'flooring-removal', categoryId: 'flooring-tiling', en: 'Old floor removal', ar: 'إزالة أرضية قديمة', fr: 'Dépose d’ancien sol' },

  // --- Renovation and finishing --------------------------------------------
  { key: 'renovation-plastering', categoryId: 'renovation-finishing', en: 'Plastering', ar: 'محارة', fr: 'Enduit' },
  { key: 'renovation-gypsum-ceiling', categoryId: 'renovation-finishing', en: 'Gypsum board ceiling', ar: 'أسقف جبس بورد', fr: 'Faux plafond en plaques' },
  { key: 'renovation-gypsum-decor', categoryId: 'renovation-finishing', en: 'Gypsum decoration', ar: 'ديكورات جبس', fr: 'Décoration en plâtre' },
  { key: 'renovation-wall-build', categoryId: 'renovation-finishing', en: 'Building or removing a wall', ar: 'بناء أو هدم حائط', fr: 'Création ou démolition de mur' },
  { key: 'renovation-bathroom', categoryId: 'renovation-finishing', en: 'Bathroom renovation', ar: 'تجديد حمام', fr: 'Rénovation de salle de bain' },
  { key: 'renovation-kitchen', categoryId: 'renovation-finishing', en: 'Kitchen renovation', ar: 'تجديد مطبخ', fr: 'Rénovation de cuisine' },
  { key: 'renovation-full-apartment', categoryId: 'renovation-finishing', en: 'Full apartment finishing', ar: 'تشطيب شقة كاملة', fr: 'Finition complète d’appartement' },
  { key: 'renovation-crack-repair', categoryId: 'renovation-finishing', en: 'Wall crack repair', ar: 'إصلاح شروخ', fr: 'Réparation de fissures' },
  { key: 'renovation-waterproofing', categoryId: 'renovation-finishing', en: 'Waterproofing', ar: 'عزل مائي', fr: 'Étanchéité' },
  { key: 'renovation-inspection', categoryId: 'renovation-finishing', en: 'Site visit and estimate', ar: 'معاينة وتقدير تكلفة', fr: 'Visite et devis' },

  // --- Alumetal ------------------------------------------------------------
  { key: 'alumetal-window-install', categoryId: 'alumetal', en: 'Aluminium window installation', ar: 'تركيب شباك ألوميتال', fr: 'Pose de fenêtre en aluminium' },
  { key: 'alumetal-window-repair', categoryId: 'alumetal', en: 'Aluminium window repair', ar: 'إصلاح شباك ألوميتال', fr: 'Réparation de fenêtre en aluminium' },
  { key: 'alumetal-door-install', categoryId: 'alumetal', en: 'Aluminium door installation', ar: 'تركيب باب ألوميتال', fr: 'Pose de porte en aluminium' },
  { key: 'alumetal-door-repair', categoryId: 'alumetal', en: 'Aluminium door repair', ar: 'إصلاح باب ألوميتال', fr: 'Réparation de porte en aluminium' },
  { key: 'alumetal-glass-replace', categoryId: 'alumetal', en: 'Glass replacement', ar: 'تغيير زجاج', fr: 'Remplacement de vitrage' },
  { key: 'alumetal-kitchen', categoryId: 'alumetal', en: 'Aluminium kitchen', ar: 'مطبخ ألوميتال', fr: 'Cuisine en aluminium' },
  { key: 'alumetal-shower-cabin', categoryId: 'alumetal', en: 'Shower cabin', ar: 'كابينة شاور', fr: 'Cabine de douche' },
  { key: 'alumetal-mosquito-net', categoryId: 'alumetal', en: 'Mosquito screens', ar: 'سلك ناموس', fr: 'Moustiquaires' },
  { key: 'alumetal-shutter', categoryId: 'alumetal', en: 'Roller shutter work', ar: 'أعمال سكريتة', fr: 'Volet roulant' },

  // --- Satellite and TV ----------------------------------------------------
  { key: 'satellite-dish-install', categoryId: 'satellite-tv-installation', en: 'Satellite dish installation', ar: 'تركيب دش', fr: 'Installation de parabole' },
  { key: 'satellite-signal-fix', categoryId: 'satellite-tv-installation', en: 'No signal or weak signal', ar: 'مفيش إشارة أو ضعيفة', fr: 'Signal absent ou faible' },
  { key: 'satellite-receiver', categoryId: 'satellite-tv-installation', en: 'Receiver setup', ar: 'ضبط ريسيفر', fr: 'Configuration du récepteur' },
  { key: 'satellite-channel-tuning', categoryId: 'satellite-tv-installation', en: 'Channel tuning', ar: 'ضبط القنوات', fr: 'Réglage des chaînes' },
  { key: 'satellite-tv-mount', categoryId: 'satellite-tv-installation', en: 'TV wall mounting', ar: 'تعليق تلفزيون على الحائط', fr: 'Fixation murale de téléviseur' },
  { key: 'satellite-tv-setup', categoryId: 'satellite-tv-installation', en: 'TV setup', ar: 'تركيب وضبط تلفزيون', fr: 'Installation de téléviseur' },
  { key: 'satellite-relocate', categoryId: 'satellite-tv-installation', en: 'Move dish or receiver', ar: 'نقل دش أو ريسيفر', fr: 'Déplacement de parabole' },

  // --- Locks and keys ------------------------------------------------------
  { key: 'locksmith-locked-out', categoryId: 'locksmithing', en: 'Locked out', ar: 'الباب اتقفل عليا', fr: 'Porte claquée' },
  { key: 'locksmith-lock-change', categoryId: 'locksmithing', en: 'Change a lock', ar: 'تغيير كالون', fr: 'Changement de serrure' },
  { key: 'locksmith-lock-repair', categoryId: 'locksmithing', en: 'Lock repair', ar: 'إصلاح كالون', fr: 'Réparation de serrure' },
  { key: 'locksmith-lock-install', categoryId: 'locksmithing', en: 'Install a new lock', ar: 'تركيب كالون جديد', fr: 'Pose de serrure' },
  { key: 'locksmith-key-copy', categoryId: 'locksmithing', en: 'Key copying', ar: 'نسخ مفاتيح', fr: 'Reproduction de clés' },
  { key: 'locksmith-broken-key', categoryId: 'locksmithing', en: 'Broken key in lock', ar: 'مفتاح مكسور جوه الكالون', fr: 'Clé cassée dans la serrure' },
  { key: 'locksmith-safe', categoryId: 'locksmithing', en: 'Safe opening or repair', ar: 'فتح أو إصلاح خزنة', fr: 'Ouverture ou réparation de coffre' },
  { key: 'locksmith-security-upgrade', categoryId: 'locksmithing', en: 'Security lock upgrade', ar: 'تحسين تأمين الباب', fr: 'Renforcement de sécurité' },

  // --- Gardening -----------------------------------------------------------
  { key: 'gardening-maintenance', categoryId: 'gardening', en: 'Garden maintenance', ar: 'العناية بالحديقة', fr: 'Entretien de jardin' },
  { key: 'gardening-planting', categoryId: 'gardening', en: 'Planting', ar: 'زراعة نباتات', fr: 'Plantation' },
  { key: 'gardening-pruning', categoryId: 'gardening', en: 'Pruning and trimming', ar: 'تقليم', fr: 'Taille' },
  { key: 'gardening-lawn', categoryId: 'gardening', en: 'Lawn care', ar: 'العناية بالنجيلة', fr: 'Entretien de pelouse' },
  { key: 'gardening-irrigation', categoryId: 'gardening', en: 'Irrigation setup', ar: 'تركيب ري', fr: 'Système d’arrosage' },
  { key: 'gardening-balcony', categoryId: 'gardening', en: 'Balcony plants', ar: 'نباتات بلكونة', fr: 'Plantes de balcon' },
  { key: 'gardening-clearance', categoryId: 'gardening', en: 'Garden clearance', ar: 'تنظيف الحديقة', fr: 'Débarras de jardin' },

  // --- Barber --------------------------------------------------------------
  { key: 'barber-haircut', categoryId: 'barber', en: 'Haircut', ar: 'قص شعر', fr: 'Coupe de cheveux' },
  { key: 'barber-beard-trim', categoryId: 'barber', en: 'Beard trim', ar: 'تظبيط دقن', fr: 'Taille de barbe' },
  { key: 'barber-shave', categoryId: 'barber', en: 'Shave', ar: 'حلاقة ذقن', fr: 'Rasage' },
  { key: 'barber-haircut-and-beard', categoryId: 'barber', en: 'Haircut and beard', ar: 'قص شعر ودقن', fr: 'Coupe et barbe' },
  { key: 'barber-kids', categoryId: 'barber', en: 'Kids haircut', ar: 'قص شعر أطفال', fr: 'Coupe enfant' },
  { key: 'barber-hair-wash', categoryId: 'barber', en: 'Wash and styling', ar: 'غسيل وتصفيف', fr: 'Shampooing et coiffage' },
  { key: 'barber-group', categoryId: 'barber', en: 'Home visit for several people', ar: 'زيارة منزلية لأكتر من شخص', fr: 'Visite à domicile pour plusieurs' },

  // --- Hairdressing --------------------------------------------------------
  { key: 'hair-cut', categoryId: 'hairdressing', en: 'Haircut', ar: 'قص شعر', fr: 'Coupe' },
  { key: 'hair-blow-dry', categoryId: 'hairdressing', en: 'Blow-dry and styling', ar: 'سشوار وتصفيف', fr: 'Brushing et coiffage' },
  { key: 'hair-colour', categoryId: 'hairdressing', en: 'Colouring', ar: 'صبغة', fr: 'Coloration' },
  { key: 'hair-highlights', categoryId: 'hairdressing', en: 'Highlights', ar: 'هاي لايت', fr: 'Mèches' },
  { key: 'hair-treatment', categoryId: 'hairdressing', en: 'Hair treatment', ar: 'علاج شعر', fr: 'Soin capillaire' },
  { key: 'hair-keratin', categoryId: 'hairdressing', en: 'Keratin or straightening', ar: 'كيراتين أو فرد', fr: 'Kératine ou lissage' },
  { key: 'hair-bridal', categoryId: 'hairdressing', en: 'Bridal or occasion styling', ar: 'تسريحة عروسة أو مناسبة', fr: 'Coiffure de mariée ou d’occasion' },
  { key: 'hair-updo', categoryId: 'hairdressing', en: 'Updo', ar: 'تسريحة مرفوعة', fr: 'Chignon' },
  { key: 'hair-kids', categoryId: 'hairdressing', en: 'Kids haircut', ar: 'قص شعر أطفال', fr: 'Coupe enfant' },

  // --- Personal styling ----------------------------------------------------
  { key: 'styling-occasion', categoryId: 'personal-styling', en: 'Occasion styling', ar: 'تنسيق إطلالة مناسبة', fr: 'Style pour une occasion' },
  { key: 'styling-wardrobe-review', categoryId: 'personal-styling', en: 'Wardrobe review', ar: 'مراجعة الدولاب', fr: 'Audit de garde-robe' },
  { key: 'styling-shopping', categoryId: 'personal-styling', en: 'Personal shopping', ar: 'تسوق شخصي', fr: 'Accompagnement shopping' },
  { key: 'styling-colour-analysis', categoryId: 'personal-styling', en: 'Colour analysis', ar: 'تحليل الألوان', fr: 'Analyse colorimétrique' },
  { key: 'styling-wedding', categoryId: 'personal-styling', en: 'Wedding styling', ar: 'تنسيق إطلالة فرح', fr: 'Style de mariage' },
  { key: 'styling-capsule', categoryId: 'personal-styling', en: 'Capsule wardrobe planning', ar: 'تخطيط دولاب أساسي', fr: 'Garde-robe capsule' },
] as const;

const byKey = new Map<string, SpecificService>(
  specificServices.map((service) => [service.key, service]),
);

/** Every service in a category, in the order it should be offered. */
export function specificServicesFor(categoryId: string): SpecificService[] {
  if (isLegacyCategory(categoryId)) return [];
  return specificServices.filter((service) => service.categoryId === categoryId);
}

export function isSpecificServiceKey(value: string): boolean {
  return byKey.has(value);
}

/**
 * The customer-facing name for a stored key.
 *
 * `null` when the key is unknown, so a caller can fall back to whatever the row
 * itself carries. That is the compatibility path for rows written before keys
 * existed: they keep their English `name` and stop being wrong the moment
 * somebody gives them a key.
 */
export function specificServiceLabel(key: string, language: Language): string | null {
  const service = byKey.get(key);
  if (!service) return null;
  return language === 'ar' ? service.ar : language === 'fr' ? service.fr : service.en;
}

/* ---------------------------------------------------------------------------
 * The consumer boundary
 *
 * Everything above answers "what is this service called?". Everything below
 * answers "what does a customer see in the picker?", which is a different
 * question and the one that kept being answered twice.
 *
 * Web derived its dropdown inline: filter the catalogue rows by category, rank
 * them by `specificServicesFor`, then label each one with `specificServiceLabel`
 * falling back to the row's English `name`. Native is now growing the same
 * control, and a second copy of that derivation is exactly how the two surfaces
 * drift -- one gets a fallback fixed, or an ordering rule, and the other does
 * not. So the derivation lives here once and both call it.
 *
 * The row type is structural rather than imported: web's `Service` and the
 * mobile `Service` are different types that happen to agree on the four fields
 * that matter. Requiring the shape rather than the type lets both pass their
 * own rows in without either depending on the other's model.
 * ------------------------------------------------------------------------- */

/**
 * The minimum a row must carry to be *named*.
 *
 * Deliberately smaller than what it takes to be *offered*: naming a service
 * does not require knowing its category, and a service reached through a
 * provider does not carry one. Requiring it here would have forced those call
 * sites to invent a category just to render a label.
 */
export type CatalogueServiceName = {
  /** The English name stored on the row: the fallback, never the normal case. */
  name: string;
  /** `services.translation_key`, absent on rows written before keys existed. */
  translationKey?: string | null;
};

/** The minimum a catalogue row must carry to be offered as a choice. */
export type CatalogueServiceRow = CatalogueServiceName & {
  /** The stable service UUID. This, and never a label, is what gets persisted. */
  id: string;
  categoryId: string;
};

/**
 * The rows a customer may pick from, in the order they should be offered.
 *
 * Filtered to one category -- mixing categories would offer a selection the
 * backend rejects with 22023 -- and ordered by the shared catalogue rather than
 * by the server's `order by s.name`, which is alphabetical in English and
 * therefore meaningless to an Arabic reader.
 *
 * A row this build does not know sorts last instead of first, so an unfamiliar
 * service never leads the list.
 */
export function orderedCatalogueServices<T extends CatalogueServiceRow>(
  services: readonly T[],
  categoryId: string,
): T[] {
  if (!categoryId) return [];
  const order = new Map(
    specificServicesFor(categoryId).map((service, index) => [service.key, index]),
  );
  const rank = (row: T) => (row.translationKey
    ? order.get(row.translationKey) ?? Number.MAX_SAFE_INTEGER
    : Number.MAX_SAFE_INTEGER);
  return services
    .filter((row) => row.categoryId === categoryId)
    .slice()
    .sort((left, right) => rank(left) - rank(right));
}

/**
 * What to render for a catalogue row, in the reader's language.
 *
 * Resolved from the key on every call rather than computed once, so switching
 * language relabels the same UUID instead of requiring a refetch. The row's
 * stored `name` is reached only when the key is absent or unknown.
 */
export function catalogueServiceLabel(
  service: CatalogueServiceName,
  language: Language,
): string {
  return (service.translationKey
    && specificServiceLabel(service.translationKey, language)) || service.name;
}

/**
 * The picker's own words, in the three languages Warsha speaks.
 *
 * These are the strings web already ships from its copy catalogue. They are
 * repeated here rather than imported because `web/lib/app-copy.ts` is a web
 * bundle that native must not pull in -- and `specific-service-parity` asserts
 * the two agree exactly, so a change to one that is not made to the other fails
 * the suite rather than reaching a customer.
 */
export const specificServicePickerCopy = {
  en: { label: 'Specific service (optional)', anyService: 'Any service in this category' },
  ar: { label: 'خدمة محددة (اختياري)', anyService: 'أي خدمة في النوع ده' },
  fr: { label: 'Service précis (facultatif)', anyService: 'Tout service de cette catégorie' },
} as const satisfies Record<Language, { label: string; anyService: string }>;
