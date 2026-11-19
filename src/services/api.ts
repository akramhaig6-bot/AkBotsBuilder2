import { BotConfig } from '../types/bot';
import { CapturedBotRecord, ScanStatusResponse } from '../types/scan';
import {
  reconcileBots,
  readVaultBotsAsync,
  readVaultBotsSync,
  readDeletedBotIdsAsync,
  readDeletedBotIdsSync,
  writeVaultBotsSync,
  upsertBotInVault,
  removeBotFromVault,
} from '../utils/botPersistence';

// Per-bot client-side promise queue to serialize updates and prevent out-of-order overwrites
const botUpdateQueues = new Map<string, Promise<unknown>>();

function enqueueBotOperation<T>(botId: string, fn: () => Promise<T>): Promise<T> {
  const prev = botUpdateQueues.get(botId) || Promise.resolve();
  const next = prev.then(fn, fn);
  botUpdateQueues.set(botId, next.catch(() => {}));
  return next;
}

async function restoreBotsOnServer(
  bots: BotConfig[],
  deletedIds: string[]
): Promise<BotConfig[]> {
  const res = await fetch('/api/bots/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bots, deletedIds }),
  });
  if (!res.ok) {
    throw new Error('فشل مزامنة البوتات مع السيرفر');
  }
  const data = await res.json();
  return Array.isArray(data?.bots) ? data.bots : bots;
}

