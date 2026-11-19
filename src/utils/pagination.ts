import {
  BotButton,
  CustomNavButton,
  ManualPage,
  MediaItem,
  MenuNavigationConfig,
  PaginationConfig,
  ParseMode,
  PageUpdateMode,
  ReplyKeyboardSettings,
  UserSession,
  NavigationBreadcrumb,
} from '../types/bot';
import {
  groupButtonsIntoRows,
  formatInlineButtonObject,
  formatReplyButtonObject,
  getOfficialTelegramStyle,
} from './telegramFormatters';

/**
 * Returns clean default pagination configuration.
 * Disabled by default to ensure 100% backward compatibility for existing bots.
 */
export function getDefaultPaginationConfig(
  overrides?: Partial<PaginationConfig>
): PaginationConfig {
  return {
    enabled: false,
    mode: 'auto',
    itemsPerPage: 6,
    manualPages: [],
    navigation: {
      showPrevNext: true,
      prevText: '⬅️ السابق',
      nextText: 'التالي ➡️',
      showFirstLast: false,
      firstText: '⏮ الأولى',
      lastText: 'الأخيرة ⏭',
      position: 'bottom',
      showPageNumbers: false,
      visibility: 'when_needed',
    },
    indicator: {
      enabled: true,
      template: '📄 صفحة {current} من {total}',
      showInNavigationBar: true,
    },
    menuNavigation: {
      showBackButton: true,
      backButtonText: '🔙 العودة للقائمة السابقة',
      showMainMenuButton: true,
      mainMenuButtonText: '🏠 القائمة الرئيسية',
    },
    updateMode: 'edit',
    ...overrides,
  };
}

/**
 * Resolves effective menu navigation without overriding explicit user "skip/hide" choices.
 */
export function getEffectiveMenuNavigation(
  pagination: PaginationConfig | undefined,
  isSubMenu: boolean,
  pageDef?: ManualPage
): MenuNavigationConfig | undefined {
  if (!isSubMenu) return undefined;
  if (pageDef?.menuNavigation) return pageDef.menuNavigation;
  if (pagination?.menuNavigation) return pagination.menuNavigation;
  return {
    showBackButton: true,
    backButtonText: '🔙 العودة للقائمة السابقة',
    showMainMenuButton: true,
    mainMenuButtonText: '🏠 القائمة الرئيسية',
  };
}

/**
 * Calculates total pages dynamically based on button count and pagination mode.
 */
export function computeTotalPages(
  buttons: BotButton[] = [],
  config?: PaginationConfig
): number {
  if (!config || !config.enabled) return 1;

  if (config.mode === 'manual') {
    if (config.manualPages && config.manualPages.length > 0) {
      return Math.max(1, config.manualPages.length);
    }
    const maxPageIndex = buttons.reduce(
      (max, btn) => Math.max(max, btn.pageIndex ?? 0),
      0
    );
    return Math.max(1, maxPageIndex + 1);
  }

  const perPage = Math.max(1, config.itemsPerPage || 6);
  return Math.max(1, Math.ceil(buttons.length / perPage));
}

/**
 * Clamps the page index safely within [0, totalPages - 1].
 */
export function clampPage(page: number, totalPages: number): number {
  if (totalPages <= 1) return 0;
  return Math.max(0, Math.min(page, totalPages - 1));
}

/**
 * Extracts buttons for a specific page.
 */
export function getButtonsForPage(
  buttons: BotButton[] = [],
  page: number,
  config?: PaginationConfig
): BotButton[] {
  if (!config || !config.enabled) return buttons;

  const totalPages = computeTotalPages(buttons, config);
  const clampedPage = clampPage(page, totalPages);

  if (config.mode === 'manual') {
    if (config.manualPages && config.manualPages[clampedPage]) {
      const pageDef = config.manualPages[clampedPage];
      const pageBtnSet = new Set(pageDef.buttonIds || []);
      const filtered = buttons.filter(
        (b) => pageBtnSet.has(b.id) || (pageBtnSet.size === 0 && b.pageIndex === clampedPage)
      );
      // Apply independent per-page buttonPositions if configured
      if (pageDef.buttonPositions) {
        return filtered.map((b) => {
          const pos = pageDef.buttonPositions![b.id];
          return pos ? { ...b, row: pos.row, order: pos.order } : b;
        });
      }
      return filtered;
    }

    return buttons.filter((b) => (b.pageIndex ?? 0) === clampedPage);
  }

  const perPage = Math.max(1, config.itemsPerPage || 6);
  const start = clampedPage * perPage;
  return buttons.slice(start, start + perPage);
}

