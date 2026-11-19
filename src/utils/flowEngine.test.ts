import test from 'node:test';
import assert from 'node:assert/strict';
import { BotButton, BotConfig } from '../types/bot';
import {
  getUtf8ByteLength,
  validateInlineButton,
  validateReplyButton,
  formatInlineButtonObject,
  formatReplyButtonObject,
  collectDescendantButtonIds,
  duplicateButtonWithFlow,
  computeNextButtonPosition,
} from './telegramFormatters';
import {
  SessionManager,
  resolvePageView,
  formatPaginatedInlineKeyboard,
  getDefaultPaginationConfig,
} from './pagination';
import {
  resolveMenuView,
  findContextAwareReplyAction,
  resolveSlashCommand,
} from './flowEngine';

test('UTF-8 callback_data byte length & Telegram button constraints validation', () => {
  // Arabic chars are 2 bytes each in UTF-8
  assert.equal(getUtf8ByteLength('مرحبا'), 10);

  const tooLongCb: BotButton = {
    id: 'b1',
    text: 'زر',
    type: 'inline',
    actionType: 'flow',
    callbackData: 'أ'.repeat(35), // 70 bytes > 64!
    row: 0,
    order: 0,
  };
  const cbCheck = validateInlineButton(tooLongCb, 0, 0);
  assert.equal(cbCheck.valid, false);
  assert.ok(cbCheck.errors[0].includes('64'));

  // Pay button constraint: warns if not row 0 col 0
  const payBtn: BotButton = {
    id: 'pay1',
    text: 'Pay $10',
    type: 'inline',
    actionType: 'pay',
    row: 1,
    order: 0,
  };
  const payCheck = validateInlineButton(payBtn, 1, 0);
  assert.equal(payCheck.warnings.length > 0, true);

  // Web App requires HTTPS
  const badWebApp: BotButton = {
    id: 'wa1',
    text: 'App',
    type: 'inline',
    actionType: 'web_app',
    webAppUrl: 'http://insecure.example.com',
    row: 0,
    order: 0,
  };
  assert.equal(validateInlineButton(badWebApp, 0, 0).valid, false);

  const goodWebApp: BotButton = {
    ...badWebApp,
    webAppUrl: 'https://app.example.com',
  };
  assert.equal(validateInlineButton(goodWebApp, 0, 0).valid, true);
  assert.deepEqual(formatInlineButtonObject(goodWebApp).web_app, { url: 'https://app.example.com' });

  // Copy text & Switch inline & Request poll/users/chat serialization
  const copyBtn: BotButton = {
    id: 'cp1',
    text: 'نسخ الكود',
    type: 'inline',
    actionType: 'copy_text',
    copyText: 'PROMO2026',
    row: 0,
    order: 0,
  };
  assert.deepEqual(formatInlineButtonObject(copyBtn).copy_text, { text: 'PROMO2026' });

  const pollBtn: BotButton = {
    id: 'pl1',
    text: 'اختبار',
    type: 'reply',
    actionType: 'request_poll',
    requestPollType: 'quiz',
    row: 0,
    order: 0,
  };
  assert.equal(validateReplyButton(pollBtn).valid, true);
  assert.deepEqual(formatReplyButtonObject(pollBtn).request_poll, { type: 'quiz' });

  const usersBtn: BotButton = {
    id: 'us1',
    text: 'اختر مستخدم',
    type: 'reply',
    actionType: 'request_users',
    requestUsersConfig: { request_id: 101, max_quantity: 3, request_name: true },
    row: 0,
    order: 0,
  };
  assert.deepEqual(formatReplyButtonObject(usersBtn).request_users, {
    request_id: 101,
    max_quantity: 3,
    request_name: true,
  });
});

