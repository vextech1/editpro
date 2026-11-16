import { diagnoseImageFailure } from '#lib/core/image-errors.ts';

export async function imageFailed(error: unknown, file: File): Promise<string> {
  return (await diagnoseImageFailure(error, file)).message;
}