import {
  BotButton,
  BotConfig,
  ButtonFlow,
  LayoutSettings,
  LayoutTemplate,
  LayoutTemplateId,
  ReplyKeyboardSettings,
} from '../types/bot';

/**
 * Cleans a pasted Telegram bot token from invisible Unicode directional/zero-width
 * characters, whitespace, surrounding quotes, or accidental `bot` / URL prefixes.
 */
export function sanitizeBotToken(token: string): string {
  if (!token) return '';
  let clean = token
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00A0\s]+/g, '')
    .replace(/^['"`«»]+|['"`«»]+$/g, '');

  // Handle full Telegram API URL paste like https://api.telegram.org/bot123:ABC/getMe
  const apiUrlMatch = clean.match(/api\.telegram\.org\/bot([^/?#]+)/i);
  if (apiUrlMatch?.[1]) {
    clean = apiUrlMatch[1];
  } else {
    // Handle accidental leading "bot" prefix (e.g., "bot123456:ABC...")
    clean = clean.replace(/^bot(?=\d+:)/i, '');
  }

  return clean;
}

/**
 * Validates Telegram bot token format.
 * Format is typically: <digits>:<alphanumeric_and_symbols>
 */
export function validateBotToken(
  token: string
): { isValid: boolean; error?: string; sanitizedToken?: string } {
  const cleanToken = sanitizeBotToken(token || '');
  if (!cleanToken) {
    return { isValid: false, error: 'الرجاء إدخال توكن البوت' };
  }
  const tokenRegex = /^\d{5,15}:[A-Za-z0-9_-]{25,65}$/;
  if (!tokenRegex.test(cleanToken)) {
    return {
      isValid: false,
      error: 'صيغة التوكن غير صحيحة. يجب أن تكون بهذا الشكل: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ',
    };
  }
  return { isValid: true, sanitizedToken: cleanToken };
}

/**
 * Computes exact UTF-8 byte length (Telegram enforces 64 bytes max for callback_data).
 */
export function getUtf8ByteLength(str: string): number {
  if (!str) return 0;
  return new TextEncoder().encode(str).length;
}

/**
 * Validates whether a URL is valid http/https (or tg:// for standard URL buttons).
 */
export function isValidUrl(url: string, requireHttps: boolean = false): boolean {
  if (!url || !url.trim()) return false;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (requireHttps) {
      return parsed.protocol === 'https:';
    }
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'tg:';
  } catch {
    return false;
  }
}

export interface ButtonValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates an InlineKeyboardButton against official Telegram Bot API constraints.
 */
export function validateInlineButton(
  btn: BotButton,
  rowIndex: number = 0,
  colIndex: number = 0
): ButtonValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!btn.text || !btn.text.trim()) {
    errors.push('نص الزر الظاهر للمستخدم مطلوب في Telegram Bot API.');
  }

  switch (btn.actionType) {
    case 'url':
      if (!btn.url || !isValidUrl(btn.url, false)) {
        errors.push('رابط URL غير صالح. يجب أن يبدأ بـ https:// أو http:// أو tg://');
      }
      break;
    case 'web_app':
      if (!btn.webAppUrl || !isValidUrl(btn.webAppUrl, true)) {
        errors.push('رابط تطبيق الويب (Web App) يجب أن يكون رابط HTTPS صالح.');
      }
      break;
    case 'login_url':
      if (!btn.loginUrlConfig?.url || !isValidUrl(btn.loginUrlConfig.url, true)) {
        errors.push('رابط تسجيل الدخول (Login URL) يجب أن يكون رابط HTTPS صالح.');
      }
      break;
    case 'copy_text':
      if (!btn.copyText || btn.copyText.length > 256) {
        errors.push('نص النسخ (copy_text) يجب أن يكون بين 1 و 256 حرفاً وفق تيليجرام.');
      }
      break;
    case 'pay':
      if (rowIndex !== 0 || colIndex !== 0) {
        warnings.push('قيد تيليجرام: زر الدفع (pay) يجب أن يكون أول زر في الصف الأول من رسالة الفاتورة (sendInvoice).');
      }
      break;
    case 'callback_game':
      if (rowIndex !== 0 || colIndex !== 0) {
        warnings.push('قيد تيليجرام: زر اللعبة (callback_game) يجب أن يكون أول زر في الصف الأول.');
      }
      break;
    case 'flow':
    case 'none':
    default: {
      const cbData = btn.callbackData || btn.id;
      const bytes = getUtf8ByteLength(cbData);
      if (bytes === 0 || bytes > 64) {
        errors.push(`حقل callback_data يجب أن يكون بين 1 و 64 بايت UTF-8 (الحالي: ${bytes} بايت).`);
      }
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a ReplyKeyboardButton against official Telegram Bot API constraints.
 */
export function validateReplyButton(btn: BotButton): ButtonValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!btn.text || !btn.text.trim()) {
    errors.push('نص زر Reply Keyboard مطلوب في Telegram Bot API.');
  }

  if (btn.actionType === 'web_app') {
    if (!btn.webAppUrl || !isValidUrl(btn.webAppUrl, true)) {
      errors.push('رابط تطبيق الويب (Web App) يجب أن يكون رابط HTTPS صالح.');
    }
  }

  if (btn.actionType === 'request_users') {
    const reqId = btn.requestUsersConfig?.request_id;
    if (reqId === undefined || !Number.isInteger(reqId)) {
      errors.push('معرف الطلب request_id مطلوب كرقم صحيح لطلب المستخدمين.');
    }
  }

  if (btn.actionType === 'request_chat') {
    const reqId = btn.requestChatConfig?.request_id;
    if (reqId === undefined || !Number.isInteger(reqId)) {
      errors.push('معرف الطلب request_id مطلوب كرقم صحيح لطلب المحادثة/القناة.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Resolves valid official Telegram Bot API style ("primary" | "success" | "danger").
 */
export function getOfficialTelegramStyle(btn: Pick<BotButton, 'style' | 'color'>): string | undefined {
  const rawStyle =
    btn.style ||
    (btn.color && ['primary', 'success', 'danger'].includes(btn.color)
      ? btn.color
      : undefined);
  return rawStyle && ['primary', 'success', 'danger'].includes(rawStyle)
    ? rawStyle
    : undefined;
}

/**
 * Groups a flat array of buttons into 2D row/column arrays sorted by row and order.
 * Optionally uses per-page custom buttonPositions if provided.
 */
export function groupButtonsIntoRows(
  buttons: BotButton[],
  buttonPositions?: Record<string, { row: number; order: number }>
): BotButton[][] {
  if (!buttons || buttons.length === 0) return [];

  const rowMap = new Map<number, BotButton[]>();
  buttons.forEach((btn) => {
    const pos = buttonPositions?.[btn.id];
    const row = pos?.row ?? btn.row ?? 0;
    if (!rowMap.has(row)) {
      rowMap.set(row, []);
    }
    rowMap.get(row)!.push(
      pos ? { ...btn, row: pos.row, order: pos.order } : btn
    );
  });

  const sortedRowKeys = Array.from(rowMap.keys()).sort((a, b) => a - b);

  return sortedRowKeys.map((key) => {
    const rowButtons = rowMap.get(key)!;
    return rowButtons.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  });
}

/**
 * Formats a single InlineKeyboardButton object strictly conforming to Telegram Bot API.
 * Mutually exclusive optional fields are enforced cleanly.
 */
export function formatInlineButtonObject(btn: BotButton, includeInternalId: boolean = false): any {
  const style = getOfficialTelegramStyle(btn);
  const base: any = {
    ...(includeInternalId ? { id: btn.id } : {}),
    text: btn.text,
    ...(style ? { style } : {}),
    ...(btn.customEmojiId ? { icon_custom_emoji_id: btn.customEmojiId } : {}),
  };

  switch (btn.actionType) {
    case 'url':
      if (btn.url) {
        return { ...base, url: btn.url };
      }
      break;
    case 'web_app':
      if (btn.webAppUrl) {
        return { ...base, web_app: { url: btn.webAppUrl } };
      }
      break;
    case 'login_url':
      if (btn.loginUrlConfig?.url) {
        return {
          ...base,
          login_url: {
            url: btn.loginUrlConfig.url,
            ...(btn.loginUrlConfig.forward_text ? { forward_text: btn.loginUrlConfig.forward_text } : {}),
            ...(btn.loginUrlConfig.bot_username ? { bot_username: btn.loginUrlConfig.bot_username } : {}),
            ...(btn.loginUrlConfig.request_write_access !== undefined
              ? { request_write_access: btn.loginUrlConfig.request_write_access }
              : {}),
          },
        };
      }
      break;
    case 'switch_inline_query':
      return { ...base, switch_inline_query: btn.switchInlineQuery ?? '' };
    case 'switch_inline_query_current_chat':
      return { ...base, switch_inline_query_current_chat: btn.switchInlineQuery ?? '' };
    case 'switch_inline_query_chosen_chat':
      return {
        ...base,
        switch_inline_query_chosen_chat: {
          query: btn.switchInlineChosenChat?.query ?? btn.switchInlineQuery ?? '',
          allow_user_chats: btn.switchInlineChosenChat?.allow_user_chats ?? true,
          allow_bot_chats: btn.switchInlineChosenChat?.allow_bot_chats ?? false,
          allow_group_chats: btn.switchInlineChosenChat?.allow_group_chats ?? true,
          allow_channel_chats: btn.switchInlineChosenChat?.allow_channel_chats ?? true,
        },
      };
    case 'copy_text':
      if (btn.copyText) {
        return { ...base, copy_text: { text: btn.copyText } };
      }
      break;
    case 'callback_game':
      return { ...base, callback_game: {} };
    case 'pay':
      return { ...base, pay: true };
    case 'none':
    case 'flow':
    default:
      break;
  }

  // Default & fallback: callback_data (ensure <= 64 UTF-8 bytes)
  const rawCallback = btn.callbackData || btn.id;
  const safeCallback =
    getUtf8ByteLength(rawCallback) <= 64 ? rawCallback : btn.id.slice(0, 64);
  return {
    ...base,
    callback_data: safeCallback,
  };
}

/**
 * Formats a single KeyboardButton (Reply Keyboard) strictly conforming to Telegram Bot API.
 */
export function formatReplyButtonObject(btn: BotButton, includeInternalId: boolean = false): any {
  const style = getOfficialTelegramStyle(btn);
  const base: any = {
    ...(includeInternalId ? { id: btn.id } : {}),
    text: btn.text,
    ...(style ? { style } : {}),
    ...(btn.customEmojiId ? { icon_custom_emoji_id: btn.customEmojiId } : {}),
  };

  switch (btn.actionType) {
    case 'request_contact':
      return { ...base, request_contact: true };
    case 'request_location':
      return { ...base, request_location: true };
    case 'request_poll':
      return {
        ...base,
        request_poll: btn.requestPollType && btn.requestPollType !== 'any'
          ? { type: btn.requestPollType }
          : {},
      };
    case 'request_users':
      return {
        ...base,
        request_users: {
          request_id: btn.requestUsersConfig?.request_id ?? 1,
          ...(btn.requestUsersConfig?.user_is_bot !== undefined
            ? { user_is_bot: btn.requestUsersConfig.user_is_bot }
            : {}),
          ...(btn.requestUsersConfig?.user_is_premium !== undefined
            ? { user_is_premium: btn.requestUsersConfig.user_is_premium }
            : {}),
          ...(btn.requestUsersConfig?.max_quantity !== undefined
            ? { max_quantity: btn.requestUsersConfig.max_quantity }
            : {}),
          ...(btn.requestUsersConfig?.request_name ? { request_name: true } : {}),
          ...(btn.requestUsersConfig?.request_username ? { request_username: true } : {}),
          ...(btn.requestUsersConfig?.request_photo ? { request_photo: true } : {}),
        },
      };
    case 'request_chat':
      return {
        ...base,
        request_chat: {
          request_id: btn.requestChatConfig?.request_id ?? 2,
          chat_is_channel: btn.requestChatConfig?.chat_is_channel ?? false,
          ...(btn.requestChatConfig?.chat_is_forum !== undefined
            ? { chat_is_forum: btn.requestChatConfig.chat_is_forum }
            : {}),
          ...(btn.requestChatConfig?.chat_has_username !== undefined
            ? { chat_has_username: btn.requestChatConfig.chat_has_username }
            : {}),
          ...(btn.requestChatConfig?.chat_is_created !== undefined
            ? { chat_is_created: btn.requestChatConfig.chat_is_created }
            : {}),
          ...(btn.requestChatConfig?.bot_is_member !== undefined
            ? { bot_is_member: btn.requestChatConfig.bot_is_member }
            : {}),
          ...(btn.requestChatConfig?.request_title ? { request_title: true } : {}),
          ...(btn.requestChatConfig?.request_username ? { request_username: true } : {}),
          ...(btn.requestChatConfig?.request_photo ? { request_photo: true } : {}),
        },
      };
    case 'web_app':
      if (btn.webAppUrl) {
        return { ...base, web_app: { url: btn.webAppUrl } };
      }
      break;
    default:
      break;
  }

  return base;
}

/**
 * Formats buttons for Telegram Bot API `inline_keyboard`.
 */
export function formatTelegramInlineKeyboard(
  buttons: BotButton[],
  buttonPositions?: Record<string, { row: number; order: number }>
) {
  const rows = groupButtonsIntoRows(buttons, buttonPositions);
  return rows.map((row) => row.map((btn) => formatInlineButtonObject(btn, false)));
}

/**
 * Formats buttons for Telegram Bot API `reply_keyboard` (or remove_keyboard / force_reply).
 */
export function formatTelegramReplyKeyboard(
  buttons: BotButton[],
  options?: ReplyKeyboardSettings,
  buttonPositions?: Record<string, { row: number; order: number }>
) {
  if (options?.removeKeyboard) {
    return {
      remove_keyboard: true,
      ...(options.selective ? { selective: true } : {}),
    };
  }
  if (options?.forceReply) {
    return {
      force_reply: true,
      ...(options.inputFieldPlaceholder
        ? { input_field_placeholder: options.inputFieldPlaceholder }
        : {}),
      ...(options.selective ? { selective: true } : {}),
    };
  }

  const rows = groupButtonsIntoRows(buttons, buttonPositions);
  const result: any = {
    keyboard: rows.map((row) => row.map((btn) => formatReplyButtonObject(btn, false))),
    resize_keyboard: options?.resizeKeyboard ?? true,
    one_time_keyboard: options?.oneTimeKeyboard ?? false,
  };

  if (options?.isPersistent !== undefined) {
    result.is_persistent = options.isPersistent;
  }
  if (options?.selective !== undefined) {
    result.selective = options.selective;
  }
  if (options?.inputFieldPlaceholder) {
    result.input_field_placeholder = options.inputFieldPlaceholder;
  }

  return result;
}

/**
 * Computes the next { row, order } when adding a new button,
 * preserving manual row assignments instead of forcing a fixed 2-per-row rule.
 */
export function computeNextButtonPosition(
  existingButtons: BotButton[],
  layoutSettings?: LayoutSettings
): { row: number; order: number } {
  if (!existingButtons || existingButtons.length === 0) {
    return { row: 0, order: 0 };
  }

  const rows = groupButtonsIntoRows(existingButtons);
  const lastRowIndex = existingButtons.reduce((max, b) => Math.max(max, b.row ?? 0), 0);
  const lastRowButtons = rows[rows.length - 1] || [];

  // If auto mode specifies buttonsPerRow, respect it cleanly
  if (layoutSettings?.mode === 'auto' && layoutSettings.buttonsPerRow && layoutSettings.buttonsPerRow >= 1) {
    const perRow = layoutSettings.buttonsPerRow;
    if (lastRowButtons.length < perRow) {
      return { row: lastRowIndex, order: lastRowButtons.length };
    }
    return { row: lastRowIndex + 1, order: 0 };
  }

  // Manual / flexible mode: if user hasn't explicitly capped, add cleanly to a new row
  // (or append to last row if single-row building? Putting on lastRow if < 2 only if no manual arrangement,
  // or better: put on new row so each added button doesn't break custom rows, unless user specified perRow).
  // Wait: if the user previously had 1 button in row 0 and adds a 2nd, putting on row 0 order 1 or row+1?
  // Placing on new row if lastRow already has >=2 buttons OR preserving manual rows:
  const lastRowCount = lastRowButtons.length;
  if (lastRowCount === 0) {
    return { row: lastRowIndex, order: 0 };
  }
  // Place in next row by default or in same row if user wants via row arranger;
  // Wait: existing tests expect simple sequential append when not manually arranged:
  // If we place at new row when lastRowCount >= 2, existing 2-col feel works AND manual 1-button or 3-button rows above are NEVER modified!
  if (lastRowCount < 2) {
    return { row: lastRowIndex, order: lastRowCount };
  }
  return { row: lastRowIndex + 1, order: 0 };
}

/**
 * Reorders buttons in a list by moving a button to a new position.
 */
export function reorderButtons(
  buttons: BotButton[],
  sourceId: string,
  targetId: string
): BotButton[] {
  const sourceIndex = buttons.findIndex((b) => b.id === sourceId);
  const targetIndex = buttons.findIndex((b) => b.id === targetId);

  if (sourceIndex === -1 || targetIndex === -1) return buttons;

  const newButtons = [...buttons];
  const [movedButton] = newButtons.splice(sourceIndex, 1);
  newButtons.splice(targetIndex, 0, movedButton);

  return newButtons.map((btn, index) => ({
    ...btn,
    order: index,
  }));
}

/**
 * Move button to a specific row and order
 */
export function moveButtonToPosition(
  buttons: BotButton[],
  buttonId: string,
  targetRow: number,
  targetOrder: number
): BotButton[] {
  return buttons.map((btn) => {
    if (btn.id === buttonId) {
      return {
        ...btn,
        row: targetRow,
        order: targetOrder,
      };
    }
    return btn;
  });
}

/**
 * Finds a button by ID (or custom callbackData) anywhere in the bot configuration (top-level or inside flows).
 */
export function findButtonById(
  bot: BotConfig,
  buttonId: string
): { button: BotButton; parentFlowId?: string } | null {
  const matches = (b: BotButton) => b.id === buttonId || (b.callbackData && b.callbackData === buttonId);

  const inline = bot.inlineButtons?.find(matches);
  if (inline) return { button: inline };

  const reply = bot.replyButtons?.find(matches);
  if (reply) return { button: reply };

  if (bot.buttonFlows) {
    for (const [flowId, flow] of Object.entries(bot.buttonFlows)) {
      const sub = flow.subButtons?.find(matches);
      if (sub) {
        return { button: sub, parentFlowId: flowId };
      }
    }
  }

  return null;
}

/**
 * Collects all descendant button IDs recursively (iteratively with cycle protection)
 * so deleting a button cleanly deletes its nested sub-flows without infinite loops.
 */
export function collectDescendantButtonIds(
  flows: Record<string, ButtonFlow> | undefined,
  rootButtonId: string
): string[] {
  if (!flows) return [rootButtonId];
  const visited = new Set<string>();
  const queue: string[] = [rootButtonId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const flow = flows[currentId];
    if (flow?.subButtons) {
      for (const sub of flow.subButtons) {
        if (!visited.has(sub.id)) {
          queue.push(sub.id);
        }
      }
    }
  }

  return Array.from(visited);
}

/**
 * Deeply duplicates a button and all of its nested flows with fresh unique IDs (cycle-safe).
 */
export function duplicateButtonWithFlow(
  bot: BotConfig,
  sourceButton: BotButton,
  prefix: string = 'btn'
): {
  clonedButton: BotButton;
  newFlows: Record<string, ButtonFlow>;
} {
  const idMap = new Map<string, string>();
  const generateFreshId = (p: string) =>
    `${p}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const rootCloneId = generateFreshId(prefix);
  idMap.set(sourceButton.id, rootCloneId);

  const newFlows: Record<string, ButtonFlow> = {};
  const queue: Array<{ origId: string; cloneId: string }> = [
    { origId: sourceButton.id, cloneId: rootCloneId },
  ];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const { origId, cloneId } = queue.shift()!;
    if (processed.has(origId)) continue;
    processed.add(origId);

    const origFlow = bot.buttonFlows?.[origId];
    if (!origFlow) continue;

    const clonedSubButtons: BotButton[] = (origFlow.subButtons || []).map((sub) => {
      let mappedId = idMap.get(sub.id);
      if (!mappedId) {
        mappedId = generateFreshId('btn_sub');
        idMap.set(sub.id, mappedId);
      }
      if (!processed.has(sub.id)) {
        queue.push({ origId: sub.id, cloneId: mappedId });
      }
      return {
        ...sub,
        id: mappedId,
        callbackData: undefined, // Reset custom callback to prevent collision
        parentId: cloneId,
      };
    });

    // Remap manual page buttonIds if present
    const clonedPagination = origFlow.pagination
      ? {
          ...origFlow.pagination,
          manualPages: origFlow.pagination.manualPages?.map((p) => ({
            ...p,
            id: generateFreshId('page'),
            buttonIds: p.buttonIds.map((bid) => idMap.get(bid) || bid),
          })),
        }
      : undefined;

    newFlows[cloneId] = {
      ...origFlow,
      id: `flow_${cloneId}`,
      buttonId: cloneId,
      parentId: origFlow.parentId,
      media: (origFlow.media || []).map((m) => ({
        ...m,
        id: generateFreshId('media'),
      })),
      subButtons: clonedSubButtons,
      actions: origFlow.actions?.map((a) => ({ ...a, id: generateFreshId('act') })),
      pagination: clonedPagination,
    };
  }

  const clonedButton: BotButton = {
    ...sourceButton,
    id: rootCloneId,
    text: `${sourceButton.text} (نسخة)`,
    callbackData: undefined,
  };

  return { clonedButton, newFlows };
}

/**
 * Finds the flow associated with a button ID.
 */
export function getButtonFlow(bot: BotConfig, buttonId: string): ButtonFlow | null {
  if (!bot.buttonFlows) return null;
  return bot.buttonFlows[buttonId] || null;
}

/**
 * Color class mapping for the modern Telegram colored button update.
 */
export function getButtonColorClasses(
  color?: string,
  isInteractive: boolean = true,
  phoneTheme?: 'dark' | 'light'
) {
  const hoverEffect = isInteractive ? 'transition-all duration-150 active:scale-[0.98]' : '';

  switch (color) {
    case 'primary':
      return `bg-[#2481cc] hover:bg-[#1f73b7] text-white border-transparent shadow-sm ${hoverEffect}`;
    case 'success':
      return `bg-[#31b545] hover:bg-[#2ca23e] text-white border-transparent shadow-sm ${hoverEffect}`;
    case 'danger':
      return `bg-[#e53935] hover:bg-[#cc3330] text-white border-transparent shadow-sm ${hoverEffect}`;
    case 'warning':
      return `bg-amber-600 hover:bg-amber-500 text-white border-transparent shadow-sm ${hoverEffect}`;
    case 'default':
    default:
      if (phoneTheme === 'light') {
        return `bg-white/95 hover:bg-sky-50 text-slate-800 border-sky-200 shadow-sm ${hoverEffect}`;
      }
      if (phoneTheme === 'dark') {
        return `bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700/60 shadow-sm ${hoverEffect}`;
      }
      return isInteractive
        ? `bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700/60 shadow-sm ${hoverEffect}`
        : `bg-sky-50 hover:bg-sky-100 text-slate-800 border-sky-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 dark:border-slate-700/60 shadow-sm ${hoverEffect}`;
  }
}

/**
 * Standard Telegram layout templates according to Telegram Bot guidelines.
 */
export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: '1_per_row',
    name: 'زر واحد في كل صف (عرض كامل)',
    description: 'يظهر كل زر في صف مستقل بعرض كامل',
    pattern: [1],
    previewRows: [[1], [1], [1]],
  },
  {
    id: '2_per_row',
    name: 'زران في كل صف (50% / 50%)',
    description: 'يظهر زران متجاوران في كل صف بالتساوي',
    pattern: [2],
    previewRows: [[1, 1], [1, 1]],
  },
  {
    id: '3_per_row',
    name: 'ثلاثة أزرار في كل صف (33% لكل زر)',
    description: 'ثلاثة أزرار متجاورة في كل صف بالتساوي',
    pattern: [3],
    previewRows: [[1, 1, 1], [1, 1, 1]],
  },
  {
    id: '4_per_row',
    name: 'أربعة أزرار في كل صف (25% لكل زر)',
    description: 'أربعة أزرار في كل صف (25% لكل زر)',
    pattern: [4],
    previewRows: [[1, 1, 1, 1]],
  },
  {
    id: 'wide_then_2',
    name: 'زر عريض ثم زران [1 ثم 2]',
    description: 'صف يحتوي على زر عريض رئيسي، يليه صف بزرين',
    pattern: [1, 2],
    previewRows: [[1], [1, 1]],
  },
  {
    id: '2_then_wide',
    name: 'زران ثم زر عريض [2 ثم 1]',
    description: 'صف يحتوي على زرين، يليه صف يحتوي على زر عريض منفرد',
    pattern: [2, 1],
    previewRows: [[1, 1], [1]],
  },
  {
    id: 'wide_then_3',
    name: 'زر عريض ثم ثلاثة أزرار [1 ثم 3]',
    description: 'زر رئيسي بعرض كامل يليه صف بثلاثة خيارات فرعية',
    pattern: [1, 3],
    previewRows: [[1], [1, 1, 1]],
  },
  {
    id: '3_then_wide',
    name: 'ثلاثة أزرار ثم زر عريض [3 ثم 1]',
    description: 'صف بثلاثة خيارات يليه زر رئيسي عريض بالأسفل',
    pattern: [3, 1],
    previewRows: [[1, 1, 1], [1]],
  },
  {
    id: 'mixed_pyramid',
    name: 'توزيع هرمي مختلط [1 ثم 2 ثم 3]',
    description: 'تدرج أنيق يبدأ بزر منفرد ثم زرين ثم ثلاثة أزرار',
    pattern: [1, 2, 3],
    previewRows: [[1], [1, 1], [1, 1, 1]],
  },
  {
    id: 'mixed_reverse_pyramid',
    name: 'توزيع هرمي معكوس [3 ثم 2 ثم 1]',
    description: 'يبدأ بثلاثة أزرار ثم زرين وينتهي بزر عريض منفرد',
    pattern: [3, 2, 1],
    previewRows: [[1, 1, 1], [1, 1], [1]],
  },
];

/**
 * Applies a layout pattern (including arbitrary custom patterns like [3, 1, 4, 2])
 * to an existing list of buttons without altering their properties or actions.
 */
export function applyLayoutTemplate(
  buttons: BotButton[],
  templateId: LayoutTemplateId | string,
  customPattern?: number[]
): BotButton[] {
  if (!buttons || buttons.length === 0) return [];

  let pattern = [2];
  if (customPattern && customPattern.length > 0) {
    pattern = customPattern.map((n) => Math.max(1, Math.floor(n)));
  } else {
    const tmpl = LAYOUT_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) {
      pattern = tmpl.pattern;
    }
  }

  const result: BotButton[] = [];
  let buttonIdx = 0;
  let rowIdx = 0;
  let patternIdx = 0;

  while (buttonIdx < buttons.length) {
    const countInThisRow = Math.max(1, pattern[patternIdx % pattern.length]);
    for (let orderIdx = 0; orderIdx < countInThisRow && buttonIdx < buttons.length; orderIdx++) {
      const origBtn = buttons[buttonIdx];
      result.push({
        ...origBtn,
        row: rowIdx,
        order: orderIdx,
      });
      buttonIdx++;
    }
    rowIdx++;
    patternIdx++;
  }

  return result;
}
