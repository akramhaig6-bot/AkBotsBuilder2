import {
  BotButton,
  BotConfig,
  ButtonFlow,
  CustomNavButton,
  FlowAction,
  MediaItem,
  MenuNavigationConfig,
  PaginationConfig,
  ParseMode,
  PageUpdateMode,
  ReplyKeyboardSettings,
  TelegramMessageOptions,
  UserSession,
} from '../types/bot';
import {
  computeTotalPages,
  clampPage,
  formatPaginatedInlineKeyboard,
  formatPaginatedReplyKeyboard,
  getEffectiveMenuNavigation,
  resolvePageView,
} from './pagination';
import { findButtonById, formatTelegramReplyKeyboard } from './telegramFormatters';

export interface ResolvedMenuView {
  menuId: string;
  isMain: boolean;
  isSkipped: boolean;
  page: number;
  totalInlinePages: number;
  totalReplyPages: number;
  text: string;
  hasExplicitText: boolean;
  parseMode?: ParseMode;
  updateMode: PageUpdateMode;
  placement: 'before_media' | 'after_media';
  media: MediaItem[];
  inlineButtons: BotButton[];
  replyButtons: BotButton[];
  inlineRows: any[][];
  replyMarkup?: any;
  inlinePagination?: PaginationConfig;
  replyPagination?: PaginationConfig;
  menuNav?: MenuNavigationConfig;
  replySettings: ReplyKeyboardSettings;
  actions: FlowAction[];
  messageOptions?: TelegramMessageOptions;
}

/**
 * Resolves the complete rendered state for either the 'main' menu or any recursive ButtonFlow at any depth.
 * Single Source of Truth used by both server.ts and TelegramSimulator.tsx.
 */
