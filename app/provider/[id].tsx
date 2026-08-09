import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText } from "@/components/warsha/Typography";
import { ProviderReviewSummary } from "@/components/warsha/ProviderReviewSummary";
import { ProviderTrustIndicators } from "@/components/warsha/ProviderTrustIndicators";
import { colors, radii, spacing, typography } from "@/constants/theme";
import { useAuth } from "@/src/auth/auth-context";
import { useLocalPreferences } from "@/src/data/local-preferences";
import type { Service } from "@/src/data/marketplace-types";
import { useMarketplaceData } from "@/src/data/marketplace-context";
import { useLocalization } from "@/src/i18n/localization";
import type { Language } from "@/src/i18n/translations";
import { useMarketplaceText } from "@/src/marketplace-intelligence/marketplace-translations";
import { useWorkerProfileText } from "@/src/i18n/worker-profile-translations";
import { professionLabel } from "@/src/providers/profession-taxonomy";

const servicePricingLabels: Record<Language, Record<Service["pricingType"], string>> = {
  en: { fixed: "Fixed price", starting: "Starting from", hourly: "Hourly", inspection: "Inspection fee", quote: "Quote required" },
  ar: { fixed: "سعر ثابت", starting: "يبدأ من", hourly: "بالساعة", inspection: "رسوم معاينة", quote: "تحتاج عرض سعر" },
};
export default function ProviderProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getProvider } = useMarketplaceData();
  const { isFavourite, toggleFavourite } = useLocalPreferences();
  const { user, mode } = useAuth();
  const { t, isRTL, language } = useLocalization();
  const mt = useMarketplaceText();
  const wt = useWorkerProfileText();
  const provider = getProvider(id);
  if (!provider)
    return (
      <SafeAreaView style={styles.safe}>
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel={t("backAccessibility")}
          style={styles.staticBack}
        >
          <MaterialIcons name="arrow-back" size={22} color={colors.white} />
        </Pressable>
        <View style={styles.center}>
          <AppText style={styles.title}>{t("notFound")}</AppText>
        </View>
      </SafeAreaView>
    );
  return (
    <SafeAreaView edges={["bottom"]} style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {provider.coverImage ? <Image source={{ uri: provider.coverImage }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, styles.heroFallback]}><MaterialIcons name="handyman" size={54} color={colors.textMuted} /></View>}
          <View style={styles.shade} />
          <Circle
            accessibilityLabel={t("backAccessibility")}
            icon={isRTL ? "arrow-forward" : "arrow-back"}
            onPress={() => router.back()}
            left
          />
          <Circle
            accessibilityLabel={t("toggleFavourite")}
            icon={isFavourite(provider.id) ? "favorite" : "favorite-border"}
            onPress={() =>
              mode === "supabase" && !user
                ? router.push("/(tabs)/profile")
                : toggleFavourite(provider.id)
            }
            right
          />
        </View>
        <View style={styles.body}>
          <View style={styles.identity}>
            {provider.image ? <Image source={{ uri: provider.image }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback]}><MaterialIcons name="person" size={42} color={colors.textMuted} /></View>}
            <View style={styles.identityText}>
              <View style={styles.nameRow}>
                <AppText style={styles.name}>{provider.name}</AppText>
              </View>
              <ProviderTrustIndicators
                identityVerified={provider.verified}
                skillCertificateVerified={provider.skillCertificateVerified}
                professionalCertificateVerified={provider.professionalCertificateVerified}
              />
              <AppText style={styles.muted}>
                {professionLabel(provider.profession, language)} — {provider.location}
              </AppText>
            </View>
          </View>
          <View style={styles.stats}>
            <Stat
              value={`${provider.completedJobs}`}
              label={t("completedJobs")}
            />
            <Stat
              value={`${provider.experienceYears}`}
              label={`${t("years")} ${t("experience")}`}
            />
            <Stat
              value={provider.responseTime.replace("Usually replies in ", "")}
              label={t("responseTime")}
            />
          </View>
          <Section title={t("serviceArea")}>
            <Info
              icon="location-on"
              text={provider.location}
            />
          </Section>
          {provider.about.trim() ? <Section title={t("about")}>
            <AppText style={styles.copy}>{provider.about}</AppText>
          </Section> : null}
          {provider.experienceSummary ? <Section title={wt("workerProvided")}><AppText style={styles.copy}>{provider.experienceSummary}</AppText><AppText style={styles.muted}>{wt("selfDeclared")}</AppText></Section> : null}
          {provider.skills.length ? <Section title={t("skills")}>
            <View style={styles.wrap}>
              {provider.skills.map((skill) => (
                <View key={skill} style={styles.tag}>
                  <AppText style={styles.tagText}>{skill}</AppText>
                </View>
              ))}
            </View>
          </Section> : null}
          <Section title={t("servicesAndPrices")}>
            {provider.services.map((service) => (
              <ServiceRow key={service.id} service={service} />
            ))}
          </Section>
          <Section title={wt("workExamples")}>
            {provider.portfolio.length ? provider.portfolio.map((entry, index) => {
              const item = typeof entry === "string" ? { id: `${provider.id}-${index}`, title: wt("relatedWork"), description: "", completedPeriod: undefined, images: [entry] } : entry;
              return <View key={item.id} style={styles.workItem}><AppText style={styles.strong}>{item.title}</AppText>{item.description ? <AppText style={styles.copy}>{item.description}</AppText> : null}{item.completedPeriod ? <AppText style={styles.muted}>{item.completedPeriod}</AppText> : null}<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>{item.images.map((uri, imageIndex) => <Image key={`${item.id}-${imageIndex}`} source={{ uri }} contentFit="cover" style={styles.work} />)}</ScrollView></View>;
            }) : <AppText style={styles.muted}>{wt("noWorkExamples")}</AppText>}
          </Section>
          <Section title={t("availability")}>
            <Info
              icon="schedule"
              text={provider.available ? wt("availableNow") : wt("unavailableNow")}
            />
          </Section>
          {provider.guarantee ? <Section title={t("guarantee")}><Info icon="verified-user" text={provider.guarantee} /></Section> : null}
          {provider.supportedPaymentMethods?.length ? <Section title={wt("paymentMethods")}><View style={styles.wrap}>{provider.supportedPaymentMethods.map(method => <View key={method} style={styles.tag}><AppText style={styles.tagText}>{wt(method)}</AppText></View>)}</View></Section> : null}
          <Section title={t("reviewsTitle")}>
            <ProviderReviewSummary providerId={provider.id} />
          </Section>
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <Pressable
          onPress={() =>
            mode === "supabase" && !user
              ? router.push("/(tabs)/profile")
              : router.push({
                  pathname: "/marketplace-request/new",
                  params: { providerId: provider.id, categoryId: provider.categoryId },
                })
          }
          accessibilityLabel={mt("requestQuote")}
          style={styles.primary}
        >
          <AppText style={styles.primaryText}>{mt("requestQuote")}</AppText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
