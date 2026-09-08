/**
 * One answer to "which Android APIs can this Test Lab model actually run?"
 *
 * This exists because two scripts asked that question two different ways and
 * disagreed in the same terminal. `catalog.mjs` read the catalogue's *version*
 * list — the set of Android releases Test Lab knows about — and announced that
 * the floor was servable. `api-floor.mjs` read each *model* and found that no
 * device on earth in the catalogue offers it. Both printed their verdict as
 * fact; the reassuring one printed first.
 *
 * A version existing in the catalogue is not a device you can book. The only
 * question worth asking is whether some schedulable model runs it, so that is
 * the only question this module answers, and both scripts now ask it here.
 *
 * Two fields carry the answer and neither is complete on its own:
 *
 *   supportedVersionIds   a flat list of version ids        (205 of 466 models)
 *   perVersionInfo        richer per-version scheduling detail  (197 of 466)
 *
 * Around half the catalogue carries neither, which is why a model that lists
 * nothing must read as "unknown" and never as "does not support". Treating an
 * absent field as a denial would silently shrink the estate; treating it as
 * support would invent devices. It is reported separately instead.
 */

/** Every API level a model advertises, from both fields, deduped and sorted. */
export function supportedApis(model) {
  const out = new Set();
  if (Array.isArray(model.supportedVersionIds)) {
    for (const v of model.supportedVersionIds) {
      const n = Number(v);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  if (Array.isArray(model.perVersionInfo)) {
    for (const v of model.perVersionInfo) {
      const n = Number(v?.versionId);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** True when the model says nothing at all about versions. Not a denial. */
export function apisUnknown(model) {
  return supportedApis(model).length === 0;
}

/** A model can advertise a version and still be unbookable. */
export function schedulable(model) {
  return !(model.tags ?? []).some((t) => /deprecated|unsupported/i.test(String(t)));
}

export function canRun(model, api) {
  return supportedApis(model).includes(Number(api));
}

/**
 * The whole floor question, answered once.
 *
 * `verdict` is deliberately one of three words rather than a boolean, because
 * "no device offers it" and "devices offer it but all are deprecated" call for
 * different work and a boolean would collapse them.
 */
export function floorReport(models, floor) {
  const api = Number(floor);
  const capable = models.filter((m) => canRun(m, api));
  const usable = capable.filter(schedulable);
  const unknown = models.filter(apisUnknown);

  const lowest = models
    .flatMap(supportedApis)
    .sort((a, b) => a - b)[0] ?? null;

  let verdict;
  if (usable.length > 0) verdict = 'SERVABLE';
  else if (capable.length > 0) verdict = 'DEPRECATED_ONLY';
  else verdict = 'ABSENT';

  return {
    floor: api,
    verdict,
    capable,
    usable,
    unknownCount: unknown.length,
    total: models.length,
    lowest,
  };
}

/** The sentence a human should read. Says what to do, not just what is true. */
export function floorVerdictText(report) {
  const { floor, verdict, usable, capable, lowest, unknownCount, total } = report;
  switch (verdict) {
    case 'SERVABLE':
      return `Test Lab CAN run API ${floor}: ${usable.length} schedulable model(s). `
        + "Warsha's floor is provable on hosted devices.";
    case 'DEPRECATED_ONLY':
      return `API ${floor} is advertised by ${capable.length} model(s), but every one of them `
        + 'is deprecated or unsupported, so none can be booked. Treat the floor as unprovable '
        + 'on Test Lab until that changes.';
    default:
      return `NO schedulable model advertises API ${floor}. The lowest API any model reports is `
        + `${lowest ?? 'unknown'}. Warsha's minSdk stays ${floor} regardless — the gap is in the `
        + 'test estate, not in the product, and the floor must be proven off Test Lab '
        + `(emulator CI). ${unknownCount} of ${total} models declare no versions at all and are `
        + 'not counted either way.';
  }
}
