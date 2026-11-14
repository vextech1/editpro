import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_ADMINS, checkAdminEmail, normalizeEmail, sortedAdmins } from '../src/lib/core/admins';

describe('admin emails', () => {
  it('tidies an email the way the sign-in token and the rules compare it', () => {
    expect(normalizeEmail('  Helper@Gmail.COM ')).toBe('helper@gmail.com');
  });
  it('accepts a normal email, lower-cased', () => { expect(checkAdminEmail(' Helper@Gmail.com ')).toEqual({ ok: true, email: 'helper@gmail.com' }); });
  it.each(['', '   ', 'plain', 'a@b', '@x.com', 'a@@x.com', 'a b@x.com', 'a/b@x.com', 'a@x/y.com', 'a\\b@x.com', 'x'.repeat(250) + '@x.com'])('refuses %j', (bad) => {
    expect(checkAdminEmail(bad).ok).toBe(false);
  });
  it('says so when the email is the owner or already added, ignoring capitals', () => {
    const owner = checkAdminEmail('OWNER@x.com', [], 'owner@x.com'); expect(owner.ok).toBe(false); if (!owner.ok) expect(owner.reason).toMatch(/owner/);
    const dup = checkAdminEmail('A@x.com', ['a@X.com']); expect(dup.ok).toBe(false); if (!dup.ok) expect(dup.reason).toMatch(/already/);
  });
  it('stops at the most admins allowed', () => {
    const full = Array.from({ length: MAX_ADMINS }, (_, i) => `u${i}@x.com`);
    expect(checkAdminEmail('new@x.com', full).ok).toBe(false); expect(checkAdminEmail('new@x.com', full.slice(1)).ok).toBe(true);
  });
  it('sorts the saved list and drops blanks and repeats', () => { expect(sortedAdmins(['b@x.com', 'A@x.com', 'b@x.com', ' '])).toEqual(['a@x.com', 'b@x.com']); });
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
    expect(rules).toMatch(/function signedIn\(\)[\s\S]*email_verified == true/);
    expect(rules).toMatch(/isOwner\(\)\s*\{\s*return signedIn\(\)/);
  });
  it('finds a helper by their lower-case email document', () => { expect(rules).toMatch(/exists\(\/databases\/\$\(database\)\/documents\/admins\/\$\(request\.auth\.token\.email\.lower\(\)\)\)/); });
  it('lets only the owner list, add or remove helpers', () => {
    const admins = block('match /admins/{email}');
    expect(admins).toMatch(/allow list: if isOwner\(\)/); expect(admins).toMatch(/allow create, update: if isOwner\(\)/); expect(admins).toMatch(/allow delete: if isOwner\(\)/);
    expect(admins).not.toMatch(/isAdmin\(\)/);
  });
  it('only accepts a lower-case email id and nothing but the date field', () => {
    const admins = block('match /admins/{email}');
    expect(admins).toMatch(/email == email\.lower\(\)/); expect(admins).toMatch(/hasOnly\(\['added'\]\)/);
  });
  it('still lets admins (not just the owner) write the Library and the pieces', () => {
    expect(rules).toMatch(/match \/library\/\{doc\}[\s\S]*allow write: if isAdmin\(\)/);
    expect(rules).toMatch(/libraryChunks[\s\S]*allow create, update: if isAdmin\(\)[\s\S]*allow delete: if isAdmin\(\)/);
  });
  it('has no rule that opens writes to everyone', () => { expect(rules).not.toMatch(/allow (write|create|update|delete)[^;]*:\s*if true/); });
});
