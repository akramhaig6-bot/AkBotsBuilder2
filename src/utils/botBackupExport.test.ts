import test from 'node:test';
import assert from 'node:assert/strict';
import { BotConfig } from '../types/bot';
import { parseBotDesignJson } from './jsonBotBlueprint';
import { buildBotBackupFilename, exportBotBackupJson } from './botBackupExport';

function makeSampleBot(): BotConfig {
  return {
    id: 'bot_123',
    name: 'بوت المتجر الذكي',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-18T12:00:00.000Z',
    token: '123456:SECRET_SHOULD_NOT_EXPORT',
    isConnected: true,
    botUsername: 'smart_shop_bot',
    startMessage: {
      text: '<b>أهلاً بك في المتجر</b>',
      isSaved: true,
      parseMode: 'HTML',
      media: [],
      messageOptions: {
        protectContent: true,
      },
    },
    inlineButtons: [
      {
        id: 'btn_products',
        text: '🛍️ المنتجات',
        type: 'inline',
        style: 'primary',
        color: 'primary',
        actionType: 'flow',
        row: 0,
        order: 0,
      },
    ],
    replyButtons: [
      {
        id: 'btn_help',
        text: '❓ المساعدة',
        type: 'reply',
        actionType: 'flow',
        row: 0,
        order: 0,
      },
    ],
    inlinePagination: {
      enabled: true,
      mode: 'auto',
      itemsPerPage: 4,
      navigation: {
        showPrevNext: true,
        prevText: 'السابق',
        nextText: 'التالي',
        showFirstLast: false,
        firstText: 'الأول',
        lastText: 'الأخير',
        position: 'bottom',
      },
      indicator: {
        enabled: true,
        template: 'صفحة {current} من {total}',
        showInNavigationBar: true,
      },
    },
    buttonFlows: {
      btn_products: {
        id: 'btn_products',
        buttonId: 'btn_products',
        parentId: null,
        message: {
          text: 'اختر القسم:',
          isSaved: true,
          parseMode: 'none',
          updateMode: 'edit',
        },
        media: [],
        subButtons: [],
      },
    },
    commands: [
      { command: 'start', description: 'بدء البوت', targetFlowId: 'main' },
      { command: 'shop', description: 'فتح المتجر', targetFlowId: 'btn_products' },
    ],
    profile: {
      displayName: 'المتجر الذكي',
      description: 'متجر إلكتروني متكامل',
      menuButtonType: 'commands',
    },
    apiFeatures: {
      enableReactions: true,
      reactionAutoReply: 'شكراً لتفاعلك!',
    },
    settings: {
      resizeKeyboard: true,
      oneTimeKeyboard: false,
      simulatorTheme: 'dark',
    },
  };
}

test('buildBotBackupFilename produces safe localized filenames with UTC date', () => {
  const fixedDate = new Date('2026-11-19T05:30:00.000Z');
  assert.equal(
    buildBotBackupFilename({ name: 'بوت المتجر / السريع:*', botUsername: 'shop_bot' }, fixedDate),
    'بوت-المتجر-السريع-backup-2026-11-19.json'
  );
  assert.equal(
    buildBotBackupFilename({ name: '   ', botUsername: 'shop_bot' }, fixedDate),
    'shop_bot-backup-2026-11-19.json'
  );
  assert.equal(
    buildBotBackupFilename({ name: '***', botUsername: null }, fixedDate),
    'telecraft-bot-backup-2026-11-19.json'
  );
});

test('exportBotBackupJson exports all settings safely without token and round-trips via parseBotDesignJson', () => {
  const bot = makeSampleBot();
  const exportedAt = new Date('2026-11-19T05:35:00.000Z');
  const jsonText = exportBotBackupJson(bot, exportedAt);
  const raw = JSON.parse(jsonText);

  assert.equal(raw.token, undefined);
  assert.equal(raw.name, 'بوت المتجر الذكي');
  assert.equal(raw.backupMeta.format, 'telecraft-bot-backup');
  assert.equal(raw.backupMeta.version, 1);
  assert.equal(raw.backupMeta.exportedAt, '2026-11-19T05:35:00.000Z');
  assert.equal(raw.backupMeta.botId, 'bot_123');
  assert.equal(raw.backupMeta.botUsername, 'smart_shop_bot');

  const reimported = parseBotDesignJson(jsonText);
  assert.equal(reimported.valid, true);
  assert.equal(reimported.blueprint?.name, 'بوت المتجر الذكي');
  assert.equal(reimported.blueprint?.startMessage?.text, '<b>أهلاً بك في المتجر</b>');
  assert.equal(reimported.blueprint?.startMessage?.messageOptions?.protectContent, true);
  assert.equal(reimported.blueprint?.inlineButtons?.length, 1);
  assert.equal(reimported.blueprint?.replyButtons?.length, 1);
  assert.equal(reimported.blueprint?.inlinePagination?.itemsPerPage, 4);
  assert.equal(reimported.blueprint?.commands?.length, 2);
  assert.equal(reimported.blueprint?.profile?.description, 'متجر إلكتروني متكامل');
  assert.equal(reimported.blueprint?.apiFeatures?.enableReactions, true);
  assert.ok(reimported.blueprint?.buttonFlows?.btn_products);
});
