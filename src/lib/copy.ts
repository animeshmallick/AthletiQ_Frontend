import { toast } from 'sonner';

/** Copies text; says so when the device refuses (so nobody believes it was copied). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast.error('Could not copy', { description: 'Select the text and copy it instead.' });
    return false;
  }
}
