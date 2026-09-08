/**
 * What can Firebase Test Lab actually run for Warsha?
 *
 * Read-only inventory of the Android device catalogue, filtered to what the
 * compatibility matrix needs. Nothing is scheduled and nothing is billed.
 *
 * Uses the OAuth credential the owner already granted to the Firebase CLI,
 * which carries `cloud-platform` scope. Prints no token.
 *
 * The point is to answer three questions before any device-hour is spent:
 *   1. Can Test Lab serve Warsha's real floor, API 24? If not, that floor has
 *      to be proven somewhere else rather than quietly raised.
 *   2. Which device classes exist — compact, normal, lower-spec — so the matrix
 *      is representative rather than six copies of one flagship.
 *   3. Which locales are available, since Arabic RTL is a hard gate.
 */
import { accessToken } from './auth.mjs';
import { floorReport, floorVerdictText, supportedApis } from './models.mjs';

const PROJECT = 'warsha-504822';
const MIN_SDK = 24;

const token = await accessToken();

const response = await fetch(
  `https://testing.googleapis.com/v1/testEnvironmentCatalog/ANDROID?projectId=${PROJECT}`,
  { headers: { Authorization: `Bearer ${token}` } });
if (!response.ok) {
  console.error(`catalogue unavailable: HTTP ${response.status}`);
  console.error((await response.text()).slice(0, 400));
  process.exit(1);
}
const catalogue = (await response.json()).androidDeviceCatalog ?? {};

const models = (catalogue.models ?? []).filter((m) => m.form === 'VIRTUAL' || m.form === 'PHYSICAL');
const versions = catalogue.versions ?? [];

console.log('=== API levels Test Lab offers ===');
const levels = versions
  .map((v) => ({ api: v.apiLevel, name: v.versionString, tags: (v.tags ?? []).join(','), id: v.id }))
  .sort((a, b) => a.api - b.api);
for (const l of levels) {
  const mark = l.api === MIN_SDK ? '  <== WARSHA FLOOR' : '';
  console.log(`  API ${String(l.api).padStart(2)}  Android ${String(l.name).padEnd(6)} ${l.tags}${mark}`);
}
// A version in the catalogue is not a device you can book. The floor question
// is answered from the models, in models.mjs, so this script and api-floor.mjs
// cannot reach opposite conclusions again.
const report = floorReport(models, MIN_SDK);
console.log(`\n${floorVerdictText(report)}`);

console.log('\n=== device classes, by screen width ===');
const withGeometry = models
  .filter((m) => m.screenX && m.screenY)
  .map((m) => ({
    id: m.id, name: `${m.manufacturer ?? ''} ${m.name ?? ''}`.trim(), form: m.form,
    px: m.screenX, py: m.screenY, dpi: m.screenDensity,
    dp: m.screenDensity ? Math.round(m.screenX / (m.screenDensity / 160)) : null,
    apis: supportedApis(m),
  }))
  .filter((m) => m.dp);

const compact = withGeometry.filter((m) => m.dp <= 360).sort((a, b) => a.dp - b.dp);
const normal = withGeometry.filter((m) => m.dp > 360 && m.dp <= 430).sort((a, b) => a.dp - b.dp);
const large = withGeometry.filter((m) => m.dp > 430).sort((a, b) => a.dp - b.dp);

const show = (label, list) => {
  console.log(`\n  ${label} (${list.length})`);
  for (const m of list.slice(0, 8)) {
    console.log(`    ${m.id.padEnd(16)} ${m.name.padEnd(26)} ${m.form.padEnd(8)} `
      + `${m.dp}dp ${m.px}x${m.py}@${m.dpi}  `
      + (m.apis.length ? `APIs ${m.apis[0]}-${m.apis[m.apis.length - 1]}` : 'APIs not declared'));
  }
};
show('COMPACT  <=360dp', compact);
show('NORMAL   361-430dp', normal);
show('LARGE    >430dp', large);

console.log('\n=== which devices can run the floor (API ' + MIN_SDK + ') ===');
const floorCapable = withGeometry.filter((m) => m.apis.includes(MIN_SDK));
console.log(floorCapable.length
  ? floorCapable.slice(0, 10).map((m) => `  ${m.id} (${m.dp}dp, ${m.form})`).join('\n')
  : `  NONE - and ${report.unknownCount} of ${report.total} models declare no versions`
    + ' at all, so they are neither counted for nor against.');

console.log('\n=== locales (Arabic is a hard gate) ===');
const locales = (catalogue.runtimeConfiguration?.locales ?? []);
for (const want of ['en', 'ar', 'fr']) {
  const hits = locales.filter((l) => l.id === want || l.id.startsWith(`${want}_`));
  console.log(`  ${want}: ${hits.length ? hits.slice(0, 4).map((l) => l.id).join(', ') : 'NOT OFFERED'}`);
}
console.log(`  (${locales.length} locales total)`);
