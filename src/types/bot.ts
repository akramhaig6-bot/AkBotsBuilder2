export type ButtonType = 'inline' | 'reply';

export type ButtonStyle = 'primary' | 'success' | 'danger';
export type ButtonColor = 'default' | 'primary' | 'success' | 'danger' | 'warning';

export type ButtonActionType =
  | 'flow'
  | 'url'
  | 'web_app'
  | 'login_url'
  | 'switch_inline_query'
  | 'switch_inline_query_current_chat'
  | 'switch_inline_query_chosen_chat'
  | 'copy_text'
  | 'callback_game'
  | 'pay'
  | 'request_contact'
  | 'request_location'
  | 'request_poll'
  | 'request_users'
  | 'request_chat'
  | 'none';

export type MediaType = 'photo' | 'video' | 'voice' | 'audio' | 'document';

export type PaginationMode = 'auto' | 'manual';
export type NavigationBarPosition = 'top' | 'bottom';
export type PageUpdateMode = 'edit' | 'new';
export type FlowMode = 'normal' | 'paginated' | 'custom' | 'skip';
export type ParseMode = 'HTML' | 'MarkdownV2' | 'none';
export type VisibilityMode = 'always' | 'when_needed' | 'hidden';

export type LayoutTemplateId =
  | '1_per_row'
  | '2_per_row'
  | '3_per_row'
  | '4_per_row'
  | 'wide_then_2'
  | '2_then_wide'
  | 'wide_then_3'
  | '3_then_wide'
  | 'mixed_pyramid'
  | 'mixed_reverse_pyramid'
  | 'custom_pattern';

export interface LayoutTemplate {
  id: LayoutTemplateId;
  name: string;
  description: string;
  pattern: number[]; // e.g. [1, 2, 3] or [1] or [2]
  previewRows: number[][]; // Visual representation of button widths per row
}

export interface LayoutSettings {
  mode: 'manual' | 'auto';
  buttonsPerRow?: number;
  pattern?: number[];
  autoRedistribute?: boolean;
}

export interface CustomNavButton {
  id: string;
  text: string;
  role:
    | 'prev'
    | 'next'
    | 'first'
    | 'last'
    | 'page_number'
    | 'indicator'
    | 'back'
    | 'home'
    | 'jump_page'
    | 'jump_flow'
    | 'custom_text';
  targetPage?: number;
  targetFlowId?: string;
  keyboardType?: ButtonType;
  row: number;
  order: number;
  enabled: boolean;
  style?: ButtonStyle;
  color?: ButtonColor;
  visibility?: VisibilityMode;
}

export interface NavigationButtonsConfig {
  showPrevNext: boolean;
  prevText: string;
  nextText: string;
  showFirstLast: boolean;
  firstText: string;
  lastText: string;
  position: NavigationBarPosition;
  showPageNumbers?: boolean;
  visibility?: VisibilityMode;
  navKeyboardType?: ButtonType;
  customNavButtons?: CustomNavButton[];
}

export interface PageIndicatorConfig {
  enabled: boolean;
  template: string; // e.g. "📄 صفحة {current} من {total}"
  showInNavigationBar: boolean;
}

export interface MenuNavigationConfig {
  showBackButton: boolean;
  backButtonText: string;
  showMainMenuButton: boolean;
  mainMenuButtonText: string;
  backButtonRow?: number;
  mainMenuButtonRow?: number;
  backTarget?: 'previous' | 'parent';
  keyboardType?: ButtonType;
}

export interface ManualPage {
  id: string;
  internalName?: string;
  title?: string;
  buttonIds: string[];
  message?: {
    text: string;
    parseMode?: ParseMode;
    updateMode?: PageUpdateMode;
    skipMessage?: boolean;
  } | null;
  media?: MediaItem[];
  layoutSettings?: LayoutSettings;
  buttonPositions?: Record<string, { row: number; order: number }>;
  menuNavigation?: MenuNavigationConfig;
  customNavButtons?: CustomNavButton[];
  hideDefaultNav?: boolean;
}

export interface PaginationConfig {
  enabled: boolean;
  mode: PaginationMode; // 'auto' | 'manual'
  itemsPerPage: number; // default 6, no hard cap
  manualPages?: ManualPage[];
  navigation: NavigationButtonsConfig;
  indicator: PageIndicatorConfig;
  menuNavigation?: MenuNavigationConfig;
  updateMode?: PageUpdateMode; // 'edit' | 'new'
}

export interface NavigationBreadcrumb {
  menuId: string;
  page: number;
  messageId?: number;
  buttonId?: string;
  keyboardMode?: 'inline' | 'reply' | 'both' | 'none';
}

