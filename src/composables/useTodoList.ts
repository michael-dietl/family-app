import { ref } from 'vue';
import { db, type TodoList, type TodoItem } from '@/services/database';

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
    } catch (error) {
      console.error('Error loading todo items:', error);
    } finally {
      isLoading.value = false;
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

  const createItem = async (listId: number, title: string, description?: string, photoPath?: string): Promise<number> => {
    const id = await db.createTodoItem({
      listId,
      title,
      description,
      completed: false,
      photoPath: photoPath || null
    } as any);
    await loadItems(listId);
    return id;
  };

  const toggleItemCompleted = async (id: number, completed: boolean, listId: number) => {
    await db.updateTodoItem(id, { completed });
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
  };
}
