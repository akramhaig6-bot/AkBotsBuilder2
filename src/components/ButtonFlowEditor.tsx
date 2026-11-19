import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  MessageSquare,
  Layers,
  Save,
  Trash2,
  Edit3,
  Plus,
  Workflow,
  ChevronLeft,
  Move,
  Image,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Sliders,
  LayoutGrid,
  Zap,
  Copy,
  Navigation,
  Keyboard,
  RefreshCw,
  Shield,
  Sparkles,
  BellOff,
  Link2,
} from 'lucide-react';
import {
  BotButton,
  BotConfig,
  ButtonFlow,
  ChatActionKind,
  DiceEmojiKind,
  FlowAction,
  FlowActionType,
  FlowMode,
  MediaItem,
  MenuNavigationConfig,
  PageUpdateMode,
  ParseMode,
  ReplyKeyboardSettings,
  TelegramMessageOptions,
} from '../types/bot';
import { MediaUploader } from './MediaUploader';
import { ConfirmModal } from './ConfirmModal';
import {
  collectDescendantButtonIds,
  computeNextButtonPosition,
  duplicateButtonWithFlow,
  getButtonColorClasses,
} from '../utils/telegramFormatters';
import { PaginationSettingsModal } from './PaginationSettingsModal';
import { RowArrangerModal } from './RowArrangerModal';
import { computeTotalPages, getDefaultPaginationConfig } from '../utils/pagination';
import { UnifiedButtonForm, UnifiedButtonSavePayload } from './UnifiedButtonForm';
import { MessageOptionsPanel } from './MessageOptionsPanel';
import { TELEGRAM_MESSAGE_EFFECTS } from '../utils/telegramDelivery';

interface ButtonFlowEditorProps {
  bot: BotConfig;
  targetButton: BotButton;
  flowStack?: BotButton[];
  onBack: () => void;
  onUpdateBot: (updates: Partial<BotConfig>) => Promise<void>;
  onNavigateSubFlow?: (subBtn: BotButton) => void;
  onSelectStackIndex?: (index: number) => void;
}

const FLOW_ACTION_LABELS: { id: FlowActionType; label: string }[] = [
  { id: 'send_message', label: 'إرسال رسالة' },
  { id: 'edit_message', label: 'تعديل الرسالة' },
  { id: 'delete_message', label: 'حذف الرسالة السابقة' },
  { id: 'send_media', label: 'إرسال الوسائط' },
  { id: 'open_flow', label: 'فتح تدفق هذا الزر' },
  { id: 'jump_to_flow', label: 'الانتقال إلى تدفق آخر' },
  { id: 'jump_to_page', label: 'الانتقال إلى صفحة' },
  { id: 'go_back', label: 'رجوع خطوة للخلف' },
  { id: 'go_parent', label: 'رجوع للقائمة الأب' },
  { id: 'go_home', label: 'العودة للقائمة الرئيسية' },
  { id: 'close_flow', label: 'إغلاق التدفق' },
  { id: 'show_reply_keyboard', label: 'إظهار لوحة Reply' },
  { id: 'remove_reply_keyboard', label: 'إزالة لوحة Reply (remove_keyboard)' },
  { id: 'force_reply', label: 'فرض الرد (force_reply)' },
  { id: 'callback_alert', label: 'تنبيه / إشعار منبثق (Alert)' },
  { id: 'send_chat_action', label: 'مؤشر حالة (يكتب الآن...)' },
  { id: 'set_reaction', label: 'إضافة تفاعل إيموجي (Reaction)' },
  { id: 'send_dice', label: 'رمي نرد / عجلة تفاعلية (Dice)' },
  { id: 'send_poll', label: 'إرسال استطلاع / اختبار (Poll)' },
  { id: 'send_checklist', label: 'قائمة مهام تفاعلية (Checklist 9.2+)' },
  { id: 'send_draft_stream', label: 'بث نصي متدرج (Draft Stream 9.5+)' },
];

const CHAT_ACTION_OPTIONS: { id: ChatActionKind; label: string }[] = [
  { id: 'typing', label: 'يكتب الآن (typing)' },
  { id: 'upload_photo', label: 'يرسل صورة (upload_photo)' },
  { id: 'record_video', label: 'يسجل فيديو (record_video)' },
  { id: 'upload_video', label: 'يرسل فيديو (upload_video)' },
  { id: 'record_voice', label: 'يسجل صوتاً (record_voice)' },
  { id: 'upload_document', label: 'يرسل ملفاً (upload_document)' },
  { id: 'choose_sticker', label: 'يختار ملصقاً (choose_sticker)' },
];

const DICE_EMOJI_OPTIONS: { id: DiceEmojiKind; label: string }[] = [
  { id: '🎲', label: '🎲 نرد (1-6)' },
  { id: '🎯', label: '🎯 سهم وهدف (1-6)' },
  { id: '🏀', label: '🏀 كرة سلة (1-5)' },
  { id: '⚽', label: '⚽ كرة قدم (1-5)' },
  { id: '🎳', label: '🎳 بولينج (1-6)' },
  { id: '🎰', label: '🎰 عجلة الحظ (1-64)' },
];

const REACTION_PRESETS = ['👍', '❤️', '🔥', '🎉', '👏', '🤩', '⚡', '💯'];

