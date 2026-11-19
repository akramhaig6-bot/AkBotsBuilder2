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

export type ScanNavStep =
  | { type: 'command'; text: string }
  | { type: 'reply'; buttonId: string; text: string }
  | { type: 'inline'; buttonId: string; callbackData: string; text: string };

function mergeCapturedSubButtons(
  existing: BotButton[] | undefined,
  incoming: BotButton[],
  withinSameBurst: boolean,
  removeReplyKeyboard?: boolean
): BotButton[] {
  const prev = existing || [];
  if (prev.length === 0) return incoming;
  if (incoming.length === 0) {
    return removeReplyKeyboard ? prev.filter((b) => b.type !== 'reply') : prev;
  }

  const incomingHasInline = incoming.some((b) => b.type === 'inline');
  const incomingHasReply = incoming.some((b) => b.type === 'reply');

  const keptFromPrev = prev.filter((b) => {
    if (removeReplyKeyboard && b.type === 'reply') return false;
    if (b.type === 'inline' && incomingHasInline && !withinSameBurst) return false;
    if (b.type === 'reply' && incomingHasReply && !withinSameBurst) return false;
    return true;
  });

  const merged: BotButton[] = [...keptFromPrev];
  const seenKeys = new Set(
    merged.map((b) => `${b.type}|${b.callbackData || b.url || b.text}`)
  );

  for (const btn of incoming) {
    const k = `${btn.type}|${btn.callbackData || btn.url || btn.text}`;
    if (!seenKeys.has(k)) {
      seenKeys.add(k);
      merged.push(btn);
    }
  }
  return merged;
}

function matchPassiveButtonByText(
  evText: string,
  candidates: BotButton[],
  claimedIds: Set<string>
): BotButton | undefined {
  const lines = evText
    .split('\n')
    .map((l) => normalizeLabel(l))
    .filter((l) => l.length >= 2)
    .slice(0, 2);

  if (lines.length === 0) return undefined;

  const unclaimed = candidates.filter(
    (b) => b.type === 'inline' && !claimedIds.has(b.id)
  );
  if (unclaimed.length === 0) return undefined;

  // 1) Exact or full-phrase containment match
  for (const lineNorm of lines) {
    const exact = unclaimed.find((b) => {
      const btnNorm = normalizeLabel(b.text);
      return (
        btnNorm.length >= 2 &&
        (lineNorm === btnNorm || lineNorm.includes(btnNorm))
      );
    });
    if (exact) return exact;
  }

  // 2) Meaningful word overlap (>= 1 distinct multi-char word match in heading)
  const headingWords = new Set(
    lines[0].split(/\s+/).filter((w) => w.length >= 3)
  );
  if (headingWords.size === 0) return undefined;

  let bestBtn: BotButton | undefined;
  let bestScore = 0;
  let tied = false;

  for (const btn of unclaimed) {
    const btnWords = normalizeLabel(btn.text)
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    if (btnWords.length === 0) continue;

    let overlap = 0;
    for (const w of btnWords) {
      if (headingWords.has(w)) overlap += 1;
    }
    if (overlap > 0) {
      if (overlap > bestScore) {
        bestScore = overlap;
        bestBtn = btn;
        tied = false;
      } else if (overlap === bestScore) {
        tied = true;
      }
    }
  }

  return bestScore > 0 && !tied ? bestBtn : undefined;
}

