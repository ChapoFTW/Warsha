/**
 * Can Firebase Test Lab actually schedule Warsha's declared floor, API 24?
 *
 * The first attempt read `supportedVersionIds` and got `undefined` for most
 * models, which means the field was guessed rather than checked. This one dumps
 * the real shape of a model first and then answers the question from whatever
 * the catalogue actually uses, separately for VIRTUAL and PHYSICAL.
 *
 * Read-only. Nothing is scheduled, nothing is billed. Prints no token.
 */
import { accessToken } from './auth.mjs';

const PROJECT = 'warsha-504822';
const FLOOR = 24;

const token = await accessToken();

const catalogue = await fetch(
  `https://testing.googleapis.com/v1/testEnvironmentCatalog/ANDROID?projectId=${PROJECT}`,
  { headers: { Authorization: `Bearer ${token}` } },
).then((r) => r.json());
const android = catalogue.androidDeviceCatalog ?? {};
const models = android.models ?? [];

console.log('=== the real shape of a model ===');
console.log(JSON.stringify(models[0], null, 1).slice(0, 700));

console.log('\n=== every field name any model uses ===');
const fields = new Set();
for (const m of models) for (const k of Object.keys(m)) fields.add(k);
console.log('  ' + [...fields].sort().join(', '));

// Whatever the field is called, find the one that carries version ids.
const versionField = [...fields].find((f) => /version/i.test(f) && Array.isArray(models[0]?.[f]))
  ?? [...fields].find((f) => /version/i.test(f));
console.log(`\n=== version field in use: ${versionField} ===`);

const supports = (m) => {
  const raw = m[versionField];
  if (!Array.isArray(raw)) return false;
  return raw.map(String).includes(String(FLOOR));
};

const capable = models.filter(supports);
const virtual = capable.filter((m) => m.form === 'VIRTUAL');
const physical = capable.filter((m) => m.form === 'PHYSICAL');

console.log(`\nmodels in catalogue        : ${models.length}`);
console.log(`models advertising API ${FLOOR}  : ${capable.length}`);
console.log(`  VIRTUAL  : ${virtual.length}`);
console.log(`  PHYSICAL : ${physical.length}`);

const line = (m) => {
  const dp = m.screenDensity ? Math.round(m.screenX / (m.screenDensity / 160)) : '?';
  const tags = (m.tags ?? []).join(',');
  return `    ${String(m.id).padEnd(18)} ${`${m.manufacturer ?? ''} ${m.name ?? ''}`.trim().padEnd(26)}`
    + ` ${dp}dp ${m.screenX}x${m.screenY}@${m.screenDensity}  ${tags}`;
};
if (virtual.length) { console.log('\n  VIRTUAL devices that can run the floor:'); virtual.slice(0, 10).forEach((m) => console.log(line(m))); }
if (physical.length) { console.log('\n  PHYSICAL devices that can run the floor:'); physical.slice(0, 10).forEach((m) => console.log(line(m))); }

// A model can advertise a version and still be unschedulable.
const usable = capable.filter((m) => !(m.tags ?? []).some((t) => /deprecated|unsupported/i.test(t)));
console.log(`\nof those, not deprecated/unsupported: ${usable.length}`);

console.log('\n=== VERDICT ===');
if (usable.length > 0) {
  console.log(`  Test Lab CAN run API ${FLOOR}. Warsha's floor is provable on hosted devices.`);
} else if (capable.length > 0) {
  console.log(`  API ${FLOOR} is advertised but every model carrying it is deprecated/unsupported.`);
} else {
  console.log(`  NO model advertises API ${FLOOR}. The floor must be proven off Test Lab.`);
  console.log('  Warsha minSdk stays 24 regardless — the gap is in the test estate.');
}

// What IS the lowest schedulable API, so the matrix can be honest about it?
const lowest = models
  .flatMap((m) => (Array.isArray(m[versionField]) ? m[versionField].map(Number) : []))
  .filter((n) => Number.isFinite(n))
  .sort((a, b) => a - b)[0];
console.log(`\n  lowest API any model can run: ${lowest ?? 'unknown'}`);

// perVersionInfo is a second, richer source: it carries per-version scheduling
// detail, so a model can describe support there without a flat id list.
const withPer = models.filter((m) => Array.isArray(m.perVersionInfo) && m.perVersionInfo.length);
console.log('  models carrying perVersionInfo :', withPer.length);
console.log('  models carrying supportedVersionIds :', models.filter((m) => Array.isArray(m.supportedVersionIds)).length);
if (withPer.length) {
  console.log('  sample entry:', JSON.stringify(withPer[0].perVersionInfo[0]));
}
const perFloor = withPer.filter((m) => m.perVersionInfo.some((v) => String(v.versionId) === String(FLOOR)));
console.log(`  models whose perVersionInfo names API ${FLOOR}: ${perFloor.length}`);
for (const m of perFloor.slice(0, 8)) {
  const entry = m.perVersionInfo.find((v) => String(v.versionId) === String(FLOOR));
  console.log(`    ${m.id} (${m.form})  ${JSON.stringify(entry)}`);
}
const allPerVersions = [...new Set(withPer.flatMap((m) => m.perVersionInfo.map((v) => Number(v.versionId))))]
  .filter(Number.isFinite).sort((a, b) => a - b);
console.log('  every API named anywhere in perVersionInfo:', allPerVersions.join(', '));
