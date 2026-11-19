import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import CreditBox from '../src/lib/components/CreditBox.svelte';
import ClassFileRow from '../src/lib/components/ClassFileRow.svelte';
import type { ClassFile } from '../src/lib/core/class-library';

const THUMB = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const base: ClassFile = { id: 'cloud/fabc', name: 'example.com-notes.pdf', title: 'Week 3 notes', size: 0, ext: 'pdf', category: 'notes', added: '2026-11-18', cloud: { id: 'fabc', parts: 0 } };
const html = (component: unknown, props: Record<string, unknown>) => render(component as never, { props: props as never }).body;

describe('CreditBox', () => {
  it('shows attribution and safe external links', () => {
    const out = html(CreditBox, { credit: { by: 'Dr Jane Doe', link: 'https://www.example.org/paper', license: 'CC BY 4.0', note: 'Thanks to the department.\nUsed with permission.' }, hostedAt: 'https://files.example.com/a.pdf' });
    expect(out).toContain('Source and acknowledgement');
    expect(out).toContain('Dr Jane Doe'); expect(out).toContain('CC BY 4.0'); expect(out).toContain('Thanks to the department.');
    expect(out).toContain('files.example.com'); expect(out).toContain('example.org');
    expect(out).toContain('href="https://www.example.org/paper"'); expect(out).toContain('rel="noopener noreferrer"');
  });
  it('renders nothing when no attribution exists and escapes text', () => {
    expect(html(CreditBox, {})).not.toContain('Source and acknowledgement');
    const out = html(CreditBox, { credit: { by: '<img src=x onerror=alert(1)>', note: '<script>alert(1)</script>' } });
    expect(out).not.toContain('<img src=x'); expect(out).not.toContain('<script>alert'); expect(out).toContain('&lt;img');
  });
});

describe('ClassFileRow external links', () => {
  const link: ClassFile = { ...base, url: 'https://www.example.com/files/notes.pdf', thumb: THUMB, credit: { by: 'Dr Jane Doe' } };
  it('shows a thumbnail, host, credit and safe visit action', () => {
    const out = html(ClassFileRow, { file: link, pagePath: '/class-library' });
    expect(out).toContain(`src="${THUMB}"`); expect(out).toContain('Link · example.com');
    expect(out).toContain('Credit: Dr Jane Doe'); expect(out).toContain('href="https://www.example.com/files/notes.pdf"');
    expect(out).toContain('target="_blank"'); expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('Visit source'); expect(out).not.toContain('>Download<');
  });
  it('keeps normal upload downloads unchanged', () => {
    const out = html(ClassFileRow, { file: { ...base, size: 1_500_000, cloud: { id: 'fabc', parts: 2 } }, pagePath: '/class-library' });
    expect(out).toContain('Download'); expect(out).not.toContain('Visit source'); expect(out).toContain('1.43 MB');
  });
});