export function resolveMenuView(
  bot: BotConfig,
  menuId: string,
  page: number = 0
): ResolvedMenuView {
  const isMain = menuId === 'main';
  const flow: ButtonFlow | undefined = !isMain
    ? bot.buttonFlows?.[menuId]
    : undefined;
  const targetBtn = !isMain ? findButtonById(bot, menuId)?.button : undefined;

  const isSkipped = Boolean(
    !isMain && (targetBtn?.skipFlow || flow?.flowMode === 'skip')
  );

  const inlineButtons = isMain
    ? bot.inlineButtons || []
    : (flow?.subButtons || []).filter((b) => b.type === 'inline' || !b.type);

  const replyButtons = isMain
    ? bot.replyButtons || []
    : (flow?.subButtons || []).filter((b) => b.type === 'reply');

  const inlinePagination = isMain ? bot.inlinePagination : flow?.pagination;
  const replyPagination = isMain ? bot.replyPagination : flow?.pagination;

  const baseMessage = isMain
    ? bot.startMessage?.skipMessage
      ? null
      : {
          text: bot.startMessage?.text || '',
          parseMode: bot.startMessage?.parseMode,
          skipMessage: bot.startMessage?.skipMessage,
        }
    : flow?.message?.skipMessage
    ? null
    : flow?.message
    ? {
        text: flow.message.text || '',
        parseMode: flow.message.parseMode,
        updateMode: flow.message.updateMode,
        skipMessage: flow.message.skipMessage,
      }
    : null;

  const baseMedia = isMain ? bot.startMessage?.media || [] : flow?.media || [];

  // Resolve inline page view (supports independent per-page content/media/nav)
  const resolvedInlinePage = resolvePageView({
    buttons: inlineButtons,
    page,
    config: inlinePagination,
    defaultMessage: baseMessage,
    defaultMedia: baseMedia,
    isSubMenu: !isMain,
    menuNavOverride: isMain
      ? undefined
      : getEffectiveMenuNavigation(flow?.pagination, true),
  });

  // Resolve reply page view
  const resolvedReplyPage = resolvePageView({
    buttons: replyButtons,
    page,
    config: replyPagination,
    defaultMessage: resolvedInlinePage.message,
    defaultMedia: resolvedInlinePage.media,
    isSubMenu: !isMain,
    menuNavOverride: resolvedInlinePage.menuNav,
  });

  // Merge page message & media (prefer manual page override if inline or reply defines one)
  const finalMsgObj =
    resolvedInlinePage.pageDef?.message !== undefined
      ? resolvedInlinePage.message
      : resolvedReplyPage.pageDef?.message !== undefined
      ? resolvedReplyPage.message
      : baseMessage;

  const finalMedia =
    resolvedInlinePage.pageDef?.media !== undefined
      ? resolvedInlinePage.media
      : resolvedReplyPage.pageDef?.media !== undefined
      ? resolvedReplyPage.media
      : baseMedia;

  const rawText = finalMsgObj && !finalMsgObj.skipMessage ? finalMsgObj.text : '';
  const hasExplicitText = Boolean(rawText && rawText.trim().length > 0);

  // Format Inline Keyboard (if inline buttons exist OR sub-menu navigation is enabled without reply buttons)
  const menuNavForInline =
    inlineButtons.length > 0 || replyButtons.length === 0
      ? resolvedInlinePage.menuNav
      : undefined;

  const inlineRows =
    !isSkipped && (inlineButtons.length > 0 || (!isMain && menuNavForInline && replyButtons.length === 0))
      ? formatPaginatedInlineKeyboard(
          inlineButtons,
          page,
          inlinePagination,
          menuNavForInline,
          !isMain
        )
      : [];

  const replySettings: ReplyKeyboardSettings = {
    resizeKeyboard:
      flow?.replyKeyboardSettings?.resizeKeyboard ?? bot.settings?.resizeKeyboard ?? true,
    oneTimeKeyboard:
      flow?.replyKeyboardSettings?.oneTimeKeyboard ?? bot.settings?.oneTimeKeyboard ?? false,
    isPersistent:
      flow?.replyKeyboardSettings?.isPersistent ?? bot.settings?.isPersistent,
    selective:
      flow?.replyKeyboardSettings?.selective ?? bot.settings?.selective,
    inputFieldPlaceholder:
      flow?.replyKeyboardSettings?.inputFieldPlaceholder ?? bot.settings?.inputFieldPlaceholder,
    removeKeyboard: flow?.replyKeyboardSettings?.removeKeyboard,
    forceReply: flow?.replyKeyboardSettings?.forceReply,
  };

  const menuNavForReply = replyButtons.length > 0 ? resolvedReplyPage.menuNav : undefined;
  const replyMarkup =
    !isSkipped &&
    (replyButtons.length > 0 ||
      replySettings.removeKeyboard ||
      replySettings.forceReply)
      ? replySettings.removeKeyboard || replySettings.forceReply
        ? formatTelegramReplyKeyboard([], replySettings)
        : formatPaginatedReplyKeyboard(
            replyButtons,
            page,
            replyPagination,
            menuNavForReply,
            !isMain,
            replySettings
          )
      : undefined;

  const updateMode: PageUpdateMode =
    finalMsgObj?.updateMode ||
    flow?.message?.updateMode ||
    inlinePagination?.updateMode ||
    'edit';

  const messageOptions: TelegramMessageOptions | undefined = isMain
    ? bot.startMessage?.messageOptions
    : flow?.message?.messageOptions;

  return {
    menuId,
    isMain,
    isSkipped,
    page: resolvedInlinePage.pageIndex,
    totalInlinePages: resolvedInlinePage.totalPages,
    totalReplyPages: resolvedReplyPage.totalPages,
    text: rawText,
    hasExplicitText,
    parseMode: finalMsgObj?.parseMode || flow?.message?.parseMode,
    updateMode,
    placement: flow?.message?.placement || 'after_media',
    media: finalMedia,
    inlineButtons,
    replyButtons,
    inlineRows,
    replyMarkup,
    inlinePagination,
    replyPagination,
    menuNav: resolvedInlinePage.menuNav,
    replySettings,
    actions: (flow?.actions || [])
      .filter((a) => a.enabled !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    messageOptions,
  };
}

export type ContextReplyMatch =
  | { kind: 'page_next' }
  | { kind: 'page_prev' }
  | { kind: 'page_first' }
  | { kind: 'page_last' }
  | { kind: 'page_number'; page: number }
  | { kind: 'page_indicator' }
  | { kind: 'nav_back' }
  | { kind: 'nav_parent' }
  | { kind: 'nav_main' }
  | { kind: 'jump_flow'; flowId: string }
  | { kind: 'button'; button: BotButton }
  | null;

/**
 * Resolves a Reply Keyboard text press strictly within the active menu/page context FIRST,
 * preventing duplicate button text collisions across different nested flows.
 */
export function findContextAwareReplyAction(
  bot: BotConfig,
  session: Pick<UserSession, 'currentMenuId' | 'currentPage'>,
  rawText: string
): ContextReplyMatch {
  const normalized = (rawText || '').trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();

  const view = resolveMenuView(bot, session.currentMenuId, session.currentPage);
  const replyPagination = view.replyPagination;
  const totalPages = view.totalReplyPages;
  const nav = replyPagination?.navigation;
  const menuNav = view.menuNav;

  // 1. Check active menu's pagination navigation buttons
  if (replyPagination?.enabled && totalPages > 1 && nav) {
    if (nav.showPrevNext && nav.nextText && normalized === nav.nextText.trim()) {
      return { kind: 'page_next' };
    }
    if (nav.showPrevNext && nav.prevText && normalized === nav.prevText.trim()) {
      return { kind: 'page_prev' };
    }
    if (nav.showFirstLast && nav.firstText && normalized === nav.firstText.trim()) {
      return { kind: 'page_first' };
    }
    if (nav.showFirstLast && nav.lastText && normalized === nav.lastText.trim()) {
      return { kind: 'page_last' };
    }
    if (nav.showPageNumbers) {
      const stripped = normalized.replace(/[•\s]/g, '');
      const parsedNum = Number(stripped);
      if (Number.isInteger(parsedNum) && parsedNum >= 1 && parsedNum <= totalPages) {
        return { kind: 'page_number', page: parsedNum - 1 };
      }
    }
  }

  // 2. Check custom nav buttons in current page/menu
  const resolvedPage = resolvePageView({
    buttons: view.replyButtons,
    page: session.currentPage,
    config: replyPagination,
    defaultMessage: null,
    defaultMedia: [],
    isSubMenu: !view.isMain,
    menuNavOverride: menuNav,
  });

  for (const cBtn of resolvedPage.customNavButtons) {
    if (cBtn.text.trim() === normalized) {
      if (cBtn.role === 'next') return { kind: 'page_next' };
      if (cBtn.role === 'prev') return { kind: 'page_prev' };
      if (cBtn.role === 'first') return { kind: 'page_first' };
      if (cBtn.role === 'last') return { kind: 'page_last' };
      if ((cBtn.role === 'jump_page' || cBtn.role === 'page_number') && cBtn.targetPage !== undefined) {
        return { kind: 'page_number', page: cBtn.targetPage };
      }
      if (cBtn.role === 'back') return { kind: 'nav_back' };
      if (cBtn.role === 'home') return { kind: 'nav_main' };
      if (cBtn.role === 'jump_flow' && cBtn.targetFlowId) {
        return { kind: 'jump_flow', flowId: cBtn.targetFlowId };
      }
    }
  }

  // 3. Check active menu's Back / Main navigation
  if (!view.isMain && menuNav) {
    if (menuNav.showBackButton && menuNav.backButtonText && normalized === menuNav.backButtonText.trim()) {
      return menuNav.backTarget === 'parent' ? { kind: 'nav_parent' } : { kind: 'nav_back' };
    }
    if (menuNav.showMainMenuButton && menuNav.mainMenuButtonText && normalized === menuNav.mainMenuButtonText.trim()) {
      return { kind: 'nav_main' };
    }
  }

  // 4. Match reply buttons in CURRENT active page FIRST
  const activePageMatch = resolvedPage.buttons.find(
    (b) => b.text.trim().toLowerCase() === lower
  );
  if (activePageMatch) {
    return { kind: 'button', button: activePageMatch };
  }

  // 5. Match any reply button in CURRENT active flow (even if on another page)
  const activeFlowMatch = view.replyButtons.find(
    (b) => b.text.trim().toLowerCase() === lower
  );
  if (activeFlowMatch) {
    return { kind: 'button', button: activeFlowMatch };
  }

  // 6. Fallback: check top-level reply buttons
  const topMatch = bot.replyButtons?.find(
    (b) => b.text.trim().toLowerCase() === lower
  );
  if (topMatch) {
    return { kind: 'button', button: topMatch };
  }

  // 7. Final fallback: search across all flows in case user clicked an older reply button message
  if (bot.buttonFlows) {
    for (const f of Object.values(bot.buttonFlows)) {
      const subMatch = f.subButtons?.find(
        (b) => b.type === 'reply' && b.text.trim().toLowerCase() === lower
      );
      if (subMatch) {
        return { kind: 'button', button: subMatch };
      }
    }
  }

  return null;
}

/**
 * Resolves the parent flow ID of a button ID (if it lives inside a ButtonFlow).
 */
export function findParentFlowId(bot: BotConfig, buttonId: string): string | null {
  if (!bot.buttonFlows) return null;
  for (const [flowId, flow] of Object.entries(bot.buttonFlows)) {
    if (flow.subButtons?.some((b) => b.id === buttonId)) {
      return flowId;
    }
  }
  return null;
}

/**
 * Resolves a slash command (e.g. "/shop" or "/shop@MyBot") against custom bot.commands
 * as well as built-in start/menu/help triggers.
 */
export function resolveSlashCommand(
  bot: BotConfig,
  rawText: string
): { matched: boolean; targetMenuId: string } {
  const trimmed = (rawText || '').trim();
  if (!trimmed.startsWith('/')) {
    return { matched: false, targetMenuId: 'main' };
  }

  // Extract command token without leading slash or @bot_username suffix
  const firstWord = trimmed.split(/\s+/)[0];
  const cmdName = firstWord.slice(1).split('@')[0].toLowerCase();
  if (!cmdName) return { matched: false, targetMenuId: 'main' };

  const customCmd = (bot.commands || []).find(
    (c) => c.command.replace(/^\//, '').trim().toLowerCase() === cmdName
  );
  if (customCmd) {
    return {
      matched: true,
      targetMenuId: customCmd.targetFlowId?.trim() || 'main',
    };
  }

  if (cmdName === 'start' || cmdName === 'menu' || cmdName === 'help') {
    return { matched: true, targetMenuId: 'main' };
  }

  return { matched: false, targetMenuId: 'main' };
}
