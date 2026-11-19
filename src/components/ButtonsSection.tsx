import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  Edit2,
  Workflow,
  ChevronLeft,
  Move,
  Sliders,
  LayoutGrid,
  Copy,
  Keyboard,
} from 'lucide-react';
import {
  BotButton,
  BotConfig,
  ButtonType,
  ButtonFlow,
  PaginationConfig,
} from '../types/bot';
import { ConfirmModal } from './ConfirmModal';
import {
  collectDescendantButtonIds,
  computeNextButtonPosition,
  duplicateButtonWithFlow,
  getButtonColorClasses,
} from '../utils/telegramFormatters';
import { PaginationSettingsModal } from './PaginationSettingsModal';
import { RowArrangerModal } from './RowArrangerModal';
import { computeTotalPages } from '../utils/pagination';
import { UnifiedButtonForm, UnifiedButtonSavePayload } from './UnifiedButtonForm';

interface ButtonsSectionProps {
  bot: BotConfig;
  onUpdateBot: (updates: Partial<BotConfig>) => Promise<void>;
  onOpenFlow: (button: BotButton) => void;
}

export const ButtonsSection: React.FC<ButtonsSectionProps> = ({
  bot,
  onUpdateBot,
  onOpenFlow,
}) => {
  const [activeTab, setActiveTab] = useState<ButtonType>('inline');
  const [isAdding, setIsAdding] = useState(false);
  const [buttonToEdit, setButtonToEdit] = useState<BotButton | null>(null);
  const [buttonToDelete, setButtonToDelete] = useState<BotButton | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [isPaginationModalOpen, setIsPaginationModalOpen] = useState(false);
  const [isRowArrangerOpen, setIsRowArrangerOpen] = useState(false);
  const [showReplySettings, setShowReplySettings] = useState(false);

  const resetForm = () => {
    setIsAdding(false);
    setButtonToEdit(null);
  };

  const handleStartAdd = () => {
    setButtonToEdit(null);
    setIsAdding(true);
  };

  const handleStartEdit = (btn: BotButton) => {
    setIsAdding(false);
    setButtonToEdit(btn);
  };

  const handleUnifiedSave = async (payload: UnifiedButtonSavePayload) => {
    const { button: savedBtn, flow, childButtonsToInitialize, goToFlow } = payload;

    let inlineList = [...(bot.inlineButtons || [])];
    let replyList = [...(bot.replyButtons || [])];

    // Remove from both lists if editing (handles switching between inline <-> reply cleanly)
    inlineList = inlineList.filter((b) => b.id !== savedBtn.id);
    replyList = replyList.filter((b) => b.id !== savedBtn.id);

    if (savedBtn.type === 'inline') {
      if (buttonToEdit && buttonToEdit.type === 'inline') {
        const origIdx = (bot.inlineButtons || []).findIndex((b) => b.id === savedBtn.id);
        if (origIdx !== -1) inlineList.splice(origIdx, 0, savedBtn);
        else inlineList.push(savedBtn);
      } else {
        inlineList.push(savedBtn);
      }
    } else {
      if (buttonToEdit && buttonToEdit.type === 'reply') {
        const origIdx = (bot.replyButtons || []).findIndex((b) => b.id === savedBtn.id);
        if (origIdx !== -1) replyList.splice(origIdx, 0, savedBtn);
        else replyList.push(savedBtn);
      } else {
        replyList.push(savedBtn);
      }
    }

    const updatedFlows: Record<string, ButtonFlow> = { ...(bot.buttonFlows || {}) };
    if (flow) {
      updatedFlows[savedBtn.id] = flow;
      (childButtonsToInitialize || []).forEach((sub) => {
        if (!updatedFlows[sub.id]) {
          updatedFlows[sub.id] = {
            id: `flow_${sub.id}`,
            buttonId: sub.id,
            parentId: savedBtn.id,
            message: null,
            media: [],
            subButtons: [],
          };
        }
      });
    }

    await onUpdateBot({
      inlineButtons: inlineList,
      replyButtons: replyList,
      buttonFlows: updatedFlows,
    });

    setActiveTab(savedBtn.type);
    resetForm();

    if (goToFlow && savedBtn.actionType === 'flow') {
      onOpenFlow(savedBtn);
    }
  };

  const handleDuplicateButton = async (btn: BotButton) => {
    const { clonedButton, newFlows } = duplicateButtonWithFlow(bot, btn, 'btn');
    const isInline = clonedButton.type === 'inline';
    const currentList = isInline ? [...(bot.inlineButtons || [])] : [...(bot.replyButtons || [])];
    const nextPos = computeNextButtonPosition(
      currentList,
      isInline ? bot.inlineLayoutSettings : bot.replyLayoutSettings
    );
    const positionedClone = { ...clonedButton, row: nextPos.row, order: nextPos.order };

    await onUpdateBot({
      ...(isInline
        ? { inlineButtons: [...currentList, positionedClone] }
        : { replyButtons: [...currentList, positionedClone] }),
      buttonFlows: {
        ...(bot.buttonFlows || {}),
        ...newFlows,
      },
    });
  };

  const handleDeleteConfirm = async () => {
    if (!buttonToDelete) return;
    const isInline = buttonToDelete.type === 'inline';
    const list = isInline ? bot.inlineButtons || [] : bot.replyButtons || [];
    const updatedList = list.filter((b) => b.id !== buttonToDelete.id);

    // Cycle-safe cascading cleanup of all nested descendant flows
    const updatedFlows = { ...(bot.buttonFlows || {}) };
    const idsToRemove = collectDescendantButtonIds(updatedFlows, buttonToDelete.id);
    idsToRemove.forEach((id) => delete updatedFlows[id]);

    if (isInline) {
      await onUpdateBot({
        inlineButtons: updatedList,
        buttonFlows: updatedFlows,
      });
    } else {
      await onUpdateBot({
        replyButtons: updatedList,
        buttonFlows: updatedFlows,
      });
    }

    setButtonToDelete(null);
  };

  const handleMoveButton = async (btnId: string, direction: 'up' | 'down') => {
    const list =
      activeTab === 'inline'
        ? [...(bot.inlineButtons || [])]
        : [...(bot.replyButtons || [])];
    const index = list.findIndex((b) => b.id === btnId);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      [list[index], list[index - 1]] = [list[index - 1], list[index]];
    } else if (direction === 'down' && index < list.length - 1) {
      [list[index], list[index + 1]] = [list[index + 1], list[index]];
    }

    const normalized = list.map((b, idx) => ({ ...b, order: idx }));
    if (activeTab === 'inline') {
      await onUpdateBot({ inlineButtons: normalized });
    } else {
      await onUpdateBot({ replyButtons: normalized });
    }
  };

  const currentButtons =
    activeTab === 'inline' ? bot.inlineButtons || [] : bot.replyButtons || [];

  const currentPagination: PaginationConfig | undefined =
    activeTab === 'inline' ? bot.inlinePagination : bot.replyPagination;

  const totalPages = computeTotalPages(currentButtons, currentPagination);

  const nextPos = computeNextButtonPosition(
    currentButtons,
    activeTab === 'inline' ? bot.inlineLayoutSettings : bot.replyLayoutSettings
  );

  const availableFlows = Object.values(bot.buttonFlows || {}).map((f) => ({
    id: f.buttonId,
    title:
      bot.inlineButtons?.find((b) => b.id === f.buttonId)?.text ||
      bot.replyButtons?.find((b) => b.id === f.buttonId)?.text ||
      f.buttonId,
  }));

  const describeAction = (btn: BotButton, flow?: ButtonFlow) => {
    switch (btn.actionType) {
      case 'url':
        return <span className="text-sky-600 dark:text-sky-400 truncate max-w-[170px]">رابط: {btn.url}</span>;
      case 'web_app':
        return <span className="text-purple-600 dark:text-purple-400 truncate max-w-[170px]">Web App: {btn.webAppUrl}</span>;
      case 'login_url':
        return <span className="text-cyan-700 dark:text-cyan-400">تسجيل دخول Login URL</span>;
      case 'copy_text':
        return <span className="text-indigo-600 dark:text-indigo-400">نسخ: {btn.copyText}</span>;
      case 'switch_inline_query':
      case 'switch_inline_query_current_chat':
      case 'switch_inline_query_chosen_chat':
        return <span className="text-sky-700 dark:text-sky-300">بحث Inline Query</span>;
      case 'callback_game':
        return <span className="text-amber-700 dark:text-amber-300">لعبة (Game)</span>;
      case 'pay':
        return <span className="text-emerald-700 dark:text-emerald-300">دفع (Pay)</span>;
      case 'request_contact':
        return <span className="text-emerald-600 dark:text-emerald-400">مشاركة الهاتف</span>;
      case 'request_location':
        return <span className="text-amber-600 dark:text-amber-400">مشاركة الموقع</span>;
      case 'request_poll':
        return <span className="text-amber-700 dark:text-amber-300">طلب استطلاع Poll</span>;
      case 'request_users':
        return <span className="text-sky-700 dark:text-sky-300">طلب مستخدمين</span>;
      case 'request_chat':
        return <span className="text-sky-700 dark:text-sky-300">طلب محادثة/قناة</span>;
      case 'none':
        return <span className="text-slate-500">بدون إجراء</span>;
      default: {
        if (btn.skipFlow || flow?.flowMode === 'skip') {
          return <span className="text-amber-600 dark:text-amber-400">تدفق متخطى</span>;
        }
        const hasFlowContent =
          !!flow?.message?.isSaved ||
          (flow?.media && flow.media.length > 0) ||
          (flow?.subButtons && flow.subButtons.length > 0) ||
          (flow?.actions && flow.actions.length > 0);
        return (
          <span className={hasFlowContent ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-500 dark:text-slate-400'}>
            {hasFlowContent ? 'تدفق معد' : 'تدفق فارغ'}
          </span>
        );
      }
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800 rounded-2xl p-6 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-sm" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 mb-6 border-b border-sky-100 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">أزرار تيليجرام</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              إنشاء وإدارة أزرار Inline وأزرار Reply Keyboard مع تدفقات متداخلة بلا حد
            </p>
          </div>
        </div>

        {/* Tab switch between Inline & Reply */}
        <div className="flex items-center p-1 bg-sky-50/90 dark:bg-slate-950 rounded-xl border border-sky-200/80 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              setActiveTab('inline');
              resetForm();
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'inline'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            أزرار Inline ({bot.inlineButtons?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('reply');
              resetForm();
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'reply'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            أزرار Reply Keyboard ({bot.replyButtons?.length || 0})
          </button>
        </div>
      </div>

      {/* Unified Form for Top-Level Buttons */}
      {(isAdding || buttonToEdit) && (
        <UnifiedButtonForm
          key={buttonToEdit?.id || `new_top_${activeTab}`}
          mode="top"
          buttonToEdit={buttonToEdit}
          existingFlow={buttonToEdit ? bot.buttonFlows?.[buttonToEdit.id] : null}
          defaultButtonType={activeTab}
          nextPosition={nextPos}
          parentId={null}
          allFlows={bot.buttonFlows}
          bot={bot}
          onCancel={resetForm}
          onSave={handleUnifiedSave}
        />
      )}

      {/* Reply Keyboard Global Settings Panel */}
      {activeTab === 'reply' && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowReplySettings((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 hover:text-sky-800 dark:hover:text-white bg-sky-50 dark:bg-slate-950 border border-sky-200 dark:border-slate-800 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
          >
            <Keyboard className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span>إعدادات لوحة Reply Keyboard العامة</span>
          </button>

          {showReplySettings && (
            <div className="mt-2 p-4 rounded-xl bg-[#F5F9FD] dark:bg-slate-950/80 border border-sky-200/80 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bot.settings?.resizeKeyboard ?? true}
                  onChange={(e) =>
                    onUpdateBot({
                      settings: { ...(bot.settings || {}), resizeKeyboard: e.target.checked },
                    })
                  }
                />
                <span>ضغط حجم اللوحة (resize_keyboard)</span>
              </label>

              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bot.settings?.oneTimeKeyboard ?? false}
                  onChange={(e) =>
                    onUpdateBot({
                      settings: { ...(bot.settings || {}), oneTimeKeyboard: e.target.checked },
                    })
                  }
                />
                <span>إخفاء تلقائي بعد الاختيار (one_time)</span>
              </label>

              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bot.settings?.isPersistent ?? false}
                  onChange={(e) =>
                    onUpdateBot({
                      settings: { ...(bot.settings || {}), isPersistent: e.target.checked },
                    })
                  }
                />
                <span>لوحة دائمة (is_persistent)</span>
              </label>

              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bot.settings?.selective ?? false}
                  onChange={(e) =>
                    onUpdateBot({
                      settings: { ...(bot.settings || {}), selective: e.target.checked },
                    })
                  }
                />
                <span>انتقائية لمستخدمين محددين (selective)</span>
              </label>

              <div className="sm:col-span-2 flex items-center gap-2">
                <span className="text-slate-600 dark:text-slate-400 shrink-0">النص التلميحي:</span>
                <input
                  type="text"
                  value={bot.settings?.inputFieldPlaceholder || ''}
                  onChange={(e) =>
                    onUpdateBot({
                      settings: {
                        ...(bot.settings || {}),
                        inputFieldPlaceholder: e.target.value || undefined,
                      },
                    })
                  }
                  placeholder="اختر من القائمة..."
                  className="flex-1 bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-sky-500"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Button list or empty state */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {activeTab === 'inline' ? 'قائمة أزرار Inline' : 'قائمة أزرار Reply Keyboard'}
          </h3>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsPaginationModalOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                currentPagination?.enabled
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                  : 'bg-sky-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-sky-200 dark:border-slate-700 hover:bg-sky-100 dark:hover:bg-slate-700 hover:text-sky-800 dark:hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>
                {currentPagination?.enabled
                  ? `تقسيم الصفحات (مفعل: ${totalPages} ص)`
                  : 'تقسيم الصفحات والتنقل'}
              </span>
            </button>

            {currentButtons.length > 0 && (
              <button
                type="button"
                onClick={() => setIsRowArrangerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-sky-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-sky-200 dark:border-slate-700 hover:bg-sky-100 dark:hover:bg-slate-700 hover:text-sky-800 dark:hover:text-white transition-colors cursor-pointer"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span>ترتيب الصفوف المختلطة</span>
              </button>
            )}

            {currentButtons.length > 1 && (
              <button
                type="button"
                onClick={() => setIsReordering(!isReordering)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  isReordering
                    ? 'bg-sky-600 text-white border-sky-500'
                    : 'bg-sky-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-sky-200 dark:border-slate-700 hover:bg-sky-100 dark:hover:bg-slate-700 hover:text-sky-800 dark:hover:text-white'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                <span>{isReordering ? 'إنهاء الترتيب' : 'ترتيب سريع'}</span>
              </button>
            )}

            {!isAdding && !buttonToEdit && (
              <button
                type="button"
                onClick={handleStartAdd}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  {activeTab === 'inline' ? 'إضافة زر Inline' : 'إضافة زر Reply Keyboard'}
                </span>
              </button>
            )}
          </div>
        </div>

        {currentButtons.length === 0 ? (
          <div className="text-center py-8 px-4 bg-[#F5F9FD] dark:bg-slate-950/40 border border-sky-200/75 dark:border-slate-800/80 rounded-xl">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              {activeTab === 'inline'
                ? 'لا توجد أزرار Inline منشأة بعد.'
                : 'لا توجد أزرار Reply Keyboard منشأة بعد.'}
            </p>
            <button
              type="button"
              onClick={handleStartAdd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 rounded-lg transition-colors border border-sky-200 dark:border-sky-500/20 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>
                {activeTab === 'inline' ? 'إضافة زر Inline' : 'إضافة زر Reply Keyboard'}
              </span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {currentButtons.map((btn, idx) => {
              const flow = bot.buttonFlows?.[btn.id];
              const colorClass = getButtonColorClasses(btn.style || btn.color, false);

              return (
                <div
                  key={btn.id}
                  className="bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200/80 dark:border-slate-800 hover:border-sky-300 dark:hover:border-slate-700/80 rounded-xl p-3.5 flex flex-col justify-between group transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-500 tabular-nums">#{idx + 1}</span>
                        <div className={`px-3 py-1 rounded-lg text-xs font-semibold border ${colorClass}`}>
                          {btn.text}
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                          صف {(btn.row ?? 0) + 1}
                        </span>
                        {currentPagination?.enabled && currentPagination.mode === 'manual' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800/60">
                            صفحة {(btn.pageIndex ?? 0) + 1}
                          </span>
                        )}
                        {btn.style && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                            style: "{btn.style}"
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {isReordering ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveButton(btn.id, 'up')}
                              disabled={idx === 0}
                              className="px-2 py-0.5 text-xs bg-sky-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-30 rounded hover:bg-sky-200 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveButton(btn.id, 'down')}
                              disabled={idx === currentButtons.length - 1}
                              className="px-2 py-0.5 text-xs bg-sky-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-30 rounded hover:bg-sky-200 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              ↓
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              title="تكرار الزر وتدفقه"
                              aria-label={`تكرار الزر ${btn.text}`}
                              onClick={() => handleDuplicateButton(btn)}
                              className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-300 hover:bg-sky-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="تعديل الزر"
                              aria-label={`تعديل الزر ${btn.text}`}
                              onClick={() => handleStartEdit(btn)}
                              className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-sky-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="حذف الزر"
                              aria-label={`حذف الزر ${btn.text}`}
                              onClick={() => setButtonToDelete(btn)}
                              className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 mt-2">
                      <span className="text-slate-500">الإجراء:</span>
                      {describeAction(btn, flow)}
                    </div>
                  </div>

                  {btn.actionType === 'flow' && (
                    <div className="mt-3 pt-2.5 border-t border-sky-200/70 dark:border-slate-900 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">
                        {flow?.subButtons?.length || 0} أزرار فرعية
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenFlow(btn)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-sky-700 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 border border-sky-200/80 dark:border-transparent rounded-lg transition-colors cursor-pointer"
                      >
                        <Workflow className="w-3 h-3" />
                        <span>إضافة تدفقات للزر</span>
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!buttonToDelete}
        title="تأكيد حذف الزر"
        message="هل أنت متأكد من أنك تريد حذف هذا الزر؟"
        confirmLabel="نعم"
        cancelLabel="لا"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setButtonToDelete(null)}
      />

      {/* Pagination and Navigation Settings Modal */}
      <PaginationSettingsModal
        isOpen={isPaginationModalOpen}
        onClose={() => setIsPaginationModalOpen(false)}
        config={currentPagination}
        buttons={currentButtons}
        availableFlows={availableFlows}
        menuTitle={
          activeTab === 'inline'
            ? 'قائمة أزرار Inline'
            : 'قائمة أزرار Reply Keyboard'
        }
        onSave={async (newConfig, updatedButtons) => {
          const updates: Partial<BotConfig> =
            activeTab === 'inline'
              ? {
                  inlinePagination: newConfig,
                  ...(updatedButtons ? { inlineButtons: updatedButtons } : {}),
                }
              : {
                  replyPagination: newConfig,
                  ...(updatedButtons ? { replyButtons: updatedButtons } : {}),
                };
          await onUpdateBot(updates);
        }}
      />

      {/* Flexible Mixed Rows Arranger Modal */}
      <RowArrangerModal
        isOpen={isRowArrangerOpen}
        onClose={() => setIsRowArrangerOpen(false)}
        buttons={currentButtons}
        title={activeTab === 'inline' ? 'أزرار Inline' : 'أزرار Reply Keyboard'}
        onSave={async (arranged) => {
          if (activeTab === 'inline') {
            await onUpdateBot({ inlineButtons: arranged });
          } else {
            await onUpdateBot({ replyButtons: arranged });
          }
        }}
      />
    </div>
  );
};
