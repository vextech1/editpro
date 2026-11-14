// Decides what to do with files that arrive from outside the app (shared to it, or opened with it).
import { routeFor } from './handoff.ts';
import { screenFiles, skippedMessage } from './pick.ts';

export interface IncomingPlan { to?: string; files: File[]; message: string }
/** Keep the PDFs and pictures, say which studio tab they open in, and explain anything that was skipped. */
export async function planIncoming(list: File[]): Promise<IncomingPlan> {
  const { files, skipped } = await screenFiles(list, 'image/*,application/pdf');
  const to = routeFor(files);
  return to ? { to, files, message: skippedMessage(skipped) } : { files: [], message: skippedMessage(skipped) || 'Choose a PDF or a picture.' };
}
