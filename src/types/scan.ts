import {
  BotButton,
  BotCommandConfig,
  BotConfig,
  ButtonActionType,
  ButtonColor,
  ButtonStyle,
  MediaItem,
  ParseMode,
  ReplyKeyboardSettings,
} from './bot';

export type ScanConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'awaiting_code'
  | 'awaiting_password'
  | 'connected'
  | 'error';

export interface ScanAccountInfo {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  phone?: string;
}

export interface SavedScanAccountSummary {
  id: string;
  accountId: string;
  firstName: string;
  lastName?: string;
  username?: string;
  phone?: string;
  createdAt: string;
  lastUsedAt: string;
  isActive: boolean;
}

export interface ScanStatusResponse {
  state: ScanConnectionState;
  isConnected: boolean;
  account: ScanAccountInfo | null;
  hasSavedSession: boolean;
  sessionString?: string | null;
  activeSavedAccountId?: string | null;
  savedAccounts: SavedScanAccountSummary[];
  activeTargetBot?: string | null;
  error?: string | null;
  capturedBotCount: number;
}

export interface CapturedButtonSnapshot {
  id: string;
  text: string;
  type: 'inline' | 'reply';
  row: number;
  order: number;
  actionType: ButtonActionType;
  style?: ButtonStyle;
  color?: ButtonColor;
  customEmojiId?: string;
  callbackData?: string;
  url?: string;
  webAppUrl?: string;
  copyText?: string;
  switchInlineQuery?: string;
  requestPollType?: 'any' | 'quiz' | 'regular';
}

export type CapturedEventKind =
  | 'start_response'
  | 'new_message'
  | 'edit_message'
  | 'callback_alert';

export type CapturedTriggerType =
  | 'command'
  | 'inline_button'
  | 'reply_button'
  | 'text'
  | 'auto';

export interface CapturedMessageEvent {
  id: string;
  botKey: string;
  telegramMessageId: number;
  timestamp: string;
  kind: CapturedEventKind;
  isEdited: boolean;
  triggerType?: CapturedTriggerType;
  triggerText?: string;
  triggerCallbackData?: string;
  parentButtonId?: string | null;
  sourceMessageId?: number;
  text: string;
  parseMode: ParseMode;
  media: MediaItem[];
  inlineButtons: CapturedButtonSnapshot[];
  replyButtons: CapturedButtonSnapshot[];
  replyKeyboardSettings?: ReplyKeyboardSettings;
  callbackAlert?: {
    text: string;
    showAlert: boolean;
  };
  poll?: {
    question: string;
    options: string[];
    pollType: 'regular' | 'quiz';
    allowsMultiple?: boolean;
  };
  diceEmoji?: string;
}

export interface ResolvedScanEventInfo {
  eventId: string;
  assignedTo: 'start' | 'button' | 'command' | 'unassigned';
  assignedLabel: string;
  assignedButtonId?: string;
  candidateButtons: Array<{ id: string; text: string; type: 'inline' | 'reply' }>;
}

export interface CapturedBotRecord {
  botKey: string;
  botTelegramId: string;
  username?: string | null;
  displayName: string;
  description?: string;
  shortDescription?: string;
  commands: BotCommandConfig[];
  events: CapturedMessageEvent[];
  manualParentOverrides: Record<string, string | null>;
  customName?: string;
  lastInteractionAt: string;
  blueprint?: Partial<BotConfig>;
  blueprintJson?: string;
  resolvedEvents?: ResolvedScanEventInfo[];
}

export type ScanButtonCandidate = Pick<BotButton, 'id' | 'text' | 'type' | 'parentId'>;
