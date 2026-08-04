# WPS-020 Manual Alpha — Search, Discovery, Personalization & Appearance

| Field | Value |
| --- | --- |
| Specification | WPS-020 v1.0 |
| Cases | 102 |
| Status | **NOT RUN** — results in `docs/testing/WPS-020-MANUAL-RESULTS.md` |
| Rule | Visual acceptance cannot be inferred from source tests. Every case here requires a human looking at a screen. |

Automated coverage proves the *rules* hold. It cannot tell you whether the light
theme looks like Warsha, whether a badge is legible at low brightness, or
whether an Arabic filter row reads correctly right-to-left. That is what this
plan is for.

Execute on a real device. Record the device, OS version, appearance, language,
and text scale for every case.

---

## A — Appearance selection (A1–A12)

| ID | Case | Expected |
| --- | --- | --- |
| A1 | Open Profile → Appearance | Three options: System, Light, Dark. Current selection visible. |
| A2 | Select Light | Applies immediately. No Save button. No restart. |
| A3 | Select Dark | Applies immediately. |
| A4 | Select System with the device in light | The app is light. |
| A5 | Select System, then change the device to dark without leaving Warsha | Warsha turns dark within a second, no relaunch. |
| A6 | Select Dark, then change the device to light | Warsha stays dark. |
| A7 | Force-quit and relaunch after selecting Light | Launches light. No dark frame at any point. |
| A8 | Force-quit and relaunch after selecting Dark | Launches dark. No bright frame at any point. |
| A9 | Select Light, navigate three screens deep, switch to Dark | Theme changes; the screen you were on stays on screen with its scroll position. |
| A10 | Begin typing a support message, switch theme mid-typing | The draft text survives. |
| A11 | Sign out while Light is selected | The app stays light. |
| A12 | Sign in as a second account that chose Dark | The appearance follows that account after sign-in. |

## B — Visual matrix (B1–B22)

Every case: walk home, search, a provider profile, a booking, chat, and the Help
Center. Look for unreadable text, invisible borders, invisible icons, and any
surface that did not change.

| ID | Case | Expected |
| --- | --- | --- |
| B1 | iPhone dark | Matches the established Warsha appearance exactly |
| B2 | iPhone light | Premium, calm, unmistakably Warsha; not washed out |
| B3 | iPhone system, changed live in Control Centre | Follows immediately on every screen |
| B4 | Android dark | As B1 |
| B5 | Android light | As B2 |
| B6 | Android system, changed live in Quick Settings | Follows immediately |
| B7 | Web dark | As B1, including the page background behind the app |
| B8 | Web light | As B2, including the page background behind the app |
| B9 | Web with the browser set to light, no stored choice | Loads light with no dark flash |
| B10 | Web with the browser set to dark, no stored choice | Loads dark with no bright flash |
| B11 | English dark | Layout and copy correct |
| B12 | English light | Layout and copy correct |
| B13 | Arabic RTL dark | Mirrored layout, Cairo font, logo not mirrored |
| B14 | Arabic RTL light | As B13 |
| B15 | Text scale at maximum, light | Nothing clipped, nothing overlapping |
| B16 | Text scale at maximum, dark | As B15 |
| B17 | Reduced Motion enabled | The loading mark holds still; no other motion |
| B18 | Screen reader, appearance selector | Announces "radio, 2 of 3, selected" or the platform equivalent |
| B19 | Minimum screen brightness, dark | Muted text still legible |
| B20 | Maximum screen brightness, light | Not painful; the canvas is paper, not glare |
| B21 | OLED device, dark | The canvas reads as near-black, with no visible banding on gradients |
| B22 | Small iPhone (SE class) and a tablet or wide browser | No clipping at either extreme; content stays centred at 720px |

## C — Search (C1–C14)

| ID | Case | Expected |
| --- | --- | --- |
| C1 | Open search with no query | Landing state: recent searches, trades, common services |
| C2 | Search a worker's name | That worker appears |
| C3 | Search a trade ("plumbing") | Relevant workers appear |
| C4 | Search a declared skill | The worker who declared it appears |
| C5 | Search a service name | Workers offering it appear |
| C6 | Search a misspelling ("plumbr") | Results appear, labelled as close matches |
| C7 | Search a correctly spelled query | **Not** labelled as approximate |
| C8 | Search nonsense | Explicit empty state with a suggestion, not a blank screen |
| C9 | Result count next to the header | Matches the number of results actually reachable by paging |
| C10 | Scroll and tap Show more | Appends; nothing repeats and nothing is skipped |
| C11 | Open a result, then go back | The result list, scroll position, and filters are all still there |
| C12 | Turn off the network and search | Failure is explained, with a working retry |
| C13 | Restore the network and retry | Results load |
| C14 | Search on web, then use the browser back button | The previous query returns |

## D — Filters (D1–D10)

