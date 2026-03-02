import { writeBlobToSharedStorage } from '@/services/storagePaths';
import { base64ToBlob } from '@/utils/filerobotEditor';

const EDITOR_SAVE_PATH = '/api/editor/save';

export type EditorSavePayload = {
  base64: string;
  mimeType?: string;
  folder: string;
  prefix?: string;
  identifier?: number | string;
  extension?: string;
};

const resolveRequestUrl = (info: RequestInfo | URL): string => {
  if (typeof info === 'string') {
    return info;
  }
  if (info instanceof Request) {
    return info.url;
  }
  return info.toString();
};

const respondJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });

const savePayloadToSharedStorage = async (payload: EditorSavePayload) => {
  const { base64, mimeType = 'image/jpeg', folder, prefix, identifier, extension } = payload;
  if (!base64) {
    throw new Error('Missing base64 payload');
  }
  if (!folder) {
    throw new Error('Target folder required');
  }

  const blob = base64ToBlob(base64, mimeType);
  const uri = await writeBlobToSharedStorage(blob, {
    folder,
    prefix,
    identifier,
    extension
  });
  return uri;
};

const handleEditorSaveRequest = async (init?: RequestInit) => {
  if (!init) {
    return respondJson({ error: 'No request data' }, 400);
  }
  if (init.method && init.method.toUpperCase() !== 'POST') {
    return respondJson({ error: 'Method not allowed' }, 405);
  }
  if (!init.body) {
    return respondJson({ error: 'Empty request body' }, 400);
  }

  let rawBody: string;
  if (typeof init.body === 'string') {
    rawBody = init.body;
  } else {
    rawBody = await new Response(init.body as BodyInit).text();
  }

  try {
    const payload = JSON.parse(rawBody) as EditorSavePayload;
    const uri = await savePayloadToSharedStorage(payload);
    return respondJson({ uri });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn('Editor save endpoint failed', message);
    return respondJson({ error: message }, 500);
  }
};

declare global {
  interface Window {
    __editorSaveEndpointRegistered?: boolean;
  }
}

export const registerEditorSaveEndpoint = () => {
  if (typeof window === 'undefined') return;
  if ((window as Window & { __editorSaveEndpointRegistered?: boolean }).__editorSaveEndpointRegistered) {
    return;
  }

  const originalFetch = window.fetch;
  (window as Window & { __editorSaveEndpointRegistered?: boolean }).__editorSaveEndpointRegistered = true;

  window.fetch = async (input, init) => {
    const requestUrl = resolveRequestUrl(input);
    const normalizedUrl = new URL(requestUrl, window.location.href);
    if (normalizedUrl.pathname === EDITOR_SAVE_PATH) {
      return handleEditorSaveRequest(init);
    }
    return originalFetch(input, init);
  };
};
