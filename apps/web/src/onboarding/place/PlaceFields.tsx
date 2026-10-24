'use client';

import { Combobox, useListCollection } from '@ark-ui/react/combobox';
import {
  COUNTRY_GROUPS,
  countryMatches,
  countryName,
  regionMatches,
  regionsOf,
  SPAIN,
} from '@backoffice/domain/places';
import { useEffect, useMemo, useState } from 'react';

import { Icon } from '@/ui/Icon';
import { icons } from '@/ui/icons';
import * as ui from '@/ui/styles';

import type { PlaceText } from './text';

import * as styles from './styles';

interface Choice {
  value: string;
  label: string;
  group: 'spain' | 'latinAmerica' | 'world' | 'regions';
  /** A region's country, which its other names are looked up in. */
  country?: string;
}

const COUNTRIES: readonly Choice[] = COUNTRY_GROUPS.flatMap(({ group, codes }) =>
  codes.map((code) => ({ value: code, label: countryName(code), group })),
);

/** A country's regions as choices (PLAN R83): Spain's provinces while it's Spain or not said. */
const regionChoices = (country: string): Choice[] =>
  regionsOf(country).map((region) => ({
    value: region,
    label: region,
    group: 'regions',
    country: country || SPAIN,
  }));

/** What a picker needs of its field: the input's id, and its hint's when it has one. */
interface FieldIds {
  id: string;
  label: string;
  hint?: string | undefined;
}

const Options = ({
  choices,
  groups,
}: {
  choices: ReturnType<typeof useListCollection<Choice>>['collection'];
  groups: Readonly<Partial<Record<Choice['group'], string>>>;
}) =>
  choices.group().map(([group, items]) => (
    <Combobox.ItemGroup key={group}>
      {groups[group as Choice['group']] ? (
        <Combobox.ItemGroupLabel className={styles.groupLabel}>
          {groups[group as Choice['group']]}
        </Combobox.ItemGroupLabel>
      ) : null}
      {items.map((item) => (
        <Combobox.Item key={item.value} item={item} className={styles.item}>
          <Combobox.ItemText>{item.label}</Combobox.ItemText>
          <Combobox.ItemIndicator>
            <Icon icon={icons.selected} size={16} />
          </Combobox.ItemIndicator>
        </Combobox.Item>
      ))}
    </Combobox.ItemGroup>
  ));

/**
 * A country, picked by typing part of its name, accents or not (PLAN R74): Spain first, then Latin America, then the
 * rest of the world. Only a country of the list is kept; the form sends its code, in a hidden field.
 */
export const CountryField = ({
  id,
  name,
  label,
  hint,
  value,
  onChange,
  text,
}: FieldIds & {
  name: string;
  /** Its code, or '' for none. */
  value: string;
  onChange: (code: string) => void;
  text: PlaceText;
}) => {
  const { collection, filter } = useListCollection({
    initialItems: COUNTRIES,
    // By any of its names, in Spanish or English, accents aside ("alem", "Germ", "EEUU").
    filter: (_text, query, item) => countryMatches(item.value, query),
    groupBy: (item) => item.group,
    groupSort: ['spain', 'latinAmerica', 'world'],
  });
  return (
    <Combobox.Root
      className={ui.field}
      collection={collection}
      value={value === '' ? [] : [value]}
      defaultInputValue={value === '' ? '' : countryName(value)}
      onInputValueChange={(details) => filter(details.inputValue)}
      onValueChange={(details) => onChange(details.value[0] ?? '')}
      openOnClick
      positioning={{ sameWidth: true }}
      ids={{ input: id, label: `${id}-etiqueta` }}
      translations={{ triggerLabel: text.openCountries, clearTriggerLabel: text.clearCountry }}
    >
      <Combobox.Label className={ui.label}>{label}</Combobox.Label>
      <Combobox.Control className={styles.control}>
        <Combobox.Input
          className={styles.input}
          placeholder={text.countryPlaceholder}
          aria-describedby={hint ? `${id}-pista` : undefined}
        />
        <Combobox.ClearTrigger className={styles.iconButton}>
          <Icon icon={icons.clear} size={18} />
        </Combobox.ClearTrigger>
        <Combobox.Trigger className={styles.iconButton}>
          <Icon icon={icons.open} size={18} />
        </Combobox.Trigger>
      </Combobox.Control>
      {hint ? (
        <span id={`${id}-pista`} className={ui.hint}>
          {hint}
        </span>
      ) : null}
      <Combobox.Positioner className={styles.positioner}>
        <Combobox.Content className={styles.content}>
          <Combobox.Empty className={styles.empty}>{text.noCountry}</Combobox.Empty>
          <Options
            choices={collection}
            groups={{
              spain: undefined,
              latinAmerica: text.latinAmerica,
              world: text.world,
            }}
          />
        </Combobox.Content>
      </Combobox.Positioner>
      <input type="hidden" name={name} value={value} />
    </Combobox.Root>
  );
};

