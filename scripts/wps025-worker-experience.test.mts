import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  accountHydrationReady,
  canRefreshAccountInline,
  defaultModeFor,
  homeRouteFor,
  isWorkerOnboardingContinuation,
  routeAfterHydration,
  routeSurface,
} from '../src/navigation/worker-route-policy.ts';
import {
  countActiveWorkerJobs,
  countNewWorkerRequests,
  workerDashboardPriority,
} from '../src/worker/worker-dashboard-policy.ts';
import type { Booking, BookingStatus } from '../src/bookings/booking-types.ts';
import { emptyOnboardingState } from '../src/onboarding/onboarding-types.ts';
import { emptyProviderDraft } from '../src/providers/provider-types.ts';
import { currentWorkerJourneyStep } from '../src/worker/worker-onboarding-policy.ts';
import {
  listProfessions,
  professions,
  selectedProfessionKeys,
  withSelectedProfessions,
} from '../src/providers/profession-taxonomy.ts';
import {
  EGYPT_LOCATION_DATASET,
  listEgyptAreas,
  listEgyptGovernorates,
} from '../src/locations/egypt-locations.ts';
import { egyptAdministrativeAreas } from '../src/locations/egypt-administrative-areas.generated.ts';
import { resolveLocationExperienceAvailability } from '../src/providers/location-experience-policy.ts';

const root = join(import.meta.dirname, '..');
let passed = 0;

function check(condition: boolean, label: string): void {
  if (!condition) throw new Error(label);
  passed += 1;
}

function read(...parts: string[]) {
  return readFileSync(join(root, ...parts), 'utf8');
}

check(homeRouteFor('worker_home') === '/worker', 'worker home has one canonical route');
check(homeRouteFor('customer_home') === '/', 'customer home route remains unchanged');
check(homeRouteFor('worker_onboarding') === '/onboarding/worker', 'worker onboarding route remains stable');
check(defaultModeFor('worker_home') === 'provider', 'ready workers default to work mode');
check(defaultModeFor('worker_onboarding') === 'provider', 'onboarding workers default to work mode');
check(defaultModeFor('customer_home') === 'customer', 'customers default to customer mode');
check(routeSurface('/') === 'customer', 'root is classified as customer product');
check(routeSurface('/orders') === 'customer', 'orders are in the customer product');
check(routeSurface('/worker') === 'worker', 'worker dashboard is in the worker product');
check(routeSurface('/worker/jobs/abc') === 'worker', 'worker nested routes remain worker routes');
check(routeSurface('/provider-verification') === 'worker', 'legacy verification is a worker route');
check(routeSurface('/support') === 'shared', 'support remains shared');
check(routeSurface('/notifications') === 'shared', 'notifications remain shared');
check(isWorkerOnboardingContinuation('/worker/verification'),
  'identity verification is an allowed worker-onboarding continuation');
check(!isWorkerOnboardingContinuation('/worker/jobs'),
  'operational worker routes remain unavailable during onboarding');

// Real-device registration regression. Publishing a Supabase session changes
// the active account during render; the effects that reset provider/onboarding
// loading flags do not run until afterward. A settled flag from the signed-out
// account must therefore not be accepted for the new worker account.
const newWorkerAccount = 'new-worker-account';
check(!accountHydrationReady({
  activeAccountKey: newWorkerAccount,
  loadedAccountKey: null,
  settled: true,
}), 'a signed-out settled flag is stale after the worker session is published');

const registrationDecisions = [
  routeAfterHydration({
    authLoading: false,
    onboardingReady: false,
    providerLoading: true,
    // Reproduce the dangerous customer/default intermediate explicitly. The
    // gate must suppress it rather than resolving customer Home.
    target: 'customer_home',
  }),
  routeAfterHydration({
    authLoading: false,
    onboardingReady: true,
    providerLoading: true,
    target: 'worker_onboarding',
  }),
  routeAfterHydration({
    authLoading: false,
    onboardingReady: true,
    providerLoading: false,
    target: 'worker_onboarding',
  }),
];
check(registrationDecisions[0] === null,
  'session-first worker hydration renders the neutral loading gate, not customer Home');
check(registrationDecisions[1] === null,
  'worker onboarding alone cannot route before provider hydration finishes');
check(registrationDecisions[2] === 'worker_onboarding',
  'an incompletely onboarded new worker resolves only worker onboarding');
check(!registrationDecisions.includes('customer_home'),
  'the async new-worker registration sequence never resolves customer Home');

