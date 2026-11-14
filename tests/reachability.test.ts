import { describe, it, expect } from 'vitest';
import { STUDIO_CROSSINGS, type CrossingSource } from '../src/lib/core/crossings';
import { picturesGoTo } from '../src/lib/core/intake';
import { allToolRows, groupTiles, studioGroups, studioTools } from '../src/lib/core/studio-tools';
import { fileKind, tabInput, toolSupports, workspaceById, workspaceFor, workspaceSupports, workspaces, type FileKind, type WorkspaceId } from '../src/lib/core/workspaces';
import { tools } from '../src/lib/tools';

// What each crossing source hands over. A Record over every source, so adding a source without saying what it sends fails type-checking.
const SENDS: Record<CrossingSource, FileKind> = {
  'image-menu': 'image', 'image-result': 'image', 'image-pdf-result': 'pdf', 'pdf-image-result': 'image', 'scan-page': 'image'
};
const IDS = ['image', 'document'] as const;

describe('every crossing lands somewhere', () => {
  for (const c of STUDIO_CROSSINGS) {
    const kind = SENDS[c.source];
    describe(`${c.source} > ${c.label}`, () => {
      it('goes to a real tab of a real studio, and that tab takes exactly what is sent', () => {
        const ws = workspaceById(c.studio);
        expect(ws, 'studio').toBeDefined(); expect(ws!.tabs).toContain(c.tab);
        expect(workspaceFor(c.tab)?.id).toBe(c.studio);
        expect(tabInput(c.tab)).toBe(kind);          // sendTo refuses anything else
        expect(toolSupports(c.tab, kind)).toBe(true);
        expect(workspaceSupports(ws!, kind)).toBe(true);
      });
      if (c.delivery === 'pending' && kind === 'image') {
        it('is not asked about again: pictures sent to a chosen tool go straight to it', () => {
          // The studio asks "what do you want to do with these pictures?" unless a tool was already chosen. This is the bug it guards.
          expect(picturesGoTo(c.studio, c.tab), `${c.tab} would re-ask`).toBe(c.tab);
        });
      }
    });
  }
  it('has no source that nothing uses, and no label repeated within a source', () => {
    for (const source of Object.keys(SENDS) as CrossingSource[]) {
      const own = STUDIO_CROSSINGS.filter((c) => c.source === source);
      expect(own.length, source).toBeGreaterThan(0);
      expect(new Set(own.map((c) => c.label)).size, `${source} labels`).toBe(own.length);   // CrossingActions keys its buttons by label
    }
  });
  it('only knows file kinds the studios can actually open', () => {
    for (const kind of new Set(Object.values(SENDS))) expect(fileKind(kind === 'pdf' ? 'application/pdf' : 'image/png')).toBe(kind);
  });
});

describe('every tool can be reached from a dock', () => {
  // The kind of file a tool works on: its registry input, or the studio's own kind for the editor's built-in tools (Crop, Export).
  const inputOf = (studio: WorkspaceId, slug?: string): FileKind => (slug ? tabInput(slug) : studio === 'image' ? 'image' : 'pdf');
  for (const studio of IDS) {
    describe(studio, () => {
      for (const tool of studioTools(studio)) {
        it(`${tool.label}: its group tile is on when the right file is open, and when no file is`, () => {
          const group = studioGroups(studio).find((g) => g.tools.includes(tool.id))!;
          expect(group, 'in a group').toBeDefined();
          for (const kind of [inputOf(studio, tool.slug), undefined]) {
            const tile = groupTiles(studio, group.id, kind).find((t) => t.id === tool.id);
            expect(tile, `tile (${kind ?? 'no file'})`).toBeDefined(); expect(tile!.disabled, `${kind ?? 'no file'}`).toBe(false);
          }
        });
        it(`${tool.label}: shows in All tools, on, for the right file`, () => {
          const row = allToolRows(studio, inputOf(studio, tool.slug)).find((r) => r.studio === studio && r.tool.id === tool.id);
          expect(row, 'row').toBeDefined(); expect(row!.disabled).toBe(false);
        });
      }
    });
  }
  it('puts every tool of the registry on a dock of the studio that owns it', () => {
    for (const t of tools) {
      const ws = workspaceFor(t.slug);
      expect(ws, `${t.slug} belongs to a studio`).toBeDefined();
      expect(studioTools(ws!.id).some((x) => x.slug === t.slug), `${t.slug} has a dock button in ${ws!.id}`).toBe(true);
    }
  });
  it('has exactly the two studios, and no tool in both', () => {
    expect(workspaces.map((w) => w.id).sort()).toEqual([...IDS].sort());
    const seen = new Map<string, WorkspaceId>();
    for (const s of IDS) for (const t of studioTools(s)) if (t.slug) { expect(seen.has(t.slug), `${t.slug} twice`).toBe(false); seen.set(t.slug, s); }
  });
});
