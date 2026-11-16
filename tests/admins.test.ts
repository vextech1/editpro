import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ADMINS_COLLECTION, isValidEmail, normalizeEmail, sortedAdmins } from '../src/lib/core/admins';

describe('admin emails', () => {
  it('tidies an email the way the sign-in token and the rules compare it', () => {
    expect(normalizeEmail('  Helper@Gmail.COM ')).toBe('helper@gmail.com');
  });
  it('accepts a normal email after normalising it', () => { expect(isValidEmail(' Helper@Gmail.com ')).toBe(true); });
  it.each(['', '   ', 'plain', 'a@b', '@x.com', 'a@@x.com', 'a b@x.com', 'a/b@x.com', 'a@x/y.com', 'a\\b@x.com', 'x'.repeat(250) + '@x.com'])('refuses %j', (bad) => {
    expect(isValidEmail(bad)).toBe(false);
  });
  it('sorts the saved list and drops blanks and repeats', () => { expect(sortedAdmins(['b@x.com', 'A@x.com', 'b@x.com', ' '])).toEqual(['a@x.com', 'b@x.com']); });
  it('uses the new helper collection while retaining the legacy collection for existing records', () => { expect(ADMINS_COLLECTION).toBe('libraryAdmins'); });
});

// The rules cannot be run here (that needs the Firebase emulator), so these check the text for the rules that matter most.
describe('firestore rules for admins', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  const block = (header: string) => rules.slice(rules.indexOf(header), rules.indexOf('}', rules.indexOf(header) + header.length + 40) + 1);
  it('keeps one owner email in the rules, and checks the owner before any lookup', () => {
    expect(rules).toMatch(/function isOwner\(\)[\s\S]*email in \['[^']+@[^']+'\]/);
    expect(rules).toMatch(/return isOwner\(\)\s*\|\|/);
  });
  it('needs a verified email for the owner and for helpers', () => {
    expect(rules).toMatch(/function isOwner\(\)[\s\S]*email_verified == true/);
    expect(rules).toMatch(/function isAdmin\(\)[\s\S]*email_verified == true/);
  });
  it('finds helpers in either collection by their lower-case email document', () => {
    expect(rules).toMatch(/exists\(\/databases\/\$\(database\)\/documents\/libraryAdmins\/\$\(request\.auth\.token\.email\.lower\(\)\)\)/);
    expect(rules).toMatch(/exists\(\/databases\/\$\(database\)\/documents\/admins\/\$\(request\.auth\.token\.email\.lower\(\)\)\)/);
  });
  it('lets only the owner list, add or remove helpers', () => {
    for (const name of ['libraryAdmins', 'admins']) {
      const admins = block(`match /${name}/{email}`);
      expect(admins).toMatch(/allow read, delete: if isOwner\(\)/); expect(admins).toMatch(/allow create, update: if isOwner\(\)/);
      expect(admins).not.toMatch(/isAdmin\(\)/);
    }
  });
  it('only accepts lower-case helper ids and the added field', () => {
    for (const name of ['libraryAdmins', 'admins']) {
      const admins = block(`match /${name}/{email}`);
      expect(admins).toMatch(/email == email\.lower\(\)/); expect(admins).toMatch(/hasOnly\(\['added'\]\)/);
    }
  });
  it('still lets admins (not just the owner) write the Library and the pieces', () => {
    expect(rules).toMatch(/match \/library\/\{doc\}[\s\S]*allow write: if isAdmin\(\)/);
    expect(rules).toMatch(/libraryChunks[\s\S]*allow create, update: if isAdmin\(\)[\s\S]*allow delete: if isAdmin\(\)/);
  });
  it('has no rule that opens writes to everyone', () => { expect(rules).not.toMatch(/allow (write|create|update|delete)[^;]*:\s*if true/); });
  it('allows public document reads but not public collection listing', () => {
    expect(rules).toMatch(/match \/library\/\{doc\}[\s\S]*allow get: if true/);
    expect(rules).toMatch(/libraryChunks[\s\S]*allow get: if true/);
    expect(rules).not.toMatch(/allow read: if true/);
  });
});
