import type { LegalCatalogue, LegalDocumentKey } from './legal-types.ts';

/**
 * The French catalogue: how each legal document is *named and described*.
 *
 * This is deliberately not a French `LegalBody`, and the difference is the
 * whole design.
 *
 * A `LegalBody` is operative text. It carries obligations, defined terms,
 * enumerated clauses and cross-references, it is hashed, and an acceptance
 * records that hash — so producing one is a legal act requiring review, not a
 * translation task an engineer can complete. French bodies do not exist yet and
 * are not invented here.
 *
 * A title and a one-sentence summary are catalogue metadata: they name and
 * describe a document so a reader can find it and decide whether to open it.
 * They bind nobody. Leaving them in English on a French page was the defect —
 * the Legal Centre rendered a French heading over twenty-six English cards —
 * and localizing them is ordinary product localization.
 *
 * The type is `LegalCatalogue`, not `LegalBody`, so this file *cannot* grow a
 * `sections` array by accident. If French operative text is ever published it
 * will arrive as a reviewed, versioned, hashed body alongside `en` and `ar`,
 * and the register will record its fingerprint like theirs.
 *
 * Not translated, by convention: `Warsha`, and the technical terms the English
 * and Arabic texts already preserve (`OCR`, `Web`).
 */
export const legalCatalogueFr: Readonly<Record<LegalDocumentKey, LegalCatalogue>> = {
  customer_terms: {
    title: 'Conditions générales client',
    summary: 'L’accord entre vous et Warsha lorsque vous utilisez Warsha pour trouver et réserver un professionnel.',
  },
  worker_terms: {
    title: 'Conditions générales du professionnel',
    summary: 'L’accord entre vous et Warsha lorsque vous proposez votre métier via Warsha. Il couvre la vérification, la conduite, le paiement, la suspension et les recours.',
  },
  privacy_policy: {
    title: 'Politique de confidentialité',
    summary: 'Ce que Warsha collecte, pourquoi, qui peut le consulter, combien de temps c’est conservé, et ce que vous pouvez faire à ce sujet.',
  },
  worker_verification_policy: {
    title: 'Politique de vérification des professionnels',
    summary: 'Exactement ce que Warsha demande à un professionnel, ce qu’elle en fait, qui le voit, ce qu’elle décide et ce qu’elle ne peut pas décider.',
  },
  acceptable_use_policy: {
    title: 'Politique d’utilisation acceptable',
    summary: 'Ce qui est interdit sur Warsha, pour tout le monde, et ce qui se passe lorsque cela se produit malgré tout.',
  },
  worker_code_of_conduct: {
    title: 'Code de conduite du professionnel',
    summary: 'La norme que Warsha impose aux professionnels, chez le client et sur la plateforme.',
  },
  refund_policy: {
    title: 'Politique de remboursement',
    summary: 'Quand vous êtes remboursé, de combien, en combien de temps, et ce qui arrive au professionnel.',
  },
  cancellation_policy: {
    title: 'Politique d’annulation',
    summary: 'Quand une réservation peut être annulée, par qui, et ce que cela coûte.',
  },
  appeals_policy: {
    title: 'Politique de recours',
    summary: 'Comment contester une décision de Warsha, qui tranche le recours, et ce qu’un recours peut changer.',
  },
  trust_safety_policy: {
    title: 'Politique de confiance et de sécurité',
    summary: 'Comment Warsha prévient les préjudices, ce qui se passe lorsque vous en signalez un, et ce que Warsha fera et ne fera pas.',
  },
  content_policy: {
    title: 'Politique de contenu',
    summary: 'Ce que vous pouvez publier sur Warsha — avis, profils, photographies et messages — et ce qui est retiré.',
  },
  intellectual_property_policy: {
    title: 'Politique de droit d’auteur et de propriété intellectuelle',
    summary: 'À qui appartient quoi sur Warsha, la licence dont Warsha a besoin pour afficher votre contenu, et comment signaler une contrefaçon.',
  },
  ai_usage_policy: {
    title: 'Politique d’utilisation de l’IA',
    summary: 'Où Warsha utilise le traitement automatisé, ce qu’il n’a jamais le droit de décider, et la gouvernance qui serait exigée avant que vos documents puissent un jour entraîner un modèle.',
  },
  ocr_usage_policy: {
    title: 'Politique d’utilisation de l’OCR',
    summary: 'À quoi sert l’extraction de texte de votre pièce d’identité, où elle s’exécute, ce qu’elle n’a jamais le droit de décider, et ce qui est conservé ensuite.',
  },
  location_data_policy: {
    title: 'Politique relative aux données de localisation',
    summary: 'Ce que Warsha fait de la localisation, pourquoi un point sur la carte est requis, pourquoi la localisation de l’appareil ne l’est jamais, et qui voit votre adresse.',
  },
  data_processing_policy: {
    title: 'Politique de traitement des données',
    summary: 'Les règles que Warsha suit lorsqu’elle traite des données personnelles, et comment une nouvelle activité de traitement est approuvée.',
  },
  data_retention_policy: {
    title: 'Politique de conservation des données',
    summary: 'Comment Warsha décide de la durée de conservation, et ce qui se passe lorsqu’une durée n’a pas été arrêtée.',
  },
  cookie_policy: {
    title: 'Politique relative aux cookies (Web)',
    summary: 'Ce que l’application web Warsha stocke dans votre navigateur, et ce qu’elle n’y stocke pas.',
  },
  subprocessor_register: {
    title: 'Registre des sous-traitants ultérieurs',
    summary: 'Chaque fournisseur qui traite des données personnelles pour Warsha, ce qu’il traite, où, et s’il est déjà utilisé.',
  },
  data_processing_register: {
    title: 'Registre des traitements de données',
    summary: 'Chaque activité de traitement réalisée par Warsha, sa finalité, ses données, sa base proposée et son état d’examen.',
  },
  data_retention_register: {
    title: 'Registre de conservation des données',
    summary: 'Combien de temps chaque catégorie est conservée, ce qui déclenche le décompte, et ce qui se passe à son terme.',
  },
  incident_response_policy: {
    title: 'Politique de réponse aux incidents',
    summary: 'Ce que fait Warsha lorsqu’un problème survient concernant les données ou la sécurité, et quand elle vous en informe.',
  },
  security_disclosure_policy: {
    title: 'Politique de divulgation de sécurité',
    summary: 'Comment signaler une faille de sécurité dans Warsha, ce qui entre dans le périmètre, et ce que Warsha promet en retour.',
  },
  accessibility_statement: {
    title: 'Déclaration d’accessibilité',
    summary: 'Ce que Warsha fait pour être utilisable par tous, ce qui a été vérifié, et ce qui ne l’a pas été.',
  },
  version_history: {
    title: 'Historique des versions',
    summary: 'Chaque version de chaque document juridique Warsha, sa date de publication, et ce qui a changé.',
  },
  legal_contact: {
    title: 'Contact juridique',
    summary: 'Où envoyer une mise en demeure, une demande relative à la vie privée, un signalement de sécurité ou une réclamation, et ce à quoi vous attendre.',
  },
};
