import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTelegramMessageOptionFields,
  buildTelegramSendBody,
  classifyTelegramPollingError,
  sanitizeTelegramMarkup,
  shouldRestartPoller,
} from './telegramDelivery';

test('shouldRestartPoller returns false when bot is disconnected or missing token', () => {
  assert.deepEqual(
    shouldRestartPoller({ id: 'b1', token: '', isConnected: true }, undefined),
    { restart: false }
  );
  assert.deepEqual(
    shouldRestartPoller({ id: 'b1', token: '123:abc', isConnected: false }, undefined),
    { restart: false }
  );
});

test('shouldRestartPoller detects missing, stopped, token-mismatched, and stale pollers', () => {
  const bot = { id: 'b1', token: '123:abc', isConnected: true };
  const now = 1_700_000_000_000;

  assert.deepEqual(shouldRestartPoller(bot, undefined, now), {
    restart: true,
    reason: 'missing_poller',
  });

  assert.deepEqual(
    shouldRestartPoller(
      bot,
      {
        botId: 'b1',
        token: '123:abc',
        isRunning: false,
        lastCheck: new Date(now - 1000).toISOString(),
        lastError: null,
      },
      now
    ),
    { restart: true, reason: 'poller_stopped' }
  );

  assert.deepEqual(
    shouldRestartPoller(
      bot,
      {
        botId: 'b1',
        token: '999:old',
        isRunning: true,
        lastCheck: new Date(now - 1000).toISOString(),
        lastError: null,
      },
      now
    ),
    { restart: true, reason: 'token_changed' }
  );

  assert.deepEqual(
    shouldRestartPoller(
      bot,
      {
        botId: 'b1',
        token: '123:abc',
        isRunning: true,
        lastCheck: new Date(now - 30_000).toISOString(),
        lastError: null,
      },
      now
    ),
    { restart: true, reason: 'poller_stale' }
  );

  assert.deepEqual(
    shouldRestartPoller(
      bot,
      {
        botId: 'b1',
        token: '123:abc',
        isRunning: true,
        isStarting: true,
        lastCheck: new Date(now - 60_000).toISOString(),
        lastError: null,
      },
      now
    ),
    { restart: false }
  );

  assert.deepEqual(
    shouldRestartPoller(
      bot,
      {
        botId: 'b1',
        token: '123:abc',
        isRunning: true,
        lastCheck: new Date(now - 5_000).toISOString(),
        lastError: null,
      },
      now
    ),
    { restart: false }
  );
});

test('classifyTelegramPollingError classifies unauthorized vs conflict vs transient', () => {
  assert.equal(classifyTelegramPollingError(401, 'Unauthorized'), 'unauthorized');
  assert.equal(classifyTelegramPollingError(404, 'Not Found'), 'unauthorized');
  assert.equal(
    classifyTelegramPollingError(409, 'Conflict: terminated by other getUpdates request'),
    'conflict'
  );
  assert.equal(classifyTelegramPollingError(429, 'Too Many Requests'), 'transient');
  assert.equal(classifyTelegramPollingError(undefined, 'fetch failed'), 'transient');
});

test('sanitizeTelegramMarkup strips internal button id in clean mode while preserving styles and urls', () => {
  const raw = {
    inline_keyboard: [
      [
        { id: 'btn_1', text: 'Styled', style: 'danger', callback_data: 'btn_1' },
        { id: 'btn_2', text: 'Site', url: 'https://example.com' },
      ],
    ],
  };

  const cleaned = sanitizeTelegramMarkup(raw, 'clean');
  assert.equal(cleaned.inline_keyboard[0][0].id, undefined);
  assert.equal(cleaned.inline_keyboard[0][0].style, 'danger');
  assert.equal(cleaned.inline_keyboard[0][0].callback_data, 'btn_1');
  assert.equal(cleaned.inline_keyboard[0][1].id, undefined);
  assert.equal(cleaned.inline_keyboard[0][1].url, 'https://example.com');
});

