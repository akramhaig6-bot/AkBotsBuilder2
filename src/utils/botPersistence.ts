import { BotConfig } from '../types/bot';

export const BOTS_VAULT_KEY = 'telecraft_bots_vault_v1';
export const DELETED_BOTS_KEY = 'telecraft_deleted_bots_v1';

const IDB_NAME = 'telecraft_durable_db';
const IDB_STORE = 'kv';
const IDB_BOTS_KEY = 'bots_vault';
const IDB_DELETED_KEY = 'deleted_ids';

export interface ReconcileResult {
  mergedBots: BotConfig[];
  botsToRestoreOnServer: BotConfig[];
  serverIdsToDelete: string[];
}

function toTimestampMs(iso?: string): number {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Pure, deterministic reconciliation between server-side bots and the browser's durable vault.
 * - Any bot explicitly deleted by the user (in `deletedIds`) is excluded and marked for server cleanup.
 * - Any non-deleted bot in `localBots` missing from `serverBots` (e.g. after container restart) is
 *   preserved and queued for restoration on the server.
 * - When a bot exists in both, the copy with the newer `updatedAt` wins.
 */
export function reconcileBots(
  serverBots: BotConfig[],
  localBots: BotConfig[],
  deletedIds: string[]
): ReconcileResult {
  const deletedSet = new Set(deletedIds);
  const serverMap = new Map<string, BotConfig>();
  const localMap = new Map<string, BotConfig>();
  const serverIdsToDelete: string[] = [];

  for (const sb of serverBots) {
    if (!sb || !sb.id) continue;
    if (deletedSet.has(sb.id)) {
      serverIdsToDelete.push(sb.id);
      continue;
    }
    serverMap.set(sb.id, sb);
  }

  for (const lb of localBots) {
    if (!lb || !lb.id) continue;
    if (deletedSet.has(lb.id)) continue;
    localMap.set(lb.id, lb);
  }

  const allIds = new Set<string>([...serverMap.keys(), ...localMap.keys()]);
  const mergedBots: BotConfig[] = [];
  const botsToRestoreOnServer: BotConfig[] = [];

  for (const id of allIds) {
    const serverBot = serverMap.get(id);
    const localBot = localMap.get(id);

    if (localBot && !serverBot) {
      mergedBots.push(localBot);
      botsToRestoreOnServer.push(localBot);
    } else if (serverBot && !localBot) {
      mergedBots.push(serverBot);
    } else if (serverBot && localBot) {
      const serverTime = toTimestampMs(serverBot.updatedAt);
      const localTime = toTimestampMs(localBot.updatedAt);

      if (localTime > serverTime) {
        mergedBots.push(localBot);
        botsToRestoreOnServer.push(localBot);
      } else {
        mergedBots.push(serverBot);
      }
    }
  }

  // Keep consistent creation order (oldest first, newest appended)
  mergedBots.sort((a, b) => {
    const ta = toTimestampMs(a.createdAt);
    const tb = toTimestampMs(b.createdAt);
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });

  return {
    mergedBots,
    botsToRestoreOnServer,
    serverIdsToDelete,
  };
}

function openVaultDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openVaultDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openVaultDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function readVaultBotsSync(): BotConfig[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BOTS_VAULT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeVaultBotsSync(bots: BotConfig[]): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(BOTS_VAULT_KEY, JSON.stringify(bots));
    } catch {
      // If quota exceeded, IndexedDB fallback still stores full data
    }
  }
  void idbSet(IDB_BOTS_KEY, bots);
}

export async function readVaultBotsAsync(): Promise<BotConfig[]> {
  const lsBots = readVaultBotsSync();
  const idbBots = await idbGet<BotConfig[]>(IDB_BOTS_KEY);
  if (!idbBots || !Array.isArray(idbBots) || idbBots.length === 0) {
    return lsBots;
  }
  if (lsBots.length === 0) {
    return idbBots;
  }
  const deletedIds = readDeletedBotIdsSync();
  return reconcileBots(lsBots, idbBots, deletedIds).mergedBots;
}

export function readDeletedBotIdsSync(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DELETED_BOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeDeletedBotIdsSync(ids: string[]): void {
  const unique = Array.from(new Set(ids));
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(DELETED_BOTS_KEY, JSON.stringify(unique));
    } catch {
      // ignore storage errors
    }
  }
  void idbSet(IDB_DELETED_KEY, unique);
}

export async function readDeletedBotIdsAsync(): Promise<string[]> {
  const lsIds = readDeletedBotIdsSync();
  const idbIds = await idbGet<string[]>(IDB_DELETED_KEY);
  if (!idbIds || !Array.isArray(idbIds)) return lsIds;
  return Array.from(new Set([...lsIds, ...idbIds]));
}

export function upsertBotInVault(bot: BotConfig): void {
  const existing = readVaultBotsSync();
  const idx = existing.findIndex((b) => b.id === bot.id);
  const next = [...existing];
  if (idx !== -1) {
    next[idx] = bot;
  } else {
    next.push(bot);
  }
  writeVaultBotsSync(next);

  // Ensure a restored/newly-created bot is not in deleted list
  const deleted = readDeletedBotIdsSync();
  if (deleted.includes(bot.id)) {
    writeDeletedBotIdsSync(deleted.filter((id) => id !== bot.id));
  }
}

export function removeBotFromVault(botId: string): void {
  const existing = readVaultBotsSync();
  writeVaultBotsSync(existing.filter((b) => b.id !== botId));
  const deleted = readDeletedBotIdsSync();
  if (!deleted.includes(botId)) {
    writeDeletedBotIdsSync([...deleted, botId]);
  }
}
