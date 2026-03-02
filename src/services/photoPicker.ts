import { Capacitor } from '@capacitor/core';

export async function pickMedia(options?: { multiple?: boolean; allowVideos?: boolean }): Promise<string[]> {
  // On Android with the injected bridge, always use the NativePhotoPicker to avoid opening
  // the legacy FilePicker UI twice.
  try {
    const isAndroid = Capacitor.getPlatform() === 'android';
    const hasBridge = typeof window !== 'undefined' && (window as any).NativePhotoPicker;
    if (isAndroid && hasBridge) {
      return new Promise((resolve) => {
        (window as any).__nativePhotoPickerCallback = (jsonStr: string) => {
          try {
            const arr = JSON.parse(jsonStr);
            resolve(arr);
          } catch (e) {
            resolve([]);
          }
        };
        try {
          (window as any).NativePhotoPicker.pick(JSON.stringify(options || {}));
        } catch (e) {
          resolve([]);
        }
      });
    }
  } catch (e) {
    // ignore and fall through to web fallback
  }

  // Fallback: use capawesome file picker dynamically (web or platforms without bridge)
  try {
    const { FilePicker } = await import('@capawesome/capacitor-file-picker');
    const limit = options?.multiple ? 0 : 1;
    const readData = false; // we only need URIs here
    const pickerOptions = { limit, readData };
    const result = options?.allowVideos
      ? await FilePicker.pickMedia(pickerOptions)
      : await FilePicker.pickImages(pickerOptions);
    if (result.files && result.files.length > 0) {
      return result.files.map((f: any) => f.path || f.uri || '');
    }
  } catch (e) {
    // ignore
  }

  return [];
}
