import express from 'express';
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import https from 'https';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

// Prefer IPv4 DNS resolution first so Cloud Run / container egress never stalls on unreachable IPv6 routes
dns.setDefaultResultOrder('ipv4first');
import { BotCapabilities, BotConfig, MediaItem, TelegramMessageOptions, TelegramUpdate } from './src/types/bot';
import { findButtonById, sanitizeBotToken } from './src/utils/telegramFormatters';
import {
  computeTotalPages,
  clampPage,
  defaultSessionManager,
} from './src/utils/pagination';
import {
  findContextAwareReplyAction,
  findParentFlowId,
  resolveMenuView,
  resolveSlashCommand,
} from './src/utils/flowEngine';
import { reconcileBots } from './src/utils/botPersistence';
import {
  buildTelegramMessageOptionFields,
  buildTelegramSendBody,
  classifyTelegramPollingError,
  sanitizeTelegramMarkup,
  shouldRestartPoller,
} from './src/utils/telegramDelivery';
import { TelegramScannerService } from './server/telegramScanner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'bots.json');
const DB_BACKUP_FILE = path.join(DATA_DIR, 'bots.json.bak');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf-8');
}

const scannerService = new TelegramScannerService(DATA_DIR, UPLOADS_DIR);

// Multer storage for media uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
});

let botsCache: BotConfig[] | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

function readBotsFromDisk(filePath: string): BotConfig[] | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    console.error(`Error reading bots from ${filePath}:`, err);
    return null;
  }
}

function loadBots(): BotConfig[] {
  if (botsCache !== null) {
    return botsCache;
  }
  const primary = readBotsFromDisk(DB_FILE);
  if (primary !== null) {
    botsCache = primary;
    return botsCache;
  }
  const backup = readBotsFromDisk(DB_BACKUP_FILE);
  if (backup !== null) {
    botsCache = backup;
    saveBots(backup);
    return botsCache;
  }
  botsCache = [];
  return botsCache;
}

function saveBots(bots: BotConfig[]) {
  botsCache = bots;
  try {
    const serialized = JSON.stringify(bots, null, 2);
    const tmpFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpFile, serialized, 'utf-8');
    if (fs.existsSync(DB_FILE)) {
      try {
        fs.copyFileSync(DB_FILE, DB_BACKUP_FILE);
      } catch {
        // Ignore backup copy failure
      }
    }
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('Error saving bots:', err);
  }
}

function withBotsWriteLock<T>(task: () => Promise<T> | T): Promise<T> {
  const run = writeQueue.then(() => task(), () => task());
  writeQueue = run.catch(() => {});
  return run;
}

// Telegram Active Polling Management
interface PollingState {
  botId: string;
  token: string;
  generation: number;
  isRunning: boolean;
  isStarting?: boolean;
  lastUpdateId: number;
  abortController: AbortController;
  lastError: string | null;
  lastCheck: string;
}

const activePollers = new Map<string, PollingState>();
const pollerGenerations = new Map<string, number>();

async function markBotUnauthorized(botId: string, description?: string) {
  stopPolling(botId);
  await withBotsWriteLock(() => {
    const list = [...loadBots()];
    const idx = list.findIndex((b) => b.id === botId);
    if (idx === -1) return;
    list[idx] = {
      ...list[idx],
      isConnected: false,
      connectionError:
        description || 'تم رفض التوكن من تيليجرام (Unauthorized). يرجى التحقق من التوكن.',
      updatedAt: new Date().toISOString(),
    };
    saveBots(list);
  });
}

function telegramHttpsJson(
  urlStr: string,
  options: {
    method?: 'GET' | 'POST';
    body?: any;
    timeoutMs?: number;
    signal?: AbortSignal;
    family?: 4 | 6;
  } = {}
): Promise<any> {
  const { method = 'GET', body, timeoutMs = 20_000, signal, family = 4 } = options;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      return reject(abortErr);
    }

    const parsed = new URL(urlStr);
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const headers: Record<string, string | number> = {};
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    let settled = false;
    const finish = (err: Error | null, data?: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal && onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
      if (err) reject(err);
      else resolve(data);
    };

    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
        family,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const json = raw ? JSON.parse(raw) : null;
            finish(null, json);
          } catch {
            finish(new Error(`استجابة غير صالحة من تيليجرام (HTTP ${res.statusCode || 0})`));
          }
        });
      }
    );

    const timer = setTimeout(() => {
      req.destroy();
      const timeoutErr = new Error('انتهت مهلة الاتصال بخوادم تيليجرام (Timeout)');
      timeoutErr.name = 'TimeoutError';
      finish(timeoutErr);
    }, timeoutMs);

    const onAbort = () => {
      req.destroy();
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      finish(abortErr);
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    req.on('error', (err) => {
      finish(err);
    });

    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

async function verifyTelegramToken(token: string): Promise<any> {
  const url = `https://api.telegram.org/bot${token}/getMe`;
  let lastError: any = null;

  for (const attempt of [
    { family: 4 as const, timeoutMs: 15_000 },
    { family: 4 as const, timeoutMs: 20_000 },
  ]) {
    try {
      return await telegramHttpsJson(url, {
        method: 'GET',
        family: attempt.family,
        timeoutMs: attempt.timeoutMs,
      });
    } catch (err: any) {
      lastError = err;
    }
  }

  // Final fallback via native fetch with IPv4-first DNS if https.request failed
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    return await res.json().catch(() => null);
  } catch (err: any) {
    throw lastError || err;
  }
}

async function callTelegramApi(token: string, method: string, body?: any) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  return telegramHttpsJson(url, {
    method: body ? 'POST' : 'GET',
    body,
    timeoutMs: 20_000,
    family: 4,
  });
}

async function callTelegramApiWithFallback(
  token: string,
  method: string,
  body: Record<string, any>
) {
  const cleanRes = await callTelegramApi(
    token,
    method,
    buildTelegramSendBody(body, 'clean')
  );
  if (cleanRes.ok) return cleanRes;
  if (
    cleanRes.error_code === 400 &&
    cleanRes.description?.includes('message is not modified')
  ) {
    return cleanRes;
  }

  if (cleanRes.error_code === 400) {
    console.warn(`Telegram API 400 on ${method}:`, cleanRes.description);
    const compatRes = await callTelegramApi(
      token,
      method,
      buildTelegramSendBody(body, 'compat')
    );
    if (compatRes.ok) return compatRes;

    const safeRes = await callTelegramApi(
      token,
      method,
      buildTelegramSendBody(body, 'safe')
    );
    if (!safeRes.ok) {
      console.warn(`Telegram API fallback failed on ${method}:`, safeRes.description);
    }
    return safeRes;
  }

  return cleanRes;
}

function extractBotCapabilities(meResult: any): BotCapabilities {
  if (!meResult || typeof meResult !== 'object') return {};
  return {
    canJoinGroups: Boolean(meResult.can_join_groups),
    canReadAllGroupMessages: Boolean(meResult.can_read_all_group_messages),
    supportsInlineQueries: Boolean(meResult.supports_inline_queries),
    hasTopicsEnabled: Boolean(meResult.has_topics_enabled),
    allowsUsersToCreateTopics: Boolean(meResult.allows_users_to_create_topics),
    hasMainWebApp: Boolean(meResult.has_main_web_app),
  };
}

