import fs from 'fs';
import path from 'path';
import { Api, TelegramClient, sessions } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events/NewMessage.js';
import { EditedMessage, EditedMessageEvent } from 'telegram/events/EditedMessage.js';
import { Logger } from 'telegram/extensions/Logger.js';
import type { BotCommandConfig, MediaItem, MediaType, ReplyKeyboardSettings } from '../src/types/bot';
import type {
  CapturedBotRecord,
  CapturedButtonSnapshot,
  CapturedEventKind,
  CapturedMessageEvent,
  CapturedTriggerType,
  SavedScanAccountSummary,
  ScanAccountInfo,
  ScanConnectionState,
  ScanCrawlProgress,
  ScanStatusResponse,
} from '../src/types/scan';
import {
  buildBlueprintFromCapturedBot,
  buildButtonNavigationPath,
  collectBotCrawlCandidates,
  makeDeterministicCapturedButtonId,
  RawTelegramEntity,
  telegramEntitiesToHtml,
} from '../src/utils/scanBlueprintBuilder';

interface StoredScanAccount {
  id: string;
  accountId: string;
  firstName: string;
  lastName?: string;
  username?: string;
  phone?: string;
  apiId: number;
  apiHash: string;
  sessionString: string;
  createdAt: string;
  lastUsedAt: string;
}

interface SavedSessionsVault {
  activeAccountId: string | null;
  autoConnect: boolean;
  accounts: StoredScanAccount[];
}

interface PendingTrigger {
  timestamp: number;
  type: CapturedTriggerType;
  text?: string;
  callbackData?: string;
  parentButtonId?: string | null;
  sourceMessageId?: number;
  callbackAlert?: { text: string; showAlert: boolean };
  handledMessageEvent?: boolean;
}

interface PendingAuthSession {
  client: TelegramClient;
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  phoneCodeHash: string;
  state: 'awaiting_code' | 'awaiting_password';
}

export class TelegramScannerService {
  private dataDir: string;
  private uploadsDir: string;
  private legacySessionFile: string;
  private sessionsVaultFile: string;
  private capturesFile: string;

  private client: TelegramClient | null = null;
  private pendingAuth: PendingAuthSession | null = null;
  private state: ScanConnectionState = 'disconnected';
  private account: ScanAccountInfo | null = null;
  private activeSavedAccountId: string | null = null;
  private sessionString: string | null = null;
  private lastError: string | null = null;
  private activeTargetBot: string | null = null;

  private captures: Record<string, CapturedBotRecord> = {};
  private recentTriggers = new Map<string, PendingTrigger>();
  private fetchedBotInfoKeys = new Set<string>();
  private seenMessageFingerprints = new Set<string>();
  private seenOutSignatures = new Map<string, number>();
  private suppressCaptureBots = new Set<string>();

  // Track baseline message IDs / editDates upon connecting so live watcher captures new & edited bot activity from Telegram app seamlessly
  private connectedAtUnix: number = 0;
  private knownDialogTopMarkers = new Map<string, { msgId: number; editDate: number }>();
  private dialogSyncTimer: ReturnType<typeof setInterval> | null = null;
  private isSyncingDialogs: boolean = false;
  private activeCrawl: ScanCrawlProgress | null = null;
  private crawlAbortRequested: boolean = false;

  constructor(dataDir: string, uploadsDir: string) {
    this.dataDir = dataDir;
    this.uploadsDir = uploadsDir;
    this.legacySessionFile = path.join(this.dataDir, 'scan-session.json');
    this.sessionsVaultFile = path.join(this.dataDir, 'scan-sessions.json');
    this.capturesFile = path.join(this.dataDir, 'scan-captures.json');

    this.ensureDirs();
    this.loadCapturesFromDisk();
    this.migrateLegacySessionIfNeeded();
  }

  private ensureDirs() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  private buildEventFingerprint(
    botKey: string,
    msgId: number,
    isEdited: boolean,
    text: string,
    inlineBtns: Array<{ text: string; callbackData?: string; url?: string }>,
    replyBtns: Array<{ text: string }>
  ): string {
    return `${botKey}|${msgId}|${isEdited ? 'e' : 'n'}|${text}|${inlineBtns
      .map((b) => `${b.text}:${b.callbackData || b.url || ''}`)
      .join(',')}|${replyBtns.map((b) => b.text).join(',')}`;
  }

