-- The legal documents stop saying Warsha requires a criminal record.
--
-- 202609170004 made the owner's decision true in the product: Warsha does not
-- collect criminal-record certificates until legal consultation has actually
-- happened. Four published documents still told workers, and everyone reading
-- the Privacy Policy, that a certificate is required and collected:
--
--   worker_terms                §3 listed it among the verification steps
--   privacy_policy              §2 listed it among what workers provide; §4
--                               described how workers obtain and upload it
--   worker_verification_policy  §2 required it; §3 described the upload;
--                               §4 tied eligibility to it
--   trust_safety_policy         §1 said every worker submits one
--
-- Each is republished as version 1.1. Each is classed "material" because the
-- Version History defines a change to verification requirements or document
-- processing as material, and this is one. version_history gains its 1.1 entry
-- as a non-material change.
--
-- What this does not claim. None of these versions has been through legal
-- review, exactly as version 1.0 had not, and the texts say so. Re-acceptance
-- is governed by `private.legal_configuration.reconsent_enforced`, which this
-- migration does not touch.
--
-- The hashes are computed from src/legal/ by the same function the clients use
-- to render and the signup path uses to verify, and
-- scripts/wps024-legal-compliance-governance.test.mts fails if they drift.
-- A client carrying the 1.0 texts is refused at signup once this is applied,
-- which is the chain doing its job: the app and web must ship the 1.1 corpus
-- with it.

update public.legal_document_versions
set status = 'superseded'
where version = '1.0' and status = 'published'
  and document_key in ('worker_terms', 'privacy_policy', 'worker_verification_policy',
                       'trust_safety_policy', 'version_history');

insert into public.legal_document_versions
  (document_key, version, content_hash_en, content_hash_ar, content_locator,
   published_at, effective_at, supersedes_version, change_class,
   change_summary_en, change_summary_ar, arabic_is_summary, status)
values
  ('worker_terms', '1.1', 'c704b99146fb734f9e65ef5d8ad77a9376d669994d562f11ad159b3ef65f1011', '4e6660e2e38fec906cf2441aab6d3d743fcbb3ff8c48033fefb852e96671061d', 'src/legal/legal-corpus-agreements.ts', '2026-09-17', '2026-09-17', '1.0', 'material', 'Warsha no longer asks workers for a criminal-record certificate. The verification steps and the description of stored documents are updated to match.', 'ورشة مبقتش بتطلب فيش وتشبيه من الصنايعية. خطوات التحقق ووصف المستندات المتخزنة اتحدّثوا علشان يطابقوا ده.', false, 'published'),
  ('privacy_policy', '1.1', '2e7c6c6371d6337492c5409906aa744bb42ee3432310988612787af9914edc8a', '9bbb7a5b58e7e7609928236ad1d13e62bdef9012532dd0aee653c947ddcda4bd', 'src/legal/legal-corpus-agreements.ts', '2026-09-17', '2026-09-17', '1.0', 'material', 'Warsha no longer collects criminal-record certificates from workers. The description of what is collected, and of how certificates sent earlier are held, is updated.', 'ورشة مبقتش بتجمع فيش وتشبيه من الصنايعية. وصف اللي بيتجمع، وإزاي بيتعامل مع الفيش اللي اتبعت قبل كده، اتحدّث.', false, 'published'),
  ('worker_verification_policy', '1.1', '3bd0386b782bfebe2798b9b069c6ebafe834f10dd804bc8b99c27f1934ad68dd', '94fb4e983350e68a2ff52036b4c083930cab50dcb26bfa1619548179aca59510', 'src/legal/legal-corpus-agreements.ts', '2026-09-17', '2026-09-17', '1.0', 'material', 'Warsha no longer asks workers for a criminal-record certificate, and no worker needs one to be activated. The requirements, the certificate section and eligibility are updated.', 'ورشة مبقتش بتطلب فيش وتشبيه من الصنايعية، ومفيش صنايعي محتاج واحد علشان يتفعّل. المتطلبات وبند الفيش والأهلية اتحدّثوا.', false, 'published'),
  ('trust_safety_policy', '1.1', 'f7bbbe42ec4cdcf6aced50d3996cb852aaee3bbdb6f9bf89c3168db4cc327e74', '6f8e289f9bee5f082896296ec32a26fddbe1bee7eaf84b55dc844f1a5daea64f', 'src/legal/legal-corpus-conduct.ts', '2026-09-17', '2026-09-17', '1.0', 'material', 'Warsha no longer collects criminal-record certificates from workers, and the description of the checks made before harm is updated to say so.', 'ورشة مبقتش بتجمع فيش وتشبيه من الصنايعية، ووصف الفحص اللي بيحصل قبل الضرر اتحدّث علشان يقول كده.', false, 'published'),
  ('version_history', '1.1', '618e0e9cca9a374cb4735f66953a4f743d118a8a6969ce62381077afb3f59507', '5d949b7460fc06f69b6636c9fc2ad68278643380f379851be68b0433f57cafe4', 'src/legal/legal-corpus-registers.ts', '2026-09-17', '2026-09-17', '1.0', 'non_material', 'Adds the version 1.1 entry.', 'بيضيف مدخل النسخة ١٫١.', true, 'published');