async function sendMediaItems(
  token: string,
  chat_id: number,
  media: MediaItem[],
  attachReplyMarkupToLast?: any,
  messageOptions?: TelegramMessageOptions
): Promise<number | undefined> {
  const msgOptFields = buildTelegramMessageOptionFields(messageOptions);
  delete msgOptFields.link_preview_options;

  let lastMessageId: number | undefined;
  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    const isLast = i === media.length - 1;
    const rawReplyMarkup = isLast ? attachReplyMarkupToLast : undefined;
    const replyMarkup = rawReplyMarkup
      ? sanitizeTelegramMarkup(rawReplyMarkup, 'clean')
      : undefined;
    const caption = m.skipCaption ? undefined : m.caption || undefined;

    const isLocalUpload = m.url.startsWith('/uploads/');
    const localPath = isLocalUpload ? path.join(UPLOADS_DIR, path.basename(m.url)) : null;

    if (localPath && fs.existsSync(localPath)) {
      try {
        const fileBuffer = fs.readFileSync(localPath);
        const sendLocalWithLevel = async (level: 'clean' | 'compat' | 'safe') => {
          const formData = new FormData();
          formData.append('chat_id', chat_id.toString());
          if (caption) formData.append('caption', caption);
          if (m.hasSpoiler && level !== 'safe') {
            formData.append('has_spoiler', 'true');
          }
          if (m.showCaptionAboveMedia && level === 'clean') {
            formData.append('show_caption_above_media', 'true');
          }
          if (msgOptFields.protect_content && level !== 'safe') {
            formData.append('protect_content', 'true');
          }
          if (msgOptFields.disable_notification && level !== 'safe') {
            formData.append('disable_notification', 'true');
          }
          if (msgOptFields.message_effect_id && level === 'clean') {
            formData.append('message_effect_id', String(msgOptFields.message_effect_id));
          }
          if (rawReplyMarkup) {
            formData.append(
              'reply_markup',
              JSON.stringify(sanitizeTelegramMarkup(rawReplyMarkup, level))
            );
          }

          let method = 'sendDocument';
          let fieldName = 'document';
          if (m.type === 'photo') {
            method = 'sendPhoto';
            fieldName = 'photo';
          } else if (m.type === 'video') {
            method = 'sendVideo';
            fieldName = 'video';
          } else if (m.type === 'audio') {
            method = 'sendAudio';
            fieldName = 'audio';
          } else if (m.type === 'voice') {
            method = 'sendVoice';
            fieldName = 'voice';
          }

          formData.append(
            fieldName,
            new Blob([fileBuffer]),
            m.fileName || path.basename(localPath)
          );
          const uploadRes = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
            method: 'POST',
            body: formData,
          });
          return uploadRes.json();
        };

        let uploadData = await sendLocalWithLevel('clean');
        if (!uploadData.ok && uploadData.error_code === 400) {
          uploadData = await sendLocalWithLevel('compat');
          if (!uploadData.ok && uploadData.error_code === 400) {
            uploadData = await sendLocalWithLevel('safe');
          }
        }
        if (uploadData.ok) {
          lastMessageId = uploadData.result?.message_id;
          continue;
        }
      } catch (err) {
        console.error('Error sending local media file to Telegram:', err);
      }
    }

    const mediaUrl = m.url.startsWith('http')
      ? m.url
      : `${process.env.APP_URL || 'http://localhost:3000'}${m.url}`;

    const methodMap: Record<string, { method: string; field: string }> = {
      photo: { method: 'sendPhoto', field: 'photo' },
      video: { method: 'sendVideo', field: 'video' },
      audio: { method: 'sendAudio', field: 'audio' },
      voice: { method: 'sendVoice', field: 'voice' },
      document: { method: 'sendDocument', field: 'document' },
    };
    const target = methodMap[m.type] || methodMap.document;
    const res = await callTelegramApiWithFallback(token, target.method, {
      chat_id,
      [target.field]: mediaUrl,
      ...(caption ? { caption } : {}),
      ...(m.hasSpoiler ? { has_spoiler: true } : {}),
      ...(m.showCaptionAboveMedia ? { show_caption_above_media: true } : {}),
      ...msgOptFields,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    if (res.ok && res.result?.message_id) {
      lastMessageId = res.result.message_id;
    }
  }
  return lastMessageId;
}

