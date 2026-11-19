import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBlueprintUpdates,
  autoFixJsonCode,
  createPreviewBotFromBlueprint,
  parseBotDesignJson,
  exportBotDesignJson,
  stripJsonCodeFences,
  SAMPLE_BOT_DESIGN_JSON,
} from './jsonBotBlueprint';
import { BotConfig } from '../types/bot';

test('parses full TeleCraft BotConfig JSON and strips fences', () => {
  const fenced = `\`\`\`json\n${SAMPLE_BOT_DESIGN_JSON}\n\`\`\``;
  assert.equal(stripJsonCodeFences(fenced).startsWith('{'), true);

  const res = parseBotDesignJson(fenced);
  assert.equal(res.valid, true);
  assert.equal(res.summary?.format, 'telecraft');
  assert.equal(res.blueprint?.name, 'بوت الخدمات السريع');
  assert.equal(res.blueprint?.inlineButtons?.length, 3);
  assert.equal(res.blueprint?.replyButtons?.length, 1);
  assert.ok(res.blueprint?.buttonFlows?.btn_services);
  assert.equal(res.blueprint?.buttonFlows?.btn_services.subButtons.length, 1);
});

test('parses official Telegram Bot API sendMessage JSON payload', () => {
  const payload = JSON.stringify({
    chat_id: 123456,
    text: '<b>مرحباً بك في المتجر</b>',
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'المنتجات', callback_data: 'products', style: 'primary' },
          { text: 'الموقع', url: 'https://example.com' },
        ],
      ],
    },
  });

  const res = parseBotDesignJson(payload);
  assert.equal(res.valid, true);
  assert.equal(res.summary?.format, 'telegram_api');
  assert.equal(res.blueprint?.startMessage?.text, '<b>مرحباً بك في المتجر</b>');
  assert.equal(res.blueprint?.startMessage?.parseMode, 'HTML');
  assert.equal(res.blueprint?.inlineButtons?.length, 2);
  assert.equal(res.blueprint?.inlineButtons?.[0].style, 'primary');
  assert.equal(res.blueprint?.inlineButtons?.[0].callbackData, 'products');
  assert.equal(res.blueprint?.inlineButtons?.[1].actionType, 'url');
  assert.equal(res.blueprint?.inlineButtons?.[1].url, 'https://example.com');
});

test('parses simplified custom JSON design with nested button flows', () => {
  const customJson = JSON.stringify({
    name: 'بوت مخصص',
    startMessage: 'أهلاً وسهلاً',
    buttons: [
      {
        text: 'القسم الأول',
        style: 'success',
        flow: {
          message: 'محتوى القسم الأول',
          subButtons: [{ text: 'تفاصيل إضافية', url: 'https://telegram.org' }],
        },
      },
      {
        text: 'تواصل معنا',
        type: 'reply',
      },
    ],
  });

  const res = parseBotDesignJson(customJson);
  assert.equal(res.valid, true);
  assert.equal(res.summary?.format, 'custom_blueprint');
  assert.equal(res.blueprint?.name, 'بوت مخصص');
  assert.equal(res.blueprint?.startMessage?.text, 'أهلاً وسهلاً');
  assert.equal(res.blueprint?.inlineButtons?.length, 1);
  assert.equal(res.blueprint?.replyButtons?.length, 1);

  const inlineId = res.blueprint?.inlineButtons?.[0].id as string;
  assert.ok(res.blueprint?.buttonFlows?.[inlineId]);
  assert.equal(
    res.blueprint?.buttonFlows?.[inlineId]?.message?.text,
    'محتوى القسم الأول'
  );
  assert.equal(
    res.blueprint?.buttonFlows?.[inlineId]?.subButtons[0].url,
    'https://telegram.org'
  );
});

test('rejects invalid JSON syntax or empty inputs cleanly while accepting empty object {}', () => {
  const emptyRes = parseBotDesignJson('   ');
  assert.equal(emptyRes.valid, false);
  assert.ok(emptyRes.error);

  const badSyntax = parseBotDesignJson('{ "name": "test" ');
  assert.equal(badSyntax.valid, false);
  assert.ok(badSyntax.error?.includes('JSON'));

  const emptyObj = parseBotDesignJson('{}');
  assert.equal(emptyObj.valid, true);
  assert.ok(emptyObj.blueprint);
});