// Real-device correction pass 2: this is a same-account authority refresh,
// not initial hydration. Step N stays mounted while the replacement answer is
// pending, then resolves step N+1 on the same canonical route.
check(canRefreshAccountInline({
  activeAccountKey: newWorkerAccount,
  loadedAccountKey: newWorkerAccount,
}), 'same-account worker authority reloads are presented inside the mounted shell');
const betweenOnboardingSteps = [
  routeAfterHydration({ authLoading: false, onboardingReady: true, providerLoading: false, target: 'worker_onboarding' }),
  routeAfterHydration({ authLoading: false, onboardingReady: true, providerLoading: false, target: 'worker_onboarding' }),
  routeAfterHydration({ authLoading: false, onboardingReady: true, providerLoading: false, target: 'worker_onboarding' }),
];
check(betweenOnboardingSteps.every(target => target === 'worker_onboarding'),
  'step N, inline refresh, and step N+1 never expose a customer destination');

const providerContext = read('src', 'providers', 'provider-context.tsx');
const onboardingContext = read('src', 'onboarding', 'onboarding-context.tsx');
const gate = read('components', 'warsha', 'AuthGate.tsx');
const rootLayout = read('app', '_layout.tsx');

check(!providerContext.includes('selected-app-mode'), 'customer mode is not persisted across restarts');
check(providerContext.includes('accountHydrationReady'),
  'provider readiness is scoped to the authenticated account');
check(onboardingContext.includes('accountHydrationReady'),
  'onboarding readiness is scoped to the authenticated account');
check(gate.includes("provider.setMode(defaultModeFor(target))"), 'the gate initializes experience from role');
check(gate.includes('routeAfterHydration'), 'the gate withholds routing through account hydration');
check(gate.includes("target === 'role_choice'"),
  'an interrupted registration cannot remain on an operational customer route');
check(gate.includes("pathname === '/worker-home'"), 'the legacy worker home remains compatible');
check(rootLayout.includes('<Stack.Screen name="worker" />'), 'the dedicated worker stack is registered');

function job(id: string, status: BookingStatus): Booking {
  return { id, status } as Booking;
}

const dashboardJobs = [job('request-1', 'pending_provider_approval'), job('active-1', 'work_in_progress')];
check(countNewWorkerRequests(dashboardJobs) === 1, 'new request count is derived from authoritative job state');
check(countActiveWorkerJobs(dashboardJobs) === 1, 'active job count is derived from authoritative job state');
check(
  workerDashboardPriority({ workerState: 'active', verificationStatus: 'approved', jobs: dashboardJobs, available: true }).kind === 'active_job',
  'an active job is the worker primary task',
);
check(
  workerDashboardPriority({ workerState: 'active', verificationStatus: 'approved', jobs: [job('request-1', 'pending_provider_approval')], available: true }).kind === 'new_requests',
  'new requests become primary when no job is active',
);
check(
  workerDashboardPriority({ workerState: 'provisionally_active', verificationStatus: 'draft', jobs: [], available: true }).kind === 'complete_verification',
  'incomplete verification becomes primary when no work is waiting',
);
check(
  workerDashboardPriority({ workerState: 'provisionally_active', verificationStatus: 'under_review', jobs: [], available: true }).kind === 'under_review',
  'review state is represented without an invented deadline',
);
check(
  workerDashboardPriority({ workerState: 'active', verificationStatus: 'approved', jobs: [], available: true }).kind === 'available',
  'an available worker with no task sees the waiting state',
);

const dashboard = read('app', 'worker', 'index.tsx');
check(dashboard.includes("await provider.setMode('customer')"), 'requesting a service explicitly enters customer experience');
check(dashboard.includes("router.replace('/')"), 'the explicit service request opens the unchanged customer home');
check(read('app', 'worker-home.tsx').includes('<Redirect href="/worker" />'), 'legacy worker home redirects to the canonical dashboard');

