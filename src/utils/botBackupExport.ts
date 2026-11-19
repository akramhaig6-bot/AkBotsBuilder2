import { BotConfig } from '../types/bot';
import { exportBotDesignJson } from './jsonBotBlueprint';

/**
 * Generates a filesystem-safe, human-readable `.json` backup filename
 * preserving Arabic/Unicode characters cleanly.
 */
export function buildBotBackupFilename(
  bot: Pick<BotConfig, 'name' | 'botUsername'>,
  date: Date = new Date()
): string {
  const rawBase = (bot.name || '').trim() || (bot.botUsername || '').trim() || 'telecraft-bot';
  const safeBase = rawBase
    .replace(/[\\/:*?"<>|\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const baseName = safeBase || (bot.botUsername ? bot.botUsername.replace(/[^a-zA-Z0-9_-]/g, '') : '') || 'telecraft-bot';
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');

  return `${baseName}-backup-${yyyy}-${mm}-${dd}.json`;
}

/**
 * Builds the portable JSON backup string for a bot's full current configuration,
 * excluding sensitive secrets (like bot token) while including safe backup metadata.
 */
export function exportBotBackupJson(
  bot: BotConfig,
  exportedAt: Date = new Date()
): string {
  const designObj = JSON.parse(exportBotDesignJson(bot)) as Record<string, unknown>;
  const backupPayload = {
    ...designObj,
    backupMeta: {
      format: 'telecraft-bot-backup',
      version: 1,
      exportedAt: exportedAt.toISOString(),
      botId: bot.id,
      ...(bot.botUsername ? { botUsername: bot.botUsername } : {}),
    },
  };
  return JSON.stringify(backupPayload, null, 2);
}

/**
 * Triggers a local browser download for any formatted JSON content.
 */
export function downloadJsonTextFile(filename: string, jsonContent: string): void {
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Exports the provided bot's current settings & design as a local JSON backup download.
 */
export function downloadBotBackupFile(bot: BotConfig): {
  filename: string;
  json: string;
} {
  const filename = buildBotBackupFilename(bot);
  const json = exportBotBackupJson(bot);
  downloadJsonTextFile(filename, json);
  return { filename, json };
}
