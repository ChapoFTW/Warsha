'use client';

import { useEffect, useId, useRef, useState } from 'react';

import {
  newPlaceSessionToken,
  resolvePlace,
  searchAddresses,
  type PlaceSuggestion,
  type ResolvedPlace,
} from '@/lib/location';
import { shouldRequestSuggestions } from '@/src/providers/location-address';
import type { LocationLanguage } from '@/src/providers/location-address';

import styles from './product-surface.module.css';

export type AddressSearchCopy = {
  label: string;
  placeholder: string;
  unavailable: string;
  noResults: string;
  failed: string;
  loading: string;
};

/** One debounced, keyboard-operable search presentation for customer and worker web. */
export function AddressSearch({
  available,
  disabled,
  language,
  copy,
  onSelect,
}: {
  available: boolean;
  disabled: boolean;
  language: LocationLanguage;
  copy: AddressSearchCopy;
  onSelect: (place: ResolvedPlace) => void;
}) {
  const listId = useId();
  const requestGeneration = useRef(0);
  /**
   * The text in the box, and why it is there.
   *
   * Searching was driven by the text alone, so filling the box with the address
   * somebody had just picked was indistinguishable from them typing it: the
   * effect ran, searched for the selected address, and offered the same
   * suggestion again. The loop was not a timing problem and a longer debounce
   * would only have made it slower, so the origin is part of the state rather
   * than something inferred from when the value changed.
   *
   * `typed` is the only origin that searches. `selected` is set once, by
   * choosing a suggestion, and the next keystroke returns it to `typed`.
   */
  const [query, setQuery] = useState<{ text: string; origin: 'typed' | 'selected' }>(
    { text: '', origin: 'typed' });
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [sessionToken, setSessionToken] = useState(newPlaceSessionToken);
  const [status, setStatus] = useState<'idle' | 'searching' | 'no_results' | 'failed'>('idle');

  useEffect(() => {
    const trimmed = query.text.trim();
    if (!shouldRequestSuggestions(query, { available, disabled })) {
      // Retire whatever is in flight, so a superseded keystroke's answer cannot
      // arrive after a selection and reopen the list it just closed.
      requestGeneration.current += 1;
      // A selection already cleared the list and left the chosen address in the
      // box. Clearing again here would wipe what was just chosen.
      if (query.origin === 'selected') return undefined;
      setSuggestions([]);
      setHighlighted(-1);
      setStatus('idle');
      return undefined;
    }
    const generation = ++requestGeneration.current;
    const timer = setTimeout(() => {
      setStatus('searching');
      void searchAddresses(trimmed, sessionToken, language).then((result) => {
        if (generation !== requestGeneration.current) return;
        if (result.outcome !== 'succeeded') {
          setSuggestions([]);
          setHighlighted(-1);
          setStatus('failed');
          return;
        }
        setSuggestions(result.suggestions);
        setHighlighted(result.suggestions.length > 0 ? 0 : -1);
        setStatus(result.suggestions.length > 0 ? 'idle' : 'no_results');
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [available, disabled, language, query, sessionToken]);

  const choose = async (suggestion: PlaceSuggestion) => {
    if (disabled || status === 'searching') return;
    requestGeneration.current += 1;
    setStatus('searching');
    const place = await resolvePlace(suggestion.placeId, sessionToken, language);
    if (!place) {
      setStatus('failed');
      return;
    }
    onSelect(place);
    // Marked as `selected`, so the effect below leaves it alone. Editing it
    // afterwards sets the origin back to `typed` and searching resumes.
    setQuery({ text: place.formattedAddress, origin: 'selected' });
    setSuggestions([]);
    setHighlighted(-1);
    // A Places session ends with the details call it paid for; the next search
    // starts a new one.
    setSessionToken(newPlaceSessionToken());
    setStatus('idle');
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted(current => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted(current => current <= 0 ? suggestions.length - 1 : current - 1);
    } else if (event.key === 'Enter' && highlighted >= 0) {
      event.preventDefault();
      void choose(suggestions[highlighted]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setSuggestions([]);
      setHighlighted(-1);
    }
  };

  if (!available) return <p className={styles.note}>{copy.unavailable}</p>;

  return (
    <div className={styles.addressSearch} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <label className={styles.field}>
        <span className={styles.label}>{copy.label}</span>
        <input
          type="search"
          className={styles.input}
          value={query.text}
          placeholder={copy.placeholder}
          disabled={disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
          aria-busy={status === 'searching'}
          onChange={(event) => setQuery({ text: event.target.value, origin: 'typed' })}
          onKeyDown={onKeyDown}
        />
      </label>
      {suggestions.length > 0 ? (
        <ul id={listId} role="listbox" className={styles.searchSuggestions} data-warsha-open="fast">
          {suggestions.map((suggestion, index) => (
            <li
              id={`${listId}-${index}`}
              key={suggestion.placeId}
              role="option"
              aria-selected={index === highlighted}
              className={`${styles.searchOption} ${index === highlighted ? styles.searchOptionActive : ''}`}>
              <button type="button" tabIndex={-1} disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void choose(suggestion)}>
                <strong>{suggestion.primary}</strong>
                {suggestion.secondary ? <span>{suggestion.secondary}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className={styles.hint} role="status" aria-live="polite">
        {status === 'searching' ? copy.loading
          : status === 'no_results' ? copy.noResults
            : status === 'failed' ? copy.failed : ''}
      </p>
    </div>
  );
}