export const api = {
  async getBots(): Promise<BotConfig[]> {
    const [localBots, deletedIds] = await Promise.all([
      readVaultBotsAsync(),
      readDeletedBotIdsAsync(),
    ]);

    let serverBots: BotConfig[] = [];
    try {
      const res = await fetch('/api/bots');
      if (!res.ok) {
        throw new Error('فشل جلب قائمة البوتات');
      }
      serverBots = await res.json();
    } catch (err) {
      // If server is temporarily unreachable, fall back to preserved local bots
      if (localBots.length > 0) {
        return localBots.filter((b) => !deletedIds.includes(b.id));
      }
      throw err;
    }

    const { mergedBots, botsToRestoreOnServer, serverIdsToDelete } = reconcileBots(
      serverBots,
      localBots,
      deletedIds
    );

    let finalBots = mergedBots;
    if (botsToRestoreOnServer.length > 0 || serverIdsToDelete.length > 0) {
      try {
        finalBots = await restoreBotsOnServer(mergedBots, deletedIds);
      } catch {
        // Keep reconciled mergedBots locally even if restore call failed transiently
      }
    }

    writeVaultBotsSync(finalBots);
    return finalBots;
  },

  async createBot(name?: string): Promise<BotConfig> {
    const res = await fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      throw new Error('فشل إنشاء بوت جديد');
    }
    const created: BotConfig = await res.json();
    upsertBotInVault(created);
    return created;
  },

  async createBotFromBlueprint(blueprint: Partial<BotConfig>): Promise<BotConfig> {
    const res = await fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: blueprint.name, blueprint }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'فشل إنشاء البوت من كود JSON');
    }
    const created: BotConfig = await res.json();
    upsertBotInVault(created);
    return created;
  },

  async importAndConnectBot(
    blueprint: Partial<BotConfig>,
    token: string
  ): Promise<{ success: boolean; bot: BotConfig; message: string }> {
    const res = await fetch('/api/bots/import-and-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blueprint, token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'فشل تفعيل البوت وربطه بتيليجرام');
    }
    if (data?.bot) {
      upsertBotInVault(data.bot);
    }
    return data;
  },

  async getBot(id: string): Promise<BotConfig> {
    const res = await fetch(`/api/bots/${id}`);
    if (res.status === 404) {
      const deletedIds = readDeletedBotIdsSync();
      const localBot = readVaultBotsSync().find((b) => b.id === id);
      if (localBot && !deletedIds.includes(id)) {
        const restored = await restoreBotsOnServer([localBot], deletedIds);
        const found = restored.find((b) => b.id === id) || localBot;
        upsertBotInVault(found);
        return found;
      }
      throw new Error('البوت غير موجود');
    }
    if (!res.ok) {
      throw new Error('فشل جلب بيانات البوت');
    }
    const bot: BotConfig = await res.json();
    upsertBotInVault(bot);
    return bot;
  },

  async updateBot(id: string, updates: Partial<BotConfig>): Promise<BotConfig> {
    return enqueueBotOperation(id, async () => {
      const localExisting = readVaultBotsSync().find((b) => b.id === id);

      const res = await fetch(`/api/bots/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.status === 404 && localExisting) {
        const mergedBot: BotConfig = {
          ...localExisting,
          ...updates,
          id,
          updatedAt: new Date().toISOString(),
        };
        const deletedIds = readDeletedBotIdsSync().filter((d) => d !== id);
        const restored = await restoreBotsOnServer([mergedBot], deletedIds);
        const finalBot = restored.find((b) => b.id === id) || mergedBot;
        upsertBotInVault(finalBot);
        return finalBot;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'فشل تحديث بيانات البوت');
      }
      const updated: BotConfig = await res.json();
      upsertBotInVault(updated);
      return updated;
    });
  },

  async deleteBot(id: string): Promise<{ success: boolean }> {
    removeBotFromVault(id);
    const res = await fetch(`/api/bots/${id}`, {
      method: 'DELETE',
    });
    if (res.status === 404) {
      return { success: true };
    }
    if (!res.ok) {
      throw new Error('فشل حذف البوت');
    }
    return res.json();
  },

  async connectBot(
    id: string,
    token: string
  ): Promise<{ success: boolean; bot: BotConfig; message: string }> {
    return enqueueBotOperation(id, async () => {
      let res = await fetch(`/api/bots/${id}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (res.status === 404) {
        const localBot = readVaultBotsSync().find((b) => b.id === id);
        if (localBot) {
          await restoreBotsOnServer([localBot], readDeletedBotIdsSync());
          res = await fetch(`/api/bots/${id}/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
        }
      }

      const data = await res.json().catch(() => ({}));
      if (data?.bot) {
        upsertBotInVault(data.bot);
      }
      if (!res.ok) {
        throw new Error(data.error || 'فشل ربط البوت بتيليجرام');
      }
      return data;
    });
  },

  async disconnectBot(
    id: string
  ): Promise<{ success: boolean; bot: BotConfig; message: string }> {
    return enqueueBotOperation(id, async () => {
      const res = await fetch(`/api/bots/${id}/disconnect`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'فشل فصل البوت');
      }
      if (data?.bot) {
        upsertBotInVault(data.bot);
      }
      return data;
    });
  },

  async getBotStatus(id: string): Promise<{
    exists?: boolean;
    isPolling: boolean;
    lastCheck: string | null;
    lastError: string | null;
    isConnected: boolean;
    botUsername?: string;
  }> {
    const res = await fetch(`/api/bots/${id}/status`);
    if (!res.ok) {
      throw new Error('فشل جلب حالة البوت');
    }
    const status = await res.json();
    if (status && status.exists === false) {
      const deletedIds = readDeletedBotIdsSync();
      const localBot = readVaultBotsSync().find((b) => b.id === id);
      if (localBot && !deletedIds.includes(id)) {
        void restoreBotsOnServer([localBot], deletedIds).catch(() => {});
      }
    }
    return status;
  },

  async syncBot(
    id: string
  ): Promise<{ success: boolean; message: string; bot: BotConfig }> {
    return enqueueBotOperation(id, async () => {
      let res = await fetch(`/api/bots/${id}/sync`, {
        method: 'POST',
      });

      if (res.status === 404) {
        const localBot = readVaultBotsSync().find((b) => b.id === id);
        if (localBot) {
          await restoreBotsOnServer([localBot], readDeletedBotIdsSync());
          res = await fetch(`/api/bots/${id}/sync`, {
            method: 'POST',
          });
        }
      }

      const data = await res.json().catch(() => ({}));
      if (data?.bot) {
        upsertBotInVault(data.bot);
      }
      if (!res.ok) {
        throw new Error(data.error || 'فشلت المزامنة مع تيليجرام');
      }
      return data;
    });
  },

  async uploadFile(file: File): Promise<{ url: string; fileName: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      throw new Error('فشل رفع الملف إلى السيرفر');
    }
    return res.json();
  },

  scan: {
    async getStatus(): Promise<ScanStatusResponse> {
      const res = await fetch('/api/scan/status');
      if (!res.ok) {
        throw new Error('تعذر جلب حالة اتصال scan Telegram');
      }
      return res.json();
    },

    async connectWithSession(params: {
      apiId: string;
      apiHash: string;
      sessionString: string;
    }): Promise<ScanStatusResponse> {
      const res = await fetch('/api/scan/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'فشل الاتصال بجلسة تيليجرام');
      }
      return data;
    },

    async startPhoneLogin(params: {
      apiId: string;
      apiHash: string;
      phoneNumber: string;
    }): Promise<ScanStatusResponse & { isCodeViaApp?: boolean }> {
      const res = await fetch('/api/scan/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'فشل إرسال رمز التحقق');
      }
      return data;
    },

    async verifyPhoneCode(params: {
      code?: string;
      password?: string;
    }): Promise<ScanStatusResponse> {
      const res = await fetch('/api/scan/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'فشل التحقق من الرمز');
      }
      return data;
    },

    async disconnect(clearSession: boolean = false): Promise<ScanStatusResponse> {
      const res = await fetch('/api/scan/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearSession }),
      });
      if (!res.ok) {
        throw new Error('فشل قطع الاتصال بحساب تيليجرام');
      }
      return res.json();
    },

    async switchAccount(savedId: string): Promise<ScanStatusResponse> {
      const res = await fetch('/api/scan/switch-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ savedId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'تعذر التبديل إلى الجلسة المحفوظة');
      }
      return data;
    },

    async removeAccount(savedId: string): Promise<ScanStatusResponse> {
      const res = await fetch(`/api/scan/accounts/${encodeURIComponent(savedId)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'تعذر حذف الحساب المحفوظ');
      }
      return data;
    },

    async syncTelegramHistory(botUsernameOrKey?: string): Promise<CapturedBotRecord[]> {
      const res = await fetch('/api/scan/sync-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botUsernameOrKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'فشل مزامنة محادثات تيليجرام');
      }
      return Array.isArray(data?.bots) ? data.bots : [];
    },

    async setTargetBot(targetBot: string | null): Promise<ScanStatusResponse> {
      const res = await fetch('/api/scan/target-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetBot }),
      });
      if (!res.ok) {
        throw new Error('فشل تحديث مرشح البوت المستهدف');
      }
      return res.json();
    },

    async getBots(): Promise<CapturedBotRecord[]> {
      const res = await fetch('/api/scan/bots');
      if (!res.ok) {
        throw new Error('تعذر جلب قائمة البوتات الممسوحة');
      }
      const data = await res.json();
      return Array.isArray(data?.bots) ? data.bots : [];
    },

    async interact(params: {
      botUsernameOrKey: string;
      action: 'send_text' | 'click_inline';
      text?: string;
      messageId?: number;
      callbackData?: string;
      parentButtonId?: string | null;
    }): Promise<{
      bot: CapturedBotRecord | null;
      callbackAlert?: { text: string; showAlert: boolean };
    }> {
      const res = await fetch('/api/scan/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'فشل التفاعل مع البوت');
      }
      return data;
    },

    async crawlFullBot(params: {
      botUsernameOrKey: string;
      maxSteps?: number;
      maxDepth?: number;
    }): Promise<{
      crawlProgress: import('../types/scan').ScanCrawlProgress;
      bot: CapturedBotRecord | null;
    }> {
      const res = await fetch('/api/scan/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'فشل بدء التقاط كل البوت');
      }
      return data;
    },

    async stopCrawl(): Promise<{
      crawlProgress: import('../types/scan').ScanCrawlProgress | null;
    }> {
      const res = await fetch('/api/scan/crawl/stop', {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'تعذر إيقاف عملية الالتقاط');
      }
      return data;
    },

    async linkStep(
      botKey: string,
      eventId: string,
      targetParentId: string | null
    ): Promise<CapturedBotRecord> {
      const res = await fetch(`/api/scan/bots/${encodeURIComponent(botKey)}/link-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, targetParentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'فشل ربط الرسالة بالزر');
      }
      return data.bot;
    },

    async renameBot(botKey: string, customName: string): Promise<CapturedBotRecord> {
      const res = await fetch(`/api/scan/bots/${encodeURIComponent(botKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'فشل تعديل اسم البوت');
      }
      return data.bot;
    },

    async deleteBot(botKey: string): Promise<void> {
      const res = await fetch(`/api/scan/bots/${encodeURIComponent(botKey)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('فشل حذف سجل البوت');
      }
    },
  },
};