export interface ResolvedPageView {
  pageIndex: number;
  totalPages: number;
  pageDef?: ManualPage;
  pageTitle?: string;
  message: {
    text: string;
    parseMode?: ParseMode;
    updateMode?: PageUpdateMode;
    skipMessage?: boolean;
  } | null;
  media: MediaItem[];
  buttons: BotButton[];
  buttonPositions?: Record<string, { row: number; order: number }>;
  menuNav?: MenuNavigationConfig;
  customNavButtons: CustomNavButton[];
  hideDefaultNav: boolean;
}

/**
 * Resolves full per-page state (supporting independent per-page message, media,
 * buttons, per-page row layout, custom nav buttons, and menu nav overrides).
 */
export function resolvePageView(params: {
  buttons: BotButton[];
  page: number;
  config?: PaginationConfig;
  defaultMessage: {
    text: string;
    parseMode?: ParseMode;
    updateMode?: PageUpdateMode;
    skipMessage?: boolean;
  } | null;
  defaultMedia: MediaItem[];
  isSubMenu: boolean;
  menuNavOverride?: MenuNavigationConfig;
}): ResolvedPageView {
  const {
    buttons = [],
    page = 0,
    config,
    defaultMessage,
    defaultMedia = [],
    isSubMenu,
    menuNavOverride,
  } = params;

  const totalPages = computeTotalPages(buttons, config);
  const clampedPage = clampPage(page, totalPages);
  const pageDef =
    config?.enabled && config.mode === 'manual' && config.manualPages
      ? config.manualPages[clampedPage]
      : undefined;

  const pageButtons = getButtonsForPage(buttons, clampedPage, config);

  let resolvedMessage = defaultMessage;
  if (pageDef?.message !== undefined) {
    resolvedMessage = pageDef.message;
  }

  const resolvedMedia =
    pageDef?.media !== undefined ? pageDef.media : defaultMedia;

  const resolvedMenuNav =
    pageDef?.menuNavigation ||
    menuNavOverride ||
    getEffectiveMenuNavigation(config, isSubMenu, pageDef);

  const customNavButtons = [
    ...(config?.navigation?.customNavButtons || []),
    ...(pageDef?.customNavButtons || []),
  ].filter((b) => b.enabled !== false);

  return {
    pageIndex: clampedPage,
    totalPages,
    pageDef,
    pageTitle: pageDef?.title,
    message: resolvedMessage,
    media: resolvedMedia,
    buttons: pageButtons,
    buttonPositions: pageDef?.buttonPositions,
    menuNav: resolvedMenuNav,
    customNavButtons,
    hideDefaultNav: Boolean(pageDef?.hideDefaultNav),
  };
}

/**
 * Formats user-configured page indicator text with {current} and {total}.
 */
export function formatPageIndicatorText(
  page: number,
  totalPages: number,
  template?: string
): string {
  const tmpl = template || '📄 صفحة {current} من {total}';
  return tmpl
    .replace('{current}', String(page + 1))
    .replace('{total}', String(totalPages));
}

