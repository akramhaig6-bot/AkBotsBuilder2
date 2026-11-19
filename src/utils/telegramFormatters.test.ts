import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeBotToken,
  validateBotToken,
  groupButtonsIntoRows,
  formatTelegramInlineKeyboard,
  formatTelegramReplyKeyboard,
  reorderButtons,
  moveButtonToPosition,
  findButtonById,
  getButtonFlow,
  applyLayoutTemplate,
} from './telegramFormatters';
import { BotButton, BotConfig } from '../types/bot';

test('validateBotToken rejects empty or invalid tokens', () => {
  assert.equal(validateBotToken('').isValid, false);
  assert.equal(validateBotToken('   ').isValid, false);
  assert.equal(validateBotToken('invalid_token').isValid, false);
  assert.equal(validateBotToken('123:short').isValid, false);
});

test('validateBotToken accepts standard Telegram Bot tokens and sanitizes copy-paste artifacts', () => {
  const validToken = '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ1234567';
  assert.equal(validateBotToken(validToken).isValid, true);

  const dirtyWithRtlMarks = `\u200F "bot${validToken}\u200E" \n`;
  assert.equal(sanitizeBotToken(dirtyWithRtlMarks), validToken);
  const res = validateBotToken(dirtyWithRtlMarks);
  assert.equal(res.isValid, true);
  assert.equal(res.sanitizedToken, validToken);

  const fullUrl = `https://api.telegram.org/bot${validToken}/getMe`;
  assert.equal(sanitizeBotToken(fullUrl), validToken);
  assert.equal(validateBotToken(fullUrl).isValid, true);
});

test('groupButtonsIntoRows correctly groups buttons by row and order', () => {
  const buttons: BotButton[] = [
    { id: '1', text: 'Btn 1', type: 'inline', actionType: 'flow', row: 0, order: 0 },
    { id: '2', text: 'Btn 2', type: 'inline', actionType: 'flow', row: 0, order: 1 },
    { id: '3', text: 'Btn 3', type: 'inline', actionType: 'flow', row: 1, order: 0 },
  ];

  const rows = groupButtonsIntoRows(buttons);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 2);
  assert.equal(rows[0][0].id, '1');
  assert.equal(rows[0][1].id, '2');
  assert.equal(rows[1].length, 1);
  assert.equal(rows[1][0].id, '3');
});

test('formatTelegramInlineKeyboard handles official style and URLs correctly without emoji injection', () => {
  const buttons: BotButton[] = [
    { id: 'b1', text: 'Website', type: 'inline', actionType: 'url', url: 'https://example.com', row: 0, order: 0 },
    { id: 'b2', text: 'Services', type: 'inline', actionType: 'flow', style: 'primary', row: 0, order: 1 },
    { id: 'b3', text: 'Accept', type: 'inline', actionType: 'flow', style: 'success', row: 1, order: 0 },
    { id: 'b4', text: 'Cancel', type: 'inline', actionType: 'flow', style: 'danger', row: 1, order: 1 },
  ];

  const formatted = formatTelegramInlineKeyboard(buttons);
  assert.equal(formatted.length, 2);
  // b1: default style, URL button
  assert.equal(formatted[0][0].text, 'Website');
  assert.equal((formatted[0][0] as any).url, 'https://example.com');
  assert.equal('style' in formatted[0][0], false);

  // b2: primary style, flow button (NO emojis)
  assert.equal(formatted[0][1].text, 'Services');
  assert.equal((formatted[0][1] as any).callback_data, 'b2');
  assert.equal((formatted[0][1] as any).style, 'primary');

  // b3: success style
  assert.equal(formatted[1][0].text, 'Accept');
  assert.equal((formatted[1][0] as any).style, 'success');

  // b4: danger style
  assert.equal(formatted[1][1].text, 'Cancel');
  assert.equal((formatted[1][1] as any).style, 'danger');
});

