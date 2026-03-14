import PocketBase from 'pocketbase';
import { Preferences } from '@capacitor/preferences';
import { pocketbase, getPocketbaseAuthorId, setPocketbaseAuthorId } from '@/services/pocketbase';
import { db, type ShoppingItem, type ShoppingList, type TodoItem, type TodoList } from '@/services/database';

const AUTH_FIELDS = ['pocketbase_username', 'pocketbase_email', 'pocketbase_password'] as const;

const buildPayloadAuthor = <T extends Record<string, unknown>>(payload: T, authorId: string | null) => ({
  ...payload,
  pb_author: authorId ?? null
});

const readAuthValues = async () => {
  const entries = await Promise.all(AUTH_FIELDS.map(key => Preferences.get({ key })));
  return {
    username: entries[0].value || null,
    email: entries[1].value || null,
    password: entries[2].value || null
  };
};

const authenticateUserIfNeeded = async (): Promise<boolean> => {
  if (pocketbase.isAuthenticated()) {
    return true;
  }
  const pb = pocketbase.getInstance();
  if (!pb) {
    return false;
  }

  const { username, email, password } = await readAuthValues();
  const identity = username || email;
  if (!identity || !password) {
    return false;
  }

  try {
    await pb.collection('users').authWithPassword(identity, password);
    return pocketbase.isAuthenticated();
  } catch (error) {
    console.warn('PocketBase auto login failed for todo/shopping sync', error);
    return false;
  }
};

const ensurePocketbaseReady = async (): Promise<PocketBase | null> => {
  await pocketbase.initialize();
  if (!pocketbase.isConfigured()) {
    return null;
  }
  const authenticated = await authenticateUserIfNeeded();
  if (!authenticated) {
    return null;
  }
  return pocketbase.getInstance();
};

const resolveAuthorIdForSync = async (): Promise<string | null> => {
  const stored = await getPocketbaseAuthorId();
  if (stored) {
    return stored;
  }
  const pb = pocketbase.getInstance();
  const fallback = pb?.authStore?.model?.id ?? null;
  if (fallback) {
    await setPocketbaseAuthorId(fallback);
    return fallback;
  }
  return null;
};

const buildTodoListPayload = (list: TodoList) => ({
  foreignID: list.id,
  name: list.name,
  updated: list.updated
});

const buildTodoItemPayload = (item: TodoItem, remoteListId: string) => ({
  foreignID: item.id,
  listId: remoteListId,
  title: item.title,
  description: item.description || '',
  completed: Boolean(item.completed),
  photoPath: (item as any).photoPath || '',
  dueDate: (item as any).dueDate ?? null,
  completionDate: (item as any).completionDate ?? null,
  updated: item.updated
});

const buildShoppingListPayload = (list: ShoppingList) => ({
  foreignID: list.id,
  name: list.name,
  updated: list.updated
});

const buildShoppingItemPayload = (item: ShoppingItem, remoteListId: string) => ({
  foreignID: item.id,
  listId: remoteListId,
  name: item.name,
  quantity: item.quantity ?? null,
  completed: Boolean(item.completed),
  updated: item.updated
});

const createRemoteRecord = async (collection: string, payload: Record<string, unknown>, authorId: string | null) => {
  const pb = await ensurePocketbaseReady();
  if (!pb) {
    return null;
  }
  const enriched = buildPayloadAuthor(payload, authorId);
  return pb.collection(collection).create(enriched);
};

export const syncNewTodoListEntry = async (listId: number): Promise<void> => {
  const list = await db.getTodoList(listId);
  if (!list || list.foreignID) {
    return;
  }
  const authorId = await resolveAuthorIdForSync();
  try {
    const created = await createRemoteRecord('todoLists', buildTodoListPayload(list), authorId);
    if (created?.id) {
      await db.updateTodoList(listId, { foreignID: created.id });
    }
  } catch (error) {
    console.warn('PocketBase todo list sync failed', { listId, error });
  }
};

export const syncNewTodoItemEntry = async (itemId: number): Promise<void> => {
  const item = await db.getTodoItemById(itemId);
  if (!item || item.foreignID) {
    return;
  }
  let list = await db.getTodoList(item.listId);
  if (!list) {
    return;
  }
  if (!list.foreignID) {
    await syncNewTodoListEntry(list.id!);
    list = await db.getTodoList(item.listId);
  }
  if (!list?.foreignID) {
    return;
  }
  const authorId = await resolveAuthorIdForSync();
  try {
    const created = await createRemoteRecord('todoItems', buildTodoItemPayload(item, list.foreignID), authorId);
    if (created?.id) {
      await db.updateTodoItem(itemId, { foreignID: created.id });
    }
  } catch (error) {
    console.warn('PocketBase todo item sync failed', { itemId, error });
  }
};

export const syncNewShoppingListEntry = async (listId: number): Promise<void> => {
  const list = await db.getShoppingList(listId);
  if (!list || list.foreignID) {
    return;
  }
  const authorId = await resolveAuthorIdForSync();
  try {
    const created = await createRemoteRecord('shoppingLists', buildShoppingListPayload(list), authorId);
    if (created?.id) {
      await db.updateShoppingList(listId, { foreignID: created.id });
    }
  } catch (error) {
    console.warn('PocketBase shopping list sync failed', { listId, error });
  }
};

export const syncNewShoppingItemEntry = async (itemId: number): Promise<void> => {
  const item = await db.getShoppingItem(itemId);
  if (!item || item.foreignID) {
    return;
  }
  let list = await db.getShoppingList(item.listId);
  if (!list) {
    return;
  }
  if (!list.foreignID) {
    await syncNewShoppingListEntry(list.id!);
    list = await db.getShoppingList(item.listId);
  }
  if (!list?.foreignID) {
    return;
  }
  const authorId = await resolveAuthorIdForSync();
  try {
    const created = await createRemoteRecord('shoppingItems', buildShoppingItemPayload(item, list.foreignID), authorId);
    if (created?.id) {
      await db.updateShoppingItem(itemId, { foreignID: created.id });
    }
  } catch (error) {
    console.warn('PocketBase shopping item sync failed', { itemId, error });
  }
};
