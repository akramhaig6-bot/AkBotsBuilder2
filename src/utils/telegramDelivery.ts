import { BotConfig } from '../types/bot';

export interface PollerHealthSnapshot {
  botId: string;
  token: string;
  isRunning: boolean;
  isStarting?: boolean;
  lastCheck: string | null;
  lastError: string | null;
}

export interface PollerDecision {
  restart: boolean;
  reason?:
    | 'missing_poller'
    | 'poller_stopped'
    | 'token_changed'
    | 'poller_stale';
}

export const POLLER_STALE_THRESHOLD_MS = 25_000;

/**
 * Pure watchdog decision helper determining whether a connected bot's
 * Telegram polling loop needs to be (re)started.
 */
export function shouldRestartPoller(
  bot: Pick<BotConfig, 'id' | 'token' | 'isConnected'>,
  poller: PollerHealthSnapshot | undefined,
  nowMs: number = Date.now(),
  staleThresholdMs: number = POLLER_STALE_THRESHOLD_MS
): PollerDecision {
  if (!bot.isConnected || !bot.token || !bot.token.trim()) {
    return { restart: false };
  }

  if (!poller) {
    return { restart: true, reason: 'missing_poller' };
  }

  if (poller.isStarting) {
    return { restart: false };
  }

  if (!poller.isRunning) {
    return { restart: true, reason: 'poller_stopped' };
  }

  if (poller.token !== bot.token.trim()) {
    return { restart: true, reason: 'token_changed' };
  }

  if (poller.lastCheck) {
    const lastCheckMs = Date.parse(poller.lastCheck);
    if (Number.isFinite(lastCheckMs) && nowMs - lastCheckMs > staleThresholdMs) {
      return { restart: true, reason: 'poller_stale' };
    }
  }

  return { restart: false };
}

export type TelegramErrorKind = 'unauthorized' | 'conflict' | 'transient';

/**
 * Classifies Telegram Bot API getUpdates errors to separate revoked/invalid tokens
 * from recoverable conflicts or transient network errors.
 */
export function classifyTelegramPollingError(
  errorCode?: number,
  description?: string
): TelegramErrorKind {
  const desc = (description || '').toLowerCase();
  if (
    errorCode === 401 ||
    desc.includes('unauthorized') ||
    (errorCode === 404 && desc.includes('not found'))
  ) {
    return 'unauthorized';
  }
  if (errorCode === 409 || desc.includes('conflict')) {
    return 'conflict';
  }
  return 'transient';
}

export type MarkupSanitizeLevel = 'clean' | 'compat' | 'safe';

function sanitizeInlineButton(btn: any, level: MarkupSanitizeLevel, rowIdx: number, colIdx: number): any {
  if (!btn || typeof btn !== 'object') return btn;

  const {
    id: internalId,
    style,
    icon_custom_emoji_id,
    ...rest
  } = btn;

  const fallbackCallbackData =
    typeof internalId === 'string' && internalId.trim()
      ? internalId.slice(0, 64)
      : `btn_${rowIdx}_${colIdx}`;

  const out: any = {
    ...rest,
    text: typeof btn.text === 'string' && btn.text.trim() ? btn.text : '•',
  };

  // Preserve style & custom emoji in 'clean' and 'compat'; strip in 'safe'
  if (level !== 'safe') {
    if (style && ['primary', 'success', 'danger'].includes(style)) {
      out.style = style;
    }
    if (icon_custom_emoji_id && typeof icon_custom_emoji_id === 'string') {
      out.icon_custom_emoji_id = icon_custom_emoji_id;
    }
  }

  if (level === 'clean') {
    return out;
  }

  // In 'compat' & 'safe': convert buttons forbidden inside standard sendMessage/editMessageText
  // (callback_game, pay) to valid callback_data buttons so Telegram never drops the menu.
  if (out.callback_game !== undefined || out.pay !== undefined) {
    delete out.callback_game;
    delete out.pay;
    out.callback_data = out.callback_data || fallbackCallbackData;
  }

  // Validate url in 'compat' and 'safe'
  if (out.url !== undefined) {
    try {
      const parsed = new URL(String(out.url));
      if (!['http:', 'https:', 'tg:'].includes(parsed.protocol)) {
        delete out.url;
        out.callback_data = out.callback_data || fallbackCallbackData;
      }
    } catch {
      delete out.url;
      out.callback_data = out.callback_data || fallbackCallbackData;
    }
  }

  // Validate web_app url (Telegram strictly requires https://)
  if (out.web_app !== undefined) {
    let validHttps = false;
    try {
      const parsed = new URL(String(out.web_app?.url || ''));
      validHttps = parsed.protocol === 'https:';
    } catch {
      validHttps = false;
    }
    if (!validHttps || level === 'safe') {
      delete out.web_app;
      out.callback_data = out.callback_data || fallbackCallbackData;
    }
  }

  // In 'safe' mode, convert optional Telegram-account-dependent inline actions
  // (login_url, switch_inline_*, copy_text) to guaranteed callback_data so buttons always appear.
  if (level === 'safe') {
    if (
      out.login_url !== undefined ||
      out.switch_inline_query !== undefined ||
      out.switch_inline_query_current_chat !== undefined ||
      out.switch_inline_query_chosen_chat !== undefined ||
      out.copy_text !== undefined
    ) {
      delete out.login_url;
      delete out.switch_inline_query;
      delete out.switch_inline_query_current_chat;
      delete out.switch_inline_query_chosen_chat;
      delete out.copy_text;
      out.callback_data = out.callback_data || fallbackCallbackData;
    }
  }

  return out;
}

