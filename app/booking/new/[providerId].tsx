import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandLoadingMark as ActivityIndicator } from "@/components/warsha/BrandMark";
import { AddressLocationPicker, type AddressLocationPickerCopy } from "@/components/warsha/AddressLocationPicker";
import { ScreenHeader } from "@/components/warsha/ScreenHeader";
import { AppText } from "@/components/warsha/Typography";
import { colors, radii, spacing, typography } from "@/constants/theme";
import {
  persistAttachment,
  removePersistedAttachment,
} from "@/src/bookings/attachment-storage";
import { localAddressRepository } from "@/src/addresses/address-repository";
import {
  useBookings,
  type Address,
  type BookingAttachment,
  type PriceBreakdown,
} from "@/src/bookings/booking-context";
import type { Service } from "@/src/data/marketplace-types";
import { useMarketplaceData } from "@/src/data/marketplace-context";
import { useLocalization } from "@/src/i18n/localization";
import { useAddressFormText } from "@/src/i18n/address-form-copy";
import type { TranslationKey } from "@/src/i18n/translations";
import { catalogueServiceLabel } from "@/src/services/specific-services";
import { resolvedAddressFields } from "@/src/providers/location-address";
import {
  formatBookingDateTime,
  formatNumber,
  localeFor,
  normalizeProblem,
  toLocalISODate,
} from "@/src/utils/date-format";
const TIMES = ["09:00", "11:00", "13:00", "15:00", "17:00"];
const TRANSPORT = 75;
const EMERGENCY = 250;
export default function NewBookingScreen() {
  const { providerId, serviceId } = useLocalSearchParams<{
    providerId: string;
    serviceId?: string;
  }>();
  const { getProvider } = useMarketplaceData();
  const { bookings, createBooking, creating } = useBookings();
  const provider = getProvider(providerId);
  const { t, isRTL, language } = useLocalization();
  const addressText = useAddressFormText();
  const [step, setStep] = useState(0);
  const [service, setService] = useState<Service | undefined>(() =>
    provider?.services.find(
      (item) => item.id === serviceId && item.available !== false,
    ),
  );
  const [issue, setIssue] = useState("");
  const [problemTouched, setProblemTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<BookingAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const bookingCreated = useRef(false);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [address, setAddress] = useState<Address>();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Omit<Address, "id">>({
    label: "Home",
    governorate: "Cairo",
    district: "",
    street: "",
    building: "",
    floor: "",
    apartment: "",
    landmark: "",
    instructions: "",
  });
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [type, setType] = useState<"scheduled" | "emergency">("scheduled");
  const [error, setError] = useState("");
  const locationPickerCopy: AddressLocationPickerCopy = {
    useCurrentLocation: addressText('useCurrentLocation'), chooseOnMap: addressText('chooseOnMap'),
    searchAddress: addressText('searchAddress'), searchPlaceholder: addressText('searchPlaceholder'),
    locationSaved: addressText('locationSaved'), locationPartial: addressText('locationPartial'),
    addressLookupFailed: addressText('lookupFailed'), locating: addressText('locating'),
    resolvingAddress: addressText('resolving'), locationFailed: addressText('locationFailed'),
    locationPermissionDenied: addressText('permissionDenied'), locationServicesDisabled: addressText('servicesDisabled'),
    locationDeviceUnavailable: addressText('deviceUnavailable'), noSearchResults: addressText('noResults'),
    providerUnavailable: addressText('providerUnavailable'), permissionOptional: addressText('permissionOptional'),
    mapUnavailable: addressText('mapUnavailable'), mapDragHint: addressText('mapHint'), loading: addressText('loading'),
  };
  useEffect(
    () => () => {
      if (!bookingCreated.current)
        attachmentsRef.current.forEach(removePersistedAttachment);
    },
    [],
  );
  useEffect(() => {
    let active = true;
    void localAddressRepository
      .list()
      .then((items) => {
        if (active) {
          setAddresses(items);
          setAddress((current) => current ?? items[0]);
        }
      })
      .catch(() => {
        if (active) setError(t("genericTryAgain"));
      });
    return () => {
      active = false;
    };
  }, [t]);
  const dates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const day = new Date();
        day.setDate(day.getDate() + index + 1);
        return {
          value: toLocalISODate(day),
          label: day.toLocaleDateString(localeFor(language), {
            weekday: "short",
            day: "numeric",
            month: "short",
          }),
        };
      }),
    [language],
  );
  const emergencyAvailable = Boolean(
    provider?.available &&
      (provider.emergencyAvailable ??
        provider.skills.some((skill) =>
          skill.toLowerCase().includes("emergency"),
        )),
  );
  const availableTimes = TIMES.map((value) => ({
    value,
    available: !bookings.some(
      (booking) =>
        booking.providerId === providerId &&
        booking.date === date &&
        booking.time === value &&
        !["cancelled", "rejected"].includes(booking.status),
    ),
  }));
  const pricing: PriceBreakdown = useMemo(() => {
    const servicePrice =
      service?.pricingType === "inspection" ? 0 : (service?.price ?? 0);
    const inspectionFee =
      service?.pricingType === "inspection" ? service.price : 0;
    const transportationFee = service?.transportationFee ?? TRANSPORT;
    const emergencySurcharge =
      type === "emergency"
        ? (service?.emergencySurcharge ?? EMERGENCY)
        : 0;
    return {
      servicePrice,
      inspectionFee,
      transportationFee,
      emergencySurcharge,
      discount: 0,
      estimatedTotal:
        servicePrice + inspectionFee + transportationFee + emergencySurcharge,
      pricingType: service?.pricingType ?? "starting",
    };
  }, [service, type]);
  if (!provider)
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title={t("newBooking")} />
        <AppText style={styles.empty}>{t("providerNotFound")}</AppText>
      </SafeAreaView>
    );
  const pick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 4,
        quality: 0.75,
      });
      if (!result.canceled) {
        const available = Math.max(0, 4 - attachments.length);
        const copied = result.assets
          .slice(0, available)
          .map((asset) => persistAttachment(asset));
        setAttachments((current) => [...current, ...copied]);
      }
    } catch {
      Alert.alert(t("attachments"), t("genericTryAgain"));
    }
  };
  const saveAddress = async () => {
    if (
      !draft.label ||
      !draft.governorate ||
      !draft.district ||
      !draft.street ||
      draft.latitude === undefined ||
      draft.longitude === undefined ||
      !draft.pinSource
    ) {
      setError(t("addressRequired"));
      return;
    }
    try {
      const saved = await localAddressRepository.add(draft);
      setAddresses((current) => [...current, saved]);
      setAddress(saved);
      setAdding(false);
      setError("");
    } catch {
      setError(t("genericTryAgain"));
    }
  };
  const valid = [
    Boolean(service),
    normalizeProblem(issue).length >= 8,
    Boolean(address),
    type === "emergency" || Boolean(date && time),
    true,
  ][step];
  const next = () => {
    if (step === 1) setProblemTouched(true);
    if (!valid) {
      setError(t("completeRequired"));
      return;
    }
    setError("");
    setStep((current) => Math.min(current + 1, 4));
  };
  const confirm = async () => {
    if (!service || !address) return;
    try {
      const booking = await createBooking({
        providerId: provider.id,
        serviceId: service.id,
        serviceTranslationKey: service.translationKey,
        serviceName: service.name,
        issueDescription: normalizeProblem(issue),
        notes: notes.trim(),
        attachments,
        address,
        date: type === "emergency" ? toLocalISODate() : date,
        time: type === "emergency" ? "ASAP" : time,
        bookingType: type,
        priceBreakdown: pricing,
        price: pricing.estimatedTotal,
        pricingType: service.pricingType,
      });
      bookingCreated.current = true;
      router.replace({
        pathname: "/booking/success/[id]",
        params: { id: booking.id },
      });
    } catch {
      Alert.alert(t("createBookingError"), t("genericTryAgain"));
    }
  };
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.top}>
          <ScreenHeader title={t("bookService")} subtitle={provider.name} />
          <View style={[styles.progress, isRTL && styles.reverse]}>
            {[
              t("serviceStep"),
              t("problemStep"),
              t("addressStep"),
              t("scheduleStep"),
              t("reviewStep"),
            ].map((label, index) => (
              <View key={label} style={styles.progressItem}>
                <View style={[styles.bar, index <= step && styles.barActive]} />
                <AppText
                  style={[
                    styles.progressLabel,
                    index === step && styles.activeLabel,
                  ]}
                >
                  {label}
                </AppText>
              </View>
            ))}
          </View>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, isRTL && styles.rtl]}
        >
          {step === 0 ? (
            <View style={styles.section}>
              <Title text={t("chooseOneService")} />
              <AppText style={styles.help}>{t("listedServicesOnly")}</AppText>
              {provider.services
                .filter((item) => item.available !== false)
                .map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setService(item)}
                    style={[
                      styles.card,
                      isRTL && styles.reverse,
                      service?.id === item.id && styles.selected,
                    ]}
                  >
                    <View style={styles.grow}>
                      <AppText style={styles.cardTitle}>{catalogueServiceLabel(item, language)}</AppText>
                      <AppText style={styles.help}>
                        {t(serviceDescriptionKey(item))}
                      </AppText>
                      <AppText style={styles.help}>
                        {item.pricingType === "inspection"
                          ? t("inspectionRequired")
                          : item.pricingType === "fixed"
                            ? t("fixedPrice")
                            : t("startingEstimate")}
                      </AppText>
                    </View>
                    <AppText style={styles.price}>
                      {item.price} {t("currency")}
                    </AppText>
                    <MaterialIcons
                      name={
                        service?.id === item.id
                          ? "radio-button-checked"
                          : "radio-button-unchecked"
                      }
                      size={22}
                      color={
                        service?.id === item.id
                          ? colors.white
                          : colors.textMuted
                      }
                    />
                  </Pressable>
                ))}
            </View>
          ) : null}
          {step === 1 ? (
            <View style={styles.section}>
              <Title text={t("tellProblem")} />
              <Field
                label={`${t("problemDescription")} *`}
                value={issue}
                onChangeText={(value) => {
                  setIssue(value);
                  if (normalizeProblem(value).length >= 8) setError("");
                }}
                onBlur={() => setProblemTouched(true)}
                placeholder={t("problemPlaceholder")}
                multiline
              />
              {problemTouched && normalizeProblem(issue).length < 8 ? (
                <AppText style={styles.error}>
                  {t("meaningfulCharacters")}
                </AppText>
              ) : null}
              <Field
                label={t("optionalNotes")}
                value={notes}
                onChangeText={setNotes}
                placeholder={t("notesPlaceholder")}
                multiline
              />
              <Pressable
                accessibilityLabel={t("imagePickerAccessibility")}
                onPress={() => void pick()}
                style={styles.outline}
              >
                <MaterialIcons
                  name="add-photo-alternate"
                  size={20}
                  color={colors.white}
                />
                <AppText style={styles.cardTitle}>
                  {t("addPhotos")} ({attachments.length}/4)
                </AppText>
              </Pressable>
              <ScrollView horizontal contentContainerStyle={styles.photos}>
                {attachments.map((item) => (
                  <View key={item.id}>
                    <Image source={{ uri: item.uri }} style={styles.photo} />
                    <Pressable
                      accessibilityLabel={t("removePhoto")}
                      onPress={() => {
                        removePersistedAttachment(item);
                        setAttachments((current) =>
                          current.filter((image) => image.id !== item.id),
                        );
                      }}
                      style={styles.remove}
                    >
                      <MaterialIcons
                        name="close"
                        size={15}
                        color={colors.white}
                      />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}
          {step === 2 ? (
            <View style={styles.section}>
              <Title text={t("selectSavedAddress")} />
              {addresses.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => setAddress(item)}
                  style={[
                    styles.card,
                    isRTL && styles.reverse,
                    address?.id === item.id && styles.selected,
                  ]}
                >
                  <MaterialIcons
                    name="location-on"
                    size={21}
                    color={colors.white}
                  />
                  <View style={styles.grow}>
                    <AppText style={styles.cardTitle}>{item.label}</AppText>
                    <AppText style={styles.help}>
                      {item.building} {item.street}, {item.district},{" "}
                      {item.governorate}
                    </AppText>
                  </View>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setAdding(!adding)}
                style={styles.outline}
              >
                <MaterialIcons name="add" size={20} color={colors.white} />
                <AppText style={styles.cardTitle}>{t("addAddress")}</AppText>
              </Pressable>
              {adding ? (
                <View style={styles.addressForm}>
                  <AddressLocationPicker
                    value={draft.latitude !== undefined && draft.longitude !== undefined
                      ? { latitude: draft.latitude, longitude: draft.longitude }
                      : null}
                    copy={locationPickerCopy}
                    resolutionRequirement="structured"
                    onChange={(position, source, place) => {
                      const fields = place ? resolvedAddressFields(place) : {};
                      setDraft(current => ({
                        ...current,
                        latitude: position.latitude,
                        longitude: position.longitude,
                        pinSource: source,
                        ...(fields.addressLine ? { street: fields.addressLine } : {}),
                        ...(fields.governorate ? { governorate: fields.governorate } : {}),
                        ...(fields.district ? { district: fields.district } : {}),
                      }));
                    }}
                  />
                  <Field label={`${addressText('addressName')} (${addressText('required')})`} helper={addressText('addressNameHelp')} value={draft.label} onChangeText={value => setDraft(current => ({ ...current, label: value }))} />
                  <Field label={`${addressText('address')} (${addressText('required')})`} helper={addressText('addressHelp')} value={draft.street} onChangeText={value => setDraft(current => ({ ...current, street: value }))} />
                  <Field label={`${addressText('governorate')} (${addressText('required')})`} helper={addressText('governorateHelp')} value={draft.governorate} onChangeText={value => setDraft(current => ({ ...current, governorate: value }))} />
                  <Field label={`${addressText('area')} (${addressText('required')})`} helper={addressText('areaHelp')} value={draft.district} onChangeText={value => setDraft(current => ({ ...current, district: value }))} />
                  <Field label={`${addressText('building')} (${addressText('optional')})`} helper={addressText('buildingHelp')} value={draft.building} onChangeText={value => setDraft(current => ({ ...current, building: value }))} />
                  <Field label={`${addressText('floor')} (${addressText('optional')})`} helper={addressText('floorHelp')} value={draft.floor} onChangeText={value => setDraft(current => ({ ...current, floor: value }))} />
                  <Field label={`${addressText('apartment')} (${addressText('optional')})`} helper={addressText('apartmentHelp')} value={draft.apartment} onChangeText={value => setDraft(current => ({ ...current, apartment: value }))} />
                  <Field label={`${addressText('landmark')} (${addressText('optional')})`} helper={addressText('landmarkHelp')} value={draft.landmark} onChangeText={value => setDraft(current => ({ ...current, landmark: value }))} />
                  <Field label={`${addressText('workerNotes')} (${addressText('optional')})`} helper={addressText('workerNotesHelp')} value={draft.instructions} onChangeText={value => setDraft(current => ({ ...current, instructions: value }))} multiline />
                  <Pressable
                    onPress={() => void saveAddress()}
                    style={styles.primarySmall}
                  >
                    <AppText style={styles.primaryText}>
                      {t("saveAddress")}
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
          {step === 3 ? (
            <View style={styles.section}>
              <Title text={t("chooseBookingType")} />
              <View style={styles.typeRow}>
                <Choice
                  label={t("scheduled")}
                  selected={type === "scheduled"}
                  onPress={() => setType("scheduled")}
                />
                {emergencyAvailable ? (
                  <Choice
                    label={t("emergency")}
                    selected={type === "emergency"}
                    onPress={() => setType("emergency")}
                  />
                ) : null}
              </View>
              {type === "emergency" ? (
                <View style={styles.warning}>
                  <AppText style={styles.warningText}>
                    {t("emergencyWarning")}
                  </AppText>
                </View>
              ) : (
                <>
                  <AppText style={styles.cardTitle}>
                    {t("availableDates")}
                  </AppText>
                  <ScrollView horizontal contentContainerStyle={styles.dates}>
                    {dates.map((item) => (
                      <Choice
                        key={item.value}
                        label={item.label}
                        selected={date === item.value}
                        onPress={() => setDate(item.value)}
                      />
                    ))}
                  </ScrollView>
                  <AppText style={styles.cardTitle}>
                    {t("availableTimes")}
                  </AppText>
                  <View style={styles.times}>
                    {availableTimes.map((slot) => (
                      <Pressable
                        disabled={!date || !slot.available}
                        key={slot.value}
                        onPress={() => setTime(slot.value)}
                        style={[
                          styles.time,
                          time === slot.value && styles.selected,
                          (!date || !slot.available) && styles.disabled,
                        ]}
                      >
                        <AppText style={styles.cardTitle}>{slot.value}</AppText>
                        {!slot.available ? (
                          <AppText style={styles.help}>{t("booked")}</AppText>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>
          ) : null}
          {step === 4 && service && address ? (
            <View style={styles.section}>
              <Title text={t("reviewYourBooking")} />
              <Summary label={t("provider")} value={provider.name} />
              <Summary label={t("service")} value={catalogueServiceLabel(service, language)} />
              <Summary label={t("problem")} value={issue} />
              {notes ? <Summary label={t("notes")} value={notes} /> : null}
              <Summary
                label={t("addressStep")}
                value={`${address.building} ${address.street}, ${address.district}, ${address.governorate}`}
              />
              <Summary
                label={t("when")}
                value={
                  type === "emergency"
                    ? formatBookingDateTime(
                        toLocalISODate(),
                        "ASAP",
                        localeFor(language),
                        t("asap"),
                      )
                    : formatBookingDateTime(
                        date,
                        time,
                        localeFor(language),
                        t("asap"),
                      )
                }
              />
              {attachments.length ? (
                <ScrollView horizontal contentContainerStyle={styles.photos}>
                  {attachments.map((item) => (
                    <Image
                      key={item.id}
                      source={{ uri: item.uri }}
                      style={styles.photo}
                    />
                  ))}
                </ScrollView>
              ) : null}
              <View style={styles.pricing}>
                <Summary
                  label={
                    service.pricingType === "inspection"
                      ? t("inspection")
                      : t("servicePrice")
                  }
                  value={`${formatNumber(service.price, language)} ${t("currency")}`}
                />
                <Summary
                  label={t("transportationFee")}
                    value={`${formatNumber(pricing.transportationFee, language)} ${t("currency")}`}
                />
                {type === "emergency" ? (
                  <Summary
                    label={t("emergencySurcharge")}
                      value={`${formatNumber(pricing.emergencySurcharge, language)} ${t("currency")}`}
                  />
                ) : null}
                <Summary label={t("discount")} value="0 EGP" />
                <Summary
                  label={t("estimatedTotal")}
                  value={`${formatNumber(pricing.estimatedTotal, language)} ${t("currency")}`}
                />
              </View>
              <AppText style={styles.warningText}>
                {service.pricingType === "fixed"
                  ? t("fixedPriceNotice")
                  : t("estimateNotice")}
              </AppText>
              <AppText style={styles.help}>
                {provider.cancellationPolicy}
              </AppText>
            </View>
          ) : null}
          {error ? <AppText style={styles.error}>{error}</AppText> : null}
        </ScrollView>
        <View style={styles.footer}>
          {step > 0 ? (
            <Pressable
              accessibilityLabel={t("backAccessibility")}
              onPress={() => {
                setError("");
                setStep((current) => current - 1);
              }}
              style={styles.back}
            >
              <AppText style={styles.cardTitle}>{t("back")}</AppText>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={t("confirmAccessibility")}
            disabled={creating}
            onPress={step === 4 ? () => void confirm() : next}
            style={[styles.primary, creating && styles.disabled]}
          >
            {creating ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <AppText style={styles.primaryText}>
                {step === 4 ? t("confirmBooking") : t("continue")}
              </AppText>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function serviceDescriptionKey(service: Service): TranslationKey {
  return service.pricingType === "inspection"
    ? "onsiteAssessment"
    : service.pricingType === "fixed"
      ? "fixedServiceDescription"
      : "startingServiceDescription";
}
function Title({ text }: { text: string }) {
  return <AppText style={styles.title}>{text}</AppText>;
}
function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choice, selected && styles.selected]}
    >
      <AppText style={styles.cardTitle}>{label}</AppText>
    </Pressable>
  );
}
function Field(
  props: React.ComponentProps<typeof TextInput> & { label: string; helper?: string },
) {
  const { isRTL } = useLocalization();
  const { label, helper, ...input } = props;
  return (
    <View style={styles.field}>
      <AppText style={styles.cardTitle}>{label}</AppText>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        multiline={props.multiline}
        blurOnSubmit={props.multiline ? false : undefined}
        returnKeyType={props.multiline ? "default" : undefined}
        textAlignVertical={props.multiline ? "top" : "center"}
        style={[
          styles.input,
          props.multiline && styles.multiline,
          {
            textAlign: isRTL ? "right" : "left",
            writingDirection: isRTL ? "rtl" : "ltr",
          },
        ]}
      />
      {helper ? <AppText style={styles.help}>{helper}</AppText> : null}
    </View>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summary}>
      <AppText style={styles.help}>{label}</AppText>
      <AppText style={styles.summaryValue}>{value}</AppText>
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  top: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.lg,
  },
  progress: { flexDirection: "row", gap: spacing.sm },
  progressItem: { flex: 1, gap: 5 },
  bar: { height: 2, borderRadius: 2, backgroundColor: colors.border },
  barActive: { backgroundColor: colors.white },
  progressLabel: { fontSize: 8, color: colors.textMuted, textAlign: "center" },
  activeLabel: { color: colors.white },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: 116,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  section: { gap: spacing.lg },
  title: { fontSize: 23, fontWeight: typography.bold },
  help: { fontSize: 11, lineHeight: 16, color: colors.textMuted },
  card: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  selected: {
    borderColor: colors.white,
    backgroundColor: colors.surfaceElevated,
  },
  grow: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 13, fontWeight: typography.semibold },
  price: { fontSize: 14, fontWeight: typography.bold },
  field: { gap: spacing.sm },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.white,
    padding: spacing.md,
    fontFamily: typography.family,
  },
  multiline: { height: 120, textAlignVertical: "top" },
  outline: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  photos: { gap: spacing.sm },
  photo: { width: 100, height: 90, borderRadius: radii.md },
  remove: {
    position: "absolute",
    right: 5,
    top: 5,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: colors.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  addressForm: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  primarySmall: {
    height: 46,
    backgroundColor: colors.white,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: colors.background, fontWeight: typography.bold },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  choice: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  warning: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radii.md,
  },
  warningText: { fontSize: 11, lineHeight: 17, color: colors.warning },
  dates: { gap: spacing.sm },
  times: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  time: {
    width: "30%",
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.35 },
  pricing: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  rtl: { direction: "rtl" },
  reverse: { flexDirection: "row-reverse" },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  summaryValue: { fontSize: 13, fontWeight: typography.semibold, flex: 1.5 },
  error: { fontSize: 12, color: colors.error, marginTop: spacing.lg },
  empty: { padding: spacing.xxxl },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  back: {
    height: 52,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    height: 52,
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
});
