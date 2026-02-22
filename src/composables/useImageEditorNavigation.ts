import { ref, computed } from 'vue';

export type ImageEditorNavigationContext = {
  imageSrc: string;
  onSave: (blob: Blob) => Promise<void> | void;
  onClose?: () => void;
};

const editorContext = ref<ImageEditorNavigationContext | null>(null);

export const setImageEditorNavigationContext = (context: ImageEditorNavigationContext) => {
  editorContext.value = context;
};

export const clearImageEditorNavigationContext = () => {
  editorContext.value = null;
};

export const useImageEditorNavigationContext = () => {
  return {
    editorContext: computed(() => editorContext.value)
  };
};
