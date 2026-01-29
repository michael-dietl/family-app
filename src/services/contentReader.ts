// Use the lightweight WebView JS interface `window.ContentReaderNative.readContentUri(uri)`
export async function readContentUri(uri: string): Promise<{ data: string; size?: number } | null> {
  try {
    const win = window as any;
    if (win && win.ContentReaderNative && typeof win.ContentReaderNative.readContentUri === 'function') {
      const b64 = win.ContentReaderNative.readContentUri(uri);
      if (!b64) return null;
      return { data: b64, size: b64.length * 3 / 4 };
    }
    return null;
  } catch (e) {
    console.warn('ContentReaderNative failed:', e);
    return null;
  }
}

export default { readContentUri };
