import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileBots } from './botPersistence';
import { BotConfig } from '../types/bot';

function makeBot(id: string, overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    id,
    name: `Bot ${id}`,
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T10:00:00.000Z',
    isConnected: false,
    startMessage: {
      text: '',
      isSaved: false,
      media: [],
    },
    inlineButtons: [],
    replyButtons: [],
    buttonFlows: {},
    ...overrides,
  };
}

test('preserves locally created bot when server restarted and wiped data', () => {
  const seedBot = makeBot('bot_seed', { createdAt: '2026-11-01T10:00:00.000Z' });
  const newBot = makeBot('bot_user_1', {
    name: 'My Custom Bot',
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:05:00.000Z',
    startMessage: {
      text: 'Welcome!',
      isSaved: true,
      media: [],
    },
  });

  const result = reconcileBots([seedBot], [seedBot, newBot], []);

  assert.equal(result.mergedBots.length, 2);
  assert.equal(result.mergedBots[1].id, 'bot_user_1');
  assert.equal(result.mergedBots[1].startMessage.text, 'Welcome!');
  assert.deepEqual(
    result.botsToRestoreOnServer.map((b) => b.id),
    ['bot_user_1']
  );
  assert.deepEqual(result.serverIdsToDelete, []);
});

test('keeps newer settings when local bot has newer updatedAt than server', () => {
  const serverVersion = makeBot('bot_1', {
    name: 'Old Name',
    updatedAt: '2026-11-14T10:00:00.000Z',
  });
  const localVersion = makeBot('bot_1', {
    name: 'Updated Name',
    updatedAt: '2026-11-14T10:15:00.000Z',
    inlineButtons: [
      {
        id: 'btn_1',
        text: 'Services',
        type: 'inline',
        actionType: 'flow',
        row: 0,
        order: 0,
      },
    ],
  });

  const result = reconcileBots([serverVersion], [localVersion], []);

  assert.equal(result.mergedBots.length, 1);
  assert.equal(result.mergedBots[0].name, 'Updated Name');
  assert.equal(result.mergedBots[0].inlineButtons.length, 1);
  assert.equal(result.botsToRestoreOnServer.length, 1);
});

test('prefers server version when server has newer updatedAt', () => {
  const serverVersion = makeBot('bot_1', {
    isConnected: true,
    botUsername: 'live_bot',
    updatedAt: '2026-11-14T10:30:00.000Z',
  });
  const localVersion = makeBot('bot_1', {
    isConnected: false,
    updatedAt: '2026-11-14T10:15:00.000Z',
  });

  const result = reconcileBots([serverVersion], [localVersion], []);

  assert.equal(result.mergedBots.length, 1);
  assert.equal(result.mergedBots[0].isConnected, true);
  assert.equal(result.mergedBots[0].botUsername, 'live_bot');
  assert.equal(result.botsToRestoreOnServer.length, 0);
});

test('never resurrects explicitly deleted bot even if server restarts with seed bots', () => {
  const seedBot = makeBot('bot_seed');
  const userBot = makeBot('bot_keep');

  const result = reconcileBots([seedBot], [seedBot, userBot], ['bot_seed']);

  assert.deepEqual(
    result.mergedBots.map((b) => b.id),
    ['bot_keep']
  );
  assert.deepEqual(result.serverIdsToDelete, ['bot_seed']);
  assert.deepEqual(
    result.botsToRestoreOnServer.map((b) => b.id),
    ['bot_keep']
  );
});

test('handles completely empty server response without losing local bots', () => {
  const botA = makeBot('bot_a');
  const botB = makeBot('bot_b', { createdAt: '2026-11-11T10:00:00.000Z' });

  const result = reconcileBots([], [botA, botB], []);

  assert.equal(result.mergedBots.length, 2);
  assert.equal(result.botsToRestoreOnServer.length, 2);
});