test('sanitizeTelegramMarkup converts sendMessage-incompatible callback_game/pay and invalid urls in compat mode', () => {
  const raw = {
    inline_keyboard: [
      [
        { id: 'btn_game', text: 'g', callback_game: {} },
        { id: 'btn_pay', text: 'Pay', pay: true },
        { id: 'btn_bad_url', text: 'Broken', url: 'notaurl' },
        { id: 'btn_http_webapp', text: 'Web', web_app: { url: 'http://insecure.local' } },
        { id: 'btn_ok', text: 'Good', style: 'success', callback_data: 'btn_ok' },
      ],
    ],
  };

  const compat = sanitizeTelegramMarkup(raw, 'compat');
  assert.equal(compat.inline_keyboard[0][0].callback_game, undefined);
  assert.equal(compat.inline_keyboard[0][0].callback_data, 'btn_game');
  assert.equal(compat.inline_keyboard[0][1].pay, undefined);
  assert.equal(compat.inline_keyboard[0][1].callback_data, 'btn_pay');
  assert.equal(compat.inline_keyboard[0][2].url, undefined);
  assert.equal(compat.inline_keyboard[0][2].callback_data, 'btn_bad_url');
  assert.equal(compat.inline_keyboard[0][3].web_app, undefined);
  assert.equal(compat.inline_keyboard[0][3].callback_data, 'btn_http_webapp');
  assert.equal(compat.inline_keyboard[0][4].style, 'success');
});

test('buildTelegramSendBody strips parse_mode, style, custom emoji and account-dependent actions in safe mode', () => {
  const payload = {
    chat_id: 123,
    text: 'Hello _unclosed',
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [
        [
          {
            id: 'btn_inline',
            text: 'Inline',
            style: 'primary',
            icon_custom_emoji_id: '99999',
            switch_inline_query: 'abc',
          },
          {
            id: 'btn_web',
            text: 'App',
            web_app: { url: 'https://example.com/app' },
          },
        ],
      ],
    },
  };

  const safe = buildTelegramSendBody(payload, 'safe');
  assert.equal(safe.parse_mode, undefined);
  assert.equal(safe.reply_markup.inline_keyboard[0][0].style, undefined);
  assert.equal(safe.reply_markup.inline_keyboard[0][0].icon_custom_emoji_id, undefined);
  assert.equal(safe.reply_markup.inline_keyboard[0][0].switch_inline_query, undefined);
  assert.equal(safe.reply_markup.inline_keyboard[0][0].callback_data, 'btn_inline');
  assert.equal(safe.reply_markup.inline_keyboard[0][1].web_app, undefined);
  assert.equal(safe.reply_markup.inline_keyboard[0][1].callback_data, 'btn_web');
});

test('buildTelegramMessageOptionFields and buildTelegramSendBody handle message effects, spoilers, and link_preview_options', () => {
  const fields = buildTelegramMessageOptionFields({
    messageEffectId: '5104841245755180586',
    protectContent: true,
    disableNotification: true,
    linkPreviewOptions: {
      is_disabled: false,
      prefer_large_media: true,
      show_above_text: true,
      url: 'https://example.com',
    },
  });

  assert.equal(fields.message_effect_id, '5104841245755180586');
  assert.equal(fields.protect_content, true);
  assert.equal(fields.disable_notification, true);
  assert.deepEqual(fields.link_preview_options, {
    url: 'https://example.com',
    prefer_large_media: true,
    show_above_text: true,
  });

  const payload = {
    chat_id: 123,
    text: 'Test',
    has_spoiler: true,
    show_caption_above_media: true,
    ...fields,
  };

  const compat = buildTelegramSendBody(payload, 'compat');
  assert.equal(compat.message_effect_id, undefined);
  assert.equal(compat.show_caption_above_media, undefined);
  assert.equal(compat.protect_content, true);

  const safe = buildTelegramSendBody(payload, 'safe');
  assert.equal(safe.message_effect_id, undefined);
  assert.equal(safe.protect_content, undefined);
  assert.equal(safe.disable_notification, undefined);
  assert.equal(safe.link_preview_options, undefined);
  assert.equal(safe.has_spoiler, undefined);
  assert.equal(safe.show_caption_above_media, undefined);
});