test('Unlimited recursive nested flows (6 levels deep) + skipping optional elements + mixed Inline/Reply', () => {
  const bot: BotConfig = {
    id: 'bot_deep',
    name: 'Deep Bot',
    createdAt: '',
    updatedAt: '',
    isConnected: false,
    startMessage: { text: 'Start', isSaved: true, media: [] },
    inlineButtons: [{ id: 'L1', text: 'المستوى 1', type: 'inline', actionType: 'flow', row: 0, order: 0 }],
    replyButtons: [],
    buttonFlows: {
      L1: {
        id: 'flow_L1',
        buttonId: 'L1',
        message: null, // Skipped message!
        media: [{ id: 'm1', type: 'document', url: 'https://example.com/a.pdf', order: 0 }],
        subButtons: [{ id: 'L2', text: 'المستوى 2 (Reply)', type: 'reply', actionType: 'flow', row: 0, order: 0 }],
        pagination: {
          ...getDefaultPaginationConfig(),
          menuNavigation: {
            showBackButton: false, // Explicitly skipped back!
            backButtonText: 'عودة',
            showMainMenuButton: false, // Explicitly skipped main!
            mainMenuButtonText: 'رئيسية',
          },
        },
      },
      L2: {
        id: 'flow_L2',
        buttonId: 'L2',
        message: { text: 'رسالة L2', isSaved: true },
        media: [],
        subButtons: [{ id: 'L3', text: 'المستوى 3 (Inline)', type: 'inline', actionType: 'flow', row: 0, order: 0 }],
      },
      L3: {
        id: 'flow_L3',
        buttonId: 'L3',
        message: { text: 'رسالة L3', isSaved: true },
        media: [],
        subButtons: [{ id: 'L4', text: 'المستوى 4', type: 'inline', actionType: 'flow', row: 0, order: 0 }],
      },
      L4: {
        id: 'flow_L4',
        buttonId: 'L4',
        message: { text: 'رسالة L4', isSaved: true },
        media: [],
        subButtons: [{ id: 'L5', text: 'المستوى 5', type: 'reply', actionType: 'flow', row: 0, order: 0 }],
      },
      L5: {
        id: 'flow_L5',
        buttonId: 'L5',
        message: { text: 'رسالة L5', isSaved: true },
        media: [],
        subButtons: [{ id: 'L6', text: 'المستوى 6 النهائي', type: 'inline', actionType: 'copy_text', copyText: 'DEEP6', row: 0, order: 0 }],
      },
    },
  };

  // Level 1: skipped message, has document media, mixed Reply sub-button, explicitly NO back/main buttons
  const view1 = resolveMenuView(bot, 'L1', 0);
  assert.equal(view1.hasExplicitText, false);
  assert.equal(view1.text, '');
  assert.equal(view1.media[0].type, 'document');
  assert.equal(view1.replyButtons.length, 1);
  assert.equal(view1.inlineRows.length, 0); // Back & Main were explicitly disabled!
  assert.equal(view1.replyMarkup.keyboard[0][0].text, 'المستوى 2 (Reply)');

  // Level 2 -> Level 3 -> Level 5 -> Level 6
  const view5 = resolveMenuView(bot, 'L5', 0);
  assert.equal(view5.inlineButtons[0].id, 'L6');
  assert.deepEqual(view5.inlineRows[0][0].copy_text, { text: 'DEEP6' });
});