export const ButtonFlowEditor: React.FC<ButtonFlowEditorProps> = ({
  bot,
  targetButton,
  flowStack = [targetButton],
  onBack,
  onUpdateBot,
  onNavigateSubFlow,
  onSelectStackIndex,
}) => {
  const currentFlow: ButtonFlow = bot.buttonFlows?.[targetButton.id] || {
    id: `flow_${targetButton.id}`,
    buttonId: targetButton.id,
    parentId: targetButton.parentId ?? null,
    flowMode: targetButton.skipFlow ? 'skip' : 'normal',
    message: null,
    media: [],
    subButtons: [],
    actions: [],
  };

  // Message State
  const [messageText, setMessageText] = useState(currentFlow.message?.text || '');
  const [skipMessage, setSkipMessage] = useState(
    Boolean(currentFlow.message?.skipMessage)
  );
  const [parseMode, setParseMode] = useState<ParseMode>(
    currentFlow.message?.parseMode || 'none'
  );
  const [updateMode, setUpdateMode] = useState<PageUpdateMode>(
    currentFlow.message?.updateMode || currentFlow.pagination?.updateMode || 'edit'
  );
  const [placement, setPlacement] = useState<'before_media' | 'after_media'>(
    currentFlow.message?.placement || 'after_media'
  );
  const [messageOptions, setMessageOptions] = useState<TelegramMessageOptions | undefined>(
    currentFlow.message?.messageOptions
  );
  const [isEditingMessage, setIsEditingMessage] = useState(
    !currentFlow.message?.isSaved && !currentFlow.message?.skipMessage
  );
  const [showDeleteMessageModal, setShowDeleteMessageModal] = useState(false);

  // Actions State
  const [newActionType, setNewActionType] = useState<FlowActionType>('send_message');
  const [newActionText, setNewActionText] = useState('');
  const [newActionTargetFlow, setNewActionTargetFlow] = useState('');
  const [newActionTargetPage, setNewActionTargetPage] = useState(0);
  const [newActionShowAlert, setNewActionShowAlert] = useState(true);
  const [newActionChatAction, setNewActionChatAction] = useState<ChatActionKind>('typing');
  const [newActionReactionEmoji, setNewActionReactionEmoji] = useState('👍');
  const [newActionReactionIsBig, setNewActionReactionIsBig] = useState(false);
  const [newActionDiceEmoji, setNewActionDiceEmoji] = useState<DiceEmojiKind>('🎲');
  const [newActionPollQuestion, setNewActionPollQuestion] = useState('');
  const [newActionPollOptions, setNewActionPollOptions] = useState('نعم\nلا');
  const [newActionPollType, setNewActionPollType] = useState<'regular' | 'quiz'>('regular');
  const [newActionPollAllowsMultiple, setNewActionPollAllowsMultiple] = useState(false);
  const [newActionPollCorrectIdx, setNewActionPollCorrectIdx] = useState(0);
  const [newActionPollExplanation, setNewActionPollExplanation] = useState('');
  const [newActionChecklistTitle, setNewActionChecklistTitle] = useState('');
  const [newActionChecklistTasks, setNewActionChecklistTasks] = useState('مهمة 1\nمهمة 2\nمهمة 3');

  // Sub-Buttons State
  const [isAddingSubButton, setIsAddingSubButton] = useState(false);
  const [subBtnToEdit, setSubBtnToEdit] = useState<BotButton | null>(null);
  const [subBtnToDelete, setSubBtnToDelete] = useState<BotButton | null>(null);

  // Reorder & Drag state
  const [isReordering, setIsReordering] = useState(false);
  const [draggingSubBtnId, setDraggingSubBtnId] = useState<string | null>(null);
  const [dragOverSubBtnId, setDragOverSubBtnId] = useState<string | null>(null);
  const [isPaginationModalOpen, setIsPaginationModalOpen] = useState(false);
  const [isRowArrangerOpen, setIsRowArrangerOpen] = useState(false);

  // Reset local form state cleanly whenever navigating deeper/back to a different targetButton
  useEffect(() => {
    const f = bot.buttonFlows?.[targetButton.id];
    setMessageText(f?.message?.text || '');
    setSkipMessage(Boolean(f?.message?.skipMessage));
    setParseMode(f?.message?.parseMode || 'none');
    setUpdateMode(f?.message?.updateMode || f?.pagination?.updateMode || 'edit');
    setPlacement(f?.message?.placement || 'after_media');
    setMessageOptions(f?.message?.messageOptions);
    setIsEditingMessage(!f?.message?.isSaved && !f?.message?.skipMessage);
    setIsAddingSubButton(false);
    setSubBtnToEdit(null);
    setSubBtnToDelete(null);
  }, [targetButton.id]);

  const subButtonsList = currentFlow.subButtons || [];
  const totalSubPages = computeTotalPages(subButtonsList, currentFlow.pagination);
  const currentMenuNav: MenuNavigationConfig = currentFlow.pagination?.menuNavigation || {
    showBackButton: true,
    backButtonText: '🔙 العودة للقائمة السابقة',
    showMainMenuButton: true,
    mainMenuButtonText: '🏠 القائمة الرئيسية',
    backTarget: 'previous',
  };

  const hasCycleInStack =
    flowStack.filter((b) => b.id === targetButton.id).length > 1;

  const saveFlow = async (updatedFlow: ButtonFlow) => {
    const updatedFlows = {
      ...(bot.buttonFlows || {}),
      [targetButton.id]: updatedFlow,
    };
    await onUpdateBot({ buttonFlows: updatedFlows });
  };

  // Flow Mode change
  const handleFlowModeChange = async (nextMode: FlowMode) => {
    await saveFlow({
      ...currentFlow,
      flowMode: nextMode,
      pagination:
        nextMode === 'paginated'
          ? {
              ...(currentFlow.pagination || getDefaultPaginationConfig()),
              enabled: true,
            }
          : currentFlow.pagination,
    });
  };

  // Message Handlers (Completely Optional / Skippable!)
  const handleSaveMessage = async () => {
    const trimmed = messageText.trim();
    const updatedFlow: ButtonFlow = {
      ...currentFlow,
      message: skipMessage
        ? {
            text: '',
            isSaved: false,
            skipMessage: true,
            parseMode,
            updateMode,
            placement,
            messageOptions,
          }
        : trimmed
        ? {
            text: trimmed,
            isSaved: true,
            skipMessage: false,
            parseMode,
            updateMode,
            placement,
            messageOptions,
          }
        : messageOptions
        ? {
            text: '',
            isSaved: true,
            skipMessage: false,
            parseMode,
            updateMode,
            placement,
            messageOptions,
          }
        : null,
    };
    await saveFlow(updatedFlow);
    setIsEditingMessage(false);
  };

  const handleDeleteMessage = async () => {
    await saveFlow({ ...currentFlow, message: null });
    setMessageText('');
    setSkipMessage(false);
    setMessageOptions(undefined);
    setIsEditingMessage(true);
    setShowDeleteMessageModal(false);
  };

  // Media Handlers
  const handleMediaChange = async (newMediaList: MediaItem[]) => {
    await saveFlow({ ...currentFlow, media: newMediaList });
  };

  // Ordered Flow Actions Handlers
  const handleAddFlowAction = async () => {
    const existing = currentFlow.actions || [];
    const parsedPollOptions = newActionPollOptions
      .split(/\n|[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedChecklistTasks = newActionChecklistTasks
      .split(/\n|[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const newAction: FlowAction = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: newActionType,
      enabled: true,
      order: existing.length,
      config: {
        ...(newActionText.trim() ? { text: newActionText.trim() } : {}),
        ...(newActionType === 'jump_to_flow' && newActionTargetFlow
          ? { targetFlowId: newActionTargetFlow }
          : {}),
        ...(newActionType === 'jump_to_page'
          ? { targetPage: Math.max(0, newActionTargetPage) }
          : {}),
        ...(newActionType === 'callback_alert'
          ? { showAlert: newActionShowAlert }
          : {}),
        ...(newActionType === 'send_chat_action'
          ? { chatAction: newActionChatAction }
          : {}),
        ...(newActionType === 'set_reaction'
          ? {
              reactionEmoji: newActionReactionEmoji.trim() || '👍',
              reactionIsBig: newActionReactionIsBig,
            }
          : {}),
        ...(newActionType === 'send_dice'
          ? { diceEmoji: newActionDiceEmoji }
          : {}),
        ...(newActionType === 'send_poll'
          ? {
              pollQuestion: newActionPollQuestion.trim() || 'ما رأيك؟',
              pollOptions:
                parsedPollOptions.length >= 2 ? parsedPollOptions : ['نعم', 'لا'],
              pollType: newActionPollType,
              pollAllowsMultiple:
                newActionPollType === 'regular' ? newActionPollAllowsMultiple : false,
              pollCorrectOptionIndex:
                newActionPollType === 'quiz' ? newActionPollCorrectIdx : undefined,
              pollExplanation:
                newActionPollType === 'quiz' && newActionPollExplanation.trim()
                  ? newActionPollExplanation.trim()
                  : undefined,
            }
          : {}),
        ...(newActionType === 'send_checklist'
          ? {
              checklistTitle: newActionChecklistTitle.trim() || 'قائمة المهام',
              checklistTasks:
                parsedChecklistTasks.length > 0 ? parsedChecklistTasks : ['مهمة 1', 'مهمة 2'],
              checklistOthersCanAdd: true,
              checklistOthersCanMark: true,
            }
          : {}),
      },
    };
    await saveFlow({ ...currentFlow, actions: [...existing, newAction] });
    setNewActionText('');
    setNewActionPollQuestion('');
    setNewActionChecklistTitle('');
  };

  const handleToggleFlowAction = async (actionId: string) => {
    const next = (currentFlow.actions || []).map((a) =>
      a.id === actionId ? { ...a, enabled: !a.enabled } : a
    );
    await saveFlow({ ...currentFlow, actions: next });
  };

  const handleMoveFlowAction = async (idx: number, dir: 'up' | 'down') => {
    const list = [...(currentFlow.actions || [])];
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    await saveFlow({
      ...currentFlow,
      actions: list.map((a, i) => ({ ...a, order: i })),
    });
  };

  const handleDeleteFlowAction = async (actionId: string) => {
    const next = (currentFlow.actions || [])
      .filter((a) => a.id !== actionId)
      .map((a, i) => ({ ...a, order: i }));
    await saveFlow({ ...currentFlow, actions: next });
  };

  // Unified Sub-Button Save Handler
  const handleUnifiedSubSave = async (payload: UnifiedButtonSavePayload) => {
    const { button: savedSubBtn, flow: subFlowPayload, childButtonsToInitialize, goToFlow } =
      payload;

    const currentSubs = [...(currentFlow.subButtons || [])];
    const existingIdx = currentSubs.findIndex((b) => b.id === savedSubBtn.id);
    if (existingIdx !== -1) {
      currentSubs[existingIdx] = savedSubBtn;
    } else {
      currentSubs.push(savedSubBtn);
    }

    const updatedFlows: Record<string, ButtonFlow> = {
      ...(bot.buttonFlows || {}),
      [targetButton.id]: {
        ...currentFlow,
        subButtons: currentSubs,
      },
    };

    if (subFlowPayload) {
      updatedFlows[savedSubBtn.id] = subFlowPayload;
      (childButtonsToInitialize || []).forEach((nested) => {
        if (!updatedFlows[nested.id]) {
          updatedFlows[nested.id] = {
            id: `flow_${nested.id}`,
            buttonId: nested.id,
            parentId: savedSubBtn.id,
            message: null,
            media: [],
            subButtons: [],
          };
        }
      });
    }

    await onUpdateBot({ buttonFlows: updatedFlows });
    setIsAddingSubButton(false);
    setSubBtnToEdit(null);

    if (goToFlow && savedSubBtn.actionType === 'flow' && onNavigateSubFlow) {
      onNavigateSubFlow(savedSubBtn);
    }
  };

  const handleDuplicateSubButton = async (subBtn: BotButton) => {
    const { clonedButton, newFlows } = duplicateButtonWithFlow(bot, subBtn, 'btn_sub');
    const nextPos = computeNextButtonPosition(subButtonsList, currentFlow.layoutSettings);
    const positionedClone = {
      ...clonedButton,
      parentId: targetButton.id,
      row: nextPos.row,
      order: nextPos.order,
    };

    const updatedFlows: Record<string, ButtonFlow> = {
      ...(bot.buttonFlows || {}),
      ...newFlows,
      [targetButton.id]: {
        ...currentFlow,
        subButtons: [...subButtonsList, positionedClone],
      },
    };
    await onUpdateBot({ buttonFlows: updatedFlows });
  };

  const handleDeleteSubButtonConfirm = async () => {
    if (!subBtnToDelete) return;
    const updatedList = (currentFlow.subButtons || []).filter(
      (b) => b.id !== subBtnToDelete.id
    );

    const updatedFlows = { ...(bot.buttonFlows || {}) };
    const idsToRemove = collectDescendantButtonIds(updatedFlows, subBtnToDelete.id);
    idsToRemove.forEach((id) => delete updatedFlows[id]);

    updatedFlows[targetButton.id] = {
      ...currentFlow,
      subButtons: updatedList,
    };

    await onUpdateBot({ buttonFlows: updatedFlows });
    setSubBtnToDelete(null);
  };

  const handleMoveSubButton = async (btnId: string, direction: 'up' | 'down') => {
    const list = [...(currentFlow.subButtons || [])];
    const index = list.findIndex((b) => b.id === btnId);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      [list[index], list[index - 1]] = [list[index - 1], list[index]];
    } else if (direction === 'down' && index < list.length - 1) {
      [list[index], list[index + 1]] = [list[index + 1], list[index]];
    }

    const normalized = list.map((b, idx) => ({ ...b, order: idx }));
    await saveFlow({ ...currentFlow, subButtons: normalized });
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggingSubBtnId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== draggingSubBtnId) setDragOverSubBtnId(id);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = draggingSubBtnId;
    setDraggingSubBtnId(null);
    setDragOverSubBtnId(null);
    if (!sourceId || sourceId === targetId) return;

    const list = [...(currentFlow.subButtons || [])];
    const sourceIndex = list.findIndex((b) => b.id === sourceId);
    const targetIndex = list.findIndex((b) => b.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const [moved] = list.splice(sourceIndex, 1);
    list.splice(targetIndex, 0, moved);
    const normalized = list.map((b, idx) => ({ ...b, order: idx }));
    await saveFlow({ ...currentFlow, subButtons: normalized });
  };

  const handleUpdateMenuNav = async (patch: Partial<MenuNavigationConfig>) => {
    const basePagination = currentFlow.pagination || getDefaultPaginationConfig();
    await saveFlow({
      ...currentFlow,
      pagination: {
        ...basePagination,
        menuNavigation: {
          ...currentMenuNav,
          ...patch,
        },
      },
    });
  };

  const handleUpdateReplySettings = async (patch: Partial<ReplyKeyboardSettings>) => {
    await saveFlow({
      ...currentFlow,
      replyKeyboardSettings: {
        ...(currentFlow.replyKeyboardSettings || {}),
        ...patch,
      },
    });
  };

  const availableFlows = Object.values(bot.buttonFlows || {}).map((f) => ({
    id: f.buttonId,
    title:
      bot.inlineButtons?.find((b) => b.id === f.buttonId)?.text ||
      bot.replyButtons?.find((b) => b.id === f.buttonId)?.text ||
      f.buttonId,
  }));

  const nextSubPos = computeNextButtonPosition(subButtonsList, currentFlow.layoutSettings);
  const hasReplySubs = subButtonsList.some((b) => b.type === 'reply');

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header & Unlimited Depth Breadcrumb Stack */}
      <div className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-sky-700 dark:hover:text-white border border-sky-200 dark:border-transparent transition-colors cursor-pointer"
              title="الرجوع إلى المستوى السابق"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 font-medium">
                <span>محرر التدفقات</span>
                {flowStack.map((btn, idx) => (
                  <React.Fragment key={`${btn.id}_${idx}`}>
                    <span className="text-slate-400 dark:text-slate-600">/</span>
                    {idx === flowStack.length - 1 ? (
                      <span className="text-slate-900 dark:text-slate-200 font-bold">{btn.text}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectStackIndex && onSelectStackIndex(idx)}
                        className="hover:underline text-sky-600 dark:text-sky-400 cursor-pointer"
                      >
                        {btn.text}
                      </button>
                    )}
                  </React.Fragment>
                ))}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/20 font-mono">
                  المستوى {flowStack.length}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                تخصيص كامل للتدفق (الوضع، الرسالة الاختيارية، الوسائط، الإجراءات المتسلسلة، والأزرار المتفرعة بلا حد)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-700 dark:text-slate-300 bg-[#F5F9FD] dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-slate-700">
              {targetButton.type === 'inline' ? 'زر Inline' : 'زر Reply Keyboard'}
            </span>
          </div>
        </div>

        {hasCycleInStack && (
          <div className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            <span>ملاحظة: يظهر هذا التدفق مكرراً في مسار التصفح (انتقال دائري آمن).</span>
          </div>
        )}

        {/* Flow Display Mode Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-sky-200/70 dark:border-slate-800/70">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">وضع تدفق هذا الزر:</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'normal', label: 'عادي' },
                { id: 'paginated', label: 'متعدد الصفحات' },
                { id: 'custom', label: 'مخصص بالإجراءات' },
                { id: 'skip', label: 'تخطي تدفق هذا الزر' },
              ] as { id: FlowMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleFlowModeChange(m.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer transition-all ${
                  (currentFlow.flowMode || 'normal') === m.id
                    ? m.id === 'skip'
                      ? 'bg-amber-600 text-white border-amber-500'
                      : 'bg-sky-600 text-white border-sky-500'
                    : 'bg-[#F5F9FD] dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-sky-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section: Message inside flow (Optional / Skippable) */}
      <div id="flow-message-section" className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-sky-200/80 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                قسم الرسالة المرتبطة بالزر (اختياري)
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                يمكنك كتابة رسالة، تنسيقها بـ HTML/MarkdownV2، أو تخطيها بدون نص افتراضي
              </p>
            </div>
          </div>
        </div>

        {isEditingMessage ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                نص الرسالة التي ستظهر للمستخدم:
              </label>
              <label className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipMessage}
                  onChange={(e) => setSkipMessage(e.target.checked)}
                />
                <span>تخطي الرسالة (بدون نص)</span>
              </label>
            </div>

            {!skipMessage && (
              <textarea
                rows={3}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="اتركه فارغاً للتخطي أو اكتب نص الرسالة المخصصة..."
                className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-xl p-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-sky-500 transition-all resize-none"
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div>
                <span className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1">تنسيق النص:</span>
                <select
                  value={parseMode}
                  onChange={(e) => setParseMode(e.target.value as ParseMode)}
                  className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
                >
                  <option value="none">نص عادي</option>
                  <option value="HTML">HTML</option>
                  <option value="MarkdownV2">MarkdownV2</option>
                </select>
              </div>
              <div>
                <span className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1">وضع الرسالة (Inline):</span>
                <select
                  value={updateMode}
                  onChange={(e) => setUpdateMode(e.target.value as PageUpdateMode)}
                  className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
                >
                  <option value="edit">تحديث نفس الرسالة (Edit)</option>
                  <option value="new">إرسال رسالة جديدة (New)</option>
                </select>
              </div>
              <div>
                <span className="text-[11px] text-slate-600 dark:text-slate-400 block mb-1">ترتيب الوسائط والرسالة:</span>
                <select
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value as any)}
                  className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200"
                >
                  <option value="after_media">الوسائط ثم الرسالة</option>
                  <option value="before_media">الرسالة ثم الوسائط</option>
                </select>
              </div>
            </div>

            <MessageOptionsPanel value={messageOptions} onChange={setMessageOptions} />

            <div className="flex items-center justify-end gap-2">
              {(currentFlow.message?.isSaved || currentFlow.message?.skipMessage) && (
                <button
                  type="button"
                  onClick={() => {
                    setMessageText(currentFlow.message?.text || '');
                    setSkipMessage(Boolean(currentFlow.message?.skipMessage));
                    setMessageOptions(currentFlow.message?.messageOptions);
                    setIsEditingMessage(false);
                  }}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-sky-50 dark:bg-slate-800 border border-sky-200 dark:border-transparent rounded-lg cursor-pointer"
                >
                  إلغاء
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveMessage}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-sm cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>حفظ إعدادات الرسالة</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-[#F5F9FD] dark:bg-slate-950/80 border border-sky-200/80 dark:border-slate-800/80 rounded-xl p-3.5 space-y-2">
              {currentFlow.message?.skipMessage ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  تم اختيار تخطي الرسالة النصية في هذا التدفق (لن يتم إرسال نص افتراضي).
                </p>
              ) : (
                <p className="text-xs text-slate-800 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {currentFlow.message?.text || '(بدون نص — تعتمد على خيارات الرسالة أو الوسائط)'}
                </p>
              )}

              {currentFlow.message?.messageOptions && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {currentFlow.message.messageOptions.messageEffectId && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20">
                      <Sparkles className="w-3 h-3" />
                      <span>
                        تأثير:{' '}
                        {TELEGRAM_MESSAGE_EFFECTS.find(
                          (e) => e.id === currentFlow.message?.messageOptions?.messageEffectId
                        )?.emoji || currentFlow.message.messageOptions.messageEffectId}
                      </span>
                    </span>
                  )}
                  {currentFlow.message.messageOptions.protectContent && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20">
                      <Shield className="w-3 h-3" />
                      <span>محتوى محمي</span>
                    </span>
                  )}
                  {currentFlow.message.messageOptions.disableNotification && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      <BellOff className="w-3 h-3" />
                      <span>إرسال صامت</span>
                    </span>
                  )}
                  {currentFlow.message.messageOptions.linkPreviewOptions?.is_disabled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/20">
                      <Link2 className="w-3 h-3" />
                      <span>معاينة الروابط معطلة</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-sky-200/60 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => {
                  setSubBtnToEdit(null);
                  setIsAddingSubButton(true);
                  document
                    .getElementById('flow-subbuttons-section')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 rounded-lg border border-sky-200 dark:border-sky-500/20 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة أزرار تحت الرسالة</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById('flow-media-section')
                    ?.scrollIntoView({ behavior: 'smooth' })
                }
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-[#F5F9FD] dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 rounded-lg border border-sky-200 dark:border-slate-700/60 cursor-pointer"
              >
                <Image className="w-3.5 h-3.5" />
                <span>إضافة وسائط</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditingMessage(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-[#F5F9FD] dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 rounded-lg border border-sky-200 dark:border-slate-700/60 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>تعديل الرسالة</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteMessageModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg mr-auto cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف الرسالة</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section: Media */}
      <div id="flow-media-section" className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm">
        <MediaUploader
          mediaList={currentFlow.media || []}
          onChange={handleMediaChange}
          title="قسم الوسائط للزر (اختياري)"
          description="إضافة صور أو فيديو أو تسجيل صوتي أو ملف/مستند يظهر عند تشغيل تدفق هذا الزر"
        />
      </div>

      {/* Section: Ordered Multi-Actions */}
      <div id="flow-actions-section" className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-sky-200/80 dark:border-slate-800/80">
          <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              تسلسل الإجراءات المتعددة (Flow Actions - اختياري)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              يمكن تنفيذ عدة إجراءات بالترتيب عند الضغط على الزر (حذف رسالة، إرسال نص، وسائط، انتقال لصفحة أو تدفق، أو إزالة الكيبورد)
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-2">
            <select
              value={newActionType}
              onChange={(e) => setNewActionType(e.target.value as FlowActionType)}
              className="bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
            >
              {FLOW_ACTION_LABELS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>

            {newActionType === 'jump_to_flow' && (
              <select
                value={newActionTargetFlow}
                onChange={(e) => setNewActionTargetFlow(e.target.value)}
                className="bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
              >
                <option value="">اختر التدفق الهدف...</option>
                {availableFlows.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </select>
            )}

            {newActionType === 'jump_to_page' && (
              <input
                type="number"
                min={1}
                value={newActionTargetPage + 1}
                onChange={(e) => setNewActionTargetPage(Math.max(0, Number(e.target.value) - 1))}
                className="w-20 bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono"
                placeholder="صفحة"
              />
            )}

            {newActionType === 'send_chat_action' && (
              <select
                value={newActionChatAction}
                onChange={(e) => setNewActionChatAction(e.target.value as ChatActionKind)}
                className="bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
              >
                {CHAT_ACTION_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}

            {newActionType === 'send_dice' && (
              <select
                value={newActionDiceEmoji}
                onChange={(e) => setNewActionDiceEmoji(e.target.value as DiceEmojiKind)}
                className="bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200"
              >
                {DICE_EMOJI_OPTIONS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}

            {newActionType !== 'send_poll' &&
              newActionType !== 'send_checklist' &&
              newActionType !== 'send_dice' &&
              newActionType !== 'send_chat_action' && (
                <input
                  type="text"
                  value={newActionText}
                  onChange={(e) => setNewActionText(e.target.value)}
                  placeholder={
                    newActionType === 'callback_alert'
                      ? 'نص التنبيه المنبثق...'
                      : newActionType === 'send_draft_stream'
                      ? 'اكتب النص الطويل للبث المتدرج...'
                      : 'نص أو تلميح اختياري للإجراء...'
                  }
                  className="flex-1 min-w-[160px] bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
              )}

            <button
              type="button"
              onClick={handleAddFlowAction}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة إجراء</span>
            </button>
          </div>

          {newActionType === 'callback_alert' && (
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newActionShowAlert}
                onChange={(e) => setNewActionShowAlert(e.target.checked)}
              />
              <span>إظهار كـ نافذة منبثقة (show_alert: true) بدلاً من شريط علوي مختصر</span>
            </label>
          )}

          {newActionType === 'set_reaction' && (
            <div className="p-3 rounded-xl bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-slate-600 dark:text-slate-400">إيموجي التفاعل:</span>
              <div className="flex items-center gap-1 flex-wrap">
                {REACTION_PRESETS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setNewActionReactionEmoji(em)}
                    className={`px-2 py-0.5 rounded border cursor-pointer text-sm ${
                      newActionReactionEmoji === em
                        ? 'bg-sky-600 text-white border-sky-500'
                        : 'bg-white dark:bg-slate-900 border-sky-200 dark:border-slate-700'
                    }`}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={newActionReactionEmoji}
                onChange={(e) => setNewActionReactionEmoji(e.target.value)}
                className="w-16 text-center bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1 text-sm"
                aria-label="إيموجي التفاعل المخصص"
              />
              <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newActionReactionIsBig}
                  onChange={(e) => setNewActionReactionIsBig(e.target.checked)}
                />
                <span>تفاعل كبير (is_big)</span>
              </label>
            </div>
          )}

          {newActionType === 'send_poll' && (
            <div className="p-3 rounded-xl bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 space-y-2.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">سؤال الاستطلاع / الاختبار:</label>
                  <input
                    type="text"
                    value={newActionPollQuestion}
                    onChange={(e) => setNewActionPollQuestion(e.target.value)}
                    placeholder="مثال: ما تقييمك لخدمتنا؟"
                    className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">النوع:</label>
                  <select
                    value={newActionPollType}
                    onChange={(e) => setNewActionPollType(e.target.value as 'regular' | 'quiz')}
                    className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  >
                    <option value="regular">استطلاع عادي (regular)</option>
                    <option value="quiz">اختبار بإجابة صحيحة (quiz)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">الخيارات (سطر لكل خيار أو مفصولة بفاصلة):</label>
                <textarea
                  rows={2}
                  value={newActionPollOptions}
                  onChange={(e) => setNewActionPollOptions(e.target.value)}
                  placeholder="ممتاز&#10;جيد جداً&#10;مقبول"
                  className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              {newActionPollType === 'regular' ? (
                <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newActionPollAllowsMultiple}
                    onChange={(e) => setNewActionPollAllowsMultiple(e.target.checked)}
                  />
                  <span>السماح باختيار عدة إجابات (allows_multiple_answers)</span>
                </label>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">رقم الإجابة الصحيحة (يبدأ من 1):</label>
                    <input
                      type="number"
                      min={1}
                      value={newActionPollCorrectIdx + 1}
                      onChange={(e) => setNewActionPollCorrectIdx(Math.max(0, Number(e.target.value) - 1))}
                      className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">توضيح الإجابة (اختياري):</label>
                    <input
                      type="text"
                      value={newActionPollExplanation}
                      onChange={(e) => setNewActionPollExplanation(e.target.value)}
                      placeholder="سبب صحة الإجابة..."
                      className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {newActionType === 'send_checklist' && (
            <div className="p-3 rounded-xl bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 space-y-2 text-xs">
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">عنوان قائمة المهام (Bot API 9.2+):</label>
                <input
                  type="text"
                  value={newActionChecklistTitle}
                  onChange={(e) => setNewActionChecklistTitle(e.target.value)}
                  placeholder="مثال: خطوات تفعيل الاشتراك"
                  className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">المهام (سطر لكل مهمة):</label>
                <textarea
                  rows={2}
                  value={newActionChecklistTasks}
                  onChange={(e) => setNewActionChecklistTasks(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}
        </div>

        {(currentFlow.actions || []).length > 0 && (
          <div className="space-y-2">
            {(currentFlow.actions || []).map((act, idx) => (
              <div
                key={act.id}
                className={`flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F5F9FD] dark:bg-slate-950 border text-xs ${
                  act.enabled ? 'border-sky-200 dark:border-slate-800' : 'border-sky-100 dark:border-slate-900 opacity-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <input
                    type="checkbox"
                    checked={act.enabled}
                    onChange={() => handleToggleFlowAction(act.id)}
                  />
                  <span className="font-mono text-slate-500">#{idx + 1}</span>
                  <span className="font-semibold text-sky-700 dark:text-sky-300">
                    {FLOW_ACTION_LABELS.find((l) => l.id === act.type)?.label || act.type}
                  </span>
                  {act.config?.text && (
                    <span className="text-slate-600 dark:text-slate-400 truncate max-w-[180px]">
                      — {act.config.text}
                    </span>
                  )}
                  {act.type === 'callback_alert' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/20">
                      {act.config?.showAlert ? 'منبثق Alert' : 'إشعار علوي'}
                    </span>
                  )}
                  {act.type === 'send_chat_action' && act.config?.chatAction && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/20 font-mono">
                      {act.config.chatAction}
                    </span>
                  )}
                  {act.type === 'set_reaction' && act.config?.reactionEmoji && (
                    <span className="text-sm">{act.config.reactionEmoji}</span>
                  )}
                  {act.type === 'send_dice' && act.config?.diceEmoji && (
                    <span className="text-sm">{act.config.diceEmoji}</span>
                  )}
                  {act.type === 'send_poll' && act.config?.pollQuestion && (
                    <span className="text-slate-600 dark:text-slate-400 truncate max-w-[180px]">
                      — {act.config.pollQuestion} ({act.config.pollOptions?.length || 0} خيارات)
                    </span>
                  )}
                  {act.type === 'send_checklist' && act.config?.checklistTitle && (
                    <span className="text-slate-600 dark:text-slate-400 truncate max-w-[180px]">
                      — {act.config.checklistTitle} ({act.config.checklistTasks?.length || 0} مهام)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMoveFlowAction(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveFlowAction(idx, 'down')}
                    disabled={idx === (currentFlow.actions || []).length - 1}
                    className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteFlowAction(act.id)}
                    className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section: Direct Menu Navigation Controls (Back / Main Menu optional!) */}
      <div className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-sky-200/80 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              أزرار الرجوع والقائمة الرئيسية لهذا التدفق
            </h3>
          </div>
          <select
            value={currentMenuNav.backTarget || 'previous'}
            onChange={(e) =>
              handleUpdateMenuNav({ backTarget: e.target.value as 'previous' | 'parent' })
            }
            className="bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-800 dark:text-slate-200"
          >
            <option value="previous">زر الرجوع يعيد للخطوة السابقة (History)</option>
            <option value="parent">زر الرجوع يعيد للقائمة الأب مباشرة</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 space-y-2">
            <label className="flex items-center justify-between cursor-pointer text-slate-700 dark:text-slate-300">
              <span>إظهار زر العودة للقائمة السابقة</span>
              <input
                type="checkbox"
                checked={currentMenuNav.showBackButton}
                onChange={(e) => handleUpdateMenuNav({ showBackButton: e.target.checked })}
              />
            </label>
            {currentMenuNav.showBackButton && (
              <input
                type="text"
                value={currentMenuNav.backButtonText}
                onChange={(e) => handleUpdateMenuNav({ backButtonText: e.target.value })}
                className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
              />
            )}
          </div>

          <div className="p-3 rounded-xl bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 space-y-2">
            <label className="flex items-center justify-between cursor-pointer text-slate-700 dark:text-slate-300">
              <span>إظهار زر القائمة الرئيسية</span>
              <input
                type="checkbox"
                checked={currentMenuNav.showMainMenuButton}
                onChange={(e) =>
                  handleUpdateMenuNav({ showMainMenuButton: e.target.checked })
                }
              />
            </label>
            {currentMenuNav.showMainMenuButton && (
              <input
                type="text"
                value={currentMenuNav.mainMenuButtonText}
                onChange={(e) =>
                  handleUpdateMenuNav({ mainMenuButtonText: e.target.value })
                }
                className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
              />
            )}
          </div>
        </div>

        {/* Reply Keyboard Settings when flow has reply buttons or custom keyboard control */}
        {(hasReplySubs ||
          currentFlow.replyKeyboardSettings?.removeKeyboard ||
          currentFlow.replyKeyboardSettings?.forceReply) && (
          <div className="p-3.5 rounded-xl bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 space-y-2.5 text-xs">
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-semibold">
              <Keyboard className="w-3.5 h-3.5" />
              <span>خصائص لوحة Reply Keyboard لهذا المستوى</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentFlow.replyKeyboardSettings?.resizeKeyboard ?? true}
                  onChange={(e) =>
                    handleUpdateReplySettings({ resizeKeyboard: e.target.checked })
                  }
                />
                <span>resize_keyboard</span>
              </label>
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentFlow.replyKeyboardSettings?.oneTimeKeyboard ?? false}
                  onChange={(e) =>
                    handleUpdateReplySettings({ oneTimeKeyboard: e.target.checked })
                  }
                />
                <span>one_time_keyboard</span>
              </label>
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentFlow.replyKeyboardSettings?.isPersistent ?? false}
                  onChange={(e) =>
                    handleUpdateReplySettings({ isPersistent: e.target.checked })
                  }
                />
                <span>is_persistent</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Section: Sub-Buttons (Unlimited Recursion via UnifiedButtonForm) */}
      <div id="flow-subbuttons-section" className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 mb-4 border-b border-sky-200/80 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                قسم الأزرار الفرعية ({subButtonsList.length} زر)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                يمتلك كل زر فرعي نفس قدرات الزر الرئيسي بالكامل وبعمق تداخل لا نهائي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsPaginationModalOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                currentFlow.pagination?.enabled
                  ? 'bg-amber-50 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 hover:bg-amber-100 dark:hover:bg-amber-500/30'
                  : 'bg-[#F5F9FD] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-sky-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>تقسيم الصفحات</span>
              {currentFlow.pagination?.enabled && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 dark:bg-amber-500/30 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-400/40">
                  {totalSubPages} ص
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsRowArrangerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-[#F5F9FD] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-sky-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:text-white cursor-pointer transition-colors"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>ترتيب الصفوف</span>
            </button>

            {subButtonsList.length > 1 && (
              <button
                type="button"
                onClick={() => setIsReordering(!isReordering)}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                  isReordering
                    ? 'bg-sky-600 text-white border-sky-500'
                    : 'bg-[#F5F9FD] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-sky-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:text-white'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                <span>{isReordering ? 'إنهاء الترتيب' : 'ترتيب الأزرار بالسحب'}</span>
              </button>
            )}

            {!isAddingSubButton && !subBtnToEdit && (
              <button
                type="button"
                onClick={() => {
                  setSubBtnToEdit(null);
                  setIsAddingSubButton(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة زر فرعي</span>
              </button>
            )}
          </div>
        </div>

        {/* Unified Form for Sub-Buttons */}
        {(isAddingSubButton || subBtnToEdit) && (
          <UnifiedButtonForm
            key={subBtnToEdit?.id || `new_sub_${targetButton.id}`}
            mode="sub"
            buttonToEdit={subBtnToEdit}
            existingFlow={subBtnToEdit ? bot.buttonFlows?.[subBtnToEdit.id] : null}
            defaultButtonType={targetButton.type === 'reply' ? 'reply' : 'inline'}
            nextPosition={nextSubPos}
            parentId={targetButton.id}
            allFlows={bot.buttonFlows}
            bot={bot}
            onCancel={() => {
              setIsAddingSubButton(false);
              setSubBtnToEdit(null);
            }}
            onSave={handleUnifiedSubSave}
          />
        )}

        {/* Sub-buttons List */}
        {subButtonsList.length === 0 ? (
          <div className="text-center py-6 px-4 bg-[#F5F9FD] dark:bg-slate-950/40 border border-sky-200/70 dark:border-slate-800/60 rounded-xl">
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
              لا توجد أزرار فرعية منشأة داخل هذا التدفق.
            </p>
            <button
              type="button"
              onClick={() => {
                setSubBtnToEdit(null);
                setIsAddingSubButton(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 rounded-lg border border-sky-200 dark:border-sky-500/20 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة أول زر فرعي</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2.5">
              {subButtonsList.map((subBtn, idx) => {
                const colorClass = getButtonColorClasses(subBtn.style || subBtn.color, false);
                const isDragging = draggingSubBtnId === subBtn.id;
                const isOver = dragOverSubBtnId === subBtn.id;

                const subFlow = bot.buttonFlows?.[subBtn.id];
                const hasSubMessage = Boolean(subFlow?.message?.text?.trim());
                const subMediaCount = subFlow?.media?.length || 0;
                const subNestedCount = subFlow?.subButtons?.length || 0;
                const subActionsCount = subFlow?.actions?.length || 0;

                return (
                  <div
                    key={subBtn.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, subBtn.id)}
                    onDragOver={(e) => handleDragOver(e, subBtn.id)}
                    onDrop={(e) => handleDrop(e, subBtn.id)}
                    onDragEnd={() => {
                      setDraggingSubBtnId(null);
                      setDragOverSubBtnId(null);
                    }}
                    className={`bg-[#F5F9FD] dark:bg-slate-950 border rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group transition-all cursor-grab active:cursor-grabbing ${
                      isOver
                        ? 'border-sky-500 ring-2 ring-sky-500/20 bg-sky-50 dark:bg-sky-950/30'
                        : isDragging
                        ? 'opacity-40 border-sky-300 dark:border-slate-700'
                        : 'border-sky-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <GripVertical className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400 shrink-0" />
                      <span className="text-[11px] text-slate-500 tabular-nums">#{idx + 1}</span>
                      <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border ${colorClass}`}>
                        {subBtn.text}
                      </span>
                      <span className="text-[10px] text-slate-500">({subBtn.type})</span>
                      {subBtn.actionType !== 'flow' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/20 font-mono">
                          {subBtn.actionType}
                        </span>
                      )}
                      {typeof subBtn.row === 'number' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-sky-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                          صف {subBtn.row + 1}
                        </span>
                      )}
                      {currentFlow.pagination?.mode === 'manual' &&
                        typeof subBtn.pageIndex === 'number' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-300">
                            صفحة {subBtn.pageIndex + 1}
                          </span>
                        )}

                      <div className="flex items-center gap-1.5 flex-wrap mr-1">
                        {hasSubMessage && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                            <MessageSquare className="w-2.5 h-2.5" />
                            <span>رسالة</span>
                          </span>
                        )}
                        {subMediaCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
                            <Image className="w-2.5 h-2.5" />
                            <span>{subMediaCount} وسائط</span>
                          </span>
                        )}
                        {subActionsCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20">
                            <Zap className="w-2.5 h-2.5" />
                            <span>{subActionsCount} إجراءات</span>
                          </span>
                        )}
                        {subNestedCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20">
                            <Layers className="w-2.5 h-2.5" />
                            <span>{subNestedCount} أزرار فرعية</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mr-auto sm:mr-0">
                      {isReordering ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveSubButton(subBtn.id, 'up')}
                            disabled={idx === 0}
                            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-sky-100 dark:hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveSubButton(subBtn.id, 'down')}
                            disabled={idx === subButtonsList.length - 1}
                            className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-sky-100 dark:hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          {onNavigateSubFlow && subBtn.actionType === 'flow' && (
                            <button
                              type="button"
                              aria-label={`تحرير التدفق بالكامل لـ ${subBtn.text}`}
                              onClick={() => onNavigateSubFlow(subBtn)}
                              className="px-2.5 py-1 rounded-lg text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-white bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/25 border border-sky-200 dark:border-sky-500/25 cursor-pointer flex items-center gap-1.5 text-xs font-medium transition-colors"
                            >
                              <Workflow className="w-3.5 h-3.5" />
                              <span>تحرير التدفق بالكامل</span>
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDuplicateSubButton(subBtn)}
                            title="تكرار الزر الفرعي وتدفقه"
                            aria-label={`تكرار الزر ${subBtn.text}`}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300 hover:bg-sky-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingSubButton(false);
                              setSubBtnToEdit(subBtn);
                            }}
                            title="تعديل بيانات وتدفق الزر الفرعي"
                            aria-label={`تعديل الزر ${subBtn.text}`}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-sky-100 dark:hover:bg-slate-800 cursor-pointer border border-transparent hover:border-sky-200 dark:hover:border-slate-700"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSubBtnToDelete(subBtn)}
                            title="حذف"
                            aria-label={`حذف الزر ${subBtn.text}`}
                            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <ConfirmModal
        isOpen={showDeleteMessageModal}
        title="تأكيد حذف رسالة التدفق"
        message="هل أنت متأكد من أنك تريد حذف هذه الرسالة من التدفق؟"
        confirmLabel="نعم، حذف الرسالة"
        cancelLabel="لا"
        onConfirm={handleDeleteMessage}
        onCancel={() => setShowDeleteMessageModal(false)}
      />

      <ConfirmModal
        isOpen={!!subBtnToDelete}
        title="تأكيد حذف الزر الفرعي"
        message={`هل أنت متأكد من أنك تريد حذف الزر الفرعي "${subBtnToDelete?.text}"؟`}
        confirmLabel="نعم، حذف"
        cancelLabel="لا"
        onConfirm={handleDeleteSubButtonConfirm}
        onCancel={() => setSubBtnToDelete(null)}
      />

      <PaginationSettingsModal
        isOpen={isPaginationModalOpen}
        onClose={() => setIsPaginationModalOpen(false)}
        config={currentFlow.pagination}
        buttons={subButtonsList}
        isSubMenu={true}
        availableFlows={availableFlows}
        menuTitle={`قائمة الأزرار الفرعية (${targetButton.text})`}
        onSave={async (newConfig, updatedButtons) => {
          await saveFlow({
            ...currentFlow,
            pagination: newConfig,
            subButtons: updatedButtons || currentFlow.subButtons || [],
          });
          setIsPaginationModalOpen(false);
        }}
      />

      <RowArrangerModal
        isOpen={isRowArrangerOpen}
        onClose={() => setIsRowArrangerOpen(false)}
        buttons={subButtonsList}
        title={`الأزرار الفرعية (${targetButton.text})`}
        onSave={async (arrangedButtons) => {
          await saveFlow({
            ...currentFlow,
            subButtons: arrangedButtons,
          });
          setIsRowArrangerOpen(false);
        }}
      />
    </div>
  );
};
