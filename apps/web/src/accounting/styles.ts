import { css } from '@styled-system/css';

/** The books' own look, on top of ui/styles and onboarding/styles: amounts in columns, a manual entry's lines. */

/** An amount in a table: right-aligned, every digit the same width, so columns of euros line up. */
export const amount = css({
  textAlign: 'end !important',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
});

/** A total's row: set apart from the rows above it. */
export const totalRow = css({
  '& th, & td': { fontWeight: 'bold', borderBlockStartWidth: '2px', borderColor: 'border.default' },
});

/** A group's row in a report (the chart's group), its accounts under it. */
export const groupRow = css({ '& th, & td': { fontWeight: 'bold', bg: 'bg.subtle' } });

/** An account under its group, indented. */
export const indented = css({ paddingInlineStart: '8 !important' });

/** One line of a manual entry: the account, then the debit and the credit, side by side once there is room. */
export const lineRow = css({
  display: 'grid',
  gap: '3',
  gridTemplateColumns: { base: '1fr', md: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto' },
  alignItems: 'end',
  paddingBlock: '3',
  borderBlockEndWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'border.subtle',
});

/** What a manual entry adds up to, said as it is typed. */
export const balance = css({ fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' });

/** A sub-account's code, as wide as the longest, so the chart's names line up. */
export const code = css({ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' });

/** An account's name in the chart, indented by how deep it sits (`data-depth`): a group, its accounts, theirs. */
export const chartName = css({
  '&[data-depth="1"]': { paddingInlineStart: '8 !important' },
  '&[data-depth="2"]': { paddingInlineStart: '12 !important' },
  '&[data-depth="3"]': { paddingInlineStart: '16 !important' },
});