test('formatTelegramReplyKeyboard formats styles, contact, and location cleanly without emoji', () => {
  const buttons: BotButton[] = [
    { id: 'r1', text: 'Share Phone', type: 'reply', actionType: 'request_contact', style: 'primary', row: 0, order: 0 },
    { id: 'r2', text: 'Share Location', type: 'reply', actionType: 'request_location', style: 'success', row: 0, order: 1 },
    { id: 'r3', text: 'Delete Account', type: 'reply', actionType: 'flow', style: 'danger', row: 1, order: 0 },
  ];

  const formatted = formatTelegramReplyKeyboard(buttons, {
    resizeKeyboard: true,
    isPersistent: true,
    inputFieldPlaceholder: 'Select an option...',
  });
  assert.equal(formatted.resize_keyboard, true);
  assert.equal(formatted.is_persistent, true);
  assert.equal(formatted.input_field_placeholder, 'Select an option...');
  // Pure text check
  assert.equal(formatted.keyboard[0][0].text, 'Share Phone');
  assert.equal((formatted.keyboard[0][0] as any).request_contact, true);
  assert.equal((formatted.keyboard[0][0] as any).style, 'primary');

  assert.equal(formatted.keyboard[0][1].text, 'Share Location');
  assert.equal((formatted.keyboard[0][1] as any).request_location, true);
  assert.equal((formatted.keyboard[0][1] as any).style, 'success');

  assert.equal(formatted.keyboard[1][0].text, 'Delete Account');
  assert.equal((formatted.keyboard[1][0] as any).style, 'danger');
});

test('reorderButtons and moveButtonToPosition modify button order correctly', () => {
  const buttons: BotButton[] = [
    { id: 'a', text: 'A', type: 'inline', actionType: 'flow', row: 0, order: 0 },
    { id: 'b', text: 'B', type: 'inline', actionType: 'flow', row: 0, order: 1 },
    { id: 'c', text: 'C', type: 'inline', actionType: 'flow', row: 0, order: 2 },
  ];

  const reordered = reorderButtons(buttons, 'c', 'a');
  assert.equal(reordered[0].id, 'c');
  assert.equal(reordered[1].id, 'a');
  assert.equal(reordered[2].id, 'b');

  const moved = moveButtonToPosition(buttons, 'b', 2, 5);
  const target = moved.find((btn) => btn.id === 'b');
  assert.equal(target?.row, 2);
  assert.equal(target?.order, 5);
});

test('findButtonById finds buttons across inline, reply, and flows', () => {
  const mockBot: BotConfig = {
    id: 'bot-1',
    name: 'Test Bot',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isConnected: false,
    startMessage: { text: 'Start', isSaved: true, media: [] },
    inlineButtons: [{ id: 'in-1', text: 'In 1', type: 'inline', actionType: 'flow', row: 0, order: 0 }],
    replyButtons: [{ id: 'rep-1', text: 'Rep 1', type: 'reply', actionType: 'flow', row: 0, order: 0 }],
    buttonFlows: {
      'in-1': {
        id: 'flow-1',
        buttonId: 'in-1',
        message: { text: 'Sub Msg', isSaved: true },
        media: [],
        subButtons: [{ id: 'sub-1', text: 'Sub 1', type: 'inline', actionType: 'flow', row: 0, order: 0 }],
      },
    },
  };

  assert.equal(findButtonById(mockBot, 'in-1')?.button.text, 'In 1');
  assert.equal(findButtonById(mockBot, 'rep-1')?.button.text, 'Rep 1');
  assert.equal(findButtonById(mockBot, 'sub-1')?.button.text, 'Sub 1');
  assert.equal(findButtonById(mockBot, 'sub-1')?.parentFlowId, 'in-1');
  assert.equal(findButtonById(mockBot, 'unknown'), null);

  assert.equal(getButtonFlow(mockBot, 'in-1')?.message?.text, 'Sub Msg');
});

test('applyLayoutTemplate correctly distributes buttons according to pattern', () => {
  const buttons: BotButton[] = [
    { id: '1', text: 'B1', type: 'inline', actionType: 'flow', row: 0, order: 0 },
    { id: '2', text: 'B2', type: 'inline', actionType: 'flow', row: 0, order: 1 },
    { id: '3', text: 'B3', type: 'inline', actionType: 'flow', row: 1, order: 0 },
    { id: '4', text: 'B4', type: 'inline', actionType: 'flow', row: 1, order: 1 },
  ];

  // 1 per row
  const onePerRow = applyLayoutTemplate(buttons, '1_per_row');
  assert.equal(onePerRow[0].row, 0);
  assert.equal(onePerRow[1].row, 1);
  assert.equal(onePerRow[2].row, 2);
  assert.equal(onePerRow[3].row, 3);

  // wide then 2: row 0 has 1 button, row 1 has 2 buttons, row 2 has 1 button
  const wideThen2 = applyLayoutTemplate(buttons, 'wide_then_2');
  assert.equal(wideThen2[0].row, 0);
  assert.equal(wideThen2[0].order, 0);
  assert.equal(wideThen2[1].row, 1);
  assert.equal(wideThen2[1].order, 0);
  assert.equal(wideThen2[2].row, 1);
  assert.equal(wideThen2[2].order, 1);
  assert.equal(wideThen2[3].row, 2);
  assert.equal(wideThen2[3].order, 0);
});

