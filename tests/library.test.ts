import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  countLabel, emailLink, filterFiles, isRecent, requestMessage, shareLink, titleFromFilename, whatsappLink
} from '../src/lib/core/class-library';
import { SITE } from '../src/lib/site';

describe('Library file labels and search', () => {
  it('makes readable titles from filenames', () => {
    expect(titleFromFilename('database-systems_week-3.pdf')).toBe('Database Systems Week 3');
    expect(titleFromFilename('Intro to SQL.PDF')).toBe('Intro To SQL');
    expect(titleFromFilename('notes')).toBe('Notes');
  });

  it('matches every search word and can filter by category', () => {
    const files = [
      { title: 'Database Normalisation', name: 'week-1.pdf', category: 'notes' as const },
      { title: 'Database Indexes', name: 'week-2.pdf', category: 'assignments' as const },
      { title: 'Networking', name: 'networks.pdf', category: 'notes' as const }
    ];
    expect(filterFiles(files, { text: 'DATABASE norm' }).map((file) => file.title)).toEqual(['Database Normalisation']);
    expect(filterFiles(files, { category: 'assignments' }).map((file) => file.title)).toEqual(['Database Indexes']);
    expect(filterFiles(files, { text: 'networks', extra: (file) => file.title === 'Networking' ? 'Computer Networks' : '' })).toHaveLength(1);
    expect(filterFiles(files, { text: '' })).toHaveLength(3);
  });

  it('formats file counts', () => {
    expect(countLabel(1)).toBe('1 file');
    expect(countLabel(2)).toBe('2 files');
    expect(countLabel(0)).toBe('0 files');
  });
});

describe('Library requests and sharing', () => {
  it('writes a request and links it to the owner', () => {
    const message = requestMessage('Chapter 3 notes', 'Databases');
    expect(message).toContain('Databases');
    expect(message).toContain('Chapter 3 notes');
    expect(requestMessage('  ')).toContain('[file name or topic]');
    expect(whatsappLink(message)).toBe(`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message)}`);
    expect(emailLink(message).startsWith(`mailto:${SITE.contactEmail}?subject=`)).toBe(true);
    expect(emailLink(message)).toContain(encodeURIComponent(message));
  });

  it('shares the Library location with the file title', () => {
    const url = shareLink('Week 1 Intro', '/class-library?section=school&class=form-1');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toContain('https://editpro.site/class-library?section=school&class=form-1');
  });

  it('keeps the WhatsApp number in wa.me form', () => {
    expect(SITE.whatsapp).toMatch(/^\d{10,15}$/);
  });
});

describe('New badge', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  it('is for files added in the last two weeks, and never for undated or future ones', () => {
    expect(isRecent('2026-11-20', now)).toBe(true);
    expect(isRecent('2026-11-06', now)).toBe(true);
    expect(isRecent('2026-11-04', now)).toBe(false);
    expect(isRecent('2026-11-25', now)).toBe(false);
    expect(isRecent(undefined, now)).toBe(false);
    expect(isRecent('nonsense', now)).toBe(false);
  });
});

describe('Library app shortcut', () => {
  it('lists the Class Library as an app shortcut', () => {
    const manifest = JSON.parse(readFileSync('static/manifest.webmanifest', 'utf8'));
    expect(manifest.shortcuts.some((shortcut: { url: string }) => shortcut.url === '/class-library')).toBe(true);
  });
});