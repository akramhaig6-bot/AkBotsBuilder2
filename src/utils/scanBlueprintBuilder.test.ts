import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBlueprintFromCapturedBot,
  makeDeterministicCapturedButtonId,
  telegramEntitiesToHtml,
} from './scanBlueprintBuilder';
import { parseBotDesignJson } from './jsonBotBlueprint';
import { CapturedBotRecord } from '../types/scan';

test('telegramEntitiesToHtml handles nested formatting and HTML escaping', () => {
  const plain = 'أهلاً <بك> في عالم البرمجة والروابط';
  // Bold on "عالم البرمجة" (offset 13, length 12), Italic on "البرمجة" (offset 18, length 7)
  // "أهلاً <بك> في " -> length 14
  const idxWorld = plain.indexOf('عالم البرمجة');
  const idxCode = plain.indexOf('البرمجة');
  const idxLink = plain.indexOf('الروابط');

  const result = telegramEntitiesToHtml(plain, [
    { className: 'MessageEntityBold', offset: idxWorld, length: 'عالم البرمجة'.length },
    { className: 'MessageEntityItalic', offset: idxCode, length: 'البرمجة'.length },
    {
      className: 'MessageEntityTextUrl',
      offset: idxLink,
      length: 'الروابط'.length,
      url: 'https://example.com?a=1&b="2"',
    },
  ]);

  assert.equal(result.parseMode, 'HTML');
  assert.equal(
    result.text,
    'أهلاً &lt;بك&gt; في <b>عالم <i>البرمجة</i></b> و<a href="https://example.com?a=1&amp;b=&quot;2&quot;">الروابط</a>'
  );
});