test('Independent per-page customization: separate message, media, row layout, and navigation per page', () => {
  const buttons: BotButton[] = [
    { id: 'b1', text: '1', type: 'inline', actionType: 'flow', row: 0, order: 0 },
    { id: 'b2', text: '2', type: 'inline', actionType: 'flow', row: 0, order: 1 },
    { id: 'b3', text: '3', type: 'inline', actionType: 'flow', row: 1, order: 0 },
    { id: 'b4', text: '4', type: 'inline', actionType: 'flow', row: 1, order: 1 },
  ];

  const config = getDefaultPaginationConfig({
    enabled: true,
    mode: 'manual',
    manualPages: [
      {
        id: 'p1',
        title: 'صفحة 1',
        buttonIds: ['b1', 'b2', 'b3'],
        message: { text: 'رسالة الصفحة الأولى', parseMode: 'HTML' },
        media: [{ id: 'mp1', type: 'photo', url: 'https://example.com/p1.jpg', order: 0 }],
        // Put 3 buttons in row 0!
        buttonPositions: {
          b1: { row: 0, order: 0 },
          b2: { row: 0, order: 1 },
          b3: { row: 0, order: 2 },
        },
      },
      {
        id: 'p2',
        title: 'صفحة 2',
        buttonIds: ['b4'],
        message: { text: 'رسالة الصفحة الثانية' },
        media: [],
        buttonPositions: {
          b4: { row: 0, order: 0 },
        },
        menuNavigation: {
          showBackButton: true,
          backButtonText: 'رجوع خاص بصفحة 2',
          showMainMenuButton: false,
          mainMenuButtonText: 'رئيسية',
        },
      },
    ],
  });

  const viewP1 = resolvePageView({
    buttons,
    page: 0,
    config,
    defaultMessage: { text: 'افتراضي' },
    defaultMedia: [],
    isSubMenu: true,
  });
  assert.equal(viewP1.message?.text, 'رسالة الصفحة الأولى');
  assert.equal(viewP1.media.length, 1);

  const kbP1 = formatPaginatedInlineKeyboard(buttons, 0, config, undefined, true);
  // Row 0 of page 1 has all 3 buttons side-by-side!
  assert.equal(kbP1[0].length, 3);

  const viewP2 = resolvePageView({
    buttons,
    page: 1,
    config,
    defaultMessage: { text: 'افتراضي' },
    defaultMedia: [],
    isSubMenu: true,
  });
  assert.equal(viewP2.message?.text, 'رسالة الصفحة الثانية');
  assert.equal(viewP2.media.length, 0);
  assert.equal(viewP2.menuNav?.backButtonText, 'رجوع خاص بصفحة 2');
  assert.equal(viewP2.menuNav?.showMainMenuButton, false);
});

test('Context-aware Reply button matching distinguishes identical button texts in different menus', () => {
  const bot: BotConfig = {
    id: 'b_ctx',
    name: 'Context Bot',
    createdAt: '',
    updatedAt: '',
    isConnected: false,
    startMessage: { text: 'Hi', isSaved: true, media: [] },
    inlineButtons: [],
    replyButtons: [
      { id: 'root_details', text: 'التفاصيل', type: 'reply', actionType: 'flow', row: 0, order: 0 },
      { id: 'cat_b', text: 'قسم B', type: 'reply', actionType: 'flow', row: 0, order: 1 },
    ],
    buttonFlows: {
      cat_b: {
        id: 'flow_cat_b',
        buttonId: 'cat_b',
        message: { text: 'داخل B', isSaved: true },
        media: [],
        subButtons: [
          { id: 'sub_b_details', text: 'التفاصيل', type: 'reply', actionType: 'flow', row: 0, order: 0 },
        ],
      },
    },
  };

  // When session is in main menu, "التفاصيل" resolves to root_details
  const matchMain = findContextAwareReplyAction(bot, { currentMenuId: 'main', currentPage: 0 }, 'التفاصيل');
  assert.equal(matchMain?.kind, 'button');
  if (matchMain?.kind === 'button') assert.equal(matchMain.button.id, 'root_details');

  // When session is inside cat_b, "التفاصيل" resolves to sub_b_details!
  const matchSub = findContextAwareReplyAction(bot, { currentMenuId: 'cat_b', currentPage: 0 }, 'التفاصيل');
  assert.equal(matchSub?.kind, 'button');
  if (matchSub?.kind === 'button') assert.equal(matchSub.button.id, 'sub_b_details');
});

