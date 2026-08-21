'use client';

import { useEffect, useId, useRef, useState } from 'react';

import {
  newPlaceSessionToken,
  resolvePlace,
  searchAddresses,
  type PlaceSuggestion,
  type ResolvedPlace,
} from '@/lib/location';
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
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [highlighted, setHighlighted] = useState(-1);
  const [sessionToken, setSessionToken] = useState(newPlaceSessionToken);
  const [status, setStatus] = useState<'idle' | 'searching' | 'no_results' | 'failed'>('idle');

  useEffect(() => {
    const trimmed = query.trim();
    if (!available || disabled || trimmed.length < 3) {
      requestGeneration.current += 1;
      setSuggestions([]);
      setHighlighted(-1);
      setStatus('idle');
      return;
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
    setQuery(place.formattedAddress);
    setSuggestions([]);
    setHighlighted(-1);
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
          value={query}
          placeholder={copy.placeholder}
          disabled={disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
          aria-busy={status === 'searching'}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </label>
      {suggestions.length > 0 ? (
        <ul id={listId} role="listbox" className={styles.searchSuggestions}>
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
