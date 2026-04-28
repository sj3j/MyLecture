import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function forceDownload(url: string, filename: string) {
  /* NEEDS_ANDROID_PERMISSION (WRITE_EXTERNAL_STORAGE) - Will import { Filesystem } from '@capacitor/filesystem' in next step */
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
