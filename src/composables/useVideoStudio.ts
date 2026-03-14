import { computed, ref } from 'vue';

type ClipStatus = 'idle' | 'processing' | 'ready';

export interface StudioClip {
  id: number;
  title: string;
  duration: number; // seconds
  status: ClipStatus;
}

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const initialClips: StudioClip[] = [
  { id: 1, title: 'Intro B-Roll', duration: 12, status: 'ready' },
  { id: 2, title: 'Reise-Highlights', duration: 27, status: 'ready' },
  { id: 3, title: 'Outro & Call-to-Action', duration: 9, status: 'idle' }
];

const clips = ref<StudioClip[]>(initialClips);
const nextClipId = ref(initialClips.length + 1);
const projectName = ref('Story Map Montage');
const autoEditStatus = ref<ClipStatus>('idle');

export const useVideoStudio = () => {
  const totalDuration = computed(() => clips.value.reduce((sum, clip) => sum + clip.duration, 0));
  const formattedDuration = computed(() => formatDuration(totalDuration.value));

  const addClip = (title?: string, duration?: number) => {
    const newClip: StudioClip = {
      id: nextClipId.value++,
      title: title || `Clip ${nextClipId.value}`,
      duration: duration ?? 15,
      status: 'idle'
    };
    clips.value = [...clips.value, newClip];
    return newClip;
  };

  const removeClip = (id: number) => {
    clips.value = clips.value.filter(clip => clip.id !== id);
  };

  const markClipReady = (id: number) => {
    clips.value = clips.value.map(clip => clip.id === id ? { ...clip, status: 'ready' } : clip);
  };

  const applyAutoEdit = async () => {
    autoEditStatus.value = 'processing';
    await new Promise(resolve => setTimeout(resolve, 900));
    clips.value = clips.value.map((clip, index) => ({
      ...clip,
      status: index % 2 === 0 ? 'ready' : 'processing'
    }));
    await new Promise(resolve => setTimeout(resolve, 600));
    clips.value = clips.value.map(clip => ({
      ...clip,
      status: 'ready'
    }));
    autoEditStatus.value = 'ready';
  };

  const resetAutoEdit = () => {
    autoEditStatus.value = 'idle';
  };

  return {
    clips,
    projectName,
    autoEditStatus,
    totalDuration,
    formattedDuration,
    addClip,
    removeClip,
    markClipReady,
    applyAutoEdit,
    resetAutoEdit
  };
};
