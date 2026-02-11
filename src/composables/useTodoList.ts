import { ref } from 'vue';
import { db, type TodoList, type TodoItem, type TodoPhoto } from '@/services/database';
import { Filesystem } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { usePhoto } from '@/composables/usePhoto';
import { buildSharedStoragePath, getSharedStorageDirectory } from '@/services/storagePaths';

export function useTodoList() {
  const lists = ref<TodoList[]>([]);
  const currentList = ref<TodoList | null>(null);
  const items = ref<TodoItem[]>([]);
  const isLoading = ref(false);

  const loadLists = async () => {
    isLoading.value = true;
    try {
      lists.value = await db.getTodoLists();
    } catch (error) {
      console.error('Error loading todo lists:', error);
    } finally {
      isLoading.value = false;
    }
  };

  const loadList = async (id: number) => {
    isLoading.value = true;
    try {
      currentList.value = await db.getTodoList(id);
    } catch (error) {
      console.error('Error loading todo list:', error);
    } finally {
      isLoading.value = false;
    }
  };

  const loadItems = async (listId: number) => {
    isLoading.value = true;
    try {
      items.value = await db.getTodoItems(listId);
      // load photos for each item
      for (const it of items.value) {
        await loadPhotosForItem(it.id!);
      }
    } catch (error) {
      console.error('Error loading todo items:', error);
    } finally {
      isLoading.value = false;
    }
  };

  const photosMap = ref<Record<number, TodoPhoto[]>>({});

  const loadPhotosForItem = async (itemId: number) => {
    try {
      const photos = await db.getTodoPhotosByItem(itemId);
      photosMap.value[itemId] = photos as TodoPhoto[];
    } catch (error) {
      console.error('Error loading photos for item', itemId, error);
      photosMap.value[itemId] = [];
    }
  };

  // Attach files (from pickMultiplePhotos or camera results) to an existing item
  const attachFilesToItem = async (
    itemId: number,
    files: Array<{ path: string | null; data?: string | null }>
  ) => {
    if (!itemId || itemId <= 0) {
      console.error('attachFilesToItem called with invalid itemId:', itemId);
      return [];
    }

    // Ensure directory
    try {
      console.log('Creating directory for todo item', itemId);
      await Filesystem.mkdir({
        path: buildSharedStoragePath('todos', itemId.toString()),
        directory: getSharedStorageDirectory(),
        recursive: true
      });
    } catch (e) {
      // ignore
      console.warn('Could not create directory (may already exist):', e);
    }

    const savedIds: number[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        let base64Data: string | null = null;
        let mime = 'image/jpeg';
        if (f.data) {
          base64Data = f.data;
        } else if (f.path) {
          // Try fetch via webview path
          try {
            const web = Capacitor.convertFileSrc(f.path);
            const res = await fetch(web);
            const blob = await res.blob();
            mime = blob.type || mime;
            base64Data = await (async () => {
              return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            })();
          } catch (e) {
            console.warn('Could not fetch file via web path', f.path, e);
          }
        }

        if (!base64Data) {
          console.warn('No base64 data available for attachment, skipping');
          continue;
        }

        const filename = `todo_${itemId}_${Date.now()}_${i}.jpg`;
        const saved = await Filesystem.writeFile({
          path: buildSharedStoragePath('todos', itemId.toString(), filename),
          data: base64Data,
          directory: getSharedStorageDirectory()
        });
        const uri = saved.uri;
        const filesize = Math.round((base64Data.length * 3) / 4);

        const photoId = await db.createTodoPhoto({
          todoItemId: itemId,
          filename,
          filepath: uri,
          mimeType: mime,
          filesize
        });

        savedIds.push(photoId);
      } catch (err) {
        console.error('Error saving attachment for item', itemId, err);
      }
    }

    // reload photos for item
    await loadPhotosForItem(itemId);
    return savedIds;
  };

  const removePhoto = async (photoId: number, itemId: number) => {
    try {
      // fetch photo record to delete file
      const photos = photosMap.value[itemId] || [];
      const p = photos.find(x => x.id === photoId as any);
      if (p && p.filepath && !p.filepath.startsWith('data:')) {
        try {
          await Filesystem.deleteFile({ path: p.filepath });
        } catch (e) {
          console.warn('Could not delete file', e);
        }
      }
      await db.deleteTodoPhoto(photoId);
      await loadPhotosForItem(itemId);
    } catch (error) {
      console.error('Error removing photo', error);
    }
  };

  const createList = async (name: string): Promise<number> => {
    const id = await db.createTodoList({ name });
    await loadLists();
    return id;
  };

  const updateList = async (id: number, updates: Partial<TodoList>) => {
    await db.updateTodoList(id, updates);
    await loadLists();
    if (currentList.value?.id === id) {
      await loadList(id);
    }
  };

  const deleteList = async (id: number) => {
    await db.deleteTodoList(id);
    await loadLists();
  };

  const createItem = async (
    listId: number,
    title: string,
    description?: string,
    dueDate?: string,
    photoPath?: string
  ): Promise<number> => {
    const id = await db.createTodoItem({
      listId,
      title,
      description,
      completed: false,
      dueDate: dueDate || null,
      completionDate: null,
      photoPath: photoPath || null
    } as any);
    await loadItems(listId);
    return id;
  };

  const toggleItemCompleted = async (id: number, completed: boolean, listId: number) => {
    const updates: Partial<TodoItem> = {
      completed,
      completionDate: completed ? new Date().toISOString() : null
    };
    await db.updateTodoItem(id, updates);
    await loadItems(listId);
  };

  const updateItem = async (id: number, updates: Partial<TodoItem>, listId: number) => {
    await db.updateTodoItem(id, updates);
    await loadItems(listId);
  };

  const deleteItem = async (id: number, listId: number) => {
    await db.deleteTodoItem(id);
    await loadItems(listId);
  };


  return {
    lists,
    currentList,
    items,
    isLoading,
    loadLists,
    loadList,
    loadItems,
    createList,
    updateList,
    deleteList,
    createItem,
    toggleItemCompleted,
    updateItem,
    deleteItem
    ,
    photosMap,
    loadPhotosForItem,
    attachFilesToItem,
    removePhoto
  };
}
