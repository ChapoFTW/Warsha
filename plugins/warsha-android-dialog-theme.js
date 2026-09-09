/**
 * Make the system dialogs look like Warsha.
 *
 * `Alert.alert` is the platform dialog, and eighteen screens use it — importing
 * local data, confirming a cancellation, deleting a portfolio photo, opening a
 * dispute. Every one of them rendered in Android's stock accent, which on this
 * device is teal: a colour that appears nowhere else in the product. The
 * buttons were ALL CAPS while every Warsha button is sentence case, and the
 * typography was the platform's.
 *
 * The result was that Warsha's own surfaces looked designed and the moment a
 * decision mattered, the dialog looked like a different application.
 *
 * ## Why this and not a JavaScript dialog
 *
 * Replacing eighteen call sites with a custom component would mean
 * reimplementing focus trapping, back-button handling, screen-reader
 * announcement and button ordering — all of which the platform dialog already
 * does correctly, and several of which are easy to get subtly wrong. The
 * appearance was the defect; the behaviour was not. So the appearance is what
 * changes, in one place, for all eighteen at once and for any added later.
 *
 * `textAllCaps` is set to false deliberately. Sentence case is not a
 * preference here: Warsha ships Arabic, which has no letter case at all, so a
 * design that relies on capitals to mark an action reads as designed in one
 * language and ported to the other.
 *
 * ## What this does NOT fix
 *
 * A `DayNight` resource follows the SYSTEM night setting. Warsha resolves its
 * own Light/Dark/System preference in JavaScript and does not tell Android, so
 * a person who chooses Dark inside Warsha on a light phone still gets a light
 * dialog. That is a separate defect with a separate fix, and it is tracked
 * rather than papered over here — nothing below can express it, because the
 * choice lives in JavaScript and these are compile-time resources.
 *
 * ## Two resource names that are easy to get wrong
 *
 * The parent is `ThemeOverlay.AppCompat.Dialog.Alert` and NOT
 * `ThemeOverlay.AppCompat.DayNight.Dialog.Alert`, which does not exist. The
 * first attempt used the second, and no unit test could have said so: a check
 * that reads this file can confirm the string is present and cannot confirm
 * that AppCompat defines it. The build is the authority for that, and it said
 * so plainly -- `resource style/... not found`.
 *
 * Day and night still work, because they come from the COLOURS rather than
 * from the parent: `@color/warshaDialogBackground` resolves out of `values/`
 * or `values-night/` depending on the night mode, and the activity's own theme
 * is already `Theme.AppCompat.DayNight.NoActionBar`.
 *
 * The panel colour is `android:colorBackground`, not `android:background`. The
 * latter is the default background for any view that does not set its own, so
 * it leaks past the dialog into its children.
 *
 * ## Values
 *
 * Read from `constants/appearance.ts`, which is the only place in Warsha
 * allowed to hold a literal colour. They are duplicated here as literals
 * because a Gradle resource file cannot import TypeScript;
 * `scripts/android-dialog-theme.test.mts` asserts the two agree, exactly as
 * `test:web-brand` already does for the web palette.
 */

const { withAndroidColors, withAndroidColorsNight, withAndroidStyles } = require('@expo/config-plugins');

/** `ink` roles from constants/appearance.ts, resolved per theme. */
const LIGHT = {
  // surfaceElevated / textPrimary / actionPrimaryBackground, light theme.
  warshaDialogBackground: '#FFFFFF',
  warshaDialogText: '#111111',
  warshaDialogAction: '#111111',
};

const DARK = {
  warshaDialogBackground: '#191919',
  warshaDialogText: '#FAFAFA',
  warshaDialogAction: '#FAFAFA',
};

/** Add or replace a `<color name=…>` entry. */
function setColors(colors, values) {
  const resources = colors.resources ?? (colors.resources = {});
  const list = resources.color ?? (resources.color = []);
  for (const [name, value] of Object.entries(values)) {
    const existing = list.find((entry) => entry.$?.name === name);
    if (existing) existing._ = value;
    else list.push({ $: { name }, _: value });
  }
  return colors;
}

/** Add or replace an `<item name=…>` inside a style. */
function setItems(style, items) {
  const list = style.item ?? (style.item = []);
  for (const [name, value] of Object.entries(items)) {
    const existing = list.find((entry) => entry.$?.name === name);
    if (existing) existing._ = value;
    else list.push({ $: { name }, _: value });
  }
}

module.exports = function withWarshaAndroidDialogTheme(config) {
  let next = withAndroidColors(config, (modConfig) => {
    modConfig.modResults = setColors(modConfig.modResults, LIGHT);
    return modConfig;
  });

  next = withAndroidColorsNight(next, (modConfig) => {
    modConfig.modResults = setColors(modConfig.modResults, DARK);
    return modConfig;
  });

  return withAndroidStyles(next, (modConfig) => {
    const styles = modConfig.modResults.resources.style ?? [];

    // The dialog itself. `ThemeOverlay` rather than a full theme, so it changes
    // the dialog and inherits everything else from the activity.
    const overlay = {
      $: {
        name: 'Warsha.Dialog',
        parent: 'ThemeOverlay.AppCompat.Dialog.Alert',
      },
      item: [],
    };
    setItems(overlay, {
      'colorAccent': '@color/warshaDialogAction',
      'android:colorBackground': '@color/warshaDialogBackground',
      'android:textColorPrimary': '@color/warshaDialogText',
      'buttonBarPositiveButtonStyle': '@style/Warsha.Dialog.Button',
      'buttonBarNegativeButtonStyle': '@style/Warsha.Dialog.Button',
      'buttonBarNeutralButtonStyle': '@style/Warsha.Dialog.Button',
    });

    const button = {
      $: {
        name: 'Warsha.Dialog.Button',
        parent: 'Widget.AppCompat.Button.ButtonBar.AlertDialog',
      },
      item: [],
    };
    setItems(button, {
      // Arabic has no case. A rule that only works in one script is not a rule.
      'android:textAllCaps': 'false',
      'android:textColor': '@color/warshaDialogAction',
    });

    const without = styles.filter((style) => style.$?.name !== 'Warsha.Dialog'
      && style.$?.name !== 'Warsha.Dialog.Button');
    without.push(overlay, button);

    const appTheme = without.find((style) => style.$?.name === 'AppTheme');
    if (!appTheme) {
      throw new Error('AppTheme is missing; Warsha cannot attach its dialog theme to it');
    }
    // `Alert.alert` builds on the activity's theme, so pointing the activity's
    // `alertDialogTheme` here reaches every existing call site and every future
    // one, with no JavaScript change at any of them.
    setItems(appTheme, { 'alertDialogTheme': '@style/Warsha.Dialog' });

    modConfig.modResults.resources.style = without;
    return modConfig;
  });
};