async function syncBotProfileAndCommands(botOrToken: BotConfig | string) {
  const token =
    typeof botOrToken === 'string' ? botOrToken.trim() : botOrToken.token?.trim();
  if (!token) return;
  const bot = typeof botOrToken === 'string' ? null : botOrToken;

  const defaultCommands = [
    { command: 'start', description: 'بدء المحادثة وعرض القائمة والأزرار الرئيسية' },
    { command: 'menu', description: 'عرض القائمة الرئيسية والأزرار' },
    { command: 'help', description: 'المساعدة ومعلومات البوت' },
  ];

  const customCommands = (bot?.commands || [])
    .map((c) => ({
      command: (c.command || '')
        .replace(/^\//, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 32),
      description: (c.description || c.command || 'أمر مخصص').trim().slice(0, 256),
    }))
    .filter((c) => c.command.length > 0 && c.description.length > 0);

  const commandsToSync = customCommands.length > 0 ? customCommands : defaultCommands;

  try {
    await callTelegramApi(token, 'setMyCommands', { commands: commandsToSync });
  } catch {
    // Non-fatal
  }

  if (bot?.profile) {
    const {
      displayName,
      description,
      shortDescription,
      menuButtonType,
      menuButtonText,
      menuButtonWebAppUrl,
    } = bot.profile;

    if (displayName && displayName.trim()) {
      await callTelegramApi(token, 'setMyName', {
        name: displayName.trim().slice(0, 64),
      }).catch(() => {});
    }
    if (typeof description === 'string' && description.trim()) {
      await callTelegramApi(token, 'setMyDescription', {
        description: description.trim().slice(0, 512),
      }).catch(() => {});
    }
    if (typeof shortDescription === 'string' && shortDescription.trim()) {
      await callTelegramApi(token, 'setMyShortDescription', {
        short_description: shortDescription.trim().slice(0, 120),
      }).catch(() => {});
    }
    if (menuButtonType) {
      let menuButtonPayload: Record<string, any> = { type: 'default' };
      if (menuButtonType === 'commands') {
        menuButtonPayload = { type: 'commands' };
      } else if (menuButtonType === 'web_app' && menuButtonWebAppUrl?.trim()) {
        menuButtonPayload = {
          type: 'web_app',
          text: menuButtonText?.trim() || 'فتح التطبيق',
          web_app: { url: menuButtonWebAppUrl.trim() },
        };
      }
      await callTelegramApi(token, 'setChatMenuButton', {
        menu_button: menuButtonPayload,
      }).catch(() => {});
    }
  }
}

async function renderMenu(
  bot: BotConfig,
  chat_id: number,
  menuId: string,
  page: number = 0,
  updateMessageId?: number,
  userId?: number,
  options?: { sendMedia?: boolean }
): Promise<number | undefined> {
  if (!bot.token) return;

  const session = defaultSessionManager.getOrCreateSession(bot.id, chat_id, userId);
  const view = resolveMenuView(bot, menuId, page);
  if (view.isSkipped) return updateMessageId;

  const inlineMarkup =
    view.inlineRows.length > 0 ? { inline_keyboard: view.inlineRows } : undefined;
  const replyMarkup = view.replyMarkup;

  const parseMode =
    view.parseMode && view.parseMode !== 'none' ? view.parseMode : undefined;
  const msgOptionFields = buildTelegramMessageOptionFields(view.messageOptions);

  const shouldSendMedia = options?.sendMedia !== false && view.media.length > 0;
  const hasExplicitText = view.hasExplicitText;

  // If user skipped message text AND has media AND has no replyKeyboard conflict,
  // attach inlineMarkup directly to the last media item cleanly!
  if (
    !hasExplicitText &&
    shouldSendMedia &&
    !replyMarkup &&
    view.placement !== 'before_media'
  ) {
    const mediaMsgId = await sendMediaItems(
      bot.token,
      chat_id,
      view.media,
      inlineMarkup,
      view.messageOptions
    );
    if (mediaMsgId) session.messageId = mediaMsgId;
    session.lastKeyboardMode = inlineMarkup ? 'inline' : 'none';
    return mediaMsgId;
  }

  // Send media before message if configured
  if (shouldSendMedia && view.placement !== 'before_media') {
    await sendMediaItems(bot.token, chat_id, view.media, undefined, view.messageOptions);
  }

  // Telegram Bot API strictly requires non-empty text for sendMessage/editMessageText
  const targetBtn = !view.isMain ? findButtonById(bot, menuId)?.button : undefined;
  const mainFallbackText =
    view.isMain && !hasExplicitText && !inlineMarkup && !replyMarkup && !shouldSendMedia && !bot.startMessage?.skipMessage
      ? bot.commands && bot.commands.length > 0
        ? `الأوامر المتاحة:\n${bot.commands.map((c) => `/${c.command} — ${c.description}`).join('\n')}`
        : bot.profile?.description?.trim() ||
          bot.profile?.shortDescription?.trim() ||
          `مرحباً بك في ${bot.name || 'البوت'}!`
      : '';

  const effectiveText = hasExplicitText
    ? view.text
    : inlineMarkup || replyMarkup
    ? targetBtn?.text || '⬇️'
    : mainFallbackText;

  if (!effectiveText) {
    if (shouldSendMedia && view.placement === 'before_media') {
      await sendMediaItems(bot.token, chat_id, view.media, undefined, view.messageOptions);
    }
    return updateMessageId;
  }

  const shouldEdit =
    Boolean(updateMessageId) &&
    Boolean(inlineMarkup) &&
    !replyMarkup &&
    view.updateMode !== 'new';

  let sentMessageId: number | undefined;

  if (shouldEdit && updateMessageId) {
    try {
      const editRes = await callTelegramApiWithFallback(bot.token, 'editMessageText', {
        chat_id,
        message_id: updateMessageId,
        text: effectiveText,
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(msgOptionFields.link_preview_options
          ? { link_preview_options: msgOptionFields.link_preview_options }
          : {}),
        reply_markup: inlineMarkup,
      });

      if (editRes.ok) {
        sentMessageId = editRes.result?.message_id || updateMessageId;
      } else if (editRes.description?.includes('message is not modified')) {
        sentMessageId = updateMessageId;
      } else {
        const markupRes = await callTelegramApiWithFallback(
          bot.token,
          'editMessageReplyMarkup',
          {
            chat_id,
            message_id: updateMessageId,
            reply_markup: inlineMarkup,
          }
        );
        if (markupRes.ok) {
          sentMessageId = markupRes.result?.message_id || updateMessageId;
        }
      }
    } catch {
      // Fall through to sendMessage
    }
  }

  if (!sentMessageId) {
    // Handle clean Reply -> Inline transition if needed when removeKeyboard is explicit
    const primaryMarkup = inlineMarkup || replyMarkup;
    const sendRes = await callTelegramApiWithFallback(bot.token, 'sendMessage', {
      chat_id,
      text: effectiveText,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      ...msgOptionFields,
      ...(primaryMarkup ? { reply_markup: primaryMarkup } : {}),
    });
    if (sendRes.error_code === 401) {
      await markBotUnauthorized(bot.id, sendRes.description);
      return undefined;
    }
    sentMessageId = sendRes.result?.message_id;

    // Telegram API cannot carry both inline_keyboard and reply_keyboard in the exact same message;
    // when a flow defines BOTH, send the reply keyboard in a companion message.
    if (inlineMarkup && replyMarkup) {
      await callTelegramApiWithFallback(bot.token, 'sendMessage', {
        chat_id,
        text: targetBtn?.text ? `${targetBtn.text}:` : '⬇️',
        reply_markup: replyMarkup,
      });
    }
  }

  if (shouldSendMedia && view.placement === 'before_media') {
    await sendMediaItems(bot.token, chat_id, view.media, undefined, view.messageOptions);
  }

  if (replyMarkup && inlineMarkup) session.lastKeyboardMode = 'both';
  else if (replyMarkup) session.lastKeyboardMode = 'reply';
  else if (inlineMarkup) session.lastKeyboardMode = 'inline';
  else session.lastKeyboardMode = 'none';

  if (sentMessageId) session.messageId = sentMessageId;
  return sentMessageId;
}

async function executeFlow(
  bot: BotConfig,
  chat_id: number,
  buttonId: string,
  fromMessageId?: number,
  userId?: number,
  callbackQueryId?: string
) {
  if (!bot.token) return;
  const token = bot.token;
  let callbackAnswered = false;
  const answerCallbackOnce = async (opts?: { text?: string; show_alert?: boolean }) => {
    if (!callbackQueryId || callbackAnswered) return;
    callbackAnswered = true;
    await callTelegramApi(token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(opts?.text ? { text: opts.text.slice(0, 200) } : {}),
      ...(opts?.show_alert ? { show_alert: true } : {}),
    }).catch(() => {});
  };

  try {
    const session = defaultSessionManager.getOrCreateSession(bot.id, chat_id, userId);
    const view = resolveMenuView(bot, buttonId, 0);

    if (view.isSkipped) {
      await answerCallbackOnce();
      return;
    }

    // If flow has explicit ordered FlowActions configured, execute them in order!
    if (view.actions && view.actions.length > 0) {
      let mediaSent = false;
      let flowRendered = false;

      for (const action of view.actions) {
        if (!action.enabled) continue;

        switch (action.type) {
          case 'callback_alert':
            await answerCallbackOnce({
              text: action.config?.text?.trim() || 'تم التنفيذ بنجاح ✅',
              show_alert: Boolean(action.config?.showAlert),
            });
            break;

          case 'send_chat_action':
            await callTelegramApi(token, 'sendChatAction', {
              chat_id,
              action: action.config?.chatAction || 'typing',
            }).catch(() => {});
            await new Promise((resolve) => setTimeout(resolve, 350));
            break;

          case 'set_reaction':
            if (fromMessageId) {
              await callTelegramApi(token, 'setMessageReaction', {
                chat_id,
                message_id: fromMessageId,
                reaction: [
                  {
                    type: 'emoji',
                    emoji: action.config?.reactionEmoji?.trim() || '👍',
                  },
                ],
                ...(action.config?.reactionIsBig ? { is_big: true } : {}),
              }).catch(() => {});
            }
            break;

          case 'send_dice':
            await callTelegramApi(token, 'sendDice', {
              chat_id,
              emoji: action.config?.diceEmoji || '🎲',
            }).catch(() => {});
            flowRendered = true;
            break;

          case 'send_poll': {
            const rawOpts = (action.config?.pollOptions || [])
              .map((o) => o.trim())
              .filter(Boolean);
            const opts = rawOpts.length >= 2 ? rawOpts.slice(0, 10) : ['نعم', 'لا'];
            const pollType = action.config?.pollType === 'quiz' ? 'quiz' : 'regular';
            const correctIdx = Math.min(
              opts.length - 1,
              Math.max(0, action.config?.pollCorrectOptionIndex ?? 0)
            );
            await callTelegramApi(token, 'sendPoll', {
              chat_id,
              question:
                action.config?.pollQuestion?.trim() ||
                action.config?.text?.trim() ||
                'استطلاع رأي سريع',
              options: opts.map((text) => ({ text })),
              type: pollType,
              ...(pollType === 'regular' && action.config?.pollAllowsMultiple
                ? { allows_multiple_answers: true }
                : {}),
              ...(pollType === 'quiz'
                ? {
                    correct_option_id: correctIdx,
                    ...(action.config?.pollAllowsMultiple
                      ? { correct_option_ids: [correctIdx], allows_multiple_answers: true }
                      : {}),
                    ...(action.config?.pollExplanation?.trim()
                      ? { explanation: action.config.pollExplanation.trim() }
                      : {}),
                  }
                : {}),
            }).catch(() => {});
            flowRendered = true;
            break;
          }

          case 'send_checklist': {
            const rawTasks = (action.config?.checklistTasks || [])
              .map((t) => t.trim())
              .filter(Boolean);
            const tasks = rawTasks.length > 0 ? rawTasks : ['المهمة الأولى', 'المهمة الثانية'];
            const title =
              action.config?.checklistTitle?.trim() ||
              action.config?.text?.trim() ||
              'قائمة المهام';
            const checklistRes = await callTelegramApi(token, 'sendChecklist', {
              chat_id,
              checklist: {
                title,
                tasks: tasks.map((text, idx) => ({ id: idx + 1, text })),
                ...(action.config?.checklistOthersCanAdd
                  ? { others_can_add_tasks: true }
                  : {}),
                ...(action.config?.checklistOthersCanMark !== false
                  ? { others_can_mark_tasks_as_done: true }
                  : {}),
              },
            }).catch(() => ({ ok: false }));
            if (!checklistRes?.ok) {
              const fallbackText = `<b>${title.replace(/[<>&]/g, '')}</b>\n${tasks
                .map((t) => `☐ ${t.replace(/[<>&]/g, '')}`)
                .join('\n')}`;
              await callTelegramApiWithFallback(token, 'sendMessage', {
                chat_id,
                text: fallbackText,
                parse_mode: 'HTML',
              });
            }
            flowRendered = true;
            break;
          }

          case 'send_draft_stream': {
            const fullText =
              action.config?.text?.trim() ||
              'جاري تجهيز الرد المباشر عبر البث التدريجي... تم بنجاح ✅';
            const words = fullText.split(/\s+/);
            const steps =
              words.length >= 6
                ? [
                    words.slice(0, Math.ceil(words.length / 3)).join(' ') + ' ▌',
                    words.slice(0, Math.ceil((words.length * 2) / 3)).join(' ') + ' ▌',
                  ]
                : [];
            const draftId = Math.max(1, Math.floor(Date.now() % 1_000_000));
            let streamedMsgId: number | undefined;
            for (const stepText of steps) {
              const draftRes = await callTelegramApi(token, 'sendMessageDraft', {
                chat_id,
                draft_id: draftId,
                text: stepText,
              }).catch(() => ({ ok: false }));
              if (!draftRes?.ok) {
                if (!streamedMsgId) {
                  const sRes = await callTelegramApiWithFallback(token, 'sendMessage', {
                    chat_id,
                    text: stepText,
                  });
                  streamedMsgId = sRes.result?.message_id;
                } else {
                  await callTelegramApiWithFallback(token, 'editMessageText', {
                    chat_id,
                    message_id: streamedMsgId,
                    text: stepText,
                  }).catch(() => {});
                }
              }
              await new Promise((resolve) => setTimeout(resolve, 260));
            }
            if (streamedMsgId) {
              await callTelegramApiWithFallback(token, 'editMessageText', {
                chat_id,
                message_id: streamedMsgId,
                text: fullText,
              }).catch(() => {});
            } else {
              await callTelegramApiWithFallback(token, 'sendMessage', {
                chat_id,
                text: fullText,
              });
            }
            flowRendered = true;
            break;
          }

          case 'delete_message':
            if (fromMessageId) {
              await callTelegramApi(token, 'deleteMessage', {
                chat_id,
                message_id: fromMessageId,
              }).catch(() => {});
            }
            break;

          case 'send_message':
            if (action.config?.text?.trim()) {
              await callTelegramApiWithFallback(token, 'sendMessage', {
                chat_id,
                text: action.config.text,
                ...(action.config.parseMode && action.config.parseMode !== 'none'
                  ? { parse_mode: action.config.parseMode }
                  : {}),
              });
            }
            break;

          case 'edit_message':
            if (fromMessageId && action.config?.text?.trim()) {
              await callTelegramApiWithFallback(token, 'editMessageText', {
                chat_id,
                message_id: fromMessageId,
                text: action.config.text,
                ...(action.config.parseMode && action.config.parseMode !== 'none'
                  ? { parse_mode: action.config.parseMode }
                  : {}),
              }).catch(() => {});
            }
            break;

          case 'send_media':
            if (view.media.length > 0 && !mediaSent) {
              await sendMediaItems(token, chat_id, view.media, undefined, view.messageOptions);
              mediaSent = true;
            }
            break;

          case 'remove_reply_keyboard':
            await callTelegramApi(token, 'sendMessage', {
              chat_id,
              text: action.config?.text?.trim() || 'تم إغلاق لوحة المفاتيح.',
              reply_markup: {
                remove_keyboard: true,
                ...(action.config?.selective ? { selective: true } : {}),
              },
            });
            break;

          case 'force_reply':
            await callTelegramApi(token, 'sendMessage', {
              chat_id,
              text: action.config?.text?.trim() || 'الرجاء كتابة ردك:',
              reply_markup: {
                force_reply: true,
                ...(action.config?.placeholder
                  ? { input_field_placeholder: action.config.placeholder }
                  : {}),
                ...(action.config?.selective ? { selective: true } : {}),
              },
            });
            break;

          case 'jump_to_flow':
            if (action.config?.targetFlowId) {
              defaultSessionManager.pushMenu(
                bot.id,
                chat_id,
                action.config.targetFlowId,
                buttonId,
                fromMessageId,
                userId
              );
              await renderMenu(
                bot,
                chat_id,
                action.config.targetFlowId,
                action.config.targetPage ?? 0,
                undefined,
                userId
              );
              flowRendered = true;
            }
            break;

          case 'jump_to_page': {
            const targetPage = action.config?.targetPage ?? 0;
            session.currentPage = Math.max(0, targetPage);
            await renderMenu(bot, chat_id, buttonId, session.currentPage, fromMessageId, userId, {
              sendMedia: !mediaSent,
            });
            flowRendered = true;
            mediaSent = true;
            break;
          }

          case 'go_back': {
            const { session: popped } = defaultSessionManager.popMenu(bot.id, chat_id, userId);
            await renderMenu(bot, chat_id, popped.currentMenuId, popped.currentPage, fromMessageId, userId);
            return;
          }

          case 'go_parent': {
            const parentId = findParentFlowId(bot, buttonId) || 'main';
            session.currentMenuId = parentId;
            session.currentPage = 0;
            await renderMenu(bot, chat_id, parentId, 0, fromMessageId, userId);
            return;
          }

          case 'go_home':
            defaultSessionManager.resetToMain(bot.id, chat_id, userId);
            await renderMenu(bot, chat_id, 'main', 0, fromMessageId, userId);
            return;

          case 'close_flow':
            if (fromMessageId) {
              await callTelegramApi(token, 'deleteMessage', {
                chat_id,
                message_id: fromMessageId,
              }).catch(() => {});
            }
            return;

          case 'open_flow':
          case 'show_reply_keyboard':
          default:
            await renderMenu(bot, chat_id, buttonId, 0, fromMessageId, userId, {
              sendMedia: !mediaSent,
            });
            flowRendered = true;
            mediaSent = true;
            break;
        }
      }

      if (!flowRendered && (view.hasExplicitText || view.inlineRows.length > 0 || view.replyMarkup || (!mediaSent && view.media.length > 0))) {
        await renderMenu(bot, chat_id, buttonId, 0, fromMessageId, userId, {
          sendMedia: !mediaSent,
        });
      }
      return;
    }

    // Standard execution without custom action list
    await renderMenu(bot, chat_id, buttonId, 0, fromMessageId, userId);
  } finally {
    await answerCallbackOnce();
  }
}