test('exportBotDesignJson omits sensitive token and connection state', () => {
  const bot: BotConfig = {
    id: 'bot_123',
    name: 'بوت التصدير',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    token: '9999999:SECRET_TOKEN',
    isConnected: true,
    botUsername: 'my_bot',
    startMessage: {
      text: 'رسالة البداية',
      isSaved: true,
      media: [],
    },
    inlineButtons: [],
    replyButtons: [],
    buttonFlows: {},
  };

  const exported = exportBotDesignJson(bot);
  const parsed = JSON.parse(exported);
  assert.equal(parsed.name, 'بوت التصدير');
  assert.equal(parsed.token, undefined);
  assert.equal(parsed.isConnected, undefined);
  assert.equal(parsed.id, undefined);
});

test('autoFixJsonCode repairs single quotes, unquoted keys, smart quotes, Arabic commas, trailing commas, and Python literals', () => {
  const broken = `{
    name: ‘بوت المتجر’،
    active = True,
    inlineButtons: [
      { text: 'تصفح', style: 'primary', row: ٠, },
    ],
  };`;

  const fix = autoFixJsonCode(broken);
  assert.equal(fix.fixed, true);
  assert.ok(fix.appliedFixes.length > 0);

  const parsedRes = parseBotDesignJson(fix.fixedJson);
  assert.equal(parsedRes.valid, true);
  assert.equal(parsedRes.blueprint?.name, 'بوت المتجر');
  assert.equal(parsedRes.blueprint?.inlineButtons?.[0].text, 'تصفح');
  assert.equal(parsedRes.blueprint?.inlineButtons?.[0].row, 0);
});

test('autoFixJsonCode strips comments outside strings while preserving https:// URLs and repairs missing commas & unclosed braces', () => {
  const broken = `تفضل الكود:
\`\`\`json
{
  // تعليق عربي
  "name": "بوت الروابط"
  "startMessage": "السطر الأول
السطر الثاني"
  "inlineButtons": [
    { "text": "الموقع", "url": "https://t.me/TeleCraftBot" }
    { "text": "تواصل" "style": "success" }
\`\`\`
شكراً!`;

  const fix = autoFixJsonCode(broken);
  assert.equal(fix.fixed, true);

  const parsedRes = parseBotDesignJson(fix.fixedJson);
  assert.equal(parsedRes.valid, true);
  assert.equal(parsedRes.blueprint?.name, 'بوت الروابط');
  assert.equal(parsedRes.blueprint?.startMessage?.text, 'السطر الأول\nالسطر الثاني');
  assert.equal(parsedRes.blueprint?.inlineButtons?.length, 2);
  assert.equal(parsedRes.blueprint?.inlineButtons?.[0].url, 'https://t.me/TeleCraftBot');
  assert.equal(parsedRes.blueprint?.inlineButtons?.[1].style, 'success');
});

test('autoFixJsonCode wraps bare properties without braces and top-level button arrays cleanly', () => {
  const bareProps = `"name": "بوت بدون أقواس", "startMessage": "أهلاً", "inlineButtons": [{"text": "ابدأ"}]`;
  const fixBare = autoFixJsonCode(bareProps);
  assert.equal(fixBare.fixed, true);
  assert.equal(parseBotDesignJson(fixBare.fixedJson).valid, true);

  const bareArray = `[ { text: "زر 1", style: "primary" }, { text: "زر 2", url: "https://example.com" } ]`;
  const fixArr = autoFixJsonCode(bareArray);
  assert.equal(fixArr.fixed, true);
  const parsedArr = parseBotDesignJson(fixArr.fixedJson);
  assert.equal(parsedArr.valid, true);
  assert.equal(parsedArr.blueprint?.inlineButtons?.length, 2);
});

test('autoFixJsonCode handles prose without backticks, extra closing braces, and unquoted URLs', () => {
  const messy = `Here is your code:
  {{
    name: 'بوت الروابط المباشرة',
    startMessage: 'مرحباً',
    inlineButtons: [
      { text: 'الموقع', url: https://t.me/TeleCraftSupport }
    ]
  }}
  Enjoy!`;

  const fix = autoFixJsonCode(messy);
  assert.equal(fix.fixed, true);

  const parsedRes = parseBotDesignJson(fix.fixedJson);
  assert.equal(parsedRes.valid, true);
  assert.equal(parsedRes.blueprint?.name, 'بوت الروابط المباشرة');
  assert.equal(
    parsedRes.blueprint?.inlineButtons?.[0].url,
    'https://t.me/TeleCraftSupport'
  );
});

