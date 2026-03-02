import { EditorSavePayload } from '@/services/editorSaveEndpoint';

const EDITOR_SAVE_API = '/api/editor/save';

export const saveImageViaEditorEndpoint = async (payload: EditorSavePayload): Promise<string> => {
  const response = await fetch(EDITOR_SAVE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || 'Editor save failed');
  }

  const data = await response.json();
  if (!data || typeof data.uri !== 'string') {
    throw new Error('Editor save returned invalid response');
  }

  return data.uri;
};