function formatCustomNavBtn(
  btn: CustomNavButton,
  currentPage: number,
  totalPages: number,
  keyboardType: 'inline' | 'reply'
) {
  const style = getOfficialTelegramStyle(btn);
  let label = btn.text;
  if (btn.role === 'indicator') {
    label = formatPageIndicatorText(currentPage, totalPages, btn.text);
  }

  if (keyboardType === 'reply') {
    return {
      text: label,
      ...(style ? { style } : {}),
    };
  }

  let callback_data = `cnav:${btn.id}`;
  if (btn.role === 'prev') callback_data = `pg:${Math.max(0, currentPage - 1)}`;
  else if (btn.role === 'next') callback_data = `pg:${Math.min(totalPages - 1, currentPage + 1)}`;
  else if (btn.role === 'first') callback_data = 'pg:0';
  else if (btn.role === 'last') callback_data = `pg:${Math.max(0, totalPages - 1)}`;
  else if (btn.role === 'page_number' || btn.role === 'jump_page') {
    callback_data = `pg:${Math.max(0, btn.targetPage ?? 0)}`;
  } else if (btn.role === 'indicator') callback_data = 'pg:info';
  else if (btn.role === 'back') callback_data = 'nav:back';
  else if (btn.role === 'home') callback_data = 'nav:main';
  else if (btn.role === 'jump_flow' && btn.targetFlowId) {
    callback_data = btn.targetFlowId;
  }

  return {
    text: label,
    callback_data,
    ...(style ? { style } : {}),
  };
}

/**
 * Builds the page navigation row buttons (Next, Prev, First, Last, Indicator, Numeric pages).
 */
export function buildNavigationRow(
  page: number,
  totalPages: number,
  config: PaginationConfig,
  keyboardType: 'inline' | 'reply'
): any[] {
  const visibility = config.navigation?.visibility || 'when_needed';
  if (visibility === 'hidden') return [];
  if (visibility === 'when_needed' && totalPages <= 1) return [];

  const nav = config.navigation;
  const indicator = config.indicator;
  const clampedPage = clampPage(page, totalPages);
  const row: any[] = [];

  const hasPrev = clampedPage > 0;
  const hasNext = clampedPage < totalPages - 1;

  if (keyboardType === 'inline') {
    if (nav.showFirstLast && (hasPrev || visibility === 'always')) {
      row.push({
        text: nav.firstText || '⏮ الأولى',
        callback_data: 'pg:0',
      });
    }

    if (nav.showPrevNext && (hasPrev || visibility === 'always')) {
      row.push({
        text: nav.prevText || '⬅️ السابق',
        callback_data: `pg:${Math.max(0, clampedPage - 1)}`,
      });
    }

    if (indicator.enabled && indicator.showInNavigationBar) {
      row.push({
        text: formatPageIndicatorText(clampedPage, totalPages, indicator.template),
        callback_data: 'pg:info',
      });
    }

    if (nav.showPrevNext && (hasNext || visibility === 'always')) {
      row.push({
        text: nav.nextText || 'التالي ➡️',
        callback_data: `pg:${Math.min(totalPages - 1, clampedPage + 1)}`,
      });
    }

    if (nav.showFirstLast && (hasNext || visibility === 'always')) {
      row.push({
        text: nav.lastText || 'الأخيرة ⏭',
        callback_data: `pg:${Math.max(0, totalPages - 1)}`,
      });
    }
  } else {
    if (nav.showFirstLast && (hasPrev || visibility === 'always')) {
      row.push({ text: nav.firstText || '⏮ الأولى' });
    }
    if (nav.showPrevNext && (hasPrev || visibility === 'always')) {
      row.push({ text: nav.prevText || '⬅️ السابق' });
    }
    if (indicator.enabled && indicator.showInNavigationBar) {
      row.push({
        text: formatPageIndicatorText(clampedPage, totalPages, indicator.template),
      });
    }
    if (nav.showPrevNext && (hasNext || visibility === 'always')) {
      row.push({ text: nav.nextText || 'التالي ➡️' });
    }
    if (nav.showFirstLast && (hasNext || visibility === 'always')) {
      row.push({ text: nav.lastText || 'الأخيرة ⏭' });
    }
  }

  return row;
}

/**
 * Builds numeric page quick-jump rows (e.g., [1] [•2•] [3]) when enabled.
 */