| ID | Case | Expected |
| --- | --- | --- |
| D1 | Open filters | Only filters the server can answer are shown |
| D2 | Apply a trade filter | Count badge shows 1; results narrow |
| D3 | Apply three filters | Badge shows 3 |
| D4 | Remove one filter chip | Badge shows 2; that filter is gone, the others remain |
| D5 | Reset all | Badge disappears; the full result set returns |
| D6 | Apply Available now | Every result is available |
| D7 | Apply a verification filter | Every result carries that badge |
| D8 | Apply an area filter | Every result serves that area |
| D9 | Apply a filter combination with no matches | Explicit empty state, not a silent blank |
| D10 | Apply filters, open a provider, come back | The filters are still applied |

## E — Sorting (E1–E6)

| ID | Case | Expected |
| --- | --- | --- |
| E1 | Default sort | Recommended |
| E2 | Recommended, screen reader on the chip | Explains the ranking policy and that nobody pays for placement |
| E3 | Sort by Rating | Highest first; review counts visible so one review reads as one review |
| E4 | Sort by Most reviewed | Highest review count first |
| E5 | Sort by Availability | Available workers first |
| E6 | Look for a Distance option | **Absent.** Warsha has no device location; see the limitations section |

## F — Discovery surfaces (F1–F8)

| ID | Case | Expected |
| --- | --- | --- |
| F1 | Home, signed out | Trades and discovery shelves; no personal shelves |
| F2 | Home, signed in with no history | No empty shelves are rendered at all |
| F3 | Home after viewing two workers | "Continue where you left off" appears |
| F4 | Home after saving a worker | "Workers you saved" appears |
| F5 | "Available near you" | Every card is actually available |
| F6 | "Proven professionals" | Every card has a verified skill certificate and completed work |
| F7 | Count the home sections | No section exists that does not answer a question |
| F8 | Look for an offer or promotion banner | **Absent.** Removed; see the WPS-020 removal note |

## G — History and favourites (G1–G10)

| ID | Case | Expected |
| --- | --- | --- |
| G1 | Open a worker, then Profile → Recently viewed | That worker is listed |
| G2 | Open the same worker again | Listed once, moved to the top |
| G3 | Open 25 workers | At most 20 are kept |
| G4 | Clear history | Empty, immediately, and after relaunch |
| G5 | Sign out, sign in as another account | The other account's history is empty |
| G6 | Read the history hint | States that only you can see it and that it affects nobody's ranking |
| G7 | Save a worker from a search result | The heart fills immediately |
| G8 | Save while offline | Rolls back visibly rather than lying |
| G9 | Favourites while signed out (Supabase mode) | Explains that signing in is needed; does not fail silently |
| G10 | A saved worker who stops being discoverable | Disappears from favourites rather than showing a stale card |

## H — Accessibility (H1–H12)

| ID | Case | Expected |
| --- | --- | --- |
| H1 | Screen reader on a search result | Name, availability in words, and review count are all announced |
| H2 | Screen reader on the favourite button | Announces its selected state |
| H3 | Screen reader on a filter chip | Announces its selected state |
| H4 | Screen reader on the sort chips | Announces a radio group |
| H5 | Keyboard focus on web through search | Every control is reachable and visibly focused |
| H6 | Keyboard focus in Arabic | Focus order follows the visual right-to-left order |
| H7 | Every touch target | At least 44×44 |
| H8 | Disabled controls | Distinguishable without relying on colour |
| H9 | Placeholder text, light and dark | Readable, not a faint grey |
| H10 | Status badges, light and dark | Each has an icon and a word |
| H11 | Reduced Motion | No looping animation anywhere in search or discovery |
| H12 | Dimmed content | Nothing inactive is dimmed unless it is genuinely disabled |

## I — Localization and RTL (I1–I8)

| ID | Case | Expected |
| --- | --- | --- |
| I1 | Arabic appearance labels | حسب الجهاز / فاتح / داكن, in that order |
| I2 | Arabic search field | Cursor and text start on the right |
| I3 | Arabic filter chips | Flow right-to-left |
| I4 | Arabic result card | Avatar on the right, badges flow right-to-left |
| I5 | Arabic back arrow | Points right |
| I6 | Arabic logo | **Not** mirrored; the wordmark is ورشة |
| I7 | Switch language mid-search | Copy changes; the query and results do not reset |
| I8 | Every WPS-020 string in Arabic | Egyptian spoken register, no untranslated English |

---

## What this plan cannot cover

- **Distance sorting and nearby-by-location.** The server supports coordinates
  and it is tested in pgTAP, but no client requests device location, so E6
  expects the option to be absent. Recorded in WPS-020 §Limitations.
- **The native launch screen in light mode.** It stays dark. B7–B10 test the web
  shell, which Warsha does control.
- **Measured contrast ratios.** See `docs/testing/WPS-020-ACCESSIBILITY-REVIEW.md`.