export function buildBlueprintFromCapturedBot(
  record: CapturedBotRecord
): ScanBlueprintBuildOutput {
  const events = [...(record.events || [])].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const overrides = record.manualParentOverrides || {};

  // Pick start event(s) — supporting multi-message /start responses (e.g. msg 1 Reply keyboard + msg 2 Inline menu):
  let startEvents: CapturedMessageEvent[] = [];
  const explicitStarts = events.filter(
    (ev) =>
      overrides[ev.id] === '__start__' ||
      (overrides[ev.id] === undefined && ev.parentButtonId === '__start__')
  );
  if (explicitStarts.length > 0) {
    startEvents = explicitStarts;
  } else {
    const startResponses = events.filter(
      (ev) =>
        ev.kind === 'start_response' &&
        overrides[ev.id] === undefined &&
        !ev.parentButtonId
    );
    if (startResponses.length > 0) {
      const latestStart = startResponses[startResponses.length - 1];
      const latestTs = new Date(latestStart.timestamp).getTime();
      // Include sibling /start response messages sent within 10s of the latest /start burst
      startEvents = startResponses.filter(
        (ev) => Math.abs(latestTs - new Date(ev.timestamp).getTime()) <= 10_000
      );
      // Also check immediate follow-up 'auto' message right after latestStart before any other interaction
      const latestIdx = events.findIndex((e) => e.id === latestStart.id);
      if (latestIdx >= 0) {
        for (let i = latestIdx + 1; i < events.length; i++) {
          const nextEv = events[i];
          if (
            nextEv.triggerType === 'auto' &&
            nextEv.kind === 'new_message' &&
            overrides[nextEv.id] === undefined &&
            !nextEv.parentButtonId &&
            new Date(nextEv.timestamp).getTime() - latestTs <= 4_000
          ) {
            startEvents.push(nextEv);
          } else {
            break;
          }
        }
      }
    } else {
      const firstMeaningful = events.find(
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
      if (firstMeaningful) startEvents = [firstMeaningful];
    }
  }

  const startEventIds = new Set(startEvents.map((e) => e.id));
  const primaryStartEvent = startEvents[startEvents.length - 1];

  const inlineButtons: BotButton[] = [];
  const replyButtons: BotButton[] = [];
  const seenRootInline = new Set<string>();
  const seenRootReply = new Set<string>();

  for (const se of startEvents) {
    for (const b of se.inlineButtons) {
      const k = `${b.row}:${b.order}:${b.callbackData || b.url || b.text}`;
      if (!seenRootInline.has(k)) {
        seenRootInline.add(k);
        inlineButtons.push(snapshotToBotButton(b, null));
      }
    }
    for (const b of se.replyButtons) {
      const k = `${b.row}:${b.order}:${b.text}`;
      if (!seenRootReply.has(k)) {
        seenRootReply.add(k);
        replyButtons.push(snapshotToBotButton(b, null));
      }
    }
  }

  const buttonFlows: Record<string, ButtonFlow> = {};
  const buttonRegistry = new Map<string, BotButton>();
  const messageButtonsMap = new Map<number, BotButton[]>();
  const claimedInlineButtonIds = new Set<string>();
  const flowLastEventTs = new Map<string, number>();

  const registerButtons = (buttons: BotButton[], telegramMessageId?: number) => {
    for (const b of buttons) {
      buttonRegistry.set(b.id, b);
    }
    if (telegramMessageId && buttons.length > 0) {
      const existing = messageButtonsMap.get(telegramMessageId) || [];
      const mergedMap = new Map<string, BotButton>();
      for (const b of existing) mergedMap.set(b.id, b);
      for (const b of buttons) mergedMap.set(b.id, b);
      messageButtonsMap.set(telegramMessageId, Array.from(mergedMap.values()));
    }
  };

  for (const se of startEvents) {
    registerButtons(
      [
        ...se.inlineButtons.map((b) => snapshotToBotButton(b, null)),
        ...se.replyButtons.map((b) => snapshotToBotButton(b, null)),
      ],
      se.telegramMessageId
    );
  }

  // Track the latest visible reply & active menu buttons for passive matching
  let activeReplyButtons: BotButton[] = [...replyButtons];
  let latestActiveInlineButtons: BotButton[] = [...inlineButtons];

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
    if (startEventIds.has(ev.id)) {
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
    latestActiveInlineButtons.forEach(addCandidate);
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
      registerButtons(
        [
          ...ev.inlineButtons.map((b) => snapshotToBotButton(b, null)),
          ...ev.replyButtons.map((b) => snapshotToBotButton(b, null)),
        ],
        ev.telegramMessageId
      );
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

    // 3) Heuristic for passive Telegram Desktop/Mobile interactions (both edit_message & follow-up new_message)
    if (
      !targetBtn &&
      (ev.kind === 'edit_message' || ev.triggerType === 'auto') &&
      ev.text.trim()
    ) {
      const msgButtons =
        messageButtonsMap.get(ev.telegramMessageId) || latestActiveInlineButtons;
      targetBtn = matchPassiveButtonByText(ev.text, msgButtons, claimedInlineButtonIds);
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
        if (ev.inlineButtons.length > 0) {
          latestActiveInlineButtons = ev.inlineButtons.map((b) => snapshotToBotButton(b, flowId));
        }
        if (ev.replyButtons.length > 0) {
          activeReplyButtons = ev.replyButtons.map((b) => snapshotToBotButton(b, flowId));
        }

        const existingCmdFlow = buttonFlows[flowId];
        const prevTs = flowLastEventTs.get(flowId) || 0;
        const evTs = new Date(ev.timestamp).getTime();
        const withinBurst = prevTs > 0 && Math.abs(evTs - prevTs) <= 12_000;
        flowLastEventTs.set(flowId, evTs);

        const mergedSubButtons = mergeCapturedSubButtons(
          existingCmdFlow?.subButtons,
          subButtons,
          withinBurst,
          ev.replyKeyboardSettings?.removeKeyboard
        );

        const actions = mergeFlowActions(existingCmdFlow?.actions, buildEventFlowActions(ev));
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
            : existingCmdFlow?.message || null,
          media: (ev.media?.length || 0) > 0 ? ev.media : existingCmdFlow?.media || [],
          subButtons: mergedSubButtons,
          ...(actions.length > 0 ? { actions } : {}),
          ...(ev.replyKeyboardSettings
            ? { replyKeyboardSettings: ev.replyKeyboardSettings }
            : existingCmdFlow?.replyKeyboardSettings
            ? { replyKeyboardSettings: existingCmdFlow.replyKeyboardSettings }
            : {}),
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
      // CRITICAL: Even if this passive screen from Telegram is unassigned yet, register ALL its buttons
      // so nested sub-menus clicked from inside Telegram or Simulator can still resolve and link cleanly!
      const fallbackScope = `msg_${ev.telegramMessageId}`;
      const unregisteredButtons = [
        ...ev.inlineButtons.map((b) => snapshotToBotButton(b, fallbackScope)),
        ...ev.replyButtons.map((b) => snapshotToBotButton(b, fallbackScope)),
      ];
      registerButtons(unregisteredButtons, ev.telegramMessageId);
      if (ev.inlineButtons.length > 0) {
        latestActiveInlineButtons = ev.inlineButtons.map((b) =>
          snapshotToBotButton(b, fallbackScope)
        );
      }
      if (ev.replyButtons.length > 0) {
        activeReplyButtons = ev.replyButtons.map((b) =>
          snapshotToBotButton(b, fallbackScope)
        );
      }

      resolvedEvents.push({
        eventId: ev.id,
        assignedTo: 'unassigned',
        assignedLabel: 'غير مربوط بزر بعد',
        candidateButtons: candidateButtonsSummary,
      });
      continue;
    }

    // Link event cleanly into buttonFlows[targetBtn.id] & attach ALL appeared buttons of its menu
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
    if (ev.inlineButtons.length > 0) {
      latestActiveInlineButtons = ev.inlineButtons.map((b) =>
        snapshotToBotButton(b, targetBtn!.id)
      );
    }
    if (ev.replyButtons.length > 0) {
      activeReplyButtons = ev.replyButtons.map((b) =>
        snapshotToBotButton(b, targetBtn!.id)
      );
    }

    const existingFlow = buttonFlows[targetBtn.id];
    const prevTs = flowLastEventTs.get(targetBtn.id) || 0;
    const evTs = new Date(ev.timestamp).getTime();
    const withinBurst = prevTs > 0 && Math.abs(evTs - prevTs) <= 12_000;
    flowLastEventTs.set(targetBtn.id, evTs);

    const mergedSubButtons = mergeCapturedSubButtons(
      existingFlow?.subButtons,
      subButtons,
      withinBurst,
      ev.replyKeyboardSettings?.removeKeyboard
    );

    const newActions = buildEventFlowActions(ev);
    const mergedActions = mergeFlowActions(existingFlow?.actions, newActions);

    const hasBodyContent =
      Boolean(ev.text.trim()) ||
      (ev.media?.length || 0) > 0 ||
      mergedSubButtons.length > 0;
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
            text: ev.text.trim()
              ? ev.text
              : existingFlow?.message?.text || '',
            isSaved: Boolean(ev.text.trim() || existingFlow?.message?.text?.trim()),
            parseMode: ev.parseMode || existingFlow?.message?.parseMode || 'none',
            updateMode: ev.kind === 'edit_message' ? 'edit' : 'new',
            ...(ev.text.trim() || existingFlow?.message?.text?.trim()
              ? {}
              : { skipMessage: false }),
          }
        : existingFlow?.message || null,
      media:
        (ev.media?.length || 0) > 0
          ? ev.media
          : existingFlow?.media || [],
      subButtons: mergedSubButtons,
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

  const combinedStartText = startEvents
    .map((e) => e.text)
    .filter((t) => Boolean(t && t.trim()))
    .join('\n\n');
  const combinedStartMedia = startEvents.flatMap((e) => e.media || []);
  const startParseMode =
    startEvents.find((e) => e.parseMode && e.parseMode !== 'none')?.parseMode ||
    primaryStartEvent?.parseMode ||
    'none';
  const startReplySettings = startEvents.find((e) => e.replyKeyboardSettings)?.replyKeyboardSettings;

  const blueprint: Partial<BotConfig> = {
    name: botName,
    startMessage: startEvents.length > 0
      ? {
          text: combinedStartText,
          isSaved: Boolean(combinedStartText.trim()) || combinedStartMedia.length > 0,
          parseMode: startParseMode,
          media: combinedStartMedia,
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
      resizeKeyboard: startReplySettings?.resizeKeyboard ?? true,
      oneTimeKeyboard: startReplySettings?.oneTimeKeyboard ?? false,
      isPersistent: startReplySettings?.isPersistent ?? false,
      ...(startReplySettings?.inputFieldPlaceholder
        ? { inputFieldPlaceholder: startReplySettings.inputFieldPlaceholder }
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

/**
 * Computes the interactive click path from `/start` (or slash command) down to `targetButtonId`
 * so the scanner backend can automatically replay edited-in-place Telegram menus if needed.
 */
export function buildButtonNavigationPath(
  record: CapturedBotRecord,
  targetButtonId: string
): ScanNavStep[] {
  const rebuilt = record.blueprint ? record : { ...record, ...buildBlueprintFromCapturedBot(record) };
  const bp = rebuilt.blueprint;
  if (!bp) return [];

  const rootInline = bp.inlineButtons || [];
  const rootReply = bp.replyButtons || [];
  const flows = bp.buttonFlows || {};

  const toStep = (btn: BotButton): ScanNavStep | null => {
    if (btn.type === 'reply') {
      return { type: 'reply', buttonId: btn.id, text: btn.text };
    }
    if (btn.callbackData) {
      return {
        type: 'inline',
        buttonId: btn.id,
        callbackData: btn.callbackData,
        text: btn.text,
      };
    }
    return null;
  };

  // BFS from root (/start) + slash command entrypoints to reach targetButtonId
  type QueueItem = { menuId: string; path: ScanNavStep[] };
  const queue: QueueItem[] = [{ menuId: 'main', path: [{ type: 'command', text: '/start' }] }];
  const visitedMenus = new Set<string>(['main']);

  for (const cmd of bp.commands || []) {
    if (cmd.targetFlowId && flows[cmd.targetFlowId]) {
      queue.push({
        menuId: cmd.targetFlowId,
        path: [{ type: 'command', text: `/${cmd.command}` }],
      });
      visitedMenus.add(cmd.targetFlowId);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const buttons =
      current.menuId === 'main'
        ? [...rootInline, ...rootReply]
        : flows[current.menuId]?.subButtons || [];

    for (const btn of buttons) {
      const step = toStep(btn);
      if (btn.id === targetButtonId) {
        return step ? [...current.path, step] : current.path;
      }
      if (step && flows[btn.id] && !visitedMenus.has(btn.id)) {
        visitedMenus.add(btn.id);
        queue.push({
          menuId: btn.id,
          path: [...current.path, step],
        });
      }
    }
  }

  return [];
}

export interface CrawlCandidate {
  kind: 'command' | 'button';
  label: string;
  depth: number;
  dedupKey: string;
  commandText?: string;
  button?: BotButton;
}

const LOOP_NAV_TEXTS = new Set<string>([
  'رجوع',
  'عودة',
  'للخلف',
  'السابق',
  'التالي',
  'القائمة السابقة',
  'العودة للقائمة',
  'العودة للقائمة السابقة',
  'العودة للرئيسية',
  'القائمة الرئيسية',
  'الرئيسية',
  'back',
  'go back',
  'return',
  'previous',
  'prev',
  'next',
  'main menu',
  'home',
  'close',
  'إغلاق',
]);

export function isLikelyLoopOrPaginationButton(btn: BotButton): boolean {
  const cb = (btn.callbackData || '').trim().toLowerCase();
  if (
    cb.startsWith('nav:') ||
    cb.startsWith('pg:') ||
    cb === 'back' ||
    cb === 'home' ||
    cb === 'main_menu' ||
    cb === 'close'
  ) {
    return true;
  }
  const norm = normalizeLabel(btn.text);
  if (LOOP_NAV_TEXTS.has(norm)) return true;
  if (/^(صفحة|page)\s*\d+\s*(\/|من|of)\s*\d+$/i.test(norm)) return true;
  if (/^[<>«»]{1,2}$/.test(btn.text.trim())) return true;
  return false;
}

/**
 * Discovers all reachable unexplored commands and interactive buttons across a captured bot tree in BFS depth order.
 */
export function collectBotCrawlCandidates(
  record: CapturedBotRecord,
  visitedKeys: Set<string>,
  options?: { maxDepth?: number; includeAlreadyCapturedFlows?: boolean }
): CrawlCandidate[] {
  const maxDepth = options?.maxDepth ?? 4;
  const includeAlreadyCaptured = Boolean(options?.includeAlreadyCapturedFlows);
  const rebuilt = record.blueprint
    ? record
    : { ...record, ...buildBlueprintFromCapturedBot(record) };
  const bp = rebuilt.blueprint;
  if (!bp) return [];

  const rootInline = bp.inlineButtons || [];
  const rootReply = bp.replyButtons || [];
  const flows = bp.buttonFlows || {};
  const candidates: CrawlCandidate[] = [];
  const queuedKeys = new Set<string>();

  for (const cmd of record.commands || []) {
    const cleanCmd = (cmd.command || '').replace(/^\//, '').trim().toLowerCase();
    if (!cleanCmd || cleanCmd === 'start') continue;
    const dedupKey = `cmd:${cleanCmd}`;
    const flowId = `scan_cmd_${cleanCmd}`;
    if (
      !visitedKeys.has(dedupKey) &&
      !queuedKeys.has(dedupKey) &&
      (includeAlreadyCaptured || !flows[flowId])
    ) {
      queuedKeys.add(dedupKey);
      candidates.push({
        kind: 'command',
        label: `/${cleanCmd}`,
        depth: 1,
        dedupKey,
        commandText: `/${cleanCmd}`,
      });
    }
  }

  type QueueNode = { menuId: string; depth: number };
  const queue: QueueNode[] = [{ menuId: 'main', depth: 1 }];
  const visitedMenus = new Set<string>(['main']);

  for (const cmd of bp.commands || []) {
    if (cmd.targetFlowId && flows[cmd.targetFlowId] && !visitedMenus.has(cmd.targetFlowId)) {
      visitedMenus.add(cmd.targetFlowId);
      queue.push({ menuId: cmd.targetFlowId, depth: 2 });
    }
  }

  while (queue.length > 0) {
    const { menuId, depth } = queue.shift()!;
    if (depth > maxDepth) continue;

    const buttons =
      menuId === 'main'
        ? [...rootInline, ...rootReply]
        : flows[menuId]?.subButtons || [];

    for (const btn of buttons) {
      if (btn.actionType !== 'flow') continue;
      if (btn.type === 'inline' && !btn.callbackData) continue;
      if (isLikelyLoopOrPaginationButton(btn)) continue;

      const dedupKey =
        btn.type === 'inline'
          ? `inline:${btn.callbackData}`
          : `reply:${normalizeLabel(btn.text) || btn.text.trim()}`;

      const hasCapturedFlow = Boolean(flows[btn.id]);
      if (
        !visitedKeys.has(dedupKey) &&
        !queuedKeys.has(dedupKey) &&
        (includeAlreadyCaptured || !hasCapturedFlow)
      ) {
        queuedKeys.add(dedupKey);
        candidates.push({
          kind: 'button',
          label: btn.text,
          depth,
          dedupKey,
          button: btn,
        });
      }

      if (hasCapturedFlow && depth + 1 <= maxDepth && !visitedMenus.has(btn.id)) {
        visitedMenus.add(btn.id);
        queue.push({ menuId: btn.id, depth: depth + 1 });
      }
    }
  }

  candidates.sort((a, b) => a.depth - b.depth);
  return candidates;
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
