import { describe, expect, it } from 'vitest';
import { checkReason, deleteRecord, pullStudentFile, retryPieces, type ModerationStore } from '../src/lib/core/moderation';
import type { UserFile } from '../src/lib/core/user-library';

const file: UserFile = { id: 'fabcdefgh123', uploader: 'user1', title: 'Class notes', name: 'notes.pdf', size: 20_000, ext: 'pdf', section: 's', cls: 'c', category: 'notes', added: '2026-11-16', parts: 1, status: 'live' };
function makeStore(failCleanup = false) {
  const events: string[] = [];
  const store: ModerationStore = {
    async markPulled(_file, reason, id, notice) { events.push(`pull:${reason}:${id}:${notice.reason}`); },
    async deleteParts() { events.push('parts'); if (failCleanup) throw new Error('offline'); },
    async markCleaned() { events.push('cleaned'); },
    async deleteFile() { events.push('delete'); }
  };
  return { store, events };
}

describe('moderation', () => {
  it('normalizes and validates a removal reason', () => {
    expect(checkReason('  copied   material ')).toEqual({ ok: true, reason: 'copied material' });
    expect(checkReason('no').ok).toBe(false); expect(checkReason('x'.repeat(501)).ok).toBe(false);
  });
  it('marks a live file pulled with a notice before attempting cleanup', async () => {
    const { store, events } = makeStore();
    expect(await pullStudentFile(store, file, 'Not study material.', () => 'notice1', new Date('2026-11-16T00:00:00Z'))).toEqual({ cleaned: true });
    expect(events).toEqual(['pull:Not study material.:notice1:Not study material.', 'parts', 'cleaned']);
  });
  it('does not pull an invalid or already pulled file', async () => {
    const { store, events } = makeStore();
    await expect(pullStudentFile(store, file, 'x', () => 'n')).rejects.toThrow();
    await expect(pullStudentFile(store, { ...file, status: 'pulled' }, 'duplicate', () => 'n')).rejects.toThrow();
    expect(events).toEqual([]);
  });
  it('leaves a pulled record for cleanup retry after storage failure', async () => {
    const { store, events } = makeStore(true);
    expect(await pullStudentFile(store, file, 'Not study material.', () => 'notice1')).toEqual({ cleaned: false });
    expect(await retryPieces(store, file)).toBe(false);
    expect(events[0]).toContain('pull:');
  });
  it('deletes pieces before the record', async () => {
    const { store, events } = makeStore(); await deleteRecord(store, file);
    expect(events).toEqual(['parts', 'delete']);
  });
});
