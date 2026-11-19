import {
  BotButton,
  BotCommandConfig,
  BotConfig,
  ButtonColor,
  ButtonFlow,
  ButtonStyle,
  FlowAction,
  ParseMode,
} from '../types/bot';
import {
  CapturedBotRecord,
  CapturedButtonSnapshot,
  CapturedMessageEvent,
  ResolvedScanEventInfo,
} from '../types/scan';
import { createPreviewBotFromBlueprint, exportBotDesignJson } from './jsonBotBlueprint';

export interface RawTelegramEntity {
  className?: string;
  offset: number;
  length: number;
  url?: string;
  language?: string;
  documentId?: string | number | bigint;
}

const STYLE_TO_COLOR: Record<ButtonStyle, ButtonColor> = {
  primary: 'primary',
  success: 'success',
  danger: 'danger',
};

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttr(attr: string): string {
  return attr
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildHtmlTagPair(entity: RawTelegramEntity): { open: string; close: string } | null {
  const cls = (entity.className || '').replace(/^MessageEntity/, '');
  switch (cls) {
    case 'Bold':
      return { open: '<b>', close: '</b>' };
    case 'Italic':
      return { open: '<i>', close: '</i>' };
    case 'Underline':
      return { open: '<u>', close: '</u>' };
    case 'Strike':
      return { open: '<s>', close: '</s>' };
    case 'Code':
      return { open: '<code>', close: '</code>' };
    case 'Pre':
      if (entity.language && entity.language.trim()) {
        return {
          open: `<pre><code class="language-${escapeHtmlAttr(entity.language.trim())}">`,
          close: '</code></pre>',
        };
      }
      return { open: '<pre>', close: '</pre>' };
    case 'TextUrl':
      if (entity.url) {
        return {
          open: `<a href="${escapeHtmlAttr(entity.url)}">`,
          close: '</a>',
        };
      }
      return null;
    case 'Spoiler':
      return { open: '<tg-spoiler>', close: '</tg-spoiler>' };
    case 'Blockquote':
      return { open: '<blockquote>', close: '</blockquote>' };
    case 'CustomEmoji':
      if (entity.documentId !== undefined && entity.documentId !== null) {
        return {
          open: `<tg-emoji emoji-id="${escapeHtmlAttr(String(entity.documentId))}">`,
          close: '</tg-emoji>',
        };
      }
      return null;
    default:
      return null;
  }
}

export function telegramEntitiesToHtml(
  plainText: string,
  entities?: RawTelegramEntity[]
): { text: string; parseMode: ParseMode } {
  if (!plainText) {
    return { text: '', parseMode: 'none' };
  }
  if (!entities || entities.length === 0) {
    return { text: plainText, parseMode: 'none' };
  }

  interface TagBoundary {
    pos: number;
    isClose: boolean;
    spanLength: number;
    order: number;
    tag: string;
  }

  const boundaries: TagBoundary[] = [];
  let hasSupportedEntity = false;

  entities.forEach((entity, idx) => {
    const start = Math.max(0, Math.min(plainText.length, Number(entity.offset) || 0));
    const len = Math.max(0, Number(entity.length) || 0);
    const end = Math.max(start, Math.min(plainText.length, start + len));
    if (end <= start) return;

    const pair = buildHtmlTagPair(entity);
    if (!pair) return;

    hasSupportedEntity = true;
    const spanLength = end - start;
    boundaries.push({
      pos: start,
      isClose: false,
      spanLength,
      order: idx,
      tag: pair.open,
    });
    boundaries.push({
      pos: end,
      isClose: true,
      spanLength,
      order: idx,
      tag: pair.close,
    });
  });

  if (!hasSupportedEntity) {
    return { text: plainText, parseMode: 'none' };
  }

  boundaries.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos;
    // Close tags before open tags at exact same boundary
    if (a.isClose !== b.isClose) return a.isClose ? -1 : 1;
    if (a.isClose) {
      // Smaller inner spans close before larger outer spans
      if (a.spanLength !== b.spanLength) return a.spanLength - b.spanLength;
      return b.order - a.order;
    }
    // Larger outer spans open before smaller inner spans
    if (a.spanLength !== b.spanLength) return b.spanLength - a.spanLength;
    return a.order - b.order;
  });

  let html = '';
  let cursor = 0;

  for (const b of boundaries) {
    if (b.pos > cursor) {
      html += escapeHtmlText(plainText.slice(cursor, b.pos));
      cursor = b.pos;
    }
    html += b.tag;
  }

  if (cursor < plainText.length) {
    html += escapeHtmlText(plainText.slice(cursor));
  }

  return { text: html, parseMode: 'HTML' };
}