const agreed = {
  ...emptyOnboardingState,
  workerAgreementAccepted: true,
  documentProcessingAccepted: true,
};
check(currentWorkerJourneyStep(emptyOnboardingState) === 'welcome', 'the guided journey starts with welcome and agreements');
check(currentWorkerJourneyStep(agreed) === 'basic_information', 'basic information is the first profile step');
check(currentWorkerJourneyStep({ ...agreed, gates: { profile_photo: true } }) === 'trade', 'trade follows basic information without a biography');
check(currentWorkerJourneyStep({ ...agreed, gates: { profile_photo: true, professions_configured: true, services_configured: true } }) === 'service_area', 'service area follows required professions and services');
check(currentWorkerJourneyStep({ ...agreed, gates: { profile_photo: true, professions_configured: true, services_configured: true, service_area_configured: true, current_address_provided: true } }) === 'identity', 'identity follows the service area');
check(currentWorkerJourneyStep({ ...agreed, gates: { profile_photo: true, professions_configured: true, services_configured: true, service_area_configured: true, current_address_provided: true, national_id_front_uploaded: true, national_id_back_uploaded: true, identity_fields_confirmed: true } }) === 'criminal_record', 'the certificate follows identity');
check(currentWorkerJourneyStep({ ...agreed, gates: { profile_photo: true, professions_configured: true, services_configured: true, service_area_configured: true, current_address_provided: true, national_id_front_uploaded: true, national_id_back_uploaded: true, identity_fields_confirmed: true, criminal_record_uploaded: true } }) === 'review', 'review is the final journey step');

const onboardingScreen = read('app', 'onboarding', 'worker.tsx');
const providerMode = read('app', 'provider-mode.tsx');
check(onboardingScreen.includes("useState('')"), 'worker numeric onboarding inputs begin blank');
check(onboardingScreen.includes("experienceInput === '' ? 0"), 'blank experience saves as the valid neutral value and intentional zero remains valid');
check(!onboardingScreen.includes('draft.about.trim().length < 20'), 'an empty introduction does not block onboarding');
check(onboardingScreen.includes('<OnboardingFieldMeta'), 'onboarding shows required or optional status before interaction');
check(!onboardingScreen.includes("wt.text('radius')") && !onboardingScreen.includes('radiusInput'), 'worker onboarding exposes no distance-radius field');
check(onboardingScreen.includes('MARKETPLACE_MANAGED_RADIUS_KM'), 'the required radius column receives the marketplace-managed compatibility value');
check(!providerMode.includes('value={String(draft.experienceYears)}'), 'worker profile does not render the database experience default');
check(!providerMode.includes('value={String(draft.serviceRadiusKm)}'), 'worker profile does not render the database radius default');

const selectedProfessions = withSelectedProfessions(emptyProviderDraft, ['plumbing', 'electrical']);
check(selectedProfessionKeys(selectedProfessions).join(',') === 'plumbing,electrical', 'profession selection stores multiple stable canonical keys');
check(professions.length === 31, 'the canonical worker profession taxonomy contains all 31 required professions');
const englishProfessionLabels = professions.map(item => item.en);
check(JSON.stringify(englishProfessionLabels) === JSON.stringify([...englishProfessionLabels].sort((a, b) => a.localeCompare(b, 'en'))),
  'the source English profession taxonomy is stable and alphabetized');
check(professions.every(item => item.ar.trim().length > 0), 'every canonical profession has an Arabic label');
const arabicProfessionLabels = listProfessions('ar').map(item => item.ar);
check(JSON.stringify(arabicProfessionLabels) === JSON.stringify([...arabicProfessionLabels].sort((a, b) => a.localeCompare(b, 'ar'))),
  'Arabic profession options are sorted by their displayed Arabic labels');
const professionSelector = read('components', 'warsha', 'ProfessionSelector.tsx');
check(professionSelector.includes('searchProfessions') && professionSelector.includes('pending'), 'profession selection is searchable and multi-select');
check(professionSelector.includes('removeProfession') && professionSelector.includes("wt.text('done')"), 'selected professions are removable and the selector has an obvious Done action');

check(EGYPT_LOCATION_DATASET.governorateCount === 27 && listEgyptGovernorates('en').length === 27,
  'the versioned geographic reference contains all 27 Egyptian governorates');
const configuredAreaCount = egyptAdministrativeAreas.reduce((count, governorate) => count + governorate.areas.length, 0);
check(EGYPT_LOCATION_DATASET.areaCount === 365 && configuredAreaCount === 365,
  'the CAPMAS/OCHA reference contains all 365 supported ADM2 areas');
check(egyptAdministrativeAreas.every(governorate => governorate.areas.length > 0
  && listEgyptAreas(governorate.id, 'en').every(area => area.id.startsWith('EG'))),
  'every configured area belongs to an explicit governorate and has a stable P-code');