test('applyBlueprintUpdates persists simulator button color, text, and flow edits back into JSON', () => {
  const initialRes = parseBotDesignJson(
    JSON.stringify({
      name: 'بوت الألوان',
      startMessage: 'اختر لوناً',
      inlineButtons: [{ text: 'زر التعديل', style: 'default' }],
    })
  );
  assert.equal(initialRes.valid, true);

  const previewBot = createPreviewBotFromBlueprint(initialRes.blueprint);
  const originalBtn = previewBot.inlineButtons[0];

  const { exportedJson } = applyBlueprintUpdates(previewBot, {
    inlineButtons: [
      {
        ...originalBtn,
        text: 'زر أزرق معدل',
        style: 'primary',
        color: 'primary',
      },
    ],
  });

  const reparsed = parseBotDesignJson(exportedJson);
  assert.equal(reparsed.valid, true);
  assert.equal(reparsed.blueprint?.inlineButtons?.[0].id, originalBtn.id);
  assert.equal(reparsed.blueprint?.inlineButtons?.[0].text, 'زر أزرق معدل');
  assert.equal(reparsed.blueprint?.inlineButtons?.[0].style, 'primary');
  assert.equal(reparsed.blueprint?.inlineButtons?.[0].color, 'primary');
});

test('round-trips Bot API commands, profile, apiFeatures, messageOptions, and media spoiler/caption flags', () => {
  const bot: BotConfig = {
    id: 'bot_modern',
    name: 'بوت حديث',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isConnected: false,
    startMessage: {
      text: 'أهلاً',
      isSaved: true,
      media: [
        {
          id: 'm1',
          type: 'photo',
          url: 'https://example.com/pic.jpg',
          caption: 'صورة مموهة',
          order: 0,
          hasSpoiler: true,
          showCaptionAboveMedia: true,
        },
      ],
      messageOptions: {
        messageEffectId: '5104841245755180586',
        protectContent: true,
        linkPreviewOptions: { is_disabled: true },
      },
    },
    inlineButtons: [],
    replyButtons: [],
    buttonFlows: {},
    commands: [{ command: 'deals', description: 'أحدث العروض', targetFlowId: 'main' }],
    profile: {
      displayName: 'TeleCraft Pro',
      shortDescription: 'وصف مختصر',
      menuButtonType: 'commands',
    },
    apiFeatures: {
      enableReactions: true,
      reactionAutoReply: 'شكراً لتفاعلك!',
      enableInlineGuestMode: true,
      inlineGuestTitle: 'بطاقة ضيف',
    },
  };

  const exported = exportBotDesignJson(bot);
  const parsed = parseBotDesignJson(exported);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.blueprint?.startMessage?.messageOptions?.messageEffectId, '5104841245755180586');
  assert.equal(parsed.blueprint?.startMessage?.messageOptions?.protectContent, true);
  assert.equal(parsed.blueprint?.startMessage?.media?.[0].hasSpoiler, true);
  assert.equal(parsed.blueprint?.startMessage?.media?.[0].showCaptionAboveMedia, true);
  assert.equal(parsed.blueprint?.commands?.[0].command, 'deals');
  assert.equal(parsed.blueprint?.profile?.displayName, 'TeleCraft Pro');
  assert.equal(parsed.blueprint?.apiFeatures?.enableInlineGuestMode, true);
});