function normalizeLabel(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function snapshotToBotButton(
  snap: CapturedButtonSnapshot,
  parentId: string | null
): BotButton {
  const color: ButtonColor =
    snap.color || (snap.style ? STYLE_TO_COLOR[snap.style] : 'default');

  return {
    id: snap.id,
    text: snap.text,
    type: snap.type,
    ...(snap.style ? { style: snap.style } : {}),
    color,
    ...(snap.customEmojiId ? { customEmojiId: snap.customEmojiId } : {}),
    actionType: snap.actionType,
    ...(snap.callbackData ? { callbackData: snap.callbackData } : {}),
    ...(snap.url ? { url: snap.url } : {}),
    ...(snap.webAppUrl ? { webAppUrl: snap.webAppUrl } : {}),
    ...(snap.copyText ? { copyText: snap.copyText } : {}),
    ...(snap.switchInlineQuery !== undefined
      ? { switchInlineQuery: snap.switchInlineQuery }
      : {}),
    ...(snap.requestPollType ? { requestPollType: snap.requestPollType } : {}),
    parentId,
    row: snap.row,
    order: snap.order,
  };
}

export function makeDeterministicCapturedButtonId(
  scope: string,
  type: 'inline' | 'reply',
  row: number,
  order: number,
  text: string,
  callbackData?: string
): string {
  const seed = `${scope}|${type}|${row}:${order}|${callbackData || text}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(36);
  return `scan_${type}_${row}_${order}_${hex}`;
}

export interface ScanBlueprintBuildOutput {
  blueprint: Partial<BotConfig>;
  json: string;
  resolvedEvents: ResolvedScanEventInfo[];
}

export function buildBlueprintFromCapturedBot(
  record: CapturedBotRecord
): ScanBlueprintBuildOutput {
  const events = [...(record.events || [])].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const overrides = record.manualParentOverrides || {};

  // Pick start event:
  // 1) Latest event explicitly assigned to '__start__' via override or parentButtonId
  // 2) Else latest 'start_response' (not overridden away from start)
  // 3) Else first non-alert incoming event that has text/media/buttons (and not overridden)
  let startEvent: CapturedMessageEvent | undefined;
  const explicitStarts = events.filter(
    (ev) => overrides[ev.id] === '__start__' || (overrides[ev.id] === undefined && ev.parentButtonId === '__start__')
  );
  if (explicitStarts.length > 0) {
    startEvent = explicitStarts[explicitStarts.length - 1];
  } else {
    const startResponses = events.filter(
      (ev) =>
        ev.kind === 'start_response' &&
        overrides[ev.id] === undefined &&
        !ev.parentButtonId
    );
    if (startResponses.length > 0) {
      startEvent = startResponses[startResponses.length - 1];
    } else {
      startEvent = events.find(
        (ev) =>
          ev.kind !== 'callback_alert' &&
          overrides[ev.id] === undefined &&
          !ev.parentButtonId &&
          !ev.triggerCallbackData &&
          (Boolean(ev.text.trim()) ||
            ev.media.length > 0 ||
            ev.inlineButtons.length > 0 ||
            ev.replyButtons.length > 0)
      );
    }
  }

  const inlineButtons: BotButton[] = startEvent
    ? startEvent.inlineButtons.map((b) => snapshotToBotButton(b, null))
    : [];
  const replyButtons: BotButton[] = startEvent
    ? startEvent.replyButtons.map((b) => snapshotToBotButton(b, null))
    : [];

  const buttonFlows: Record<string, ButtonFlow> = {};
  const buttonRegistry = new Map<string, BotButton>();
  const messageButtonsMap = new Map<number, BotButton[]>();
  const claimedInlineButtonIds = new Set<string>();

  const registerButtons = (buttons: BotButton[], telegramMessageId?: number) => {
    for (const b of buttons) {
      buttonRegistry.set(b.id, b);
    }
    if (telegramMessageId) {
      messageButtonsMap.set(telegramMessageId, buttons);
    }
  };

  registerButtons(
    [...inlineButtons, ...replyButtons],
    startEvent?.telegramMessageId
  );

  // Track the latest visible reply keyboard buttons for reply-text matching
  let activeReplyButtons: BotButton[] = [...replyButtons];

  const commandsMap = new Map<string, BotCommandConfig>();
  for (const cmd of record.commands || []) {
    const normalizedCmd = (cmd.command || '')
      .replace(/^\//, '')
      .trim()
      .toLowerCase();
    if (!normalizedCmd) continue;
    commandsMap.set(normalizedCmd, {
      command: normalizedCmd,
      description: cmd.description || normalizedCmd,
      ...(cmd.targetFlowId ? { targetFlowId: cmd.targetFlowId } : {}),
    });
  }

  const resolvedEvents: ResolvedScanEventInfo[] = [];

  for (const ev of events) {
    if (startEvent && ev.id === startEvent.id) {
      const candidates = [...inlineButtons, ...replyButtons].map((b) => ({
        id: b.id,
        text: b.text,
        type: b.type,
      }));
      resolvedEvents.push({
        eventId: ev.id,
        assignedTo: 'start',
        assignedLabel: 'رسالة البداية (/start)',
        candidateButtons: candidates,
      });
      continue;
    }

    const candidateList: BotButton[] = [];
    const seenCandidateIds = new Set<string>();
    const addCandidate = (b: BotButton) => {
      if (!seenCandidateIds.has(b.id)) {
        seenCandidateIds.add(b.id);
        candidateList.push(b);
      }
    };

    if (ev.sourceMessageId && messageButtonsMap.has(ev.sourceMessageId)) {
      messageButtonsMap.get(ev.sourceMessageId)!.forEach(addCandidate);
    }
    if (ev.telegramMessageId && messageButtonsMap.has(ev.telegramMessageId)) {
      messageButtonsMap.get(ev.telegramMessageId)!.forEach(addCandidate);
    }
    activeReplyButtons.forEach(addCandidate);
    for (const b of buttonRegistry.values()) {
      addCandidate(b);
    }

    const candidateButtonsSummary = candidateList.map((b) => ({
      id: b.id,
      text: b.text,
      type: b.type,
    }));

    // 1) Explicit manual override to '__start__'
    const manualTarget = overrides[ev.id];
    if (manualTarget === '__start__') {
      resolvedEvents.push({
        eventId: ev.id,
        assignedTo: 'start',
        assignedLabel: 'رسالة البداية (/start)',
        candidateButtons: candidateButtonsSummary,
      });
      continue;
    }

    // 2) Resolve target parent button ID
    let targetBtn: BotButton | undefined;

    if (typeof manualTarget === 'string' && manualTarget) {
      targetBtn = buttonRegistry.get(manualTarget);
    }

    if (!targetBtn && ev.parentButtonId && ev.parentButtonId !== '__start__') {
      targetBtn = buttonRegistry.get(ev.parentButtonId);
    }

    if (!targetBtn && ev.triggerCallbackData) {
      targetBtn =
        candidateList.find(
          (b) => b.type === 'inline' && b.callbackData === ev.triggerCallbackData
        ) ||
        Array.from(buttonRegistry.values()).find(
          (b) => b.type === 'inline' && b.callbackData === ev.triggerCallbackData
        );
    }

    if (!targetBtn && ev.triggerText && !ev.triggerText.trim().startsWith('/')) {
      const triggerNorm = ev.triggerText.trim();
      targetBtn =
        activeReplyButtons.find((b) => b.text.trim() === triggerNorm) ||
        candidateList.find((b) => b.type === 'reply' && b.text.trim() === triggerNorm) ||
        candidateList.find((b) => b.text.trim() === triggerNorm);
    }

    // 3) Heuristic for passive Telegram Desktop/Mobile edit_message where title clearly reflects button
    if (!targetBtn && ev.kind === 'edit_message' && ev.text.trim()) {
      const msgButtons = messageButtonsMap.get(ev.telegramMessageId) || [];
      const firstLineNorm = normalizeLabel(ev.text.split('\n')[0] || '');
      if (firstLineNorm.length >= 2) {
        const unclaimedInline = msgButtons.filter(
          (b) => b.type === 'inline' && !claimedInlineButtonIds.has(b.id)
        );
        targetBtn = unclaimedInline.find((b) => {
          const btnNorm = normalizeLabel(b.text);
          return btnNorm.length >= 2 && (firstLineNorm === btnNorm || firstLineNorm.includes(btnNorm));
        });
      }
    }

    // 4) Slash commands like /help or /about (excluding /start)
    const trimmedTrigger = (ev.triggerText || '').trim();
    const isSlashCmd =
      !targetBtn &&
      trimmedTrigger.startsWith('/') &&
      !trimmedTrigger.toLowerCase().startsWith('/start');

    if (isSlashCmd) {
      const cmdName = trimmedTrigger
        .slice(1)
        .split(/[\s@]/)[0]
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');

      if (cmdName) {
        const flowId = `scan_cmd_${cmdName}`;
        const subButtons = [
          ...ev.inlineButtons.map((b) => snapshotToBotButton(b, flowId)),
          ...ev.replyButtons.map((b) => snapshotToBotButton(b, flowId)),
        ];
        registerButtons(subButtons, ev.telegramMessageId);
        if (ev.replyButtons.length > 0) {
          activeReplyButtons = ev.replyButtons.map((b) => snapshotToBotButton(b, flowId));
        }

        const actions = buildEventFlowActions(ev);
        buttonFlows[flowId] = {
          id: flowId,
          buttonId: flowId,
          parentId: null,
          flowMode: 'normal',
          message: ev.text.trim()
            ? {
                text: ev.text,
                isSaved: true,
                parseMode: ev.parseMode || 'none',
                updateMode: 'new',
              }
            : null,
          media: ev.media || [],
          subButtons,
          ...(actions.length > 0 ? { actions } : {}),
          ...(ev.replyKeyboardSettings ? { replyKeyboardSettings: ev.replyKeyboardSettings } : {}),
        };

        const existingCmd = commandsMap.get(cmdName);
        commandsMap.set(cmdName, {
          command: cmdName,
          description: existingCmd?.description || `أمر /${cmdName}`,
          targetFlowId: flowId,
        });

        resolvedEvents.push({
          eventId: ev.id,
          assignedTo: 'command',
          assignedLabel: `الأمر /${cmdName}`,
          assignedButtonId: flowId,
          candidateButtons: candidateButtonsSummary,
        });
        continue;
      }
    }

    if (!targetBtn) {
      resolvedEvents.push({
        eventId: ev.id,
        assignedTo: 'unassigned',
        assignedLabel: 'غير مربوط بزر بعد',
        candidateButtons: candidateButtonsSummary,
      });
      continue;
    }

    // Link event cleanly into buttonFlows[targetBtn.id]
    if (targetBtn.type === 'inline') {
      claimedInlineButtonIds.add(targetBtn.id);
    }
    if (targetBtn.actionType !== 'flow') {
      targetBtn.actionType = 'flow';
    }

    const subButtons = [
      ...ev.inlineButtons.map((b) => snapshotToBotButton(b, targetBtn!.id)),
      ...ev.replyButtons.map((b) => snapshotToBotButton(b, targetBtn!.id)),
    ];
    registerButtons(subButtons, ev.telegramMessageId);
    if (ev.replyButtons.length > 0) {
      activeReplyButtons = ev.replyButtons.map((b) =>
        snapshotToBotButton(b, targetBtn!.id)
      );
    }

    const existingFlow = buttonFlows[targetBtn.id];
    const newActions = buildEventFlowActions(ev);
    const mergedActions = mergeFlowActions(existingFlow?.actions, newActions);

    const hasBodyContent = Boolean(ev.text.trim()) || (ev.media?.length || 0) > 0 || subButtons.length > 0;
    const isAlertOnly = ev.kind === 'callback_alert' && !hasBodyContent;

    buttonFlows[targetBtn.id] = {
      id: targetBtn.id,
      buttonId: targetBtn.id,
      parentId: targetBtn.parentId ?? null,
      flowMode: 'normal',
      message: isAlertOnly
        ? existingFlow?.message || null
        : hasBodyContent
        ? {
            text: ev.text,
            isSaved: Boolean(ev.text.trim()),
            parseMode: ev.parseMode || 'none',
            updateMode: ev.kind === 'edit_message' ? 'edit' : 'new',
            ...(ev.text.trim() ? {} : { skipMessage: false }),
          }
        : existingFlow?.message || null,
      media:
        (ev.media?.length || 0) > 0
          ? ev.media
          : existingFlow?.media || [],
      subButtons:
        subButtons.length > 0
          ? subButtons
          : existingFlow?.subButtons || [],
      ...(mergedActions.length > 0 ? { actions: mergedActions } : {}),
      ...(ev.replyKeyboardSettings
        ? { replyKeyboardSettings: ev.replyKeyboardSettings }
        : existingFlow?.replyKeyboardSettings
        ? { replyKeyboardSettings: existingFlow.replyKeyboardSettings }
        : {}),
    };

    resolvedEvents.push({
      eventId: ev.id,
      assignedTo: 'button',
      assignedLabel: `الزر: ${targetBtn.text}`,
      assignedButtonId: targetBtn.id,
      candidateButtons: candidateButtonsSummary,
    });
  }

  const botName =
    (record.customName && record.customName.trim()) ||
    record.displayName ||
    (record.username ? `@${record.username}` : 'بوت منسوخ من تيليجرام');

  const commandsList = Array.from(commandsMap.values());

  const blueprint: Partial<BotConfig> = {
    name: botName,
    startMessage: startEvent
      ? {
          text: startEvent.text,
          isSaved: Boolean(startEvent.text.trim()) || (startEvent.media?.length || 0) > 0,
          parseMode: startEvent.parseMode || 'none',
          media: startEvent.media || [],
        }
      : {
          text: `مرحباً بك في ${botName}!`,
          isSaved: true,
          parseMode: 'none',
          media: [],
        },
    inlineButtons,
    replyButtons,
    buttonFlows,
    ...(commandsList.length > 0 ? { commands: commandsList } : {}),
    ...(record.displayName || record.description || record.shortDescription
      ? {
          profile: {
            displayName: botName,
            ...(record.description ? { description: record.description } : {}),
            ...(record.shortDescription ? { shortDescription: record.shortDescription } : {}),
          },
        }
      : {}),
    settings: {
      resizeKeyboard: startEvent?.replyKeyboardSettings?.resizeKeyboard ?? true,
      oneTimeKeyboard: startEvent?.replyKeyboardSettings?.oneTimeKeyboard ?? false,
      isPersistent: startEvent?.replyKeyboardSettings?.isPersistent ?? false,
      ...(startEvent?.replyKeyboardSettings?.inputFieldPlaceholder
        ? { inputFieldPlaceholder: startEvent.replyKeyboardSettings.inputFieldPlaceholder }
        : {}),
      simulatorTheme: 'dark',
    },
  };

  const previewBot = createPreviewBotFromBlueprint(blueprint);
  const json = exportBotDesignJson(previewBot);

  return {
    blueprint,
    json,
    resolvedEvents,
  };
}

function buildEventFlowActions(ev: CapturedMessageEvent): FlowAction[] {
  const actions: FlowAction[] = [];
  let order = 0;

  if (ev.callbackAlert && ev.callbackAlert.text.trim()) {
    actions.push({
      id: `scan_act_alert_${ev.id}`,
      type: 'callback_alert',
      enabled: true,
      order: order++,
      config: {
        text: ev.callbackAlert.text.trim(),
        showAlert: Boolean(ev.callbackAlert.showAlert),
      },
    });
  }

  if (ev.poll && ev.poll.question) {
    actions.push({
      id: `scan_act_poll_${ev.id}`,
      type: 'send_poll',
      enabled: true,
      order: order++,
      config: {
        pollQuestion: ev.poll.question,
        pollOptions: ev.poll.options,
        pollType: ev.poll.pollType,
        pollAllowsMultiple: Boolean(ev.poll.allowsMultiple),
      },
    });
  }

  if (ev.diceEmoji) {
    actions.push({
      id: `scan_act_dice_${ev.id}`,
      type: 'send_dice',
      enabled: true,
      order: order++,
      config: {
        diceEmoji: ev.diceEmoji as any,
      },
    });
  }

  return actions;
}

function mergeFlowActions(
  existing?: FlowAction[],
  incoming?: FlowAction[]
): FlowAction[] {
  const result = [...(existing || [])];
  for (const act of incoming || []) {
    const idx = result.findIndex((x) => x.type === act.type);
    if (idx >= 0) {
      result[idx] = act;
    } else {
      result.push({ ...act, order: result.length });
    }
  }
  return result;
}