export interface UserSession {
  botId: string;
  chatId: number;
  userId?: number;
  currentMenuId: string; // 'main' | flowId
  currentPage: number;
  messageId?: number;
  lastKeyboardMode?: 'inline' | 'reply' | 'both' | 'none';
  history: NavigationBreadcrumb[];
  lastUpdated: number;
}

export interface LinkPreviewOptions {
  is_disabled?: boolean;
  url?: string;
  prefer_small_media?: boolean;
  prefer_large_media?: boolean;
  show_above_text?: boolean;
}

export interface TelegramMessageOptions {
  messageEffectId?: string;
  protectContent?: boolean;
  disableNotification?: boolean;
  linkPreviewOptions?: LinkPreviewOptions;
}

export interface MediaItem {
  id: string;
  type: MediaType;
  url: string;
  fileName?: string;
  caption?: string;
  order: number;
  skipCaption?: boolean;
  hasSpoiler?: boolean;
  showCaptionAboveMedia?: boolean;
}

export interface LoginUrlConfig {
  url: string;
  forward_text?: string;
  bot_username?: string;
  request_write_access?: boolean;
}

export interface SwitchInlineChosenChatConfig {
  query?: string;
  allow_user_chats?: boolean;
  allow_bot_chats?: boolean;
  allow_group_chats?: boolean;
  allow_channel_chats?: boolean;
}

export interface RequestUsersConfig {
  request_id: number;
  user_is_bot?: boolean;
  user_is_premium?: boolean;
  max_quantity?: number;
  request_name?: boolean;
  request_username?: boolean;
  request_photo?: boolean;
}

export interface RequestChatConfig {
  request_id: number;
  chat_is_channel: boolean;
  chat_is_forum?: boolean;
  chat_has_username?: boolean;
  chat_is_created?: boolean;
  bot_is_member?: boolean;
  request_title?: boolean;
  request_username?: boolean;
  request_photo?: boolean;
}

export interface BotButton {
  id: string;
  name?: string; // Optional internal name
  text: string; // Display text shown in Telegram
  type: ButtonType;
  style?: ButtonStyle; // Official Telegram Bot API structural style: "primary" | "success" | "danger"
  color?: ButtonColor; // UI color representation
  customEmojiId?: string; // Telegram icon_custom_emoji_id
  actionType: ButtonActionType;
  callbackData?: string; // Optional custom <= 64 byte callback_data
  url?: string;
  webAppUrl?: string;
  loginUrlConfig?: LoginUrlConfig;
  switchInlineQuery?: string;
  switchInlineChosenChat?: SwitchInlineChosenChatConfig;
  copyText?: string;
  requestPollType?: 'any' | 'quiz' | 'regular';
  requestUsersConfig?: RequestUsersConfig;
  requestChatConfig?: RequestChatConfig;
  skipFlow?: boolean;
  parentId?: string | null;
  row: number; // 0, 1, 2...
  order: number; // position within the row
  pageIndex?: number; // Optional 0-indexed page for manual pagination
}

export type ChatActionKind =
  | 'typing'
  | 'upload_photo'
  | 'record_video'
  | 'upload_video'
  | 'record_voice'
  | 'upload_document'
  | 'choose_sticker';

export type DiceEmojiKind = '🎲' | '🎯' | '🏀' | '⚽' | '🎳' | '🎰';

export type FlowActionType =
  | 'send_message'
  | 'edit_message'
  | 'delete_message'
  | 'send_media'
  | 'open_flow'
  | 'jump_to_flow'
  | 'jump_to_page'
  | 'go_back'
  | 'go_parent'
  | 'go_home'
  | 'close_flow'
  | 'show_reply_keyboard'
  | 'remove_reply_keyboard'
  | 'force_reply'
  | 'open_url'
  | 'callback_alert'
  | 'send_chat_action'
  | 'set_reaction'
  | 'send_dice'
  | 'send_poll'
  | 'send_checklist'
  | 'send_draft_stream';

export interface FlowAction {
  id: string;
  type: FlowActionType;
  enabled: boolean;
  order: number;
  label?: string;
  config?: {
    text?: string;
    parseMode?: ParseMode;
    targetFlowId?: string;
    targetPage?: number;
    url?: string;
    placeholder?: string;
    selective?: boolean;
    showAlert?: boolean;
    chatAction?: ChatActionKind;
    reactionEmoji?: string;
    reactionIsBig?: boolean;
    diceEmoji?: DiceEmojiKind;
    pollQuestion?: string;
    pollOptions?: string[];
    pollType?: 'regular' | 'quiz';
    pollAllowsMultiple?: boolean;
    pollCorrectOptionIndex?: number;
    pollExplanation?: string;
    checklistTitle?: string;
    checklistTasks?: string[];
    checklistOthersCanAdd?: boolean;
    checklistOthersCanMark?: boolean;
  };
}

