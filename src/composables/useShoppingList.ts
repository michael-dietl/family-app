import { ref } from 'vue';
import { db, type ShoppingList, type ShoppingItem } from '@/services/database';
import { syncNewShoppingItemEntry, syncNewShoppingListEntry } from '@/services/pocketbaseTodoShoppingSync';

export function useShoppingList() {
  const lists = ref<ShoppingList[]>([]);
  const currentList = ref<ShoppingList | null>(null);
  const items = ref<ShoppingItem[]>([]);
  const isLoading = ref(false);

  const loadLists = async () => {
    isLoading.value = true;
    try {
      lists.value = await db.getShoppingLists();
    } catch (error) {
      console.error('Error loading shopping lists:', error);
    } finally {
      isLoading.value = false;
    }
  };

  const loadList = async (id: number) => {
    isLoading.value = true;
    try {
      currentList.value = await db.getShoppingList(id);
    } catch (error) {
      console.error('Error loading shopping list:', error);
    } finally {
      isLoading.value = false;
    }
  };

  const loadItems = async (listId: number) => {
    isLoading.value = true;
    try {
      items.value = await db.getShoppingItems(listId);
    } catch (error) {
      console.error('Error loading shopping items:', error);
    } finally {
      isLoading.value = false;
    }
  };

  const createList = async (name: string): Promise<number> => {
    const id = await db.createShoppingList({ name });
    await loadLists();
    void syncNewShoppingListEntry(id);
    return id;
  };

  const updateList = async (id: number, updates: Partial<ShoppingList>) => {
    await db.updateShoppingList(id, updates);
    await loadLists();
    if (currentList.value?.id === id) {
      await loadList(id);
    }
  };

  const deleteList = async (id: number) => {
    await db.deleteShoppingList(id);
    await loadLists();
  };

  const createItem = async (listId: number, name: string, quantity?: number): Promise<number> => {
    const id = await db.createShoppingItem({
      listId,
      name,
      quantity,
      completed: false
    });
    await loadItems(listId);
    void syncNewShoppingItemEntry(id);
    return id;
  };

  const toggleItemCompleted = async (id: number, completed: boolean, listId: number) => {
    await db.updateShoppingItem(id, { completed });
    await loadItems(listId);
  };

  const updateItem = async (id: number, updates: Partial<ShoppingItem>, listId: number) => {
    await db.updateShoppingItem(id, updates);
    await loadItems(listId);
  };

  const updateItemOrder = async (listId: number, orderedIds: number[], completed: boolean) => {
    for (let index = 0; index < orderedIds.length; index += 1) {
      await db.updateShoppingItem(orderedIds[index], {
        sortOrder: index + 1,
        completed
      });
    }
    await loadItems(listId);
  };

  const deleteItem = async (id: number, listId: number) => {
    await db.deleteShoppingItem(id);
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
    updateItemOrder,
    deleteItem
  };
}