async function handleTelegramMessage(
  bot: BotConfig,
  message: NonNullable<TelegramUpdate['message']>
) {
  if (!bot.token) return;
  const chat_id = message.chat.id;
  const userId = message.from?.id;

  // 1. Handle Contact sharing
  if (message.contact) {
    const phone = message.contact.phone_number || '';
    await callTelegramApi(bot.token, 'sendMessage', {
      chat_id,
      text: `شكراً لك! تم استلام رقم الهاتف بنجاح (${phone}) ✅`,
    });
    return;
  }

  // 2. Handle Location sharing
  if (message.location) {
    await callTelegramApi(bot.token, 'sendMessage', {
      chat_id,
      text: `شكراً لك! تم استلام موقعك الجغرافي بنجاح (${message.location.latitude}, ${message.location.longitude}) 📍`,
    });
    return;
  }

  // 3. Handle Poll / Users Shared / Chat Shared / Web App Data
  if (message.poll) {
    await callTelegramApi(bot.token, 'sendMessage', {
      chat_id,
      text: `تم استلام الاستطلاع: ${message.poll.question} 📊`,
    });
    return;
  }
  if (message.users_shared) {
    await callTelegramApi(bot.token, 'sendMessage', {
      chat_id,
      text: `تم اختيار ${message.users_shared.users.length} مستخدم بنجاح ✅`,
    });
    return;
  }
  if (message.chat_shared) {
    await callTelegramApi(bot.token, 'sendMessage', {
      chat_id,
      text: `تم اختيار المحادثة (${message.chat_shared.title || message.chat_shared.chat_id}) ✅`,
    });
    return;
  }
  if (message.web_app_data) {
    await callTelegramApi(bot.token, 'sendMessage', {
      chat_id,
      text: `تم استلام بيانات تطبيق الويب (${message.web_app_data.button_text}) ✅`,
    });
    return;
  }

  const normalizedText = (message.text || '').trim();

  // Check custom & built-in slash commands first
  const slashMatch = resolveSlashCommand(bot, normalizedText);
  if (slashMatch.matched) {
    if (slashMatch.targetMenuId === 'main') {
      defaultSessionManager.resetToMain(bot.id, chat_id, userId);
      await renderMenu(bot, chat_id, 'main', 0, undefined, userId);
    } else {
      defaultSessionManager.pushMenu(
        bot.id,
        chat_id,
        slashMatch.targetMenuId,
        slashMatch.targetMenuId,
        message.message_id,
        userId
      );
      await executeFlow(bot, chat_id, slashMatch.targetMenuId, message.message_id, userId);
    }
    return;
  }

  const isStartOrMenu =
    normalizedText.toLowerCase() === 'start' ||
    normalizedText.toLowerCase() === 'menu' ||
    normalizedText.toLowerCase() === 'help' ||
    normalizedText === 'ابدأ' ||
    normalizedText === 'البداية' ||
    normalizedText === 'القائمة' ||
    normalizedText === 'قائمة' ||
    normalizedText === 'مرحبا' ||
    normalizedText === 'أهلاً' ||
    normalizedText === 'السلام عليكم' ||
    normalizedText === 'هلا';

  if (isStartOrMenu) {
    defaultSessionManager.resetToMain(bot.id, chat_id, userId);
    await renderMenu(bot, chat_id, 'main', 0, undefined, userId);
    return;
  }

  const session = defaultSessionManager.getOrCreateSession(bot.id, chat_id, userId);
  const match = findContextAwareReplyAction(bot, session, normalizedText);

  if (match) {
    const view = resolveMenuView(bot, session.currentMenuId, session.currentPage);
    const totalPages = view.totalReplyPages;

    switch (match.kind) {
      case 'page_next':
        session.currentPage = clampPage(session.currentPage + 1, totalPages);
        await renderMenu(bot, chat_id, session.currentMenuId, session.currentPage, undefined, userId);
        return;
      case 'page_prev':
        session.currentPage = clampPage(session.currentPage - 1, totalPages);
        await renderMenu(bot, chat_id, session.currentMenuId, session.currentPage, undefined, userId);
        return;
      case 'page_first':
        session.currentPage = 0;
        await renderMenu(bot, chat_id, session.currentMenuId, 0, undefined, userId);
        return;
      case 'page_last':
        session.currentPage = Math.max(0, totalPages - 1);
        await renderMenu(bot, chat_id, session.currentMenuId, session.currentPage, undefined, userId);
        return;
      case 'page_number':
        session.currentPage = clampPage(match.page, totalPages);
        await renderMenu(bot, chat_id, session.currentMenuId, session.currentPage, undefined, userId);
        return;
      case 'nav_back': {
        const { session: popped } = defaultSessionManager.popMenu(bot.id, chat_id, userId);
        await renderMenu(bot, chat_id, popped.currentMenuId, popped.currentPage, undefined, userId);
        return;
      }
      case 'nav_parent': {
        const parentId = findParentFlowId(bot, session.currentMenuId) || 'main';
        session.currentMenuId = parentId;
        session.currentPage = 0;
        await renderMenu(bot, chat_id, parentId, 0, undefined, userId);
        return;
      }
      case 'nav_main':
        defaultSessionManager.resetToMain(bot.id, chat_id, userId);
        await renderMenu(bot, chat_id, 'main', 0, undefined, userId);
        return;
      case 'jump_flow':
        defaultSessionManager.pushMenu(bot.id, chat_id, match.flowId, match.flowId, undefined, userId);
        await executeFlow(bot, chat_id, match.flowId, undefined, userId);
        return;
      case 'button':
        if (match.button.actionType === 'none' || match.button.skipFlow) {
          return;
        }
        defaultSessionManager.pushMenu(
          bot.id,
          chat_id,
          match.button.id,
          match.button.id,
          undefined,
          userId
        );
        await executeFlow(bot, chat_id, match.button.id, undefined, userId);
        return;
    }
  }

  // Fallback for unrecognized free text: show main menu cleanly
  defaultSessionManager.resetToMain(bot.id, chat_id, userId);
  await renderMenu(bot, chat_id, 'main', 0, undefined, userId);
}