export interface ReplyKeyboardSettings {
  resizeKeyboard?: boolean;
  oneTimeKeyboard?: boolean;
  isPersistent?: boolean;
  selective?: boolean;
  inputFieldPlaceholder?: string;
  removeKeyboard?: boolean;
  forceReply?: boolean;
}

export interface ButtonFlow {
  id: string;
  buttonId: string;
  parentId?: string | null;
  flowMode?: FlowMode;
  message: {
    text: string;
    isSaved: boolean;
    parseMode?: ParseMode;
    updateMode?: PageUpdateMode;
    skipMessage?: boolean;
    placement?: 'before_media' | 'after_media';
    messageOptions?: TelegramMessageOptions;
  } | null;
  media: MediaItem[];
  subButtons: BotButton[];
  actions?: FlowAction[];
  pagination?: PaginationConfig;
  layoutSettings?: LayoutSettings;
  replyKeyboardSettings?: ReplyKeyboardSettings;
}

export interface BotCommandConfig {
  command: string;
  description: string;
  targetFlowId?: string;
}

export interface BotProfileConfig {
  displayName?: string;
  description?: string;
  shortDescription?: string;
  menuButtonType?: 'default' | 'commands' | 'web_app';
  menuButtonText?: string;
  menuButtonWebAppUrl?: string;
}

export interface BotCapabilities {
  canJoinGroups?: boolean;
  canReadAllGroupMessages?: boolean;
  supportsInlineQueries?: boolean;
  hasTopicsEnabled?: boolean;
  allowsUsersToCreateTopics?: boolean;
  hasMainWebApp?: boolean;
}

export interface BotApiFeaturesConfig {
  enableReactions?: boolean;
  reactionAutoReply?: string;
  enableInlineGuestMode?: boolean;
  inlineGuestTitle?: string;
  inlineGuestDescription?: string;
  inlineGuestMessageText?: string;
}

export interface BotConfig {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  token?: string;
  isConnected: boolean;
  botUsername?: string | null;
  botFirstName?: string | null;
  connectionError?: string | null;
  startMessage: {
    text: string;
    isSaved: boolean;
    parseMode?: ParseMode;
    skipMessage?: boolean;
    media: MediaItem[];
    messageOptions?: TelegramMessageOptions;
  };
  inlineButtons: BotButton[];
  replyButtons: BotButton[];
  inlinePagination?: PaginationConfig;
  replyPagination?: PaginationConfig;
  inlineLayoutSettings?: LayoutSettings;
  replyLayoutSettings?: LayoutSettings;
  buttonFlows: Record<string, ButtonFlow>;
  commands?: BotCommandConfig[];
  profile?: BotProfileConfig;
  capabilities?: BotCapabilities;
  apiFeatures?: BotApiFeaturesConfig;
  settings?: {
    resizeKeyboard?: boolean;
    oneTimeKeyboard?: boolean;
    isPersistent?: boolean;
    selective?: boolean;
    inputFieldPlaceholder?: string;
    simulatorTheme?: 'dark' | 'light';
  };
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    message_thread_id?: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
      username?: string;
      first_name?: string;
    };
    date: number;
    text?: string;
    contact?: {
      phone_number: string;
      first_name?: string;
      last_name?: string;
      user_id?: number;
    };
    location?: {
      latitude: number;
      longitude: number;
    };
    poll?: {
      id: string;
      question: string;
    };
    users_shared?: {
      request_id: number;
      users: Array<{ user_id: number; first_name?: string; username?: string }>;
    };
    chat_shared?: {
      request_id: number;
      chat_id: number;
      title?: string;
      username?: string;
    };
    web_app_data?: {
      data: string;
      button_text: string;
    };
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
      };
    };
    data?: string;
  };
  inline_query?: {
    id: string;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    query: string;
    offset: string;
    chat_type?: string;
  };
  message_reaction?: {
    chat: {
      id: number;
      type: string;
    };
    message_id: number;
    user?: {
      id: number;
      first_name: string;
      username?: string;
    };
    date: number;
    old_reaction: Array<{ type: string; emoji?: string }>;
    new_reaction: Array<{ type: string; emoji?: string }>;
  };
}