test('buildBlueprintFromCapturedBot builds multi-level inline, reply, edits, alerts, commands, and round-trips through parseBotDesignJson', () => {
  const btnShopId = makeDeterministicCapturedButtonId('root', 'inline', 0, 0, '🛍️ المتجر', 'shop');
  const btnAlertId = makeDeterministicCapturedButtonId('root', 'inline', 0, 1, 'ℹ️ تنبيه', 'info_alert');
  const btnReplyHelpId = makeDeterministicCapturedButtonId('root', 'reply', 0, 0, '📞 تواصل معنا');
  const subBtnCheckoutId = makeDeterministicCapturedButtonId('shop', 'inline', 0, 0, '💳 الدفع', 'checkout');

  const record: CapturedBotRecord = {
    botKey: 'demo_shop_bot',
    botTelegramId: '99887766',
    username: 'demo_shop_bot',
    displayName: 'متجر تيليجرام',
    description: 'بوت تجريبي للتسوق',
    commands: [
      { command: 'start', description: 'البداية' },
      { command: 'help', description: 'مساعدة' },
    ],
    manualParentOverrides: {},
    lastInteractionAt: '2026-01-01T00:00:05.000Z',
    events: [
      {
        id: 'ev_1',
        botKey: 'demo_shop_bot',
        telegramMessageId: 100,
        timestamp: '2026-01-01T00:00:01.000Z',
        kind: 'start_response',
        isEdited: false,
        triggerType: 'command',
        triggerText: '/start',
        text: '<b>مرحباً بك في المتجر!</b>',
        parseMode: 'HTML',
        media: [{ id: 'm1', type: 'photo', url: '/uploads/scan_welcome.jpg', order: 0 }],
        inlineButtons: [
          {
            id: btnShopId,
            text: '🛍️ المتجر',
            type: 'inline',
            row: 0,
            order: 0,
            actionType: 'flow',
            callbackData: 'shop',
            style: 'primary',
            color: 'primary',
          },
          {
            id: btnAlertId,
            text: 'ℹ️ تنبيه',
            type: 'inline',
            row: 0,
            order: 1,
            actionType: 'flow',
            callbackData: 'info_alert',
          },
        ],
        replyButtons: [
          {
            id: btnReplyHelpId,
            text: '📞 تواصل معنا',
            type: 'reply',
            row: 0,
            order: 0,
            actionType: 'flow',
          },
        ],
        replyKeyboardSettings: {
          resizeKeyboard: true,
          oneTimeKeyboard: false,
          inputFieldPlaceholder: 'اختر من القائمة...',
        },
      },
      {
        id: 'ev_2',
        botKey: 'demo_shop_bot',
        telegramMessageId: 100,
        sourceMessageId: 100,
        timestamp: '2026-01-01T00:00:02.000Z',
        kind: 'edit_message',
        isEdited: true,
        triggerType: 'inline_button',
        triggerCallbackData: 'shop',
        parentButtonId: btnShopId,
        text: 'اختر قسم المنتجات:',
        parseMode: 'none',
        media: [],
        inlineButtons: [
          {
            id: subBtnCheckoutId,
            text: '💳 الدفع',
            type: 'inline',
            row: 0,
            order: 0,
            actionType: 'flow',
            callbackData: 'checkout',
            style: 'success',
            color: 'success',
          },
        ],
        replyButtons: [],
      },
      {
        id: 'ev_3',
        botKey: 'demo_shop_bot',
        telegramMessageId: 100,
        sourceMessageId: 100,
        timestamp: '2026-01-01T00:00:03.000Z',
        kind: 'callback_alert',
        isEdited: false,
        triggerType: 'inline_button',
        triggerCallbackData: 'info_alert',
        parentButtonId: btnAlertId,
        text: '',
        parseMode: 'none',
        media: [],
        inlineButtons: [],
        replyButtons: [],
        callbackAlert: {
          text: 'المتجر يعمل 24 ساعة!',
          showAlert: true,
        },
      },
      {
        id: 'ev_4',
        botKey: 'demo_shop_bot',
        telegramMessageId: 101,
        timestamp: '2026-01-01T00:00:04.000Z',
        kind: 'new_message',
        isEdited: false,
        triggerType: 'reply_button',
        triggerText: '📞 تواصل معنا',
        text: 'تواصل معنا عبر الدعم الفني.',
        parseMode: 'none',
        media: [],
        inlineButtons: [],
        replyButtons: [],
      },
      {
        id: 'ev_5',
        botKey: 'demo_shop_bot',
        telegramMessageId: 100,
        sourceMessageId: 100,
        timestamp: '2026-01-01T00:00:05.000Z',
        kind: 'edit_message',
        isEdited: true,
        triggerType: 'inline_button',
        triggerCallbackData: 'checkout',
        parentButtonId: subBtnCheckoutId,
        text: 'تم فتح صفحة الدفع بنجاح.',
        parseMode: 'none',
        media: [],
        inlineButtons: [],
        replyButtons: [],
      },
      {
        id: 'ev_6',
        botKey: 'demo_shop_bot',
        telegramMessageId: 102,
        timestamp: '2026-01-01T00:00:06.000Z',
        kind: 'new_message',
        isEdited: false,
        triggerType: 'command',
        triggerText: '/help',
        text: 'دليل استخدام البوت',
        parseMode: 'none',
        media: [],
        inlineButtons: [],
        replyButtons: [],
      },
    ],
  };

  const built = buildBlueprintFromCapturedBot(record);

  assert.equal(built.blueprint.name, 'متجر تيليجرام');
  assert.equal(built.blueprint.startMessage?.text, '<b>مرحباً بك في المتجر!</b>');
  assert.equal(built.blueprint.startMessage?.parseMode, 'HTML');
  assert.equal(built.blueprint.startMessage?.media.length, 1);
  assert.equal(built.blueprint.inlineButtons?.length, 2);
  assert.equal(built.blueprint.replyButtons?.length, 1);
  assert.equal(built.blueprint.settings?.inputFieldPlaceholder, 'اختر من القائمة...');

  // Flow 1: Shop (edited in place + nested Checkout button)
  const shopFlow = built.blueprint.buttonFlows?.[btnShopId];
  assert.ok(shopFlow);
  assert.equal(shopFlow.message?.updateMode, 'edit');
  assert.equal(shopFlow.subButtons.length, 1);
  assert.equal(shopFlow.subButtons[0].id, subBtnCheckoutId);

  // Nested Level 2: Checkout
  const checkoutFlow = built.blueprint.buttonFlows?.[subBtnCheckoutId];
  assert.ok(checkoutFlow);
  assert.equal(checkoutFlow.parentId, btnShopId);
  assert.equal(checkoutFlow.message?.text, 'تم فتح صفحة الدفع بنجاح.');

  // Alert-only Flow
  const alertFlow = built.blueprint.buttonFlows?.[btnAlertId];
  assert.ok(alertFlow);
  assert.equal(alertFlow.message, null);
  assert.equal(alertFlow.actions?.[0]?.type, 'callback_alert');
  assert.equal(alertFlow.actions?.[0]?.config?.text, 'المتجر يعمل 24 ساعة!');
  assert.equal(alertFlow.actions?.[0]?.config?.showAlert, true);

  // Passive Reply Button match by text
  const replyFlow = built.blueprint.buttonFlows?.[btnReplyHelpId];
  assert.ok(replyFlow);
  assert.equal(replyFlow.message?.text, 'تواصل معنا عبر الدعم الفني.');

  // Command /help flow
  const helpCmd = built.blueprint.commands?.find((c) => c.command === 'help');
  assert.equal(helpCmd?.targetFlowId, 'scan_cmd_help');
  assert.equal(built.blueprint.buttonFlows?.scan_cmd_help?.message?.text, 'دليل استخدام البوت');

  // Round-trip validation through parseBotDesignJson
  const reparsed = parseBotDesignJson(built.json);
  assert.equal(reparsed.valid, true);
  assert.equal(reparsed.blueprint?.inlineButtons?.length, 2);
  assert.equal(reparsed.blueprint?.replyButtons?.length, 1);
});