function sanitizeReplyButton(btn: any, level: MarkupSanitizeLevel): any {
  if (!btn || typeof btn !== 'object') return btn;

  const {
    id: _internalId,
    style,
    icon_custom_emoji_id,
    ...rest
  } = btn;

  const out: any = {
    ...rest,
    text: typeof btn.text === 'string' && btn.text.trim() ? btn.text : '•',
  };

  if (level !== 'safe') {
    if (style && ['primary', 'success', 'danger'].includes(style)) {
      out.style = style;
    }
    if (icon_custom_emoji_id && typeof icon_custom_emoji_id === 'string') {
      out.icon_custom_emoji_id = icon_custom_emoji_id;
    }
  }

  if (level === 'safe') {
    if (out.web_app !== undefined) {
      delete out.web_app;
    }
  }

  return out;
}

/**
 * Strips internal studio-only properties (e.g. `id`) and optionally downgrades
 * Telegram-incompatible button actions/attributes on retry.
 */
export function sanitizeTelegramMarkup(
  markup: any,
  level: MarkupSanitizeLevel = 'clean'
): any {
  if (!markup || typeof markup !== 'object') return markup;

  const cloned: any = { ...markup };

  if (Array.isArray(markup.inline_keyboard)) {
    cloned.inline_keyboard = markup.inline_keyboard
      .filter((row: any) => Array.isArray(row) && row.length > 0)
      .map((row: any[], rIdx: number) =>
        row.map((btn, cIdx) => sanitizeInlineButton(btn, level, rIdx, cIdx))
      );
  }

  if (Array.isArray(markup.keyboard)) {
    cloned.keyboard = markup.keyboard
      .filter((row: any) => Array.isArray(row) && row.length > 0)
      .map((row: any[]) => row.map((btn) => sanitizeReplyButton(btn, level)));
  }

  return cloned;
}

export interface TelegramMessageEffectPreset {
  id: string;
  emoji: string;
  label: string;
}

export const TELEGRAM_MESSAGE_EFFECTS: TelegramMessageEffectPreset[] = [
  { id: '5104841245755180586', emoji: '🔥', label: 'نار (Fire)' },
  { id: '5159385139981059251', emoji: '❤️', label: 'قلب (Heart)' },
  { id: '5107584321108051014', emoji: '👍', label: 'إعجاب (Thumbs Up)' },
  { id: '5046509860389126442', emoji: '🎉', label: 'احتفال (Party)' },
  { id: '5170166362592510656', emoji: '👏', label: 'تصفيق (Clap)' },
  { id: '5170169077011841524', emoji: '🥰', label: 'قلوب (Hearts)' },
  { id: '5104858069142078462', emoji: '👎', label: 'عدم إعجاب' },
  { id: '5046589136895476101', emoji: '💩', label: 'مقلب (Poop)' },
];

export function buildTelegramMessageOptionFields(options?: {
  messageEffectId?: string;
  protectContent?: boolean;
  disableNotification?: boolean;
  linkPreviewOptions?: {
    is_disabled?: boolean;
    url?: string;
    prefer_small_media?: boolean;
    prefer_large_media?: boolean;
    show_above_text?: boolean;
  };
}): Record<string, any> {
  if (!options) return {};
  const out: Record<string, any> = {};

  if (options.messageEffectId && options.messageEffectId.trim()) {
    out.message_effect_id = options.messageEffectId.trim();
  }
  if (options.protectContent) {
    out.protect_content = true;
  }
  if (options.disableNotification) {
    out.disable_notification = true;
  }
  if (options.linkPreviewOptions) {
    const lp = options.linkPreviewOptions;
    const lpObj: Record<string, any> = {};
    if (lp.is_disabled) lpObj.is_disabled = true;
    if (lp.url && lp.url.trim()) lpObj.url = lp.url.trim();
    if (lp.prefer_small_media) lpObj.prefer_small_media = true;
    else if (lp.prefer_large_media) lpObj.prefer_large_media = true;
    if (lp.show_above_text) lpObj.show_above_text = true;
    if (Object.keys(lpObj).length > 0) {
      out.link_preview_options = lpObj;
    }
  }

  return out;
}

/**
 * Prepares a Telegram sendMessage / editMessageText / editMessageReplyMarkup body
 * at the requested sanitization level.
 */
export function buildTelegramSendBody(
  body: Record<string, any>,
  level: MarkupSanitizeLevel = 'clean'
): Record<string, any> {
  const next: Record<string, any> = { ...body };

  if (level === 'compat') {
    // message_effect_id is restricted to private chats and specific effect IDs;
    // strip on compat retry so group/channel or unsupported contexts still succeed.
    delete next.message_effect_id;
    delete next.show_caption_above_media;
  }

  if (level === 'safe') {
    delete next.parse_mode;
    delete next.message_effect_id;
    delete next.link_preview_options;
    delete next.protect_content;
    delete next.disable_notification;
    delete next.show_caption_above_media;
    delete next.has_spoiler;
  }

  if (next.reply_markup) {
    next.reply_markup = sanitizeTelegramMarkup(next.reply_markup, level);
  }

  return next;
}
