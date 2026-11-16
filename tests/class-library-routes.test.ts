import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES = join(__dirname, '..', 'src', 'routes');
const dirs = (d: string): string[] => [d, ...readdirSync(d).map((n) => join(d, n)).filter((p) => statSync(p).isDirectory()).flatMap(dirs)];

describe('routes that are not prerendered (the site is static)', () => {
  it('have no +page.server.ts: a static host cannot run it, so the visitor would get "not found" instead of the page', () => {
    const clashes = dirs(ROUTES).filter((d) => existsSync(join(d, '+page.ts')) && existsSync(join(d, '+page.server.ts'))
      && /prerender\s*=\s*false/.test(readFileSync(join(d, '+page.ts'), 'utf8')));
    expect(clashes.map((d) => d.slice(ROUTES.length))).toEqual([]);
  });
  it('the old-link redirect pages exist only as client-side routes', () => {
    for (const d of ['class-library/[section]', 'class-library/[section]/[slug]']) {
      expect(existsSync(join(ROUTES, d, '+page.ts'))).toBe(true); expect(existsSync(join(ROUTES, d, '+page.server.ts'))).toBe(false);
    }
  });
  it('the real viewer route is still prerendered', () => expect(readFileSync(join(ROUTES, 'class-library/file/+page.server.ts'), 'utf8')).toMatch(/prerender\s*=\s*true/));
});