test('manualParentOverrides re-links an unassigned passive edit to a specific button', () => {
  const btnId = makeDeterministicCapturedButtonId('root', 'inline', 0, 0, 'الباقات', 'plans');
  const record: CapturedBotRecord = {
    botKey: 'sample_bot',
    botTelegramId: '12345',
    displayName: 'بوت تجريبي',
    commands: [],
    manualParentOverrides: {
      ev_passive: btnId,
    },
    lastInteractionAt: '2026-01-01T00:00:02.000Z',
    events: [
      {
        id: 'ev_start',
        botKey: 'sample_bot',
        telegramMessageId: 50,
        timestamp: '2026-01-01T00:00:01.000Z',
        kind: 'start_response',
        isEdited: false,
        triggerType: 'command',
        triggerText: '/start',
        text: 'القائمة الرئيسية',
        parseMode: 'none',
        media: [],
        inlineButtons: [
          {
            id: btnId,
            text: 'الباقات',
            type: 'inline',
            row: 0,
            order: 0,
            actionType: 'flow',
            callbackData: 'plans',
          },
        ],
        replyButtons: [],
      },
      {
        id: 'ev_passive',
        botKey: 'sample_bot',
        telegramMessageId: 50,
        sourceMessageId: 50,
        timestamp: '2026-01-01T00:00:02.000Z',
        kind: 'edit_message',
        isEdited: true,
        text: 'تفاصيل الأسعار الشهرية والسنوية',
        parseMode: 'none',
        media: [],
        inlineButtons: [],
        replyButtons: [],
      },
    ],
  };

  const built = buildBlueprintFromCapturedBot(record);
  assert.equal(
    built.blueprint.buttonFlows?.[btnId]?.message?.text,
    'تفاصيل الأسعار الشهرية والسنوية'
  );
  const resolvedPassive = built.resolvedEvents.find((e) => e.eventId === 'ev_passive');
  assert.equal(resolvedPassive?.assignedTo, 'button');
  assert.equal(resolvedPassive?.assignedButtonId, btnId);
});
