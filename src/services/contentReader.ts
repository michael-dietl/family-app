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

export async function getContentUriMeta(
  uri: string
): Promise<{ mimeType?: string; displayName?: string; size?: number } | null> {
  try {
    const win = window as any;
    if (win && win.ContentReaderNative && typeof win.ContentReaderNative.getContentUriMeta === 'function') {
      const payload = win.ContentReaderNative.getContentUriMeta(uri);
      if (!payload) return null;
      try {
        return JSON.parse(payload);
      } catch (parseError) {
        console.warn('ContentReaderNative meta parse failed:', parseError);
      }
    }
    return null;
  } catch (e) {
    console.warn('ContentReaderNative meta failed:', e);
    return null;
  }
}

export async function copyContentUriToFile(uri: string, relativePath: string): Promise<string | null> {
  try {
    const win = window as any;
    if (win && win.ContentReaderNative && typeof win.ContentReaderNative.copyContentUriToFile === 'function') {
      const out = win.ContentReaderNative.copyContentUriToFile(uri, relativePath);
      return out || null;
    }
    return null;
  } catch (e) {
    console.warn('ContentReaderNative copy failed:', e);
    return null;
  }
}

export default { readContentUri, getContentUriMeta, copyContentUriToFile };