function ensureBotPolling(bot: BotConfig) {
  const poller = activePollers.get(bot.id);
  const decision = shouldRestartPoller(bot, poller, Date.now());
  if (decision.restart) {
    void startPolling(bot);
  }
}

async function startPolling(bot: BotConfig) {
  const token = bot.token?.trim();
  if (!token) return false;

  const gen = (pollerGenerations.get(bot.id) || 0) + 1;
  pollerGenerations.set(bot.id, gen);

  stopPolling(bot.id);

  // Stop any other active poller sharing the exact same token to eliminate 409 Conflicts
  for (const [otherId, otherState] of activePollers.entries()) {
    if (otherId !== bot.id && otherState.token === token) {
      stopPolling(otherId);
    }
  }

  const abortController = new AbortController();
  const state: PollingState = {
    botId: bot.id,
    token,
    generation: gen,
    isRunning: true,
    isStarting: true,
    lastUpdateId: 0,
    abortController,
    lastError: null,
    lastCheck: new Date().toISOString(),
  };

  activePollers.set(bot.id, state);

  await new Promise((resolve) => setTimeout(resolve, 650));

  if (
    pollerGenerations.get(bot.id) !== gen ||
    !state.isRunning ||
    abortController.signal.aborted
  ) {
    return false;
  }

  // Ensure any stale webhook does not block getUpdates
  await callTelegramApi(token, 'deleteWebhook', { drop_pending_updates: false }).catch(() => {});
  syncBotProfileAndCommands(bot).catch(() => {});

  if (
    pollerGenerations.get(bot.id) !== gen ||
    !state.isRunning ||
    abortController.signal.aborted
  ) {
    return false;
  }

  state.isStarting = false;
  state.lastCheck = new Date().toISOString();

  (async () => {
    const allowedUpdatesParam = encodeURIComponent(
      JSON.stringify(['message', 'callback_query', 'inline_query', 'message_reaction'])
    );
    while (
      state.isRunning &&
      !abortController.signal.aborted &&
      pollerGenerations.get(bot.id) === gen
    ) {
      const requestController = new AbortController();
      const onParentAbort = () => requestController.abort();
      abortController.signal.addEventListener('abort', onParentAbort, { once: true });
      const requestTimeout = setTimeout(() => requestController.abort(), 15_000);

      try {
        const botsBeforePoll = loadBots();
        const botBeforePoll = botsBeforePoll.find((b) => b.id === bot.id);
        if (!botBeforePoll || !botBeforePoll.isConnected || botBeforePoll.token?.trim() !== state.token) {
          state.isRunning = false;
          break;
        }

        const url = `https://api.telegram.org/bot${state.token}/getUpdates?offset=${
          state.lastUpdateId + 1
        }&timeout=5&allowed_updates=${allowedUpdatesParam}`;
        const data = await telegramHttpsJson(url, {
          method: 'GET',
          family: 4,
          timeoutMs: 14_500,
          signal: requestController.signal,
        });

        state.lastCheck = new Date().toISOString();

        if (data.ok && Array.isArray(data.result)) {
          state.lastError = null;

          // Re-read the latest bot configuration AFTER getUpdates returns so
          // buttons/flows added during the long-poll window apply immediately!
          const currentBot = loadBots().find((b) => b.id === bot.id) || botBeforePoll;

          for (const update of data.result as TelegramUpdate[]) {
            state.lastUpdateId = update.update_id;

            try {
              if (update.message?.chat?.id) {
                await handleTelegramMessage(currentBot, update.message);
              } else if (update.inline_query) {
                const iq = update.inline_query;
                const guestEnabled =
                  currentBot.apiFeatures?.enableInlineGuestMode ??
                  Boolean(currentBot.capabilities?.supportsInlineQueries);
                if (guestEnabled) {
                  const queryHint = iq.query?.trim();
                  const title =
                    currentBot.apiFeatures?.inlineGuestTitle?.trim() || currentBot.name;
                  const description =
                    currentBot.apiFeatures?.inlineGuestDescription?.trim() ||
                    'مشاركة رسالة البوت عبر وضع Inline / وضع الضيف (API 10.0)';
                  const rawMessageText =
                    currentBot.apiFeatures?.inlineGuestMessageText?.trim() ||
                    currentBot.startMessage?.text?.trim() ||
                    currentBot.name;
                  const finalMessageText = queryHint
                    ? `${rawMessageText}\n\n🔍 ${queryHint}`
                    : rawMessageText;

                  await callTelegramApi(state.token, 'answerInlineQuery', {
                    inline_query_id: iq.id,
                    results: [
                      {
                        type: 'article',
                        id: `iq_${iq.id}`,
                        title,
                        description,
                        input_message_content: {
                          message_text: finalMessageText,
                        },
                      },
                    ],
                    cache_time: 10,
                  }).catch(() => {});
                } else {
                  await callTelegramApi(state.token, 'answerInlineQuery', {
                    inline_query_id: iq.id,
                    results: [],
                    cache_time: 5,
                  }).catch(() => {});
                }
              } else if (update.message_reaction?.chat?.id) {
                const mr = update.message_reaction;
                if (
                  currentBot.apiFeatures?.enableReactions &&
                  currentBot.apiFeatures?.reactionAutoReply?.trim() &&
                  Array.isArray(mr.new_reaction) &&
                  mr.new_reaction.length > 0
                ) {
                  const emoji = mr.new_reaction[0]?.emoji || '❤️';
                  const replyText = currentBot.apiFeatures.reactionAutoReply
                    .replace(/\{emoji\}/g, emoji);
                  await callTelegramApi(state.token, 'sendMessage', {
                    chat_id: mr.chat.id,
                    text: replyText,
                  }).catch(() => {});
                }
              } else if (update.callback_query) {
                const cq = update.callback_query;

                if (cq.data && cq.message?.chat?.id) {
                  const chatId = cq.message.chat.id;
                  const messageId = cq.message.message_id;
                  const userId = cq.from?.id;

                  if (cq.data === 'pg:info') {
                    await callTelegramApi(state.token, 'answerCallbackQuery', {
                      callback_query_id: cq.id,
                    }).catch(() => {});
                  } else if (cq.data.startsWith('pg:')) {
                    await callTelegramApi(state.token, 'answerCallbackQuery', {
                      callback_query_id: cq.id,
                    }).catch(() => {});
                    const target = cq.data.slice(3);
                    const session = defaultSessionManager.getOrCreateSession(
                      currentBot.id,
                      chatId,
                      userId
                    );
                    const view = resolveMenuView(currentBot, session.currentMenuId, session.currentPage);
                    const totalPages = view.totalInlinePages;

                    let targetPage = session.currentPage;
                    if (target === 'next') targetPage = session.currentPage + 1;
                    else if (target === 'prev') targetPage = session.currentPage - 1;
                    else targetPage = parseInt(target, 10);

                    defaultSessionManager.navigatePage(
                      currentBot.id,
                      chatId,
                      targetPage,
                      totalPages,
                      userId
                    );
                    await renderMenu(
                      currentBot,
                      chatId,
                      session.currentMenuId,
                      session.currentPage,
                      messageId,
                      userId,
                      { sendMedia: view.inlinePagination?.mode === 'manual' }
                    );
                  } else if (cq.data === 'nav:back') {
                    await callTelegramApi(state.token, 'answerCallbackQuery', {
                      callback_query_id: cq.id,
                    }).catch(() => {});
                    const { session: newSession } = defaultSessionManager.popMenu(
                      currentBot.id,
                      chatId,
                      userId
                    );
                    await renderMenu(
                      currentBot,
                      chatId,
                      newSession.currentMenuId,
                      newSession.currentPage,
                      messageId,
                      userId
                    );
                  } else if (cq.data === 'nav:parent') {
                    await callTelegramApi(state.token, 'answerCallbackQuery', {
                      callback_query_id: cq.id,
                    }).catch(() => {});
                    const session = defaultSessionManager.getOrCreateSession(
                      currentBot.id,
                      chatId,
                      userId
                    );
                    const parentId = findParentFlowId(currentBot, session.currentMenuId) || 'main';
                    session.currentMenuId = parentId;
                    session.currentPage = 0;
                    await renderMenu(currentBot, chatId, parentId, 0, messageId, userId);
                  } else if (cq.data === 'nav:main') {
                    await callTelegramApi(state.token, 'answerCallbackQuery', {
                      callback_query_id: cq.id,
                    }).catch(() => {});
                    defaultSessionManager.resetToMain(currentBot.id, chatId, userId);
                    await renderMenu(currentBot, chatId, 'main', 0, messageId, userId);
                  } else {
                    const found = findButtonById(currentBot, cq.data);
                    const targetButtonId = found?.button.id || cq.data;
                    if (found?.button.actionType === 'none' || found?.button.skipFlow) {
                      await callTelegramApi(state.token, 'answerCallbackQuery', {
                        callback_query_id: cq.id,
                      }).catch(() => {});
                      continue;
                    }
                    defaultSessionManager.pushMenu(
                      currentBot.id,
                      chatId,
                      targetButtonId,
                      targetButtonId,
                      messageId,
                      userId
                    );
                    await executeFlow(
                      currentBot,
                      chatId,
                      targetButtonId,
                      messageId,
                      userId,
                      cq.id
                    );
                  }
                } else {
                  await callTelegramApi(state.token, 'answerCallbackQuery', {
                    callback_query_id: cq.id,
                  }).catch(() => {});
                }
              }
            } catch (updateErr: any) {
              console.error(`Error handling Telegram update for ${bot.id}:`, updateErr?.message || updateErr);
            }
          }
        } else if (!data.ok) {
          const errorKind = classifyTelegramPollingError(data.error_code, data.description);
          state.lastError = data.description || 'Unknown Telegram Error';
          if (errorKind === 'unauthorized') {
            await markBotUnauthorized(bot.id, data.description);
            break;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, errorKind === 'conflict' ? 2000 : 3000)
          );
        }
      } catch (err: any) {
        if (abortController.signal.aborted || !state.isRunning) break;
        if (err.name === 'AbortError') {
          // Per-request 15s socket timeout: loop cleanly and poll again
          state.lastCheck = new Date().toISOString();
          continue;
        }
        state.lastError = err.message || 'Polling Network Error';
        await new Promise((resolve) => setTimeout(resolve, 4000));
      } finally {
        clearTimeout(requestTimeout);
        abortController.signal.removeEventListener('abort', onParentAbort);
      }
    }

    if (activePollers.get(bot.id) === state) {
      state.isRunning = false;
      state.isStarting = false;
    }
  })();

  return true;
}