test('accepts and converts arbitrary JSON objects, arrays, primitives, and Telegram Bot API methods without rejection', () => {
  // 1. Arbitrary custom JSON object (previously rejected with "كود JSON لا يحتوي على بيانات تصميم بوت معروفة")
  const arbitraryObj = parseBotDesignJson(
    JSON.stringify({
      store: 'متجر النخبة',
      currency: 'SAR',
      support: { phone: '0500000000', hours: '9-5' },
    })
  );
  assert.equal(arbitraryObj.valid, true);
  assert.equal(arbitraryObj.summary?.format, 'generic_json');
  assert.equal(arbitraryObj.blueprint?.name, 'متجر النخبة');
  assert.ok(arbitraryObj.blueprint?.startMessage?.text.includes('currency: SAR'));
  assert.equal(arbitraryObj.blueprint?.inlineButtons?.length, 1);

  // 2. Commands-only JSON & commands array
  const cmdsOnly = parseBotDesignJson(
    JSON.stringify({
      commands: [{ command: 'offers', description: 'عرض الخصومات' }],
    })
  );
  assert.equal(cmdsOnly.valid, true);
  assert.equal(cmdsOnly.summary?.format, 'telegram_api');
  assert.equal(cmdsOnly.blueprint?.commands?.[0].command, 'offers');

  const cmdsArray = parseBotDesignJson(
    JSON.stringify([{ command: 'help', description: 'المساعدة' }])
  );
  assert.equal(cmdsArray.valid, true);
  assert.equal(cmdsArray.blueprint?.commands?.[0].command, 'help');

  // 3. sendPhoto with Telegram photo + spoiler + caption
  const photoPayload = parseBotDesignJson(
    JSON.stringify({
      photo: 'https://example.com/banner.jpg',
      caption: 'عرض خاص',
      has_spoiler: true,
      show_caption_above_media: true,
    })
  );
  assert.equal(photoPayload.valid, true);
  assert.equal(photoPayload.blueprint?.startMessage?.media?.[0].url, 'https://example.com/banner.jpg');
  assert.equal(photoPayload.blueprint?.startMessage?.media?.[0].hasSpoiler, true);
  assert.equal(photoPayload.blueprint?.startMessage?.media?.[0].showCaptionAboveMedia, true);

  // 4. sendPoll & sendChecklist & sendDice & screens map & primitive string
  const pollRes = parseBotDesignJson(
    JSON.stringify({
      question: 'ما تقييمك للخدمة؟',
      options: ['ممتاز', 'جيد جداً'],
      type: 'quiz',
      correct_option_id: 0,
    })
  );
  assert.equal(pollRes.valid, true);
  assert.equal(pollRes.blueprint?.inlineButtons?.length, 1);
  const pollBtnId = pollRes.blueprint?.inlineButtons?.[0].id as string;
  assert.equal(pollRes.blueprint?.buttonFlows?.[pollBtnId]?.actions?.[0].type, 'send_poll');

  const checklistRes = parseBotDesignJson(
    JSON.stringify({
      title: 'خطة العمل',
      tasks: [{ text: 'الخطوة الأولى' }, { text: 'الخطوة الثانية', done: true }],
    })
  );
  assert.equal(checklistRes.valid, true);
  const clBtnId = checklistRes.blueprint?.inlineButtons?.[0].id as string;
  assert.equal(checklistRes.blueprint?.buttonFlows?.[clBtnId]?.actions?.[0].type, 'send_checklist');

  const screensRes = parseBotDesignJson(
    JSON.stringify({
      welcome_message: 'أهلاً بك في الشاشات',
      screens: {
        about: { text: 'عن الشركة', buttons: [{ text: 'الموقع', url: 'https://example.com' }] },
      },
    })
  );
  assert.equal(screensRes.valid, true);
  assert.equal(screensRes.blueprint?.startMessage?.text, 'أهلاً بك في الشاشات');
  assert.equal(screensRes.blueprint?.inlineButtons?.length, 1);
  assert.equal(screensRes.blueprint?.buttonFlows?.about?.subButtons[0].url, 'https://example.com');

  const stringRes = parseBotDesignJson('"رسالة نصية مباشرة من JSON"');
  assert.equal(stringRes.valid, true);
  assert.equal(stringRes.blueprint?.startMessage?.text, 'رسالة نصية مباشرة من JSON');
});