const addressScreen = read('app', 'onboarding', 'address.tsx');
check(rootLayout.includes('<Stack.Screen name="onboarding/address" />'), 'the current-address route is registered in the root stack');
check(onboardingScreen.includes("router.replace({ pathname: '/onboarding/address', params: { returnTo: 'worker' } })"),
  'worker current address uses the canonical route with an explicit worker return');
check(addressScreen.includes("router.replace('/onboarding/worker')"),
  'address completion replaces directly back into the worker journey');
const workerAddressStart = addressScreen.indexOf('function WorkerCurrentLocationFlow');
const customerAddressStart = addressScreen.indexOf('function CustomerDestinationAddressFlow');
const workerAddressPresentation = addressScreen.slice(workerAddressStart, customerAddressStart);
const customerAddressPresentation = addressScreen.slice(customerAddressStart);
check(workerAddressPresentation.includes("wt.text('workLocationTitle')")
  && workerAddressPresentation.includes("wt.text('selectedWorkArea')"),
  'worker address uses private work-location copy and shows the already-selected area');
for (const customerOnlyKey of [
  'addressBuilding', 'addressFloor', 'addressApartment', 'addressLandmark', 'addressNotes',
  'addressTitle', 'addressIntro', 'addressPinRequired', 'addressConfirm',
]) {
  check(!workerAddressPresentation.includes(customerOnlyKey),
    `worker address cannot render the customer-only ${customerOnlyKey} field or copy`);
}
check(!addressScreen.includes('addressLatitude') && !addressScreen.includes('addressLongitude'),
  'no normal address flow renders raw latitude or longitude inputs');
check(customerAddressPresentation.includes('addressFloor')
  && customerAddressPresentation.includes('addressApartment')
  && customerAddressPresentation.includes('addressLandmark'),
  'customer profile onboarding retains reusable destination details');
check(!customerAddressPresentation.includes("ot.text('addressNotes')")
  && customerAddressPresentation.includes('serviceNotes: null')
  && customerAddressPresentation.includes("instructions: ''"),
  'profile onboarding stores no job-specific worker notes');
check(customerAddressPresentation.includes('<EgyptLocationSelector')
  && !customerAddressPresentation.includes("ot.text('addressGovernorate')} value="),
  'customer profile onboarding uses the structured Egypt selector instead of free text');
check(workerAddressPresentation.includes('<AddressLocationPicker'),
  'worker address reuses provider-aware map, search, and device-location infrastructure');
const addressLocationPicker = read('components', 'warsha', 'AddressLocationPicker.tsx');
check(addressLocationPicker.includes('providerClients.locationCapability()')
  && addressLocationPicker.includes('providerClients.mapRenderDescriptor()'),
  'the shared picker resolves live server capability and renderer availability separately');
check(addressLocationPicker.includes('requestDeviceFix()')
  && addressLocationPicker.includes("'device_location'"),
  'current location obtains coordinates internally and records its source');
check(addressLocationPicker.includes('providerClients.searchAddresses')
  && addressLocationPicker.includes('providerClients.resolvePlace'),
  'address search resolves a selected place to internal coordinates through the proxy');
check(addressLocationPicker.includes("choosePosition(position, 'manual_pin')"),
  'map pin placement records internal coordinates without showing numeric fields');
const liveLocation = resolveLocationExperienceAvailability({
  dataMode: 'supabase',
  capability: { mapsAvailable: true, searchAvailable: true, manualPinAlwaysAvailable: true, pinRequiredBeforeBooking: true, mapRendererKey: 'google_native_sdk' },
  descriptor: { providerKey: 'configured-provider', rendererKey: 'google_native_sdk', requiresPublishableRenderKey: true, serverCredentialAvailable: true, attribution: 'Attribution', defaultViewport: { latitude: 30, longitude: 31, latitudeDelta: 0.1, longitudeDelta: 0.1 } },
});
check(liveLocation.deviceLocationAvailable && liveLocation.interactiveMapAvailable && liveLocation.addressSearchAvailable,
  'a configured live provider enables all three worker location paths');
check(!liveLocation.providerUnavailable, 'configured Maps never resolves the unavailable presentation');