function stopPolling(botId: string) {
  const existing = activePollers.get(botId);
  if (existing) {
    existing.isRunning = false;
    existing.isStarting = false;
    existing.abortController.abort();
    activePollers.delete(botId);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));

  // --- API Endpoints ---

  // 1. Get all bots
  app.get('/api/bots', (_req, res) => {
    const bots = loadBots();
    res.json(bots);
  });

  // 1.5 Reconcile & restore bots from client durable vault (survives server/container restarts)
  app.post('/api/bots/restore', async (req, res) => {
    try {
      const clientBots = Array.isArray(req.body?.bots) ? (req.body.bots as BotConfig[]) : [];
      const deletedIds = Array.isArray(req.body?.deletedIds)
        ? (req.body.deletedIds as string[])
        : [];

      const merged = await withBotsWriteLock(async () => {
        const currentServerBots = loadBots();
        const { mergedBots, serverIdsToDelete } = reconcileBots(
          currentServerBots,
          clientBots,
          deletedIds
        );

        for (const delId of serverIdsToDelete) {
          stopPolling(delId);
        }

        saveBots(mergedBots);
        return mergedBots;
      });

      for (const b of merged) {
        if (b.isConnected && b.token) {
          ensureBotPolling(b);
        }
      }

      res.json({ bots: merged });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'فشل استعادة البوتات' });
    }
  });

  // 2. Create bot (optionally initialized with a parsed JSON blueprint)
  app.post('/api/bots', async (req, res) => {
    const { name, blueprint } = req.body || {};
    const design = blueprint && typeof blueprint === 'object' ? blueprint : {};

    const newBot = await withBotsWriteLock(() => {
      const bots = [...loadBots()];

      const resolvedName =
        (name || design.name || '').trim() || `بوت جديد ${bots.length + 1}`;

      const created: BotConfig = {
        id: `bot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: resolvedName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isConnected: false,
        startMessage: design.startMessage || {
          text: '',
          isSaved: false,
          media: [],
        },
        inlineButtons: Array.isArray(design.inlineButtons) ? design.inlineButtons : [],
        replyButtons: Array.isArray(design.replyButtons) ? design.replyButtons : [],
        ...(design.inlinePagination ? { inlinePagination: design.inlinePagination } : {}),
        ...(design.replyPagination ? { replyPagination: design.replyPagination } : {}),
        ...(design.inlineLayoutSettings ? { inlineLayoutSettings: design.inlineLayoutSettings } : {}),
        ...(design.replyLayoutSettings ? { replyLayoutSettings: design.replyLayoutSettings } : {}),
        buttonFlows:
          design.buttonFlows && typeof design.buttonFlows === 'object'
            ? design.buttonFlows
            : {},
        ...(Array.isArray(design.commands) ? { commands: design.commands } : {}),
        ...(design.profile && typeof design.profile === 'object'
          ? { profile: design.profile }
          : {}),
        ...(design.apiFeatures && typeof design.apiFeatures === 'object'
          ? { apiFeatures: design.apiFeatures }
          : {}),
        settings: design.settings || {
          resizeKeyboard: true,
          oneTimeKeyboard: false,
          simulatorTheme: 'dark',
        },
      };

      bots.push(created);
      saveBots(bots);
      return created;
    });
    res.status(201).json(newBot);
  });

  // 2.5 Import JSON bot design + connect token in one step so it goes live on Telegram immediately
  app.post('/api/bots/import-and-connect', async (req, res) => {
    const { blueprint, token } = req.body || {};
    const candidateToken = sanitizeBotToken(String(token || ''));
    const design = blueprint && typeof blueprint === 'object' ? blueprint : null;

    if (!design) {
      return res.status(400).json({ error: 'بيانات تصميم البوت (JSON) غير صالحة أو مفقودة' });
    }
    if (!candidateToken) {
      return res.status(400).json({ error: 'الرجاء إدخال توكن البوت لتفعيله في تيليجرام' });
    }

    try {
      const checkData = await verifyTelegramToken(candidateToken);

      if (!checkData?.ok) {
        const isUnauthorized =
          checkData?.error_code === 401 ||
          checkData?.error_code === 404 ||
          /unauthorized|not found/i.test(checkData?.description || '');
        return res.status(400).json({
          error: isUnauthorized
            ? 'توكن البوت غير صالح أو تم إلغاؤه من @BotFather. يرجى التأكد من التوكن والمحاولة مجدداً.'
            : checkData?.description ||
              'توكن البوت غير صالح أو مرفوض من تيليجرام، يرجى التأكد منه من @BotFather',
        });
      }

      const createdBot = await withBotsWriteLock(() => {
        const bots = loadBots().map((b) => {
          if (b.isConnected && sanitizeBotToken(b.token || '') === candidateToken) {
            stopPolling(b.id);
            return {
              ...b,
              isConnected: false,
              connectionError: 'تم نقل هذا التوكن وتفعيله في بوت آخر',
              updatedAt: new Date().toISOString(),
            };
          }
          return b;
        });
        const resolvedName =
          (typeof design.name === 'string' && design.name.trim()) ||
          checkData.result.first_name ||
          `بوت JSON ${bots.length + 1}`;

        const created: BotConfig = {
          id: `bot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: resolvedName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          token: candidateToken,
          isConnected: true,
          connectionError: null,
          botUsername: checkData.result.username || null,
          botFirstName: checkData.result.first_name || null,
          startMessage: design.startMessage || {
            text: '',
            isSaved: false,
            media: [],
          },
          inlineButtons: Array.isArray(design.inlineButtons) ? design.inlineButtons : [],
          replyButtons: Array.isArray(design.replyButtons) ? design.replyButtons : [],
          ...(design.inlinePagination ? { inlinePagination: design.inlinePagination } : {}),
          ...(design.replyPagination ? { replyPagination: design.replyPagination } : {}),
          ...(design.inlineLayoutSettings ? { inlineLayoutSettings: design.inlineLayoutSettings } : {}),
          ...(design.replyLayoutSettings ? { replyLayoutSettings: design.replyLayoutSettings } : {}),
          buttonFlows:
            design.buttonFlows && typeof design.buttonFlows === 'object'
              ? design.buttonFlows
              : {},
          ...(Array.isArray(design.commands) ? { commands: design.commands } : {}),
          ...(design.profile && typeof design.profile === 'object'
            ? { profile: design.profile }
            : {}),
          ...(design.apiFeatures && typeof design.apiFeatures === 'object'
            ? { apiFeatures: design.apiFeatures }
            : {}),
          capabilities: extractBotCapabilities(checkData.result),
          settings: design.settings || {
            resizeKeyboard: true,
            oneTimeKeyboard: false,
            simulatorTheme: 'dark',
          },
        };

        bots.push(created);
        saveBots(bots);
        return created;
      });

      await syncBotProfileAndCommands(createdBot);
      await startPolling(createdBot);

      return res.status(201).json({
        success: true,
        message: 'تم تفعيل البوت من كود JSON وربطه بتيليجرام بنجاح! يمكنك فتحه وإرسال /start الآن.',
        bot: createdBot,
        telegramInfo: checkData.result,
      });
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || /timeout|timed out|aborted/i.test(err?.message || '');
      return res.status(504).json({
        error: isTimeout
          ? 'تعذر الوصول إلى خوادم تيليجرام (انتهت مهلة الاتصال). يرجى المحاولة مرة أخرى بعد لحظات.'
          : `فشل الاتصال بخوادم تيليجرام: ${err?.message || 'خطأ غير معروف'}`,
      });
    }
  });

  // 3. Get single bot
  app.get('/api/bots/:id', (req, res) => {
    const bots = loadBots();
    const bot = bots.find((b) => b.id === req.params.id);
    if (!bot) {
      return res.status(404).json({ error: 'البوت غير موجود' });
    }
    res.json(bot);
  });

  // 4. Update bot configuration (serialized to prevent concurrent overwrite races)
  app.put('/api/bots/:id', async (req, res) => {
    const updatedBot = await withBotsWriteLock(() => {
      const bots = [...loadBots()];
      const index = bots.findIndex((b) => b.id === req.params.id);
      if (index === -1) {
        return null;
      }

      const nextBot: BotConfig = {
        ...bots[index],
        ...req.body,
        id: bots[index].id, // Prevent ID overwrite
        updatedAt: new Date().toISOString(),
      };

      bots[index] = nextBot;
      saveBots(bots);
      return nextBot;
    });

    if (!updatedBot) {
      return res.status(404).json({ error: 'البوت غير موجود' });
    }

    // If bot is connected, ensure poller is running and healthy (without killing an already healthy loop)
    if (updatedBot.isConnected && updatedBot.token) {
      ensureBotPolling(updatedBot);
      if (req.body?.commands !== undefined || req.body?.profile !== undefined) {
        syncBotProfileAndCommands(updatedBot).catch(() => {});
      }
    }

    res.json(updatedBot);
  });

  // 4.5 Immediate Sync Bot with Telegram
  app.post('/api/bots/:id/sync', async (req, res) => {
    const bots = loadBots();
    const bot = bots.find((b) => b.id === req.params.id);
    if (!bot) {
      return res.status(404).json({ error: 'البوت غير موجود' });
    }
    if (!bot.token) {
      return res.status(400).json({ error: 'لم يتم ربط توكن البوت بعد' });
    }

    try {
      const meCheck = await verifyTelegramToken(bot.token).catch(() => null);
      await syncBotProfileAndCommands(bot);
      const syncedBot = await withBotsWriteLock(() => {
        const list = [...loadBots()];
        const idx = list.findIndex((b) => b.id === req.params.id);
        if (idx === -1) return null;
        const next: BotConfig = {
          ...list[idx],
          isConnected: true,
          connectionError: null,
          ...(meCheck?.ok && meCheck.result
            ? {
                botUsername: meCheck.result.username || list[idx].botUsername,
                botFirstName: meCheck.result.first_name || list[idx].botFirstName,
                capabilities: extractBotCapabilities(meCheck.result),
              }
            : {}),
          updatedAt: new Date().toISOString(),
        };
        list[idx] = next;
        saveBots(list);
        return next;
      });
      if (!syncedBot) {
        return res.status(404).json({ error: 'البوت غير موجود' });
      }
      await startPolling(syncedBot);

      res.json({
        success: true,
        message: 'تمت مزامنة البوت بنجاح مع تيليجرام وتحديث كافة الأزرار والأوامر والملف!',
        bot: syncedBot,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'فشلت المزامنة مع تيليجرام' });
    }
  });

  // 5. Delete bot
  app.delete('/api/bots/:id', async (req, res) => {
    stopPolling(req.params.id);
    const removed = await withBotsWriteLock(() => {
      const bots = loadBots();
      const exists = bots.some((b) => b.id === req.params.id);
      if (!exists) {
        return false;
      }
      const next = bots.filter((b) => b.id !== req.params.id);
      saveBots(next);
      return true;
    });
    if (!removed) {
      return res.status(404).json({ error: 'البوت غير موجود' });
    }
    res.json({ success: true, message: 'تم حذف البوت بنجاح' });
  });

  // 6. Connect & Verify Telegram Bot Token
  app.post('/api/bots/:id/connect', async (req, res) => {
    const { token } = req.body;
    const botsSnapshot = loadBots();
    const existingBot = botsSnapshot.find((b) => b.id === req.params.id);
    if (!existingBot) {
      return res.status(404).json({ error: 'البوت غير موجود' });
    }

    const candidateToken = sanitizeBotToken(String(token || existingBot.token || ''));

    if (!candidateToken) {
      return res.status(400).json({ error: 'الرجاء إدخال توكن البوت' });
    }

    try {
      // Test token with getMe over IPv4 with automatic retry
      const checkData = await verifyTelegramToken(candidateToken);

      if (!checkData?.ok) {
        const isUnauthorized =
          checkData?.error_code === 401 ||
          checkData?.error_code === 404 ||
          /unauthorized|not found/i.test(checkData?.description || '');
        const friendlyError = isUnauthorized
          ? 'توكن البوت غير صالح أو تم إلغاؤه من @BotFather. يرجى التأكد من التوكن والمحاولة مجدداً.'
          : checkData?.description || 'توكن البوت غير صالح، يرجى التأكد منه من @BotFather';
        const failedBot = await withBotsWriteLock(() => {
          const list = [...loadBots()];
          const idx = list.findIndex((b) => b.id === req.params.id);
          if (idx === -1) return null;
          const next: BotConfig = {
            ...list[idx],
            isConnected: false,
            connectionError: friendlyError,
            token: candidateToken,
            updatedAt: new Date().toISOString(),
          };
          list[idx] = next;
          saveBots(list);
          return next;
        });
        stopPolling(req.params.id);
        return res.status(400).json({
          error: failedBot?.connectionError || friendlyError,
          bot: failedBot,
        });
      }

      // Valid token! Disconnect any other bot using the exact same token so Watchdog doesn't trigger 409 Conflict
      const connectedBot = await withBotsWriteLock(() => {
        const list = loadBots().map((b) => {
          if (b.id !== req.params.id && b.isConnected && sanitizeBotToken(b.token || '') === candidateToken) {
            stopPolling(b.id);
            return {
              ...b,
              isConnected: false,
              connectionError: 'تم نقل هذا التوكن وتفعيله في بوت آخر',
              updatedAt: new Date().toISOString(),
            };
          }
          return b;
        });
        const idx = list.findIndex((b) => b.id === req.params.id);
        if (idx === -1) return null;
        const next: BotConfig = {
          ...list[idx],
          token: candidateToken,
          isConnected: true,
          connectionError: null,
          botUsername: checkData.result.username || null,
          botFirstName: checkData.result.first_name || null,
          capabilities: extractBotCapabilities(checkData.result),
          updatedAt: new Date().toISOString(),
        };
        list[idx] = next;
        saveBots(list);
        return next;
      });

      if (!connectedBot) {
        return res.status(404).json({ error: 'البوت غير موجود' });
      }

      // Start live polling loop on the server
      await startPolling(connectedBot);

      return res.json({
        success: true,
        message: 'تم ربط البوت بنجاح وهو الآن نشط ومتصل بتيليجرام!',
        bot: connectedBot,
        telegramInfo: checkData.result,
      });
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || /timeout|timed out|aborted/i.test(err?.message || '');
      const friendlyErr = isTimeout
        ? 'تعذر الاتصال بخوادم تيليجرام حالياً (انتهت مهلة الشبكة). تأكد من صلاحية الاتصال وأعد المحاولة بعد لحظات.'
        : `فشل الاتصال بخوادم تيليجرام: ${err?.message || 'خطأ غير معروف'}`;
      const errorBot = await withBotsWriteLock(() => {
        const list = [...loadBots()];
        const idx = list.findIndex((b) => b.id === req.params.id);
        if (idx === -1) return null;
        const next: BotConfig = {
          ...list[idx],
          isConnected: false,
          connectionError: friendlyErr,
          updatedAt: new Date().toISOString(),
        };
        list[idx] = next;
        saveBots(list);
        return next;
      });
      return res.status(isTimeout ? 504 : 500).json({
        error: errorBot?.connectionError || friendlyErr,
        bot: errorBot,
      });
    }
  });

  // 7. Disconnect Telegram Bot
  app.post('/api/bots/:id/disconnect', async (req, res) => {
    stopPolling(req.params.id);
    const updated = await withBotsWriteLock(() => {
      const list = [...loadBots()];
      const index = list.findIndex((b) => b.id === req.params.id);
      if (index === -1) return null;
      const next: BotConfig = {
        ...list[index],
        isConnected: false,
        connectionError: null,
        updatedAt: new Date().toISOString(),
      };
      list[index] = next;
      saveBots(list);
      return next;
    });

    if (!updated) {
      return res.status(404).json({ error: 'البوت غير موجود' });
    }

    res.json({
      success: true,
      message: 'تم فصل البوت وإيقاف الاستماع للتحديثات',
      bot: updated,
    });
  });

  // 8. Get Live Poller Status (and auto-heal any stopped/stalled poller)
  app.get('/api/bots/:id/status', (req, res) => {
    const bots = loadBots();
    const bot = bots.find((b) => b.id === req.params.id);

    if (bot && bot.isConnected && bot.token) {
      ensureBotPolling(bot);
    }

    const poller = activePollers.get(req.params.id);

    res.json({
      exists: Boolean(bot),
      isPolling: poller ? poller.isRunning : false,
      lastCheck: poller ? poller.lastCheck : null,
      lastError: poller?.lastError || bot?.connectionError || null,
      isConnected: bot ? bot.isConnected : false,
      botUsername: bot?.botUsername,
      botFirstName: bot?.botFirstName,
    });
  });

  // 9. Media upload endpoint
  app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم إرسال أي ملف' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      url: fileUrl,
      fileName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  });

  // 10. scan Telegram (MTProto Live Bot Scanner) Endpoints
  app.get('/api/scan/status', (_req, res) => {
    res.json(scannerService.getStatus());
  });

  app.post('/api/scan/connect', async (req, res) => {
    const { apiId, apiHash, sessionString, phoneNumber } = req.body || {};
    try {
      if (sessionString && String(sessionString).trim()) {
        const status = await scannerService.connectWithSession(
          apiId,
          apiHash,
          String(sessionString)
        );
        return res.json(status);
      }
      if (phoneNumber && String(phoneNumber).trim()) {
        const status = await scannerService.startPhoneLogin(
          apiId,
          apiHash,
          String(phoneNumber)
        );
        return res.json(status);
      }
      return res.status(400).json({
        error: 'يرجى إدخال كود الجلسة (StringSession) أو رقم الهاتف لإتمام تسجيل الدخول.',
      });
    } catch (err: any) {
      return res.status(400).json({
        error: err?.message || 'فشل الاتصال بحساب تيليجرام',
        status: scannerService.getStatus(),
      });
    }
  });

  app.post('/api/scan/verify-code', async (req, res) => {
    const { code, password } = req.body || {};
    try {
      const status = await scannerService.verifyPhoneLogin({ code, password });
      return res.json(status);
    } catch (err: any) {
      return res.status(400).json({
        error: err?.message || 'فشل التحقق من الرمز أو كلمة المرور',
        status: scannerService.getStatus(),
      });
    }
  });

  app.post('/api/scan/disconnect', async (req, res) => {
    const clearSession = Boolean(req.body?.clearSession);
    const status = await scannerService.disconnect(clearSession);
    res.json(status);
  });

  app.post('/api/scan/switch-account', async (req, res) => {
    const { savedId } = req.body || {};
    if (!savedId) {
      return res.status(400).json({ error: 'يرجى اختيار حساب محفوظ للاتصال به.' });
    }
    try {
      const status = await scannerService.switchToSavedAccount(String(savedId));
      return res.json(status);
    } catch (err: any) {
      return res.status(400).json({
        error: err?.message || 'تعذر التبديل إلى الحساب المحدد.',
        status: scannerService.getStatus(),
      });
    }
  });

  app.delete('/api/scan/accounts/:savedId', async (req, res) => {
    try {
      const status = await scannerService.removeSavedAccount(req.params.savedId);
      res.json(status);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'تعذر حذف الحساب المحفوظ.' });
    }
  });

  app.post('/api/scan/sync-telegram', async (req, res) => {
    const { botUsernameOrKey } = req.body || {};
    try {
      const bots = await scannerService.syncRecentTelegramHistory(botUsernameOrKey);
      res.json({ bots });
    } catch (err: any) {
      res.status(400).json({
        error: err?.message || 'تعذر مزامنة محادثات البوتات من تيليجرام.',
      });
    }
  });

  app.post('/api/scan/target-bot', (req, res) => {
    const { targetBot } = req.body || {};
    scannerService.setTargetBotFilter(targetBot || null);
    res.json(scannerService.getStatus());
  });

  app.get('/api/scan/bots', (_req, res) => {
    res.json({ bots: scannerService.listCapturedBots() });
  });

  app.get('/api/scan/bots/:botKey', (req, res) => {
    const bot = scannerService.getCapturedBot(req.params.botKey);
    if (!bot) {
      return res.status(404).json({ error: 'البوت غير موجود في سجل المسح' });
    }
    res.json({ bot });
  });

  app.post('/api/scan/interact', async (req, res) => {
    const { botUsernameOrKey, action, text, messageId, callbackData, parentButtonId } =
      req.body || {};
    try {
      const result = await scannerService.interactWithBot({
        botUsernameOrKey,
        action: action === 'click_inline' ? 'click_inline' : 'send_text',
        text,
        messageId: messageId ? Number(messageId) : undefined,
        callbackData,
        parentButtonId,
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'فشل التفاعل مع البوت في تيليجرام' });
    }
  });

  app.post('/api/scan/bots/:botKey/link-step', (req, res) => {
    const { eventId, targetParentId } = req.body || {};
    if (!eventId) {
      return res.status(400).json({ error: 'معرف الرسالة (eventId) مطلوب' });
    }
    try {
      const bot = scannerService.linkEventToTarget(
        req.params.botKey,
        String(eventId),
        targetParentId === undefined ? null : targetParentId
      );
      res.json({ bot });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'فشل ربط الرسالة بالزر' });
    }
  });

  app.patch('/api/scan/bots/:botKey', (req, res) => {
    const { customName } = req.body || {};
    try {
      const bot = scannerService.renameCapturedBot(
        req.params.botKey,
        String(customName || '')
      );
      res.json({ bot });
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'البوت غير موجود' });
    }
  });

  app.delete('/api/scan/bots/:botKey', (req, res) => {
    const deleted = scannerService.deleteCapturedBot(req.params.botKey);
    if (!deleted) {
      return res.status(404).json({ error: 'البوت غير موجود' });
    }
    res.json({ success: true });
  });

  // Re-start polling for any previously connected bots upon server start
  const existingBots = loadBots();
  for (const b of existingBots) {
    if (b.isConnected && b.token) {
      ensureBotPolling(b);
    }
  }
  scannerService.tryAutoReconnect().catch(() => {});

  // Watchdog: every 15s verify every connected bot still has a healthy, non-stalled poller
  setInterval(() => {
    const allBots = loadBots();
    for (const b of allBots) {
      if (b.isConnected && b.token) {
        ensureBotPolling(b);
      }
    }
  }, 15_000);

  // Mount Vite middleware in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Telegram Bot Studio running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
