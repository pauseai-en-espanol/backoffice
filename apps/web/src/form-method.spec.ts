import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The apps whose pages have forms: this one, and the public census form's. */
const APPS = fileURLToPath(new URL('../..', import.meta.url));
const SOURCES = ['web/src', 'forms/src'];

const components = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? components(join(dir, entry.name))
      : entry.name.endsWith('.tsx')
        ? [join(dir, entry.name)]
        : [],
  );

describe('forms say how they are sent (PLAN R88)', () => {
  it('every form has a method, so one sent before the page comes alive never puts what was typed in its address', () => {
    const files = SOURCES.flatMap((source) => components(join(APPS, source)));
    expect(files.length).toBeGreaterThan(0);
    // Without one, a form sent before React has hydrated the page goes as a GET: a password, a person's phone or the
    // Airtable link in the address, the browser's history and every access log on the way.
    const unsaid = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/<form\b[^>]*>/gu)]
        .filter(([tag]) => !/\bmethod="(?:get|post)"/u.test(tag))
        .map(() => relative(APPS, file)),
    );
    expect(unsaid).toEqual([]);
  });
});
