import { ref } from 'vue';
import { db, type TimelineEvent, type TimelineEventPhoto } from '@/services/database';

type PickedPhoto = { path: string | null; data?: string | null };

const resolveFilename = (input: string | null | undefined, fallback: string) => {
  if (!input) return fallback;
  const sanitized = input.split('?')[0];
  const segments = sanitized.split('/');
  const candidate = segments[segments.length - 1];
  return candidate || fallback;
};

export function useTimeline() {
  const events = ref<TimelineEvent[]>([]);
  const attachments = ref<Record<number, TimelineEventPhoto[]>>({});

  const loadEvents = async () => {
    const loaded = await db.getTimelineEvents();
    const map: Record<number, TimelineEventPhoto[]> = {};

    await Promise.all(
      loaded.map(async (event) => {
        if (!event.id) return;
        map[event.id] = await db.getTimelineEventPhotos(event.id);
      })
    );

    events.value = loaded;
    attachments.value = map;
  };

  const createManualEvent = async (payload: Omit<TimelineEvent, 'id' | 'created'>) => {
    const id = await db.createTimelineEvent(payload);
    await loadEvents();
    return id;
  };

  const addEventPhotos = async (eventId: number, photos: PickedPhoto[]) => {
    if (!eventId || photos.length === 0) return;

    for (let index = 0; index < photos.length; index += 1) {
      const photo = photos[index];
      const filepath = photo.path || photo.data || '';
      if (!filepath) continue;
      const filename = resolveFilename(filepath, `event-${eventId}-${index + 1}`);

      await db.createTimelineEventPhoto({
        eventId,
        filename,
        filepath
      });
    }

    attachments.value = {
      ...attachments.value,
      [eventId]: await db.getTimelineEventPhotos(eventId)
    };
  };

  return {
    events,
    attachments,
    loadEvents,
    createManualEvent,
    addEventPhotos
  };
}