  private loadCapturesFromDisk() {
    try {
      if (!fs.existsSync(this.capturesFile)) return;
      const raw = fs.readFileSync(this.capturesFile, 'utf-8').trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const next: Record<string, CapturedBotRecord> = {};
        for (const [k, rec] of Object.entries(parsed)) {
          if (rec && typeof rec === 'object') {
            const rebuilt = this.rebuildRecord(rec as CapturedBotRecord);
            next[k] = rebuilt;
            for (const ev of rebuilt.events || []) {
              this.seenMessageFingerprints.add(
                this.buildEventFingerprint(
                  k,
                  ev.telegramMessageId,
                  ev.isEdited,
                  ev.text,
                  ev.inlineButtons,
                  ev.replyButtons
                )
              );
            }
          }
        }
        this.captures = next;
      }
    } catch (err) {
      console.error('Error loading scan captures:', err);
    }
  }

  private saveCapturesToDisk() {
    try {
      const tmp = `${this.capturesFile}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.captures, null, 2), 'utf-8');
      fs.renameSync(tmp, this.capturesFile);
    } catch (err) {
      console.error('Error saving scan captures:', err);
    }
  }

  private migrateLegacySessionIfNeeded() {
    if (fs.existsSync(this.sessionsVaultFile) || !fs.existsSync(this.legacySessionFile)) {
      return;
    }
    try {
      const raw = fs.readFileSync(this.legacySessionFile, 'utf-8').trim();
      if (!raw) return;
      const legacy = JSON.parse(raw);
      if (legacy?.apiId && legacy?.apiHash && legacy?.sessionString) {
        const now = legacy.updatedAt || new Date().toISOString();
        const migrated: SavedSessionsVault = {
          activeAccountId: 'legacy_1',
          autoConnect: true,
          accounts: [
            {
              id: 'legacy_1',
              accountId: 'legacy_1',
              firstName: 'حساب تيليجرام محفوظ',
              apiId: Number(legacy.apiId),
              apiHash: String(legacy.apiHash),
              sessionString: String(legacy.sessionString),
              createdAt: now,
              lastUsedAt: now,
            },
          ],
        };
        this.writeVault(migrated);
      }
    } catch {
      // ignore legacy migration error
    }
  }

  private readVault(): SavedSessionsVault {
    try {
      if (!fs.existsSync(this.sessionsVaultFile)) {
        return { activeAccountId: null, autoConnect: false, accounts: [] };
      }
      const raw = fs.readFileSync(this.sessionsVaultFile, 'utf-8').trim();
      if (!raw) {
        return { activeAccountId: null, autoConnect: false, accounts: [] };
      }
      const parsed = JSON.parse(raw);
      return {
        activeAccountId:
          typeof parsed?.activeAccountId === 'string' ? parsed.activeAccountId : null,
        autoConnect: Boolean(parsed?.autoConnect),
        accounts: Array.isArray(parsed?.accounts) ? parsed.accounts : [],
      };
    } catch {
      return { activeAccountId: null, autoConnect: false, accounts: [] };
    }
  }

  private writeVault(vault: SavedSessionsVault) {
    try {
      const tmp = `${this.sessionsVaultFile}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(vault, null, 2), 'utf-8');
      fs.renameSync(tmp, this.sessionsVaultFile);
    } catch (err) {
      console.error('Error saving scan sessions vault:', err);
    }
  }

  private upsertSavedAccount(
    account: ScanAccountInfo,
    apiId: number,
    apiHash: string,
    sessionString: string
  ): string {
    const vault = this.readVault();
    const now = new Date().toISOString();
    const accountId = account.id || `acc_${Date.now()}`;
    const savedId = `tg_${accountId}`;

    // Replace legacy placeholder if its session matches or keep separate
    const filteredAccounts = vault.accounts.filter(
      (a) => !(a.id === 'legacy_1' && a.sessionString === sessionString)
    );

    const existingIdx = filteredAccounts.findIndex(
      (a) => a.id === savedId || a.accountId === accountId
    );

    const nextEntry: StoredScanAccount = {
      id: savedId,
      accountId,
      firstName: account.firstName || 'مستخدم تيليجرام',
      ...(account.lastName ? { lastName: account.lastName } : {}),
      ...(account.username ? { username: account.username } : {}),
      ...(account.phone ? { phone: account.phone } : {}),
      apiId,
      apiHash,
      sessionString,
      createdAt:
        existingIdx >= 0 ? filteredAccounts[existingIdx].createdAt : now,
      lastUsedAt: now,
    };

    if (existingIdx >= 0) {
      filteredAccounts[existingIdx] = nextEntry;
    } else {
      filteredAccounts.unshift(nextEntry);
    }

    this.writeVault({
      activeAccountId: savedId,
      autoConnect: true,
      accounts: filteredAccounts,
    });

    return savedId;
  }

  private getSavedAccountSummaries(): SavedScanAccountSummary[] {
    const vault = this.readVault();
    return vault.accounts
      .map((a) => ({
        id: a.id,
        accountId: a.accountId,
        firstName: a.firstName,
        lastName: a.lastName,
        username: a.username,
        phone: a.phone,
        createdAt: a.createdAt,
        lastUsedAt: a.lastUsedAt,
        isActive:
          this.state === 'connected' && this.activeSavedAccountId === a.id,
      }))
      .sort(
        (a, b) =>
          new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
      );
  }

  public async tryAutoReconnect(): Promise<void> {
    const vault = this.readVault();
    if (!vault.autoConnect || vault.accounts.length === 0 || this.client || this.state === 'connected') {
      return;
    }

    const target =
      vault.accounts.find((a) => a.id === vault.activeAccountId) || vault.accounts[0];
    if (!target) return;

    try {
      await this.connectWithSession(
        target.apiId,
        target.apiHash,
        target.sessionString,
        true
      );
    } catch (err: any) {
      this.state = 'disconnected';
      this.lastError = null;
      console.warn('Scan Telegram auto-reconnect skipped:', err?.message || err);
    }
  }

  private createClient(sessionStr: string, apiId: number, apiHash: string): TelegramClient {
    const logger = new Logger('error' as any);
    return new TelegramClient(new sessions.StringSession(sessionStr), apiId, apiHash, {
      connectionRetries: 5,
      useWSS: false,
      baseLogger: logger,
    });
  }

  private stopDialogWatcher() {
    if (this.dialogSyncTimer) {
      clearInterval(this.dialogSyncTimer);
      this.dialogSyncTimer = null;
    }
    this.isSyncingDialogs = false;
  }

  private async cleanupClient(targetClient: TelegramClient | null) {
    if (!targetClient) return;
    try {
      await targetClient.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }

  private rebuildRecord(record: CapturedBotRecord): CapturedBotRecord {
    const built = buildBlueprintFromCapturedBot(record);
    return {
      ...record,
      blueprint: built.blueprint,
      blueprintJson: built.json,
      resolvedEvents: built.resolvedEvents,
    };
  }

  public getStatus(): ScanStatusResponse {
    const savedAccounts = this.getSavedAccountSummaries();
    return {
      state: this.state,
      isConnected: this.state === 'connected' && Boolean(this.client?.connected),
      account: this.account,
      hasSavedSession: savedAccounts.length > 0,
      sessionString: this.sessionString,
      activeSavedAccountId: this.activeSavedAccountId,
      savedAccounts,
      activeTargetBot: this.activeTargetBot,
      error: this.lastError,
      capturedBotCount: Object.keys(this.captures).length,
      crawlProgress: this.activeCrawl ? { ...this.activeCrawl } : null,
    };
  }

  public listCapturedBots(): CapturedBotRecord[] {
    return Object.values(this.captures)
      .map((rec) => this.rebuildRecord(rec))
      .sort(
        (a, b) =>
          new Date(b.lastInteractionAt).getTime() - new Date(a.lastInteractionAt).getTime()
      );
  }

  public getCapturedBot(botKey: string): CapturedBotRecord | null {
    const rec = this.captures[botKey];
    return rec ? this.rebuildRecord(rec) : null;
  }

  public setTargetBotFilter(targetBot: string | null) {
    const cleaned = targetBot ? targetBot.replace(/^@/, '').trim().toLowerCase() : null;
    this.activeTargetBot = cleaned || null;
  }

  public async connectWithSession(
    apiIdInput: number | string,
    apiHashInput: string,
    sessionStringInput: string,
    saveToDisk: boolean = true
  ): Promise<ScanStatusResponse> {
    const apiId = Number(apiIdInput);
    const apiHash = String(apiHashInput || '').trim();
    const sessionStr = String(sessionStringInput || '').trim();

    if (!Number.isInteger(apiId) || apiId <= 0) {
      throw new Error('الرجاء إدخال API ID صحيح (أرقام فقط من my.telegram.org).');
    }
    if (!apiHash || apiHash.length < 16) {
      throw new Error('الرجاء إدخال API Hash صحيح من my.telegram.org.');
    }
    if (!sessionStr || sessionStr.length < 20) {
      throw new Error('كود الجلسة (StringSession) غير صالح أو قصير جداً.');
    }

    await this.disconnect(false, false);
    this.state = 'connecting';
    this.lastError = null;

    const client = this.createClient(sessionStr, apiId, apiHash);
    try {
      await client.connect();
      const isAuth = await client.isUserAuthorized();
      if (!isAuth) {
        await this.cleanupClient(client);
        throw new Error(
          'الجلسة غير مصرح لها أو منتهية الصلاحية. يرجى تسجيل الدخول برقم الهاتف أو استخدام جلسة StringSession صالحة.'
        );
      }

      await this.finalizeAuthenticatedClient(client, apiId, apiHash, saveToDisk);
      return this.getStatus();
    } catch (err: any) {
      await this.cleanupClient(client);
      this.state = 'error';
      this.lastError = this.formatGramJsError(err);
      throw new Error(this.lastError);
    }
  }

  public async switchToSavedAccount(savedId: string): Promise<ScanStatusResponse> {
    const vault = this.readVault();
    const target = vault.accounts.find((a) => a.id === savedId);
    if (!target) {
      throw new Error('الحساب المحفوظ غير موجود.');
    }
    return this.connectWithSession(
      target.apiId,
      target.apiHash,
      target.sessionString,
      true
    );
  }

  public async removeSavedAccount(savedId: string): Promise<ScanStatusResponse> {
    const vault = this.readVault();
    const remaining = vault.accounts.filter((a) => a.id !== savedId);
    const wasActive = this.activeSavedAccountId === savedId;

    this.writeVault({
      activeAccountId:
        vault.activeAccountId === savedId
          ? remaining[0]?.id || null
          : vault.activeAccountId,
      autoConnect: wasActive ? false : vault.autoConnect,
      accounts: remaining,
    });

    if (wasActive) {
      await this.disconnect(false, false);
    }

    return this.getStatus();
  }

  public async startPhoneLogin(
    apiIdInput: number | string,
    apiHashInput: string,
    phoneNumberInput: string
  ): Promise<ScanStatusResponse & { isCodeViaApp?: boolean }> {
    const apiId = Number(apiIdInput);
    const apiHash = String(apiHashInput || '').trim();
    const phone = String(phoneNumberInput || '').trim().replace(/\s+/g, '');

    if (!Number.isInteger(apiId) || apiId <= 0) {
      throw new Error('الرجاء إدخال API ID صحيح (أرقام فقط).');
    }
    if (!apiHash || apiHash.length < 16) {
      throw new Error('الرجاء إدخال API Hash صحيح.');
    }
    if (!phone || !/^\+?[0-9]{7,18}$/.test(phone)) {
      throw new Error('الرجاء إدخال رقم الهاتف بالصيغة الدولية الصحيحة (مثال: +967770000000).');
    }

    await this.disconnect(false, false);
    this.state = 'connecting';
    this.lastError = null;

    const client = this.createClient('', apiId, apiHash);
    try {
      await client.connect();
      const sendResult = await client.sendCode({ apiId, apiHash }, phone);
      this.pendingAuth = {
        client,
        apiId,
        apiHash,
        phoneNumber: phone,
        phoneCodeHash: sendResult.phoneCodeHash,
        state: 'awaiting_code',
      };
      this.state = 'awaiting_code';
      return {
        ...this.getStatus(),
        isCodeViaApp: sendResult.isCodeViaApp,
      };
    } catch (err: any) {
      await this.cleanupClient(client);
      this.pendingAuth = null;
      this.state = 'error';
      this.lastError = this.formatGramJsError(err);
      throw new Error(this.lastError);
    }
  }

  public async verifyPhoneLogin(params: {
    code?: string;
    password?: string;
  }): Promise<ScanStatusResponse> {
    if (!this.pendingAuth) {
      throw new Error('لا توجد عملية تسجيل دخول قيد الانتظار. يرجى إرسال رقم الهاتف أولاً.');
    }

    const { client, apiId, apiHash, phoneNumber, phoneCodeHash, state } = this.pendingAuth;
    const code = String(params.code || '').trim();
    const password = String(params.password || '');

    try {
      if (state === 'awaiting_code') {
        if (!code) {
          throw new Error('الرجاء إدخال رمز التحقق المرسل من تيليجرام.');
        }

        try {
          await client.invoke(
            new Api.auth.SignIn({
              phoneNumber,
              phoneCodeHash,
              phoneCode: code,
            })
          );
        } catch (err: any) {
          const msg = String(err?.errorMessage || err?.message || '');
          if (msg.includes('SESSION_PASSWORD_NEEDED')) {
            if (!password) {
              this.pendingAuth.state = 'awaiting_password';
              this.state = 'awaiting_password';
              this.lastError = null;
              return this.getStatus();
            }
            await client.signInWithPassword(
              { apiId, apiHash },
              {
                password: async () => password,
                onError: async (pwErr) => {
                  throw pwErr;
                },
              }
            );
          } else {
            throw err;
          }
        }
      } else if (state === 'awaiting_password') {
        if (!password) {
          throw new Error('يرجى إدخال كلمة مرور التحقق بخطوتين (2FA).');
        }
        await client.signInWithPassword(
          { apiId, apiHash },
          {
            password: async () => password,
            onError: async (pwErr) => {
              throw pwErr;
            },
          }
        );
      }

      this.pendingAuth = null;
      await this.finalizeAuthenticatedClient(client, apiId, apiHash, true);
      return this.getStatus();
    } catch (err: any) {
      const friendly = this.formatGramJsError(err);
      this.lastError = friendly;
      throw new Error(friendly);
    }
  }

  private async finalizeAuthenticatedClient(
    client: TelegramClient,
    apiId: number,
    apiHash: string,
    saveToDisk: boolean
  ) {
    const me = (await client.getMe()) as Api.User;
    const savedStr = client.session.save() as unknown as string;

    this.client = client;
    this.sessionString = savedStr;
    this.state = 'connected';
    this.lastError = null;
    this.connectedAtUnix = Math.floor(Date.now() / 1000) - 5;
    this.knownDialogTopMarkers.clear();

    this.account = {
      id: String(me?.id || ''),
      firstName: me?.firstName || 'مستخدم تيليجرام',
      lastName: me?.lastName || undefined,
      username: me?.username || undefined,
      phone: me?.phone || undefined,
    };

    if (saveToDisk && savedStr) {
      this.activeSavedAccountId = this.upsertSavedAccount(
        this.account,
        apiId,
        apiHash,
        savedStr
      );
    }

    // Pre-warm GramJS entity cache and MTProto updates state so incoming & edited messages from bots in Telegram Desktop/Mobile always resolve and stream!
    await this.warmDialogsAndBaseline(client);
    this.attachEventHandlers(client);
    this.startDialogWatcher();
  }

  private async warmDialogsAndBaseline(client: TelegramClient) {
    try {
      await client.invoke(new Api.updates.GetState()).catch(() => null);
      const dialogs = await client.getDialogs({ limit: 40 });
      for (const d of dialogs) {
        if (d.entity instanceof Api.User && d.entity.bot) {
          const botKey = this.getBotKeyFromUser(d.entity);
          this.knownDialogTopMarkers.set(botKey, {
            msgId: Number(d.message?.id || 0),
            editDate: Number(d.message?.editDate || 0),
          });
        }
      }
    } catch {
      // Non-fatal warm failure
    }
  }

  private startDialogWatcher() {
    this.stopDialogWatcher();
    // Fallback safety sync every 4.5s to guarantee any interaction or message edit done inside Telegram Mobile/Desktop is captured even if GramJS missed a push packet
    this.dialogSyncTimer = setInterval(() => {
      void this.pollRecentBotActivityFromTelegram();
    }, 4500);
  }

  private async pollRecentBotActivityFromTelegram() {
    if (!this.client || this.state !== 'connected' || this.isSyncingDialogs) return;
    this.isSyncingDialogs = true;
    try {
      const dialogs = await this.client.getDialogs({ limit: 15 });
      for (const dialog of dialogs) {
        if (!(dialog.entity instanceof Api.User) || !dialog.entity.bot) continue;
        const botKey = this.getBotKeyFromUser(dialog.entity);
        if (!this.shouldScanBot(botKey)) continue;

        const topMsgId = Number(dialog.message?.id || 0);
        const topEditDate = Number(dialog.message?.editDate || 0);
        const prevMarker = this.knownDialogTopMarkers.get(botKey);

        const topChanged =
          !prevMarker ||
          topMsgId > prevMarker.msgId ||
          topEditDate > prevMarker.editDate;

        // Also monitor bots actively captured in this session for inline edits on older messages
        const isAlreadyTrackedInSession = Boolean(this.captures[botKey]);

        if (topChanged || isAlreadyTrackedInSession) {
          const messages = await this.client.getMessages(dialog.entity, {
            limit: topChanged ? 12 : 6,
          });
          // Process chronologically oldest -> newest
          const ordered = [...messages].reverse();
          for (const msg of ordered) {
            if (!msg) continue;
            const msgTime = Number(msg.date || 0);
            const editTime = Number(msg.editDate || 0);

            // On background poll, only auto-ingest messages or edits created/edited after this scan session connected
            const isRecent =
              msgTime >= this.connectedAtUnix || editTime >= this.connectedAtUnix;
            if (!isRecent) continue;

            if (msg.out) {
              const text = (msg.message || '').trim();
              if (text) {
                this.recordOutgoingTrigger(botKey, msg.id, text, msgTime * 1000);
              }
            } else {
              const isEdited = Boolean(msg.editDate && msg.editDate > 0);
              await this.recordBotMessage(dialog.entity, msg, isEdited);
            }
          }
          this.knownDialogTopMarkers.set(botKey, {
            msgId: topMsgId,
            editDate: topEditDate,
          });
        }
      }
    } catch {
      // quiet poll error
    } finally {
      this.isSyncingDialogs = false;
    }
  }

  public async syncRecentTelegramHistory(
    targetBotUsernameOrKey?: string
  ): Promise<CapturedBotRecord[]> {
    if (!this.client || this.state !== 'connected') {
      throw new Error('حساب تيليجرام غير متصل حالياً.');
    }

    const filterKey = targetBotUsernameOrKey
      ? targetBotUsernameOrKey.replace(/^@/, '').trim().toLowerCase()
      : null;

    if (filterKey) {
      const targetPeer: any = filterKey.startsWith('id_')
        ? BigInt(filterKey.slice(3))
        : `@${filterKey}`;
      const entity = (await this.client.getEntity(targetPeer)) as Api.User;
      if (entity instanceof Api.User && entity.bot) {
        await this.syncSingleBotHistory(entity, 25);
      }
    } else {
      const dialogs = await this.client.getDialogs({ limit: 20 });
      for (const d of dialogs) {
        if (d.entity instanceof Api.User && d.entity.bot) {
          const msgDate = Number(d.message?.date || 0);
          // Sync recent active bot dialogs (or all bots active in the last 24h)
          if (Date.now() / 1000 - msgDate < 86400) {
            await this.syncSingleBotHistory(d.entity, 20);
          }
        }
      }
    }

    return this.listCapturedBots();
  }

  private async syncSingleBotHistory(botUser: Api.User, limit: number) {
    if (!this.client) return;
    const botKey = this.getBotKeyFromUser(botUser);
    const messages = await this.client.getMessages(botUser, { limit });
    const ordered = [...messages].reverse();
    for (const msg of ordered) {
      if (!msg) continue;
      if (msg.out) {
        const text = (msg.message || '').trim();
        if (text) {
          this.recordOutgoingTrigger(
            botKey,
            msg.id,
            text,
            Number(msg.date || 0) * 1000
          );
        }
      } else {
        await this.recordBotMessage(botUser, msg, Boolean(msg.editDate));
      }
    }
  }

  public async disconnect(
    clearSaved: boolean = false,
    updateAutoConnectPref: boolean = true
  ): Promise<ScanStatusResponse> {
    this.crawlAbortRequested = true;
    if (this.activeCrawl?.state === 'running') {
      this.activeCrawl = {
        ...this.activeCrawl,
        state: 'stopped',
        finishedAt: new Date().toISOString(),
      };
    }
    this.stopDialogWatcher();

    if (this.pendingAuth?.client) {
      await this.cleanupClient(this.pendingAuth.client);
      this.pendingAuth = null;
    }
    if (this.client) {
      await this.cleanupClient(this.client);
      this.client = null;
    }

    if (clearSaved && this.activeSavedAccountId) {
      const vault = this.readVault();
      const remaining = vault.accounts.filter(
        (a) => a.id !== this.activeSavedAccountId
      );
      this.writeVault({
        activeAccountId: remaining[0]?.id || null,
        autoConnect: false,
        accounts: remaining,
      });
    } else if (updateAutoConnectPref) {
      const vault = this.readVault();
      this.writeVault({
        ...vault,
        autoConnect: false,
      });
    }

    this.state = 'disconnected';
    this.account = null;
    this.activeSavedAccountId = null;
    this.sessionString = null;
    this.lastError = null;
    this.fetchedBotInfoKeys.clear();
    this.knownDialogTopMarkers.clear();
    return this.getStatus();
  }

  private attachEventHandlers(client: TelegramClient) {
    client.addEventHandler(async (event: NewMessageEvent) => {
      try {
        await this.handleMessageEvent(event.message, false);
      } catch (err) {
        console.warn('Scan NewMessage error:', err);
      }
    }, new NewMessage({}));

    client.addEventHandler(async (event: EditedMessageEvent) => {
      try {
        await this.handleMessageEvent(event.message, true);
      } catch (err) {
        console.warn('Scan EditedMessage error:', err);
      }
    }, new EditedMessage({}));
  }

  private getBotKeyFromUser(user: Api.User): string {
    if (user.username && user.username.trim()) {
      return user.username.trim().toLowerCase();
    }
    return `id_${String(user.id)}`;
  }

  private shouldScanBot(botKey: string): boolean {
    if (!this.activeTargetBot) return true;
    const normalizedFilter = this.activeTargetBot.replace(/^@/, '').trim().toLowerCase();
    return botKey === normalizedFilter;
  }

  private async resolveBotPeerFromMessage(message: Api.Message): Promise<Api.User | null> {
    try {
      const chat = await message.getChat();
      if (chat instanceof Api.User) {
        return chat.bot ? chat : null;
      }
    } catch {
      // fall through
    }
    try {
      const sender = await message.getSender();
      if (sender instanceof Api.User && sender.bot) {
        return sender;
      }
    } catch {
      // fall through
    }

    // Critical fallback for secondary MTProto sessions when update arrived without cached entity:
    if (this.client && message.peerId instanceof Api.PeerUser) {
      try {
        const entity = await this.client.getEntity(message.peerId);
        if (entity instanceof Api.User) {
          return entity.bot ? entity : null;
        }
      } catch {
        try {
          await this.client.getDialogs({ limit: 30 });
          const entity = await this.client.getEntity(message.peerId);
          if (entity instanceof Api.User) {
            return entity.bot ? entity : null;
          }
        } catch {
          // ignore
        }
      }
    }
    return null;
  }

  private async ensureBotProfileAndCommands(botUser: Api.User, botKey: string) {
    if (!this.client || this.fetchedBotInfoKeys.has(botKey)) return;
    this.fetchedBotInfoKeys.add(botKey);

    try {
      const full = await this.client.invoke(new Api.users.GetFullUser({ id: botUser }));
      const botInfo = full.fullUser?.botInfo;
      const commands: BotCommandConfig[] = [];
      if (botInfo?.commands && Array.isArray(botInfo.commands)) {
        for (const c of botInfo.commands) {
          if (c.command) {
            commands.push({
              command: c.command.replace(/^\//, '').toLowerCase(),
              description: c.description || c.command,
            });
          }
        }
      }

      const existing = this.captures[botKey];
      if (existing) {
        if (commands.length > 0 && existing.commands.length === 0) {
          existing.commands = commands;
        }
        if (full.fullUser?.about && !existing.description) {
          existing.description = full.fullUser.about;
        }
        if (botInfo?.description && !existing.shortDescription) {
          existing.shortDescription = botInfo.description;
        }
        this.captures[botKey] = this.rebuildRecord(existing);
        this.saveCapturesToDisk();
      }
    } catch {
      // Non-fatal
    }
  }

  private ensureBotRecord(botUser: Api.User): CapturedBotRecord {
    const botKey = this.getBotKeyFromUser(botUser);
    const fullName = [botUser.firstName, botUser.lastName].filter(Boolean).join(' ').trim();
    if (!this.captures[botKey]) {
      this.captures[botKey] = this.rebuildRecord({
        botKey,
        botTelegramId: String(botUser.id),
        username: botUser.username || null,
        displayName: fullName || (botUser.username ? `@${botUser.username}` : `Bot ${botUser.id}`),
        commands: [],
        events: [],
        manualParentOverrides: {},
        lastInteractionAt: new Date().toISOString(),
      });
    } else if (fullName) {
      this.captures[botKey].displayName = fullName;
      if (botUser.username) this.captures[botKey].username = botUser.username;
    }
    return this.captures[botKey];
  }

  private recordOutgoingTrigger(
    botKey: string,
    msgId: number,
    text: string,
    timestampMs: number = Date.now()
  ) {
    const outKey = `${botKey}|out|${msgId}`;
    if (this.seenOutSignatures.has(outKey)) return;
    this.seenOutSignatures.set(outKey, timestampMs);

    const existingTrigger = this.recentTriggers.get(botKey);
    if (
      existingTrigger &&
      Math.abs(timestampMs - existingTrigger.timestamp) < 2500 &&
      existingTrigger.text === text
    ) {
      return;
    }

    this.recentTriggers.set(botKey, {
      timestamp: Date.now(),
      type: text.startsWith('/') ? 'command' : 'reply_button',
      text,
    });
  }

  private async handleMessageEvent(message: Api.Message, isEdited: boolean) {
    if (!message) return;
    const botUser = await this.resolveBotPeerFromMessage(message);
    if (!botUser) return;

    const botKey = this.getBotKeyFromUser(botUser);
    if (!this.shouldScanBot(botKey)) return;

    if (message.out) {
      const text = (message.message || '').trim();
      if (text) {
        this.recordOutgoingTrigger(botKey, message.id, text);
      }
      return;
    }

    await this.recordBotMessage(botUser, message, isEdited);
  }

  private extractEntities(message: Api.Message): RawTelegramEntity[] {
    if (!Array.isArray(message.entities)) return [];
    return message.entities.map((ent: any) => ({
      className: ent.className,
      offset: Number(ent.offset) || 0,
      length: Number(ent.length) || 0,
      url: ent.url,
      language: ent.language,
      documentId: ent.documentId !== undefined ? String(ent.documentId) : undefined,
    }));
  }

  private extractButtons(
    message: Api.Message,
    scopeKey: string
  ): {
    inlineButtons: CapturedButtonSnapshot[];
    replyButtons: CapturedButtonSnapshot[];
    replyKeyboardSettings?: ReplyKeyboardSettings;
  } {
    const markup = message.replyMarkup;
    const inlineButtons: CapturedButtonSnapshot[] = [];
    const replyButtons: CapturedButtonSnapshot[] = [];
    let replyKeyboardSettings: ReplyKeyboardSettings | undefined;

    if (!markup) {
      return { inlineButtons, replyButtons };
    }

    if (markup instanceof Api.ReplyInlineMarkup) {
      (markup.rows || []).forEach((rowObj, rowIdx) => {
        (rowObj.buttons || []).forEach((btn: any, colIdx) => {
          const text = String(btn.text || 'زر').trim() || 'زر';
          let actionType: CapturedButtonSnapshot['actionType'] = 'flow';
          let callbackData: string | undefined;
          let url: string | undefined;
          let webAppUrl: string | undefined;
          let copyText: string | undefined;
          let switchInlineQuery: string | undefined;

          if (btn instanceof Api.KeyboardButtonCallback) {
            actionType = 'flow';
            if (btn.data) {
              const buf = Buffer.from(btn.data);
              const decoded = buf.toString('utf-8');
              callbackData = /^[\x20-\x7E\u0600-\u06FF\s_.:|-]+$/.test(decoded)
                ? decoded.slice(0, 64)
                : buf.toString('base64').slice(0, 64);
            }
          } else if (btn instanceof Api.KeyboardButtonUrl) {
            actionType = 'url';
            url = btn.url;
          } else if (
            btn instanceof Api.KeyboardButtonWebView ||
            btn instanceof Api.KeyboardButtonSimpleWebView
          ) {
            actionType = 'web_app';
            webAppUrl = btn.url;
          } else if (btn instanceof Api.KeyboardButtonCopy) {
            actionType = 'copy_text';
            copyText = btn.copyText;
          } else if (btn instanceof Api.KeyboardButtonSwitchInline) {
            actionType = btn.samePeer
              ? 'switch_inline_query_current_chat'
              : 'switch_inline_query';
            switchInlineQuery = btn.query || '';
          } else if (btn instanceof Api.KeyboardButtonUrlAuth) {
            actionType = 'login_url';
            url = btn.url;
          } else if (btn instanceof Api.KeyboardButtonGame) {
            actionType = 'callback_game';
          } else if (btn instanceof Api.KeyboardButtonBuy) {
            actionType = 'pay';
          }

          const rawStyle = btn.style;
          let style: CapturedButtonSnapshot['style'];
          if (rawStyle === 'primary' || rawStyle?.primary) style = 'primary';
          else if (rawStyle === 'success' || rawStyle?.success) style = 'success';
          else if (rawStyle === 'danger' || rawStyle?.danger) style = 'danger';

          const id = makeDeterministicCapturedButtonId(
            scopeKey,
            'inline',
            rowIdx,
            colIdx,
            text,
            callbackData
          );

          inlineButtons.push({
            id,
            text,
            type: 'inline',
            row: rowIdx,
            order: colIdx,
            actionType,
            ...(style ? { style, color: style } : {}),
            ...(callbackData ? { callbackData } : {}),
            ...(url ? { url } : {}),
            ...(webAppUrl ? { webAppUrl } : {}),
            ...(copyText ? { copyText } : {}),
            ...(switchInlineQuery !== undefined ? { switchInlineQuery } : {}),
          });
        });
      });
    } else if (markup instanceof Api.ReplyKeyboardMarkup) {
      replyKeyboardSettings = {
        resizeKeyboard: Boolean(markup.resize),
        oneTimeKeyboard: Boolean(markup.singleUse),
        isPersistent: Boolean(markup.persistent),
        selective: Boolean(markup.selective),
        ...(markup.placeholder ? { inputFieldPlaceholder: markup.placeholder } : {}),
      };

      (markup.rows || []).forEach((rowObj, rowIdx) => {
        (rowObj.buttons || []).forEach((btn: any, colIdx) => {
          const text = String(btn.text || 'زر').trim() || 'زر';
          let actionType: CapturedButtonSnapshot['actionType'] = 'flow';
          let webAppUrl: string | undefined;
          let requestPollType: CapturedButtonSnapshot['requestPollType'];

          if (btn instanceof Api.KeyboardButtonRequestPhone) {
            actionType = 'request_contact';
          } else if (btn instanceof Api.KeyboardButtonRequestGeoLocation) {
            actionType = 'request_location';
          } else if (btn instanceof Api.KeyboardButtonRequestPoll) {
            actionType = 'request_poll';
            requestPollType =
              btn.quiz === true ? 'quiz' : btn.quiz === false ? 'regular' : 'any';
          } else if (
            btn instanceof Api.KeyboardButtonWebView ||
            btn instanceof Api.KeyboardButtonSimpleWebView
          ) {
            actionType = 'web_app';
            webAppUrl = btn.url;
          }

          const id = makeDeterministicCapturedButtonId(
            scopeKey,
            'reply',
            rowIdx,
            colIdx,
            text
          );

          replyButtons.push({
            id,
            text,
            type: 'reply',
            row: rowIdx,
            order: colIdx,
            actionType,
            ...(webAppUrl ? { webAppUrl } : {}),
            ...(requestPollType ? { requestPollType } : {}),
          });
        });
      });
    } else if (markup instanceof Api.ReplyKeyboardHide) {
      replyKeyboardSettings = { removeKeyboard: true, selective: Boolean(markup.selective) };
    } else if (markup instanceof Api.ReplyKeyboardForceReply) {
      replyKeyboardSettings = {
        forceReply: true,
        selective: Boolean(markup.selective),
        ...(markup.placeholder ? { inputFieldPlaceholder: markup.placeholder } : {}),
      };
    }

    return { inlineButtons, replyButtons, replyKeyboardSettings };
  }

  private async extractMedia(
    message: Api.Message,
    botKey: string
  ): Promise<{
    media: MediaItem[];
    poll?: CapturedMessageEvent['poll'];
    diceEmoji?: string;
  }> {
    const media: MediaItem[] = [];
    let poll: CapturedMessageEvent['poll'];
    let diceEmoji: string | undefined;

    if (!message.media || !this.client) {
      return { media };
    }

    if (message.media instanceof Api.MessageMediaPoll) {
      const p = message.media.poll;
      poll = {
        question: p.question?.text || 'استطلاع',
        options: (p.answers || []).map((a: any) => a.text?.text || '').filter(Boolean),
        pollType: p.quiz ? 'quiz' : 'regular',
        allowsMultiple: Boolean(p.multipleChoice),
      };
      return { media, poll };
    }

    if (message.media instanceof Api.MessageMediaDice) {
      diceEmoji = message.media.emoticon || '🎲';
      return { media, diceEmoji };
    }

    let mediaType: MediaType | null = null;
    let ext = '.bin';
    let fileName = `scan_${message.id}`;

    if (message.media instanceof Api.MessageMediaPhoto) {
      mediaType = 'photo';
      ext = '.jpg';
      fileName = `scan_photo_${message.id}.jpg`;
    } else if (message.media instanceof Api.MessageMediaDocument && message.media.document instanceof Api.Document) {
      const doc = message.media.document;
      const mime = doc.mimeType || '';
      const sizeBytes = Number(doc.size || 0);
      if (sizeBytes > 12 * 1024 * 1024) {
        return { media };
      }
      const attrs = doc.attributes || [];
      const filenameAttr = attrs.find((a) => a instanceof Api.DocumentAttributeFilename) as
        | Api.DocumentAttributeFilename
        | undefined;
      const audioAttr = attrs.find((a) => a instanceof Api.DocumentAttributeAudio) as
        | Api.DocumentAttributeAudio
        | undefined;
      const videoAttr = attrs.find((a) => a instanceof Api.DocumentAttributeVideo);

      if (audioAttr?.voice) mediaType = 'voice';
      else if (audioAttr || mime.startsWith('audio/')) mediaType = 'audio';
      else if (videoAttr || mime.startsWith('video/')) mediaType = 'video';
      else if (mime.startsWith('image/')) mediaType = 'photo';
      else mediaType = 'document';

      if (filenameAttr?.fileName) {
        fileName = filenameAttr.fileName;
        ext = path.extname(fileName) || ext;
      } else if (mediaType === 'voice') ext = '.ogg';
      else if (mediaType === 'audio') ext = '.mp3';
      else if (mediaType === 'video') ext = '.mp4';
      else if (mediaType === 'photo') ext = '.jpg';
    }

    if (mediaType) {
      try {
        const buffer = (await this.client.downloadMedia(message, {})) as Buffer | undefined;
        if (buffer && buffer.length > 0) {
          const safeBotKey = botKey.replace(/[^a-z0-9_]/gi, '_');
          const diskName = `scan_${safeBotKey}_${message.id}_${Date.now()}${ext}`;
          const fullPath = path.join(this.uploadsDir, diskName);
          fs.writeFileSync(fullPath, buffer);
          media.push({
            id: `scan_media_${message.id}_${Date.now()}`,
            type: mediaType,
            url: `/uploads/${diskName}`,
            fileName,
            order: 0,
          });
        }
      } catch (err) {
        console.warn('Scan media download skipped:', err);
      }
    }

    return { media, poll, diceEmoji };
  }

  private async recordBotMessage(
    botUser: Api.User,
    message: Api.Message,
    isEdited: boolean
  ): Promise<CapturedMessageEvent | null> {
    const botKey = this.getBotKeyFromUser(botUser);
    if (this.suppressCaptureBots.has(botKey)) {
      return null;
    }
    const record = this.ensureBotRecord(botUser);
    void this.ensureBotProfileAndCommands(botUser, botKey);

    const { text, parseMode } = telegramEntitiesToHtml(
      message.message || '',
      this.extractEntities(message)
    );

    const trigger = this.recentTriggers.get(botKey);
    const triggerFresh = trigger && Date.now() - trigger.timestamp < 20_000 ? trigger : undefined;
    if (triggerFresh) {
      triggerFresh.handledMessageEvent = true;
    }

    const isStartCmd =
      !isEdited &&
      triggerFresh?.type === 'command' &&
      /^\/start(\s|@|$)/i.test((triggerFresh.text || '').trim());

    const kind: CapturedEventKind = isStartCmd
      ? 'start_response'
      : isEdited
      ? 'edit_message'
      : 'new_message';

    const scopeKey = triggerFresh?.parentButtonId
      ? triggerFresh.parentButtonId
      : isStartCmd
      ? 'root'
      : triggerFresh?.text
      ? `trig_${message.id}_${triggerFresh.text.slice(0, 24)}`
      : `msg_${message.id}_${
          isEdited
            ? message.editDate || message.date || Date.now()
            : message.date || Date.now()
        }_${(message.message || '').trim().slice(0, 18)}`;

    const { inlineButtons, replyButtons, replyKeyboardSettings } = this.extractButtons(
      message,
      scopeKey
    );

    const fingerprint = this.buildEventFingerprint(
      botKey,
      message.id,
      isEdited,
      text,
      inlineButtons,
      replyButtons
    );
    if (this.seenMessageFingerprints.has(fingerprint)) {
      return null;
    }
    this.seenMessageFingerprints.add(fingerprint);

    const { media, poll, diceEmoji } = await this.extractMedia(message, botKey);

    const eventId = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const capturedEvent: CapturedMessageEvent = {
      id: eventId,
      botKey,
      telegramMessageId: message.id,
      timestamp: message.editDate
        ? new Date(message.editDate * 1000).toISOString()
        : message.date
        ? new Date(message.date * 1000).toISOString()
        : new Date().toISOString(),
      kind,
      isEdited,
      ...(triggerFresh
        ? {
            triggerType: triggerFresh.type,
            triggerText: triggerFresh.text,
            triggerCallbackData: triggerFresh.callbackData,
            parentButtonId: triggerFresh.parentButtonId,
            sourceMessageId: triggerFresh.sourceMessageId || (isEdited ? message.id : undefined),
            ...(triggerFresh.callbackAlert ? { callbackAlert: triggerFresh.callbackAlert } : {}),
          }
        : {
            triggerType: 'auto',
            ...(isEdited ? { sourceMessageId: message.id } : {}),
          }),
      text,
      parseMode,
      media,
      inlineButtons,
      replyButtons,
      ...(replyKeyboardSettings ? { replyKeyboardSettings } : {}),
      ...(poll ? { poll } : {}),
      ...(diceEmoji ? { diceEmoji } : {}),
    };

    record.events.push(capturedEvent);
    record.lastInteractionAt = capturedEvent.timestamp;
    this.captures[botKey] = this.rebuildRecord(record);
    this.saveCapturesToDisk();
    return capturedEvent;
  }

  private extractCallbackMatchFromMessages(
    messages: Api.Message[],
    callbackData: string
  ): { messageId: number; dataBuffer: Buffer } | null {
    for (const msg of messages) {
      if (!msg || !(msg.replyMarkup instanceof Api.ReplyInlineMarkup)) continue;
      for (const row of msg.replyMarkup.rows || []) {
        for (const btn of row.buttons || []) {
          if (btn instanceof Api.KeyboardButtonCallback && btn.data) {
            const rawBuf = Buffer.from(btn.data);
            const utf = rawBuf.toString('utf-8');
            const b64 = rawBuf.toString('base64');
            if (
              utf.slice(0, 64) === callbackData ||
              b64.slice(0, 64) === callbackData
            ) {
              return { messageId: msg.id, dataBuffer: rawBuf };
            }
          }
        }
      }
    }
    return null;
  }

  private async findLiveMessageWithCallback(
    entity: Api.User,
    callbackData: string,
    preferredMsgId?: number
  ): Promise<{ messageId: number; dataBuffer: Buffer } | null> {
    if (!this.client) return null;
    if (preferredMsgId) {
      try {
        const preferredMsgs = await this.client.getMessages(entity, { ids: [preferredMsgId] });
        const hit = this.extractCallbackMatchFromMessages(preferredMsgs, callbackData);
        if (hit) return hit;
      } catch {
        // ignore and scan recent
      }
    }
    try {
      const recentMsgs = await this.client.getMessages(entity, { limit: 8 });
      return this.extractCallbackMatchFromMessages(recentMsgs, callbackData);
    } catch {
      return null;
    }
  }

  private async replayPathToFindButton(
    entity: Api.User,
    botKey: string,
    record: CapturedBotRecord,
    targetButtonId: string,
    targetCallbackData: string
  ): Promise<{ messageId: number; dataBuffer: Buffer } | null> {
    if (!this.client) return null;
    const fullPath = buildButtonNavigationPath(record, targetButtonId);
    if (fullPath.length === 0) return null;

    // Steps before the target button itself
    const ancestorSteps = fullPath.slice(0, -1);
    if (ancestorSteps.length === 0) return null;

    this.suppressCaptureBots.add(botKey);
    try {
      for (const step of ancestorSteps) {
        if (step.type === 'command' || step.type === 'reply') {
          await this.client.sendMessage(entity, { message: step.text });
          await new Promise((r) => setTimeout(r, 900));
        } else if (step.type === 'inline') {
          const found = await this.findLiveMessageWithCallback(entity, step.callbackData);
          if (!found) break;
          try {
            await this.client.invoke(
              new Api.messages.GetBotCallbackAnswer({
                peer: entity,
                msgId: found.messageId,
                data: found.dataBuffer,
              })
            );
          } catch {
            break;
          }
          await new Promise((r) => setTimeout(r, 850));
        }
      }

      return await this.findLiveMessageWithCallback(entity, targetCallbackData);
    } finally {
      this.suppressCaptureBots.delete(botKey);
    }
  }

  private async waitAndPullBurstResponses(
    entity: Api.User,
    trigger: PendingTrigger,
    startedUnix: number,
    preferredMsgId?: number
  ) {
    if (!this.client) return;
    // Wait up to 1800ms for real-time MTProto updates, then brief 350ms settle for multi-message bursts
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 220));
      if (trigger.handledMessageEvent) {
        await new Promise((r) => setTimeout(r, 350));
        break;
      }
    }

    // Active pull fallback so no new or edited message from a bot is ever missed due to update lag
    try {
      const recent = await this.client.getMessages(entity, { limit: 6 });
      const ordered = [...recent].reverse();
      for (const m of ordered) {
        if (!m || m.out) continue;
        const mDate = Number(m.date || 0);
        const mEdit = Number(m.editDate || 0);
        const isFresh =
          mDate >= startedUnix - 1 ||
          mEdit >= startedUnix - 1 ||
          (preferredMsgId && m.id === preferredMsgId && mEdit > 0);
        if (isFresh) {
          const isEdited = Boolean(mEdit > 0);
          await this.recordBotMessage(entity, m, isEdited);
        }
      }
    } catch {
      // non-fatal active pull
    }
  }

  public async interactWithBot(params: {
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
    if (!this.client || this.state !== 'connected') {
      throw new Error('حساب تيليجرام غير متصل حالياً.');
    }

    const rawTarget = String(params.botUsernameOrKey || '').trim();
    if (!rawTarget) {
      throw new Error('يرجى تحديد اسم مستخدم البوت (مثال: @BotFather) أو اختيار بوت من القائمة.');
    }

    const existingKey = rawTarget.replace(/^@/, '').trim().toLowerCase();
    const existingRecord = this.captures[existingKey];
    const peer: any = existingRecord?.username
      ? existingRecord.username
      : existingKey.startsWith('id_')
      ? BigInt(existingKey.slice(3))
      : rawTarget.startsWith('@')
      ? rawTarget
      : `@${rawTarget}`;

    const entity = (await this.client.getEntity(peer)) as Api.User;
    if (!(entity instanceof Api.User) || !entity.bot) {
      throw new Error('الحساب المحدد ليس بوت تيليجرام. يرجى إدخال معرف بوت صالح ينتهي بـ bot.');
    }

    const botKey = this.getBotKeyFromUser(entity);
    const record = this.ensureBotRecord(entity);
    const startedUnix = Math.floor(Date.now() / 1000);

    if (params.action === 'send_text') {
      const text = String(params.text || '/start').trim() || '/start';
      const isCmd = text.startsWith('/');
      const trigger: PendingTrigger = {
        timestamp: Date.now(),
        type: isCmd ? 'command' : 'reply_button',
        text,
        parentButtonId: params.parentButtonId ?? null,
        handledMessageEvent: false,
      };
      this.recentTriggers.set(botKey, trigger);

      await this.client.sendMessage(entity, { message: text });
      await this.waitAndPullBurstResponses(entity, trigger, startedUnix);

      return { bot: this.getCapturedBot(botKey) };
    }

    if (!params.callbackData) {
      throw new Error('بيانات الزر غير مكتملة للتفاعل مع الزر.');
    }

    // Locate the live Telegram message carrying this callbackData; if overwritten by another menu, replay ancestor path automatically!
    let liveMatch = await this.findLiveMessageWithCallback(
      entity,
      params.callbackData,
      params.messageId
    );
    if (!liveMatch && params.parentButtonId) {
      liveMatch = await this.replayPathToFindButton(
        entity,
        botKey,
        record,
        params.parentButtonId,
        params.callbackData
      );
    }

    const targetMessageId = liveMatch?.messageId || params.messageId;
    if (!targetMessageId) {
      throw new Error('تعذر العثور على رسالة نشطة تحتوي على هذا الزر في تيليجرام. حاول إرسال /start للبوت.');
    }
    const dataBuffer = liveMatch?.dataBuffer || Buffer.from(params.callbackData, 'utf-8');

    const trigger: PendingTrigger = {
      timestamp: Date.now(),
      type: 'inline_button',
      callbackData: params.callbackData,
      parentButtonId: params.parentButtonId ?? null,
      sourceMessageId: targetMessageId,
      handledMessageEvent: false,
    };
    this.recentTriggers.set(botKey, trigger);

    const clickStartedUnix = Math.floor(Date.now() / 1000);
    const answer = await this.client.invoke(
      new Api.messages.GetBotCallbackAnswer({
        peer: entity,
        msgId: targetMessageId,
        data: dataBuffer,
      })
    );

    let callbackAlert: { text: string; showAlert: boolean } | undefined;
    if (answer?.message) {
      callbackAlert = {
        text: answer.message,
        showAlert: Boolean(answer.alert),
      };
      trigger.callbackAlert = callbackAlert;
    }

    await this.waitAndPullBurstResponses(
      entity,
      trigger,
      clickStartedUnix,
      targetMessageId
    );

    if (callbackAlert && !trigger.handledMessageEvent) {
      const latestRecord = this.ensureBotRecord(entity);
      const alertEvent: CapturedMessageEvent = {
        id: `ev_alert_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        botKey,
        telegramMessageId: targetMessageId,
        sourceMessageId: targetMessageId,
        timestamp: new Date().toISOString(),
        kind: 'callback_alert',
        isEdited: false,
        triggerType: 'inline_button',
        triggerCallbackData: params.callbackData,
        parentButtonId: params.parentButtonId ?? null,
        text: '',
        parseMode: 'none',
        media: [],
        inlineButtons: [],
        replyButtons: [],
        callbackAlert,
      };
      latestRecord.events.push(alertEvent);
      latestRecord.lastInteractionAt = alertEvent.timestamp;
      this.captures[botKey] = this.rebuildRecord(latestRecord);
      this.saveCapturesToDisk();
    }

    return {
      bot: this.getCapturedBot(botKey),
      ...(callbackAlert ? { callbackAlert } : {}),
    };
  }

  public stopFullBotCrawl(): ScanCrawlProgress | null {
    if (this.activeCrawl && this.activeCrawl.state === 'running') {
      this.crawlAbortRequested = true;
      this.activeCrawl = {
        ...this.activeCrawl,
        currentLabel: 'جاري إيقاف الالتقاط...',
      };
    }
    return this.activeCrawl ? { ...this.activeCrawl } : null;
  }

  public async startFullBotCrawl(params: {
    botUsernameOrKey: string;
    maxSteps?: number;
    maxDepth?: number;
  }): Promise<{
    crawlProgress: ScanCrawlProgress;
    bot: CapturedBotRecord | null;
  }> {
    if (!this.client || this.state !== 'connected') {
      throw new Error('حساب تيليجرام غير متصل حالياً.');
    }
    if (this.activeCrawl?.state === 'running') {
      throw new Error('توجد عملية التقاط كامل قيد التنفيذ حالياً. انتظر انتهاءها أو أوقفها أولاً.');
    }

    const rawTarget = String(params.botUsernameOrKey || '').trim();
    if (!rawTarget) {
      throw new Error('يرجى تحديد معرف البوت (مثال: @BotFather) أو اختياره أولاً.');
    }

    const existingKey = rawTarget.replace(/^@/, '').trim().toLowerCase();
    const existingRecord = this.captures[existingKey];
    const peer: any = existingRecord?.username
      ? existingRecord.username
      : existingKey.startsWith('id_')
      ? BigInt(existingKey.slice(3))
      : rawTarget.startsWith('@')
      ? rawTarget
      : `@${rawTarget}`;

    const entity = (await this.client.getEntity(peer)) as Api.User;
    if (!(entity instanceof Api.User) || !entity.bot) {
      throw new Error('الحساب المحدد ليس بوت تيليجرام. يرجى إدخال معرف بوت صالح.');
    }

    const botKey = this.getBotKeyFromUser(entity);
    const record = this.ensureBotRecord(entity);
    const maxSteps = Math.max(5, Math.min(80, Number(params.maxSteps || 40)));
    const maxDepth = Math.max(1, Math.min(6, Number(params.maxDepth || 4)));

    this.crawlAbortRequested = false;
    this.activeCrawl = {
      botKey,
      botLabel: record.customName || record.displayName || `@${botKey}`,
      state: 'running',
      visitedCount: 0,
      queuedCount: 1,
      maxSteps,
      currentLabel: '/start',
      startedAt: new Date().toISOString(),
    };

    void this.runFullBotCrawlLoop(entity, botKey, maxSteps, maxDepth);

    return {
      crawlProgress: { ...this.activeCrawl },
      bot: this.getCapturedBot(botKey),
    };
  }

  private findMessageIdForButtonInRecord(
    record: CapturedBotRecord,
    buttonId: string,
    callbackData?: string
  ): number | undefined {
    for (let i = record.events.length - 1; i >= 0; i--) {
      const ev = record.events[i];
      if (!ev.telegramMessageId || ev.kind === 'callback_alert') continue;
      if (
        ev.inlineButtons.some(
          (b) => b.id === buttonId || (callbackData && b.callbackData === callbackData)
        )
      ) {
        return ev.telegramMessageId;
      }
      if (ev.replyButtons.some((b) => b.id === buttonId)) {
        return ev.telegramMessageId;
      }
    }
    return undefined;
  }

  private async runFullBotCrawlLoop(
    entity: Api.User,
    botKey: string,
    maxSteps: number,
    maxDepth: number
  ) {
    const visitedKeys = new Set<string>();
    let visitedCount = 0;

    try {
      await this.ensureBotProfileAndCommands(entity, botKey);

      const initialRec = this.getCapturedBot(botKey);
      const hasStart = initialRec?.events.some(
        (e) =>
          e.kind === 'start_response' ||
          e.inlineButtons.length > 0 ||
          e.replyButtons.length > 0
      );

      if (!hasStart && !this.crawlAbortRequested) {
        if (this.activeCrawl) {
          this.activeCrawl = {
            ...this.activeCrawl,
            currentLabel: '/start',
            visitedCount: 0,
          };
        }
        await this.interactWithBot({
          botUsernameOrKey: botKey,
          action: 'send_text',
          text: '/start',
        }).catch((err) => {
          console.warn('Full crawl initial /start error:', err?.message || err);
        });
        await new Promise((r) => setTimeout(r, 500));
      }

      while (
        !this.crawlAbortRequested &&
        this.client &&
        this.state === 'connected' &&
        visitedCount < maxSteps
      ) {
        const latestRec = this.getCapturedBot(botKey);
        if (!latestRec) break;

        const candidates = collectBotCrawlCandidates(latestRec, visitedKeys, { maxDepth });
        if (candidates.length === 0) break;

        const next = candidates[0];
        visitedKeys.add(next.dedupKey);

        if (this.activeCrawl) {
          this.activeCrawl = {
            ...this.activeCrawl,
            visitedCount,
            queuedCount: candidates.length,
            currentLabel: next.label,
          };
        }

        try {
          if (next.kind === 'command' && next.commandText) {
            await this.interactWithBot({
              botUsernameOrKey: botKey,
              action: 'send_text',
              text: next.commandText,
            });
          } else if (next.button?.type === 'inline' && next.button.callbackData) {
            const msgId = this.findMessageIdForButtonInRecord(
              latestRec,
              next.button.id,
              next.button.callbackData
            );
            await this.interactWithBot({
              botUsernameOrKey: botKey,
              action: 'click_inline',
              messageId: msgId,
              callbackData: next.button.callbackData,
              parentButtonId: next.button.id,
            });
          } else if (next.button?.type === 'reply') {
            await this.interactWithBot({
              botUsernameOrKey: botKey,
              action: 'send_text',
              text: next.button.text,
              parentButtonId: next.button.id,
            });
          }
        } catch (stepErr: any) {
          const msg = String(stepErr?.errorMessage || stepErr?.message || '');
          const floodMatch = msg.match(/FLOOD_WAIT_(\d+)/);
          if (floodMatch) {
            const waitSec = parseInt(floodMatch[1], 10);
            if (waitSec <= 15) {
              await new Promise((r) => setTimeout(r, (waitSec + 1) * 1000));
            } else {
              throw new Error(`تم إيقاف المسح الشامل مؤقتاً بسبب حد الحماية من تيليجرام (${waitSec} ثانية).`);
            }
          } else {
            console.warn(`Full crawl step skipped (${next.label}):`, msg);
          }
        }

        visitedCount += 1;
        if (this.activeCrawl) {
          this.activeCrawl = {
            ...this.activeCrawl,
            visitedCount,
          };
        }

        if (!this.crawlAbortRequested) {
          await new Promise((r) => setTimeout(r, 450));
        }
      }

      if (this.activeCrawl) {
        this.activeCrawl = {
          ...this.activeCrawl,
          state: this.crawlAbortRequested ? 'stopped' : 'completed',
          visitedCount,
          queuedCount: 0,
          currentLabel: undefined,
          finishedAt: new Date().toISOString(),
        };
      }
    } catch (err: any) {
      if (this.activeCrawl) {
        this.activeCrawl = {
          ...this.activeCrawl,
          state: 'error',
          visitedCount,
          queuedCount: 0,
          currentLabel: undefined,
          finishedAt: new Date().toISOString(),
          error: err?.message || 'حدث خطأ أثناء الالتقاط الكامل للبوت.',
        };
      }
    } finally {
      this.suppressCaptureBots.delete(botKey);
    }
  }

  public linkEventToTarget(
    botKey: string,
    eventId: string,
    targetParentId: string | null
  ): CapturedBotRecord {
    const record = this.captures[botKey];
    if (!record) {
      throw new Error('البوت غير موجود في سجل المسح.');
    }
    const evExists = record.events.some((e) => e.id === eventId);
    if (!evExists) {
      throw new Error('الرسالة المحددة غير موجودة في سجل التفاعل.');
    }
    if (!record.manualParentOverrides) {
      record.manualParentOverrides = {};
    }
    if (targetParentId === null || targetParentId === '') {
      delete record.manualParentOverrides[eventId];
    } else {
      record.manualParentOverrides[eventId] = targetParentId;
    }
    const rebuilt = this.rebuildRecord(record);
    this.captures[botKey] = rebuilt;
    this.saveCapturesToDisk();
    return rebuilt;
  }

  public renameCapturedBot(botKey: string, customName: string): CapturedBotRecord {
    const record = this.captures[botKey];
    if (!record) {
      throw new Error('البوت غير موجود في سجل المسح.');
    }
    record.customName = customName.trim();
    const rebuilt = this.rebuildRecord(record);
    this.captures[botKey] = rebuilt;
    this.saveCapturesToDisk();
    return rebuilt;
  }

  public deleteCapturedBot(botKey: string): boolean {
    if (!this.captures[botKey]) return false;
    delete this.captures[botKey];
    this.recentTriggers.delete(botKey);
    this.fetchedBotInfoKeys.delete(botKey);
    this.knownDialogTopMarkers.delete(botKey);
    for (const fp of Array.from(this.seenMessageFingerprints)) {
      if (fp.startsWith(`${botKey}|`)) {
        this.seenMessageFingerprints.delete(fp);
      }
    }
    for (const sig of Array.from(this.seenOutSignatures.keys())) {
      if (sig.startsWith(`${botKey}|out|`)) {
        this.seenOutSignatures.delete(sig);
      }
    }
    this.saveCapturesToDisk();
    return true;
  }

  private formatGramJsError(err: any): string {
    const msg = String(err?.errorMessage || err?.message || err || '');
    if (msg.includes('API_ID_INVALID') || msg.includes('API_ID_PUBLISHED_FLOOD')) {
      return 'بيانات API ID أو API Hash غير صالحة. تأكد من نسخها بشكل صحيح من my.telegram.org.';
    }
    if (msg.includes('PHONE_NUMBER_INVALID')) {
      return 'رقم الهاتف غير صالح. يجب إدخال الرقم بالصيغة الدولية مع رمز الدولة (مثل +967...).';
    }
    if (msg.includes('PHONE_CODE_INVALID')) {
      return 'رمز التحقق غير صحيح. يرجى التأكد من الرمز والمحاولة مجدداً.';
    }
    if (msg.includes('PHONE_CODE_EXPIRED')) {
      return 'انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.';
    }
    if (msg.includes('PASSWORD_HASH_INVALID')) {
      return 'كلمة مرور التحقق بخطوتين (2FA) غير صحيحة.';
    }
    if (msg.includes('FLOOD_WAIT')) {
      return 'تم حظر المحاولات مؤقتاً من تيليجرام لكثرة الطلبات (Flood Wait). يرجى الانتظار قليلاً ثم المحاولة.';
    }
    if (msg.includes('AUTH_KEY_UNREGISTERED') || msg.includes('SESSION_REVOKED')) {
      return 'انتهت صلاحية الجلسة أو تم إلغاؤها من تيليجرام. يرجى تسجيل الدخول من جديد.';
    }
    return msg || 'حدث خطأ أثناء الاتصال بحساب تيليجرام.';
  }
}