export function buildPageNumbersRow(
  page: number,
  totalPages: number,
  config: PaginationConfig,
  keyboardType: 'inline' | 'reply'
): any[][] {
  if (!config.navigation?.showPageNumbers || totalPages <= 1) return [];

  const rows: any[][] = [];
  const perRow = 5;
  let currentRow: any[] = [];

  for (let i = 0; i < totalPages; i++) {
    const label = i === page ? `• ${i + 1} •` : `${i + 1}`;
    if (keyboardType === 'inline') {
      currentRow.push({
        text: label,
        callback_data: `pg:${i}`,
        ...(i === page ? { style: 'primary' } : {}),
      });
    } else {
      currentRow.push({ text: label });
    }

    if (currentRow.length >= perRow) {
      rows.push(currentRow);
      currentRow = [];
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }
  return rows;
}

/**
 * Builds Menu Navigation rows (Back to Previous Menu, Return to Main Menu).
 */
export function buildMenuNavigationRows(
  menuNav: MenuNavigationConfig | undefined,
  isSubMenu: boolean,
  keyboardType: 'inline' | 'reply'
): any[][] {
  if (!isSubMenu || !menuNav) return [];
  if (!menuNav.showBackButton && !menuNav.showMainMenuButton) return [];

  const backTargetCallback = menuNav.backTarget === 'parent' ? 'nav:parent' : 'nav:back';
  const backItem = menuNav.showBackButton
    ? keyboardType === 'inline'
      ? {
          text: menuNav.backButtonText || '🔙 العودة للقائمة السابقة',
          callback_data: backTargetCallback,
        }
      : { text: menuNav.backButtonText || '🔙 العودة للقائمة السابقة' }
    : null;

  const mainItem = menuNav.showMainMenuButton
    ? keyboardType === 'inline'
      ? {
          text: menuNav.mainMenuButtonText || '🏠 القائمة الرئيسية',
          callback_data: 'nav:main',
        }
      : { text: menuNav.mainMenuButtonText || '🏠 القائمة الرئيسية' }
    : null;

  if (backItem && mainItem) {
    if (
      menuNav.backButtonRow !== undefined &&
      menuNav.mainMenuButtonRow !== undefined &&
      menuNav.backButtonRow !== menuNav.mainMenuButtonRow
    ) {
      return menuNav.backButtonRow < menuNav.mainMenuButtonRow
        ? [[backItem], [mainItem]]
        : [[mainItem], [backItem]];
    }
    return [[backItem, mainItem]];
  }

  if (backItem) return [[backItem]];
  if (mainItem) return [[mainItem]];
  return [];
}

/**
 * Builds custom nav rows grouped by row & order.
 */
function buildCustomNavRows(
  customNavButtons: CustomNavButton[],
  currentPage: number,
  totalPages: number,
  keyboardType: 'inline' | 'reply'
): any[][] {
  const filtered = customNavButtons.filter((b) => {
    if (b.enabled === false) return false;
    if (b.visibility === 'hidden') return false;
    if (b.visibility === 'when_needed' && totalPages <= 1 && ['prev', 'next', 'first', 'last', 'page_number', 'indicator'].includes(b.role)) {
      return false;
    }
    if (b.keyboardType && b.keyboardType !== keyboardType) return false;
    return true;
  });

  if (filtered.length === 0) return [];

  const rowMap = new Map<number, CustomNavButton[]>();
  filtered.forEach((btn) => {
    const r = btn.row ?? 0;
    if (!rowMap.has(r)) rowMap.set(r, []);
    rowMap.get(r)!.push(btn);
  });

  return Array.from(rowMap.keys())
    .sort((a, b) => a - b)
    .map((r) =>
      rowMap
        .get(r)!
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((btn) => formatCustomNavBtn(btn, currentPage, totalPages, keyboardType))
    );
}

/**
 * Formats a paginated Inline Keyboard 2D array with full Telegram button type support
 * and optional per-page independent row/layout overrides.
 */
export function formatPaginatedInlineKeyboard(
  buttons: BotButton[] = [],
  page: number = 0,
  config?: PaginationConfig,
  menuNav?: MenuNavigationConfig,
  isSubMenu: boolean = false
): any[][] {
  const totalPages = computeTotalPages(buttons, config);
  const clampedPage = clampPage(page, totalPages);
  const pageDef =
    config?.enabled && config.mode === 'manual' && config.manualPages
      ? config.manualPages[clampedPage]
      : undefined;

  const pageButtons = getButtonsForPage(buttons, clampedPage, config);
  const grouped = groupButtonsIntoRows(pageButtons, pageDef?.buttonPositions);
  const contentRows = grouped.map((row) =>
    row.map((btn) => formatInlineButtonObject(btn, true))
  );

  const finalRows: any[][] = [];
  const hideDefaultNav = Boolean(pageDef?.hideDefaultNav);

  const navRow =
    config && config.enabled && !hideDefaultNav
      ? buildNavigationRow(clampedPage, totalPages, config, 'inline')
      : [];

  const numberRows =
    config && config.enabled && !hideDefaultNav
      ? buildPageNumbersRow(clampedPage, totalPages, config, 'inline')
      : [];

  const indicatorRow =
    config &&
    config.enabled &&
    !hideDefaultNav &&
    config.indicator.enabled &&
    !config.indicator.showInNavigationBar &&
    (totalPages > 1 || config.navigation?.visibility === 'always')
      ? [
          {
            text: formatPageIndicatorText(
              clampedPage,
              totalPages,
              config.indicator.template
            ),
            callback_data: 'pg:info',
          },
        ]
      : [];

  const customNavRows = buildCustomNavRows(
    [
      ...(config?.navigation?.customNavButtons || []),
      ...(pageDef?.customNavButtons || []),
    ],
    clampedPage,
    totalPages,
    'inline'
  );

  const navPosition = config?.navigation.position || 'bottom';

  if (navPosition === 'top') {
    if (indicatorRow.length > 0) finalRows.push(indicatorRow);
    if (navRow.length > 0) finalRows.push(navRow);
    finalRows.push(...numberRows);
    finalRows.push(...customNavRows);
    finalRows.push(...contentRows);
  } else {
    finalRows.push(...contentRows);
    if (indicatorRow.length > 0) finalRows.push(indicatorRow);
    if (navRow.length > 0) finalRows.push(navRow);
    finalRows.push(...numberRows);
    finalRows.push(...customNavRows);
  }

  const effectiveMenuNav = pageDef?.menuNavigation || menuNav;
  if (isSubMenu && effectiveMenuNav) {
    const menuRows = buildMenuNavigationRows(effectiveMenuNav, true, 'inline');
    finalRows.push(...menuRows);
  }

  return finalRows;
}

/**
 * Formats a paginated Reply Keyboard object with full Telegram button type & settings support.
 */
export function formatPaginatedReplyKeyboard(
  buttons: BotButton[] = [],
  page: number = 0,
  config?: PaginationConfig,
  menuNav?: MenuNavigationConfig,
  isSubMenu: boolean = false,
  options?: ReplyKeyboardSettings
) {
  if (options?.removeKeyboard) {
    return {
      keyboard: [],
      remove_keyboard: true,
      ...(options.selective ? { selective: true } : {}),
    };
  }

  const totalPages = computeTotalPages(buttons, config);
  const clampedPage = clampPage(page, totalPages);
  const pageDef =
    config?.enabled && config.mode === 'manual' && config.manualPages
      ? config.manualPages[clampedPage]
      : undefined;

  const pageButtons = getButtonsForPage(buttons, clampedPage, config);
  const grouped = groupButtonsIntoRows(pageButtons, pageDef?.buttonPositions);
  const contentRows = grouped.map((row) =>
    row.map((btn) => formatReplyButtonObject(btn, true))
  );

  const finalRows: any[][] = [];
  const hideDefaultNav = Boolean(pageDef?.hideDefaultNav);

  const navRow =
    config && config.enabled && !hideDefaultNav
      ? buildNavigationRow(clampedPage, totalPages, config, 'reply')
      : [];

  const numberRows =
    config && config.enabled && !hideDefaultNav
      ? buildPageNumbersRow(clampedPage, totalPages, config, 'reply')
      : [];

  const indicatorRow =
    config &&
    config.enabled &&
    !hideDefaultNav &&
    config.indicator.enabled &&
    !config.indicator.showInNavigationBar &&
    (totalPages > 1 || config.navigation?.visibility === 'always')
      ? [
          {
            text: formatPageIndicatorText(
              clampedPage,
              totalPages,
              config.indicator.template
            ),
          },
        ]
      : [];

  const customNavRows = buildCustomNavRows(
    [
      ...(config?.navigation?.customNavButtons || []),
      ...(pageDef?.customNavButtons || []),
    ],
    clampedPage,
    totalPages,
    'reply'
  );

  const navPosition = config?.navigation.position || 'bottom';

  if (navPosition === 'top') {
    if (indicatorRow.length > 0) finalRows.push(indicatorRow);
    if (navRow.length > 0) finalRows.push(navRow);
    finalRows.push(...numberRows);
    finalRows.push(...customNavRows);
    finalRows.push(...contentRows);
  } else {
    finalRows.push(...contentRows);
    if (indicatorRow.length > 0) finalRows.push(indicatorRow);
    if (navRow.length > 0) finalRows.push(navRow);
    finalRows.push(...numberRows);
    finalRows.push(...customNavRows);
  }

  const effectiveMenuNav = pageDef?.menuNavigation || menuNav;
  if (isSubMenu && effectiveMenuNav) {
    const menuRows = buildMenuNavigationRows(effectiveMenuNav, true, 'reply');
    finalRows.push(...menuRows);
  }

  const result: any = {
    keyboard: finalRows,
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
 * User Session and Navigation State Management
 * Keyed by (botId, chatId, userId) so concurrent users stay strictly isolated.
 */
export class SessionManager {
  private sessions = new Map<string, UserSession>();

  private getKey(botId: string, chatId: number, userId?: number): string {
    return `${botId}:${chatId}:${userId ?? 0}`;
  }

  public getOrCreateSession(
    botId: string,
    chatId: number,
    userId?: number
  ): UserSession {
    const key = this.getKey(botId, chatId, userId);
    const existing = this.sessions.get(key);
    if (existing) {
      existing.lastUpdated = Date.now();
      return existing;
    }

    const newSession: UserSession = {
      botId,
      chatId,
      userId,
      currentMenuId: 'main',
      currentPage: 0,
      lastKeyboardMode: 'none',
      history: [],
      lastUpdated: Date.now(),
    };
    this.sessions.set(key, newSession);
    return newSession;
  }

  public getSession(
    botId: string,
    chatId: number,
    userId?: number
  ): UserSession | undefined {
    return this.sessions.get(this.getKey(botId, chatId, userId));
  }

  public navigatePage(
    botId: string,
    chatId: number,
    targetPage: number,
    totalPages: number,
    userId?: number
  ): UserSession {
    const session = this.getOrCreateSession(botId, chatId, userId);
    session.currentPage = clampPage(targetPage, totalPages);
    session.lastUpdated = Date.now();
    return session;
  }

  public pushMenu(
    botId: string,
    chatId: number,
    newMenuId: string,
    buttonId?: string,
    messageId?: number,
    userId?: number
  ): UserSession {
    const session = this.getOrCreateSession(botId, chatId, userId);
    session.history.push({
      menuId: session.currentMenuId,
      page: session.currentPage,
      buttonId,
      messageId: messageId || session.messageId,
      keyboardMode: session.lastKeyboardMode,
    });

    session.currentMenuId = newMenuId;
    session.currentPage = 0;
    if (messageId) session.messageId = messageId;
    session.lastUpdated = Date.now();
    return session;
  }

  public popMenu(
    botId: string,
    chatId: number,
    userId?: number
  ): { session: UserSession; previous?: NavigationBreadcrumb } {
    const session = this.getOrCreateSession(botId, chatId, userId);
    if (session.history.length === 0) {
      session.currentMenuId = 'main';
      session.currentPage = 0;
      session.lastUpdated = Date.now();
      return { session };
    }

    const previous = session.history.pop()!;
    session.currentMenuId = previous.menuId;
    session.currentPage = previous.page;
    if (previous.messageId) session.messageId = previous.messageId;
    session.lastUpdated = Date.now();
    return { session, previous };
  }

  public resetToMain(
    botId: string,
    chatId: number,
    userId?: number
  ): UserSession {
    const session = this.getOrCreateSession(botId, chatId, userId);
    session.currentMenuId = 'main';
    session.currentPage = 0;
    session.history = [];
    session.lastUpdated = Date.now();
    return session;
  }
}

export const defaultSessionManager = new SessionManager();
