# Warsha Brand Refresh Manual Review

## Status

Overall manual visual-review status: **NOT RUN**

Automated export and static checks do not constitute visual acceptance. Record a device, OS, build identifier, language, reviewer, date, observed result, and evidence link before changing any item from NOT RUN.

## Build and cache preparation

| Check | Status | Evidence / notes |
| --- | --- | --- |
| Expo restart completed | **NOT RUN** | |
| Metro cache cleared with `npx.cmd expo start --clear` | **NOT RUN** | |
| Native development rebuild created after icon/splash changes | **NOT RUN** | |
| Previous app uninstalled before rebuilt icon/splash inspection | **NOT RUN** | |
| Fresh build installed on physical iPhone | **NOT RUN** | |
| Fresh build installed on physical Android device | **NOT RUN** | |
| Web export redeployed and browser cache hard-refreshed | **NOT RUN** | |
| EAS build inspected for release icon/splash behavior | **NOT RUN** | |

## Asset and launch checks

| Check | Status | Evidence / notes |
| --- | --- | --- |
| iOS launcher icon shows The Current with no legacy W-and-dot mark | **NOT RUN** | |
| Android adaptive icon safe-zone and masks are correct | **NOT RUN** | |
| Android monochrome/themed icon is legible | **NOT RUN** | |
| Android notification icon is single-color and unclipped | **NOT RUN** | |
| Native splash uses `#080808`, the Current lockup, and no white flash | **NOT RUN** | |
| Favicon shows The Current at small size | **NOT RUN** | |
| Web manifest name, theme color, and 192/512 icons are correct | **NOT RUN** | |

## English screens

| Check | Status | Evidence / notes |
| --- | --- | --- |
| Authentication and reset password | **NOT RUN** | |
| Customer home, services, categories, and search | **NOT RUN** | |
| Worker cards and worker profile | **NOT RUN** | |
| Marketplace request creation and request detail | **NOT RUN** | |
| Worker quote invitation and quote submission | **NOT RUN** | |
| Bookings, booking success, and booking detail | **NOT RUN** | |
| Booking chat and attachment preview | **NOT RUN** | |
| Payments, price adjustments, cash payment, and earnings | **NOT RUN** | |
| Worker mode and provider jobs | **NOT RUN** | |
| Verification and trust badges | **NOT RUN** | |
| Reviews and worker replies | **NOT RUN** | |
| Notifications and foreground banner | **NOT RUN** | |
| Error, configuration, empty, and loading states | **NOT RUN** | |

## Arabic and RTL screens

| Check | Status | Evidence / notes |
| --- | --- | --- |
| Arabic Cairo font loads without fallback or clipping | **NOT RUN** | |
| Arabic Current lockup order and spacing are correct | **NOT RUN** | |
| Header, back controls, tabs, and bottom navigation mirror correctly | **NOT RUN** | |
| Auth and reset fields align and type RTL correctly | **NOT RUN** | |
| Customer home, category, search, and worker cards mirror correctly | **NOT RUN** | |
| Marketplace request and quote screens mirror correctly | **NOT RUN** | |
| Booking detail, chat bubbles, and composer mirror correctly | **NOT RUN** | |
| Payments, verification, reviews, and notifications mirror correctly | **NOT RUN** | |
| Mixed Arabic/Latin numbers, EGP values, phone numbers, and times remain readable | **NOT RUN** | |

## Accessibility and motion

| Check | Status | Evidence / notes |
| --- | --- | --- |
| Primary and secondary text contrast is acceptable on device | **NOT RUN** | |
| Success, attention, and error state contrast is acceptable | **NOT RUN** | |
| Dynamic text does not clip critical actions | **NOT RUN** | |
| Interactive targets remain at least 44 by 44 | **NOT RUN** | |
| Screen-reader labels for mark, lockups, controls, and states are understandable | **NOT RUN** | |
| Loading mark animates calmly with no spinner/rotation | **NOT RUN** | |
| Reduced Motion produces a stable, non-travelling loading mark | **NOT RUN** | |
| No bounce, overshoot, gradient, glass, glow, or construction cliché is visible | **NOT RUN** | |

## Visual-system consistency

| Check | Status | Evidence / notes |
| --- | --- | --- |
| Background and surfaces match the locked palette | **NOT RUN** | |
| Inter hierarchy is consistent in English | **NOT RUN** | |
| 4 px spacing rhythm is visually consistent | **NOT RUN** | |
| 6/10/16/22/full radius hierarchy is used consistently | **NOT RUN** | |
| Borders and elevation remain restrained, with no glass effect | **NOT RUN** | |
| Primary, secondary, ghost, and destructive buttons are distinguishable | **NOT RUN** | |
| Verification/success/error badges use tinted dark fills | **NOT RUN** | |
| Marketplace, worker, quote, booking, and notification cards feel related | **NOT RUN** | |
| Empty states use one clear title and at most one action | **NOT RUN** | |

## iPhone inspection commands

For Expo Go JavaScript/layout inspection:

```powershell
npx.cmd expo start --clear --tunnel
```

Scan the QR code with the iPhone Camera app and open it in Expo Go. Expo Go cannot fully represent the final native splash/icon on SDK 54.

For a development build after native asset changes:

```powershell
npx.cmd eas build --profile development --platform ios
npx.cmd expo start --clear --dev-client --tunnel
```

Install the returned build on the iPhone, then scan/open the development-client URL. If the old launcher icon or splash remains, uninstall the previous Warsha build before installing the new one.

For release/TestFlight inspection:

```powershell
npx.cmd eas build --profile production --platform ios
```

Do not change the overall status from NOT RUN until the relevant physical-device rows are completed with evidence.
