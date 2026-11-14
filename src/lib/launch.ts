// Files opened with the installed app from the device (desktop Chrome and Edge "Open with"). Where the browser does not
// support this, nothing happens.
interface LaunchParams { files?: { getFile(): Promise<File> }[] }
export function listenForLaunchFiles(open: (files: File[]) => void | Promise<void>) {
  const q = (globalThis as { launchQueue?: { setConsumer(fn: (p: LaunchParams) => void): void } }).launchQueue;
  q?.setConsumer(async (p) => {
    try { const files = await Promise.all((p.files ?? []).map((h) => h.getFile())); if (files.length) await open(files); } catch { /* a file that cannot be read is skipped */ }
  });
}