test('Telegram Bot API wrappers, stringified reply_markup, commands-only, and method arrays always produce start/buttons for Telegram', () => {
  // 1. Commands-only / setMyCommands never yields empty start or 0 buttons
  const setCmdsRes = parseBotDesignJson(
    JSON.stringify({
      method: 'setMyCommands',
      commands: [
        { command: 'start', description: 'بدء التشغيل' },
        { command: 'pricing', description: 'الباقات والأسعار' },
      ],
    })
  );
  assert.equal(setCmdsRes.valid, true);
  assert.equal(setCmdsRes.summary?.hasStartMessage, true);
  assert.ok(setCmdsRes.blueprint?.startMessage?.text.includes('/pricing'));
  assert.equal(setCmdsRes.blueprint?.inlineButtons?.length, 1);
  assert.ok(setCmdsRes.blueprint?.commands?.[1]?.targetFlowId);

  // 2. Stringified reply_markup
  const stringifiedMarkup = parseBotDesignJson(
    JSON.stringify({
      chat_id: 99999,
      text: 'اختر من القائمة:',
      reply_markup: JSON.stringify({
        inline_keyboard: [[{ text: 'فتح القسم', callback_data: 'open_sec' }]],
      }),
    })
  );
  assert.equal(stringifiedMarkup.valid, true);
  assert.equal(stringifiedMarkup.summary?.format, 'telegram_api');
  assert.equal(stringifiedMarkup.blueprint?.inlineButtons?.[0]?.text, 'فتح القسم');
  assert.equal(stringifiedMarkup.blueprint?.inlineButtons?.[0]?.callbackData, 'open_sec');

  // 3. Nested parameters wrapper & multi-method object
  const nestedParams = parseBotDesignJson(
    JSON.stringify({
      method: 'sendMessage',
      parameters: {
        chat_id: 12345,
        text: 'رسالة من parameters',
        reply_markup: {
          inline_keyboard: [[{ text: 'تأكيد', callback_data: 'ok' }]],
        },
      },
    })
  );
  assert.equal(nestedParams.valid, true);
  assert.equal(nestedParams.blueprint?.startMessage?.text, 'رسالة من parameters');
  assert.equal(nestedParams.blueprint?.inlineButtons?.[0]?.text, 'تأكيد');

  const multiMethod = parseBotDesignJson(
    JSON.stringify({
      setMyCommands: { commands: [{ command: 'help', description: 'مساعدة' }] },
      sendMessage: {
        text: 'مرحباً من sendMessage',
        reply_markup: {
          inline_keyboard: [[{ text: 'ابدأ الآن', callback_data: 'go' }]],
        },
      },
    })
  );
  assert.equal(multiMethod.valid, true);
  assert.equal(multiMethod.blueprint?.startMessage?.text, 'مرحباً من sendMessage');
  assert.equal(multiMethod.blueprint?.commands?.[0]?.command, 'help');
  assert.equal(multiMethod.blueprint?.inlineButtons?.[0]?.text, 'ابدأ الآن');

  // 4. Array of Telegram Bot API methods & ok.result array
  const apiArray = parseBotDesignJson(
    JSON.stringify([
      { method: 'setMyCommands', commands: [{ command: 'deals', description: 'العروض' }] },
      {
        method: 'sendMessage',
        text: 'أهلاً من المصفوفة',
        reply_markup: { inline_keyboard: [[{ text: 'عرض', callback_data: 'view' }]] },
      },
    ])
  );
  assert.equal(apiArray.valid, true);
  assert.equal(apiArray.blueprint?.startMessage?.text, 'أهلاً من المصفوفة');
  assert.equal(apiArray.blueprint?.commands?.[0]?.command, 'deals');
  assert.equal(apiArray.blueprint?.inlineButtons?.[0]?.text, 'عرض');

  const okResultArray = parseBotDesignJson(
    JSON.stringify({
      ok: true,
      result: [{ command: 'status', description: 'حالة الطلب' }],
    })
  );
  assert.equal(okResultArray.valid, true);
  assert.equal(okResultArray.summary?.hasStartMessage, true);
  assert.equal(okResultArray.blueprint?.inlineButtons?.length, 1);

  // 5. Profile-only JSON still produces non-empty start message & bot name
  const profileOnly = parseBotDesignJson(
    JSON.stringify({
      profile: {
        displayName: 'بوت الدعم الفني',
        shortDescription: 'نرد على استفساراتكم على مدار الساعة',
      },
    })
  );
  assert.equal(profileOnly.valid, true);
  assert.equal(profileOnly.blueprint?.name, 'بوت الدعم الفني');
  assert.equal(profileOnly.summary?.hasStartMessage, true);
});