function Circle({
  icon,
  onPress,
  left,
  right,
  accessibilityLabel,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  onPress: () => void;
  left?: boolean;
  right?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.circle, left && styles.left, right && styles.right]}
    >
      <MaterialIcons name={icon} size={22} color={colors.white} />
    </Pressable>
  );
}
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <AppText style={styles.statValue}>{value}</AppText>
      <AppText style={styles.statLabel}>{label}</AppText>
    </View>
  );
}
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <AppText style={styles.sectionTitle}>{title}</AppText>
      {children}
    </View>
  );
}
function Info({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  text: string;
}) {
  return (
    <View style={styles.info}>
      <MaterialIcons name={icon} size={20} color={colors.white} />
      <AppText style={styles.copy}>{text}</AppText>
    </View>
  );
}
function ServiceRow({ service }: { service: Service }) {
  const { language, t, isRTL } = useLocalization();
  const { id } = useLocalSearchParams<{ id: string }>();
  const mt = useMarketplaceText();
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/marketplace-request/new",
          params: { providerId: id, serviceId: service.id },
        })
      }
      accessibilityLabel={`${mt("requestQuote")} ${service.name}`}
      style={styles.service}
    >
      <View>
        <AppText style={styles.strong}>{service.name}</AppText>
        <AppText style={styles.muted}>
          {service.duration} · {servicePricingLabels[language][service.pricingType]}
        </AppText>
      </View>
      <View style={styles.inline}>
        <AppText style={styles.price}>
          {service.price} {t("currency")}
        </AppText>
        <MaterialIcons
          name={isRTL ? "arrow-back" : "arrow-forward"}
          size={17}
          color={colors.white}
        />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 96 },
  hero: { height: 225, backgroundColor: colors.surface },
  heroFallback: { alignItems: "center", justifyContent: "center" },
  shade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.imageScrim,
  },
  circle: {
    position: "absolute",
    top: 52,
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  left: { left: 16 },
  right: { right: 16 },
  staticBack: {
    margin: spacing.lg,
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: typography.bold },
  body: {
    paddingHorizontal: spacing.lg,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  identity: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md,
    marginTop: -44,
  },
  avatar: {
    width: 94,
    height: 112,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: colors.background,
  },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceElevated },
  identityText: { flex: 1, gap: 5, paddingBottom: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 24, fontWeight: typography.bold, flexShrink: 1 },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  muted: { fontSize: 11, color: colors.textMuted },
  strong: { fontSize: 13, fontWeight: typography.semibold },
  stats: {
    flexDirection: "row",
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  stat: {
    flex: 1,
    minHeight: 78,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  statValue: { fontSize: 16, fontWeight: typography.bold, textAlign: "center" },
  statLabel: { fontSize: 10, color: colors.textMuted, textAlign: "center" },
  section: { marginTop: spacing.xl, gap: spacing.md },
  sectionTitle: { fontSize: 19, fontWeight: typography.semibold },
  copy: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
  },
  tagText: { fontSize: 12, color: colors.textSecondary },
  service: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  price: { fontSize: 15, fontWeight: typography.bold },
  gallery: { gap: spacing.sm },
  workItem: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface },
  work: {
    width: 210,
    height: 145,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  info: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  review: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  between: { flexDirection: "row", justifyContent: "space-between" },
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.canvasElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  secondary: {
    height: 52,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    height: 52,
    flex: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: colors.background, fontWeight: typography.bold },
});