test('Cycle-safe descendant cleanup, recursive duplication, and per-user session isolation', () => {
  const bot: BotConfig = {
    id: 'b_tree',
    name: 'Tree Bot',
    createdAt: '',
    updatedAt: '',
    isConnected: false,
    startMessage: { text: 'Hi', isSaved: true, media: [] },
    inlineButtons: [{ id: 'root1', text: 'أصل', type: 'inline', actionType: 'flow', row: 0, order: 0 }],
    replyButtons: [],
    buttonFlows: {
      root1: {
        id: 'f1',
        buttonId: 'root1',
        message: { text: 'M1', isSaved: true },
        media: [],
        subButtons: [{ id: 'child1', text: 'فرع', type: 'inline', actionType: 'flow', row: 0, order: 0 }],
      },
      child1: {
        id: 'f2',
        buttonId: 'child1',
        message: { text: 'M2', isSaved: true },
        media: [],
        // Even with a cyclic reference back to root1, collectDescendantButtonIds won't infinite loop
        subButtons: [{ id: 'root1', text: 'حلقة', type: 'inline', actionType: 'flow', row: 0, order: 0 }],
      },
    },
  };

  const ids = collectDescendantButtonIds(bot.buttonFlows, 'root1');
  assert.deepEqual(ids.sort(), ['child1', 'root1']);

  const { clonedButton, newFlows } = duplicateButtonWithFlow(bot, bot.inlineButtons[0]);
  assert.notEqual(clonedButton.id, 'root1');
  assert.ok(clonedButton.text.includes('(نسخة)'));
  assert.ok(newFlows[clonedButton.id]);
  assert.equal(newFlows[clonedButton.id].subButtons.length, 1);

  // Per-user isolation in SessionManager
  const sm = new SessionManager();
  sm.navigatePage('bot1', 100, 3, 5, 111);
  sm.navigatePage('bot1', 100, 1, 5, 222);
  assert.equal(sm.getSession('bot1', 100, 111)?.currentPage, 3);
  assert.equal(sm.getSession('bot1', 100, 222)?.currentPage, 1);

  // computeNextButtonPosition preserves manual 3-button row without reshuffling
  const manual3: BotButton[] = [
    { id: '1', text: '1', type: 'inline', actionType: 'flow', row: 0, order: 0 },
    { id: '2', text: '2', type: 'inline', actionType: 'flow', row: 0, order: 1 },
    { id: '3', text: '3', type: 'inline', actionType: 'flow', row: 0, order: 2 },
  ];
  const nextPos = computeNextButtonPosition(manual3);
  assert.deepEqual(nextPos, { row: 1, order: 0 });
});

test('resolveMenuView preserves messageOptions and resolveSlashCommand routes custom, @bot, built-in, and unmatched commands', () => {
  const bot: BotConfig = {
    id: 'b_cmd',
    name: 'Cmd Bot',
    createdAt: '',
    updatedAt: '',
    isConnected: false,
    startMessage: {
      text: 'Welcome',
      isSaved: true,
      media: [],
      messageOptions: {
        messageEffectId: '5104841245755180586',
        protectContent: true,
      },
    },
    inlineButtons: [{ id: 'btn_offers', text: 'العروض', type: 'inline', actionType: 'flow', row: 0, order: 0 }],
    replyButtons: [],
    buttonFlows: {
      btn_offers: {
        id: 'flow_offers',
        buttonId: 'btn_offers',
        message: {
          text: 'قائمة العروض',
          isSaved: true,
          messageOptions: {
            disableNotification: true,
            linkPreviewOptions: { is_disabled: true },
          },
        },
        media: [],
        subButtons: [],
      },
    },
    commands: [
      { command: 'offers', description: 'عرض العروض', targetFlowId: 'btn_offers' },
      { command: '/home_alias', description: 'الرئيسية', targetFlowId: '' },
    ],
  };

  const mainView = resolveMenuView(bot, 'main', 0);
  assert.equal(mainView.messageOptions?.messageEffectId, '5104841245755180586');
  assert.equal(mainView.messageOptions?.protectContent, true);

  const flowView = resolveMenuView(bot, 'btn_offers', 0);
  assert.equal(flowView.messageOptions?.disableNotification, true);
  assert.equal(flowView.messageOptions?.linkPreviewOptions?.is_disabled, true);

  assert.deepEqual(resolveSlashCommand(bot, '/offers'), {
    matched: true,
    targetMenuId: 'btn_offers',
  });
  assert.deepEqual(resolveSlashCommand(bot, '/offers@TeleCraftBot extra'), {
    matched: true,
    targetMenuId: 'btn_offers',
  });
  assert.deepEqual(resolveSlashCommand(bot, '/home_alias'), {
    matched: true,
    targetMenuId: 'main',
  });
  assert.deepEqual(resolveSlashCommand(bot, '/start'), {
    matched: true,
    targetMenuId: 'main',
  });
  assert.deepEqual(resolveSlashCommand(bot, '/unknown'), {
    matched: false,
    targetMenuId: 'main',
  });
  assert.deepEqual(resolveSlashCommand(bot, 'hello text'), {
    matched: false,
    targetMenuId: 'main',
  });
});
