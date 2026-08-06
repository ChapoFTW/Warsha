import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useOnboardingText } from '@/src/onboarding/onboarding-translations';

/**
 * The three links the signed-out gateway offers.
 *
 * These are static, local screens. They deliberately do not read the Help
 * Center, which requires an authenticated call — serving three links on the
 * gateway is not worth opening a new anonymous data surface, which is the
 * opposite of what WPS-023 is for.
 *
 * The text says what Warsha can actually say today and stops. In particular it
 * does not claim any legal status, approval or compliance, because none has
 * been established.
 */

const body = {
  en: {
    help: [
      'Warsha connects you with plumbers, electricians, carpenters and other trades.',
      'You need an account to book a service or to offer one. Creating an account takes a minute.',
      'If you are creating a worker account, you will be asked for identity documents and an official criminal-record certificate. Our team reviews both before you can take jobs.',
      'Once you are signed in, the Help Center has the full set of articles.',
    ],
    privacy: [
      'Warsha collects what it needs to arrange work and nothing more.',
      'Your exact address and coordinates stay private. A worker sees only the minimum needed to reach you, and only at the point in a booking where they need it.',
      'Identity documents and criminal-record certificates are stored privately. Only our verification team can open them, and every time one is opened it is recorded.',
      'Warsha does not track you across other apps, does not collect background location, and does not read your contacts.',
      'Once you are signed in, the privacy centre lets you see what is stored, correct it, export it, deactivate your account or ask for it to be deleted.',
    ],
    terms: [
      'By creating an account you agree to use Warsha honestly and to treat the people you meet through it with respect.',
      'Worker accounts have additional terms covering identity checks, the certificate requirement, and the conditions under which an account can be suspended.',
      'You will be shown those terms in full during worker onboarding, before you are asked to accept anything.',
      'The complete terms are available in the app once you are signed in.',
    ],
  },
  ar: {
    help: [
      'ورشة بتوصلك بسباكين وكهربائيين ونجارين وصنايعية تانيين.',
      'محتاج حساب علشان تحجز خدمة أو تقدّم واحدة. إنشاء الحساب بياخد دقيقة.',
      'لو بتعمل حساب صنايعي، هنطلب منك إثبات شخصية وفيش وتشبيه رسمي. الفريق بيراجع الاتنين قبل ما تقدر تاخد شغل.',
      'بعد ما تدخل على حسابك، هتلاقي كل المقالات في مركز المساعدة.',
    ],
    privacy: [
      'ورشة بتجمع اللي محتاجاه علشان ترتّب الشغل وبس.',
      'عنوانك بالظبط وإحداثياتك بيفضلوا خاصين. الصنايعي بيشوف أقل حاجة توصله ليك، وفي وقت الحجز اللي محتاجها فيه بس.',
      'إثبات الشخصية والفيش والتشبيه بيتخزنوا بشكل خاص. فريق التحقق بس اللي يقدر يفتحهم، وكل مرة بيتفتحوا بتتسجل.',
      'ورشة مش بتتبعك في تطبيقات تانية، ومش بتجمع موقعك في الخلفية، ومش بتقرا جهات اتصالك.',
      'بعد ما تدخل على حسابك، مركز الخصوصية هيوريك المتخزن عنك وتقدر تصححه أو تصدّره أو توقف حسابك أو تطلب حذفه.',
    ],
    terms: [
      'لما تعمل حساب بتوافق إنك تستخدم ورشة بأمانة وتعامل الناس اللي بتقابلهم من خلالها باحترام.',
      'حسابات الصنايعية ليها شروط زيادة بتغطي التحقق من الهوية، ومطلب الفيش والتشبيه، والحالات اللي ممكن يتوقف فيها الحساب.',
      'هنعرض عليك الشروط دي كاملة أثناء تسجيلك كصنايعي، قبل ما نطلب منك توافق على أي حاجة.',
      'الشروط الكاملة موجودة في التطبيق بعد ما تدخل على حسابك.',
    ],
  },
} as const;

type Topic = keyof typeof body.en;

export default function LegalTopic() {
  const styles = useThemedStyles(makeStyles);
  const { language } = useLocalization();
  const ot = useOnboardingText();
  const params = useLocalSearchParams<{ topic?: string }>();

  const locale = language === 'ar' ? 'ar' : 'en';
  const raw = params.topic ?? 'help';
  const topic: Topic = raw === 'privacy' || raw === 'terms' ? raw : 'help';
  const heading = topic === 'privacy'
    ? ot.text('gatewayPrivacy')
    : topic === 'terms' ? ot.text('gatewayTerms') : ot.text('gatewayHelp');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <AppText accessibilityRole="header" style={styles.title}>{heading}</AppText>
        <View style={styles.body}>
          {body[locale][topic].map((paragraph) => (
            <AppText key={paragraph} style={styles.paragraph}>{paragraph}</AppText>
          ))}
        </View>
        <BrandButton
          label={ot.text('gatewayWelcome')}
          variant="secondary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  page: { padding: spacing.xl, gap: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: typography.bold, color: colors.textPrimary },
  body: { gap: spacing.md },
  paragraph: { color: colors.textSecondary, lineHeight: 22 },
});
