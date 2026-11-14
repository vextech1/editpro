import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const keyFiles = readdirSync(new URL('static/', root)).filter((f) => /^[A-Za-z0-9-]{8,128}\.txt$/.test(f) && f !== 'robots.txt');

describe('IndexNow', () => {
  it('has exactly one key file, so an old key is not left behind', () => {
    expect(keyFiles).toHaveLength(1);
  });
  it('the key file is named after the key and contains only the key', () => {
    const [name] = keyFiles;
    expect(readFileSync(new URL(`static/${name}`, root), 'utf8').trim()).toBe(name.slice(0, -'.txt'.length));
  });
  it('the deploy workflow runs the ping script, and a failed ping never fails the deploy', () => {
    expect(existsSync(new URL('scripts/indexnow.mjs', root))).toBe(true);
    const workflow = readFileSync(new URL('.github/workflows/web-deploy.yml', root), 'utf8');
    expect(workflow).toMatch(/Notify IndexNow[\s\S]*?continue-on-error: true[\s\S]*?node scripts\/indexnow\.mjs/);
  });
  it('the script sends to the IndexNow endpoint', () => {
    expect(readFileSync(new URL('scripts/indexnow.mjs', root), 'utf8')).toContain('https://api.indexnow.org/indexnow');
  });
});