const verificationScreen = read('app', 'worker', 'verification.tsx');
const onboardingRepository = read('src', 'onboarding', 'onboarding-repository.ts');
check(verificationScreen.includes('<DocumentCamera'), 'the canonical verification flow uses the governed document camera');
check(verificationScreen.includes('verificationState.upload'), 'identity media is registered through the existing verification authority');
check(verificationScreen.includes('onboarding.recordCapture'), 'identity captures are recorded through the onboarding authority');
check(verificationScreen.includes('onboarding.confirmIdentityFields'), 'identity details use the established confirmation RPC path');
check(verificationScreen.includes('verificationState.submit'), 'identity verification still submits through the verification authority');
check(verificationScreen.includes('onboarding.submitIdentity'), 'worker identity lifecycle still submits through the onboarding authority');
check(verificationScreen.match(/<OnboardingFieldMeta/g)?.length === 10, 'every identity and certificate input states whether it is required or optional and private');
check(verificationScreen.includes('DocumentPicker.getDocumentAsync'), 'the certificate picker lives in the canonical flow');
check(verificationScreen.includes('copyToCacheDirectory: true'), 'picked certificates remain readable by the File API');
check(onboardingRepository.includes("from('worker-criminal-records')"), 'criminal records use the governed private storage bucket');
check(onboardingRepository.includes('p_size_bytes: input.fileSizeBytes'), 'certificate submission uses the authoritative five-argument RPC');
check(!onboardingRepository.includes('p_file_size_bytes'), 'the retired certificate RPC parameter is not used');
check(!onboardingRepository.includes('p_declared_name'), 'no unsupported declared-name field is sent to the certificate RPC');
check(!onboardingRepository.includes('p_document_reference'), 'no unsupported reference field is sent to the certificate RPC');
check(read('app', 'provider-verification.tsx').includes('<Redirect href="/worker/verification" />'), 'legacy provider verification redirects to the canonical flow');
check(read('app', 'onboarding', 'identity.tsx').includes('<Redirect href="/worker/verification" />'), 'legacy identity onboarding redirects to the canonical flow');
check(read('app', 'onboarding', 'certificate.tsx').includes('/worker/verification?step=certificate'), 'legacy certificate onboarding redirects to the certificate step');

const money = read('src', 'payments', 'money.ts');
const profile = read('app', 'worker', 'profile.tsx');
const jobList = read('components', 'warsha', 'ProviderJobsContent.tsx');
const jobDetails = read('app', 'provider-job', '[id].tsx');
const notifications = read('src', 'notifications', 'notification-context.tsx');
check(!money.includes('new Intl.NumberFormat'), 'worker earnings never pass BigInt to Intl.NumberFormat');
check(money.includes('(value / 100n).toString()'), 'earnings retain BigInt arithmetic through the presentation boundary');
check(money.includes("'\\u066C'"), 'Arabic money grouping is produced from the exact decimal string');
const workerPhotoPicker = read('components', 'warsha', 'WorkerPhotoPicker.tsx');
check(!workerPhotoPicker.includes('allowsEditing: true') && workerPhotoPicker.includes('allowsEditing: false'),
  'worker profile photos never invoke Android native crop UI');
check(workerPhotoPicker.includes('ImageManipulator.manipulate') && workerPhotoPicker.includes('context.crop'),
  'photo selection uses an automatic square crop followed by a Warsha-owned preview');
check(workerPhotoPicker.includes("wt.text('usePhoto')") && workerPhotoPicker.includes("wt.text('retake')"),
  'the Warsha photo preview has obvious Use and Retake actions');
check(!profile.includes('accessibilityRole="tab"'), 'the worker profile no longer hides fields behind a second navigation system');
check(profile.includes("useState('')"), 'editable profile numeric inputs start blank');
check(read('app', 'provider-mode.tsx').includes('<Redirect href="/worker" />'), 'legacy provider mode redirects to worker home');
check(jobList.includes("pathname:'/worker/jobs/[id]'"), 'worker job cards use the canonical worker path');
check(jobDetails.includes("'work_in_progress'"), 'active lifecycle jobs keep their visible action surface');
check(notifications.includes("pathname: '/worker/jobs/[id]'"), 'worker booking notifications use the canonical job path');
check(notifications.includes("pathname: '/worker/requests/[id]'"), 'worker quote notifications use the canonical request path');
check(read('app', 'worker', 'jobs', '[id].tsx').includes("../../provider-job/[id]"), 'canonical job details reuse the hardened job authority');
check(read('app', 'worker', 'requests', '[id].tsx').includes("../../worker-quote/[id]"), 'canonical request details reuse the hardened quote authority');

console.log(`WPS-025 worker experience regressions: ${passed} checks passed`);