/**
 * A province or region, as typed (PLAN R74): the country's are offered as it's typed, Spain's while it's Spain or not
 * said, and those of Latin America and the United States (PLAN R83); anything else is kept too (a region elsewhere, or
 * how someone wrote it before).
 */
export const ProvinceField = ({
  id,
  name,
  label,
  hint,
  defaultValue,
  country,
  onChange,
  text,
}: FieldIds & {
  name: string;
  defaultValue: string;
  /** The country picked, its code, or '' for none: whose regions to offer. */
  country: string;
  /** What it says now, typed or picked. */
  onChange?: ((value: string) => void) | undefined;
  text: PlaceText;
}) => {
  const regions = useMemo(() => regionChoices(country), [country]);
  const suggest = regions.length > 0;
  const { collection, filter, set } = useListCollection<Choice>({
    initialItems: regions,
    // By any of its names ("vizc" finds Bizkaia, "lérid" Lleida, "cdmx" Ciudad de México).
    filter: (_text, query, item) => regionMatches(item.country, item.value, query),
  });
  // The country changed: what was typed stays, and only the suggestions follow.
  useEffect(() => {
    set(regions);
  }, [regions, set]);
  return (
    <Combobox.Root
      className={ui.field}
      collection={collection}
      name={name}
      defaultInputValue={defaultValue}
      onInputValueChange={(details) => {
        filter(details.inputValue);
        onChange?.(details.inputValue);
      }}
      allowCustomValue
      openOnClick={suggest}
      openOnChange={suggest}
      inputBehavior="none"
      positioning={{ sameWidth: true }}
      ids={{ input: id, label: `${id}-etiqueta` }}
      translations={{
        triggerLabel: !country || country === SPAIN ? text.openProvinces : text.openRegions,
      }}
    >
      <Combobox.Label className={ui.label}>{label}</Combobox.Label>
      <Combobox.Control className={styles.control}>
        <Combobox.Input
          className={styles.input}
          maxLength={100}
          aria-describedby={hint ? `${id}-pista` : undefined}
        />
        {suggest ? (
          <Combobox.Trigger className={styles.iconButton}>
            <Icon icon={icons.open} size={18} />
          </Combobox.Trigger>
        ) : null}
      </Combobox.Control>
      {hint ? (
        <span id={`${id}-pista`} className={ui.hint}>
          {hint}
        </span>
      ) : null}
      {suggest ? (
        <Combobox.Positioner className={styles.positioner}>
          <Combobox.Content className={styles.content}>
            <Options choices={collection} groups={{}} />
          </Combobox.Content>
        </Combobox.Positioner>
      ) : null}
    </Combobox.Root>
  );
};

/**
 * Where someone lives, or where they're from (PLAN R74): the country, then the province or region, the country's
 * offered (Spain's while it's not said), and, where it's asked, the town. The form reads them by their names.
 */
export const PlaceFields = ({
  prefix,
  names,
  initial,
  onProvinceChange,
  text,
}: {
  /** The fields' ids start with it ("perfil", "perfil-origen"). */
  prefix: string;
  names: { country: string; province: string; town?: string };
  initial: { country: string | null; province: string | null; town?: string | null };
  /** The province as it's typed: Añadir rápido looks for duplicates by it. */
  onProvinceChange?: (value: string) => void;
  text: PlaceText;
}) => {
  const [country, setCountry] = useState(initial.country ?? '');
  const hint =
    country === '' || country === SPAIN
      ? text.provinceHint
      : regionsOf(country).length > 0
        ? text.regionListHint
        : text.regionHint;
  return (
    <>
      <CountryField
        id={`${prefix}-pais`}
        name={names.country}
        label={text.country}
        value={country}
        onChange={setCountry}
        text={text}
      />
      <ProvinceField
        id={`${prefix}-provincia`}
        name={names.province}
        label={text.province}
        hint={hint}
        defaultValue={initial.province ?? ''}
        country={country}
        onChange={onProvinceChange}
        text={text}
      />
      {names.town === undefined ? null : (
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${prefix}-localidad`}>
            {text.town}
          </label>
          <input
            id={`${prefix}-localidad`}
            className={ui.input}
            name={names.town}
            defaultValue={initial.town ?? ''}
            maxLength={100}
          />
        </div>
      )}
    </>
  );
};
