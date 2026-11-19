import React, { useState } from 'react';
import {
  Layers,
  Sliders,
  X,
  Check,
  Plus,
  Trash2,
  Copy,
  ArrowRight,
  ArrowLeft,
  LayoutGrid,
  MessageSquare,
  Image as ImageIcon,
  Navigation,
} from 'lucide-react';
import {
  PaginationConfig,
  PaginationMode,
  NavigationBarPosition,
  PageUpdateMode,
  BotButton,
  ManualPage,
  ParseMode,
  VisibilityMode,
  CustomNavButton,
  MediaItem,
  MenuNavigationConfig,
} from '../types/bot';
import { getDefaultPaginationConfig, computeTotalPages } from '../utils/pagination';
import { MediaUploader } from './MediaUploader';
import { RowArrangerModal } from './RowArrangerModal';

interface PaginationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: PaginationConfig;
  buttons: BotButton[];
  isSubMenu?: boolean;
  menuTitle: string;
  availableFlows?: { id: string; title: string }[];
  onSave: (newConfig: PaginationConfig, updatedButtons?: BotButton[]) => Promise<void>;
}

export const PaginationSettingsModal: React.FC<PaginationSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  buttons,
  isSubMenu = false,
  menuTitle,
  availableFlows = [],
  onSave,
}) => {
  if (!isOpen) return null;

  const currentConfig = config || getDefaultPaginationConfig();

  // Form State
  const [enabled, setEnabled] = useState(currentConfig.enabled);
  const [mode, setMode] = useState<PaginationMode>(currentConfig.mode || 'auto');
  const [itemsPerPage, setItemsPerPage] = useState(currentConfig.itemsPerPage || 6);
  const [navPosition, setNavPosition] = useState<NavigationBarPosition>(
    currentConfig.navigation?.position || 'bottom'
  );
  const [navVisibility, setNavVisibility] = useState<VisibilityMode>(
    currentConfig.navigation?.visibility || 'when_needed'
  );
  const [showPrevNext, setShowPrevNext] = useState(
    currentConfig.navigation?.showPrevNext ?? true
  );
  const [prevText, setPrevText] = useState(
    currentConfig.navigation?.prevText || '⬅️ السابق'
  );
  const [nextText, setNextText] = useState(
    currentConfig.navigation?.nextText || 'التالي ➡️'
  );
  const [showFirstLast, setShowFirstLast] = useState(
    currentConfig.navigation?.showFirstLast ?? false
  );
  const [firstText, setFirstText] = useState(
    currentConfig.navigation?.firstText || '⏮ الأولى'
  );
  const [lastText, setLastText] = useState(
    currentConfig.navigation?.lastText || 'الأخيرة ⏭'
  );
  const [showPageNumbers, setShowPageNumbers] = useState(
    currentConfig.navigation?.showPageNumbers ?? false
  );

  // Indicator
  const [indicatorEnabled, setIndicatorEnabled] = useState(
    currentConfig.indicator?.enabled ?? true
  );
  const [indicatorTemplate, setIndicatorTemplate] = useState(
    currentConfig.indicator?.template || '📄 صفحة {current} من {total}'
  );
  const [indicatorInNav, setIndicatorInNav] = useState(
    currentConfig.indicator?.showInNavigationBar ?? true
  );

  // Sub-menu navigation
  const [showBackButton, setShowBackButton] = useState(
    currentConfig.menuNavigation?.showBackButton ?? true
  );
  const [backButtonText, setBackButtonText] = useState(
    currentConfig.menuNavigation?.backButtonText || '🔙 العودة للقائمة السابقة'
  );
  const [backTarget, setBackTarget] = useState<'previous' | 'parent'>(
    currentConfig.menuNavigation?.backTarget || 'previous'
  );
  const [showMainMenuButton, setShowMainMenuButton] = useState(
    currentConfig.menuNavigation?.showMainMenuButton ?? true
  );
  const [mainMenuButtonText, setMainMenuButtonText] = useState(
    currentConfig.menuNavigation?.mainMenuButtonText || '🏠 القائمة الرئيسية'
  );

  // Update mode
  const [updateMode, setUpdateMode] = useState<PageUpdateMode>(
    currentConfig.updateMode || 'edit'
  );

  // Manual pages state (with full independent per-page config!)
  const [manualPages, setManualPages] = useState<ManualPage[]>(() => {
    if (currentConfig.manualPages && currentConfig.manualPages.length > 0) {
      return currentConfig.manualPages.map((p, idx) => ({
        ...p,
        id: p.id || `page_${idx + 1}`,
        title: p.title || `الصفحة ${idx + 1}`,
        buttonIds: p.buttonIds || [],
      }));
    }
    const p1: string[] = [];
    const p2: string[] = [];
    buttons.forEach((b, idx) => {
      if (idx < 6) p1.push(b.id);
      else p2.push(b.id);
    });
    return [
      { id: 'page_1', title: 'الصفحة 1', buttonIds: p1 },
      { id: 'page_2', title: 'الصفحة 2', buttonIds: p2 },
    ];
  });

  const [activeManualPageTab, setActiveManualPageTab] = useState(0);
  const [manualSubTab, setManualSubTab] = useState<'buttons' | 'content' | 'nav'>('buttons');
  const [arrangerPageIdx, setArrangerPageIdx] = useState<number | null>(null);
  const [newCustomNavText, setNewCustomNavText] = useState('');
  const [newCustomNavRole, setNewCustomNavRole] = useState<CustomNavButton['role']>('jump_page');
  const [newCustomNavTargetPage, setNewCustomNavTargetPage] = useState(0);
  const [newCustomNavTargetFlow, setNewCustomNavTargetFlow] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const previewTotalPages = computeTotalPages(buttons, {
    enabled,
    mode,
    itemsPerPage,
    manualPages,
    navigation: {
      showPrevNext,
      prevText,
      nextText,
      showFirstLast,
      firstText,
      lastText,
      position: navPosition,
      showPageNumbers,
      visibility: navVisibility,
    },
    indicator: {
      enabled: indicatorEnabled,
      template: indicatorTemplate,
      showInNavigationBar: indicatorInNav,
    },
    updateMode,
  });

  const handleAddManualPage = () => {
    const nextNum = manualPages.length + 1;
    setManualPages([
      ...manualPages,
      {
        id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        title: `الصفحة ${nextNum}`,
        buttonIds: [],
      },
    ]);
    setActiveManualPageTab(manualPages.length);
  };

  const handleCopyManualPage = (idx: number) => {
    const src = manualPages[idx];
    if (!src) return;
    const copy: ManualPage = {
      ...src,
      id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      title: `${src.title || `الصفحة ${idx + 1}`} (نسخة)`,
      buttonIds: [], // buttons uniquely belong to a page unless moved; copy inherits content/media/nav
      media: src.media ? src.media.map((m) => ({ ...m, id: `m_${Date.now()}_${Math.random().toString(36).substring(2, 5)}` })) : undefined,
      customNavButtons: src.customNavButtons
        ? src.customNavButtons.map((c) => ({ ...c, id: `cnav_${Date.now()}_${Math.random().toString(36).substring(2, 5)}` }))
        : undefined,
    };
    const next = [...manualPages];
    next.splice(idx + 1, 0, copy);
    setManualPages(next);
    setActiveManualPageTab(idx + 1);
  };

  const handleMoveManualPage = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= manualPages.length) return;
    const next = [...manualPages];
    [next[idx], next[target]] = [next[target], next[idx]];
    setManualPages(next);
    setActiveManualPageTab(target);
  };

  const handleDeleteManualPage = (pageIndex: number) => {
    if (manualPages.length <= 1) return;
    const removedPage = manualPages[pageIndex];
    const newPages = manualPages.filter((_, idx) => idx !== pageIndex);
    if (removedPage.buttonIds.length > 0 && newPages[0]) {
      newPages[0].buttonIds = Array.from(
        new Set([...newPages[0].buttonIds, ...removedPage.buttonIds])
      );
    }
    setManualPages(newPages);
    setActiveManualPageTab(Math.max(0, pageIndex - 1));
  };

  const handleMoveButtonToPage = (buttonId: string, targetPageIndex: number) => {
    const updated = manualPages.map((page, idx) => {
      const filtered = page.buttonIds.filter((id) => id !== buttonId);
      if (idx === targetPageIndex) {
        return { ...page, buttonIds: [...filtered, buttonId] };
      }
      return { ...page, buttonIds: filtered };
    });
    setManualPages(updated);
  };

  const updateActivePage = (patch: Partial<ManualPage>) => {
    setManualPages((prev) =>
      prev.map((p, idx) => (idx === activeManualPageTab ? { ...p, ...patch } : p))
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const newConfig: PaginationConfig = {
        enabled,
        mode,
        itemsPerPage: Math.max(1, Number(itemsPerPage) || 6),
        manualPages: mode === 'manual' ? manualPages : currentConfig.manualPages,
        navigation: {
          showPrevNext,
          prevText: prevText.trim() || '⬅️ السابق',
          nextText: nextText.trim() || 'التالي ➡️',
          showFirstLast,
          firstText: firstText.trim() || '⏮ الأولى',
          lastText: lastText.trim() || 'الأخيرة ⏭',
          position: navPosition,
          showPageNumbers,
          visibility: navVisibility,
          customNavButtons: currentConfig.navigation?.customNavButtons,
        },
        indicator: {
          enabled: indicatorEnabled,
          template: indicatorTemplate.trim() || '📄 صفحة {current} من {total}',
          showInNavigationBar: indicatorInNav,
        },
        menuNavigation: isSubMenu
          ? {
              showBackButton,
              backButtonText: backButtonText.trim() || '🔙 العودة للقائمة السابقة',
              showMainMenuButton,
              mainMenuButtonText:
                mainMenuButtonText.trim() || '🏠 القائمة الرئيسية',
              backTarget,
            }
          : undefined,
        updateMode,
      };

      let updatedButtons: BotButton[] | undefined = undefined;
      if (mode === 'manual' && enabled) {
        const buttonPageMap = new Map<string, number>();
        manualPages.forEach((page, pIdx) => {
          page.buttonIds.forEach((bId) => buttonPageMap.set(bId, pIdx));
        });
        updatedButtons = buttons.map((btn) => ({
          ...btn,
          pageIndex: buttonPageMap.has(btn.id) ? buttonPageMap.get(btn.id) : 0,
        }));
      }

      await onSave(newConfig, updatedButtons);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const activePage = manualPages[activeManualPageTab];
  const activePageButtons = activePage
    ? buttons
        .filter((b) => activePage.buttonIds.includes(b.id))
        .map((b) => {
          const pos = activePage.buttonPositions?.[b.id];
          return pos ? { ...b, row: pos.row, order: pos.order } : b;
        })
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-700 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-sky-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-[#F5F9FD] dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                <span>إعدادات تقسيم الصفحات والتنقل</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-sky-200 dark:border-slate-700">
                  {menuTitle}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                تحكم كامل بعدد الصفحات، محتوى ووسائط وتخطيط كل صفحة مستقلة، وأزرار التنقل والعودة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-sky-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Master Enable / Disable Toggle */}
          <button
            type="button"
            onClick={() => setEnabled((prev) => !prev)}
            className="w-full flex items-center justify-between p-4 rounded-xl bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200/80 dark:border-slate-800 hover:border-sky-300 dark:hover:border-slate-700 transition-colors cursor-pointer text-right"
          >
            <div>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-200 block">
                تفعيل نظام الصفحات لهذه القائمة
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 block">
                عند التفعيل، يمكنك تقسيم الأزرار ({buttons.length} زر) تلقائياً أو إنشاء صفحات يدوية مستقلة بالكامل.
              </span>
            </div>
            <div className="relative inline-flex items-center shrink-0">
              <div
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  enabled ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-800'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                    enabled ? 'translate-x-1 rtl:-translate-x-5' : 'translate-x-5 rtl:-translate-x-0.5'
                  }`}
                />
              </div>
            </div>
          </button>

          {enabled && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Pagination Mode Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  طريقة تقسيم الصفحات:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('auto')}
                    className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer flex flex-col gap-1 ${
                      mode === 'auto'
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/30 text-sky-950 dark:text-white ring-1 ring-sky-500'
                        : 'border-sky-200/80 dark:border-slate-800 bg-[#F5F9FD] dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">التقسيم التلقائي (Auto)</span>
                      {mode === 'auto' && <Check className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      تحديد عدد الأزرار في كل صفحة بحرية ليحسب النظام الصفحات تلقائياً.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('manual')}
                    className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer flex flex-col gap-1 ${
                      mode === 'manual'
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/30 text-sky-950 dark:text-white ring-1 ring-sky-500'
                        : 'border-sky-200/80 dark:border-slate-800 bg-[#F5F9FD] dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">التقسيم اليدوي المستقل (Manual)</span>
                      {mode === 'manual' && <Check className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      كل صفحة تملك رسالة ووسائط وأزرار وترتيب صفوف وتنقل خاص بها.
                    </span>
                  </button>
                </div>
              </div>

              {/* Auto Mode Config */}
              {mode === 'auto' && (
                <div className="p-4 rounded-xl bg-[#F5F9FD] dark:bg-slate-950/80 border border-sky-200/80 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      عدد الأزرار في الصفحة الواحدة (بدون حد أقصى ثابت):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={itemsPerPage}
                        onChange={(e) =>
                          setItemsPerPage(Math.max(1, Number(e.target.value) || 1))
                        }
                        className="w-20 bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-sky-700 dark:text-sky-300 text-center"
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400">زر / صفحة</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(30, itemsPerPage)}
                    step={1}
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    className="w-full accent-sky-600 dark:accent-sky-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-sky-200/70 dark:border-slate-900">
                    <span>إجمالي الأزرار الحالية: {buttons.length}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      إجمالي الصفحات المحسوبة: {previewTotalPages} صفحة
                    </span>
                  </div>
                </div>
              )}

              {/* Manual Mode Config */}
              {mode === 'manual' && activePage && (
                <div className="p-4 rounded-xl bg-[#F5F9FD] dark:bg-slate-950/80 border border-sky-200/80 dark:border-slate-800 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        إدارة الصفحات اليدوية ({manualPages.length} صفحة — بلا حد ثابت)
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        أضف أو انسخ أو رتّب الصفحات وحدد لكل صفحة محتواها وأزرارها وتخطيطها المستقل
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddManualPage}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة صفحة جديدة</span>
                    </button>
                  </div>

                  {/* Page Tabs */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {manualPages.map((page, pIdx) => (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => setActiveManualPageTab(pIdx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 border transition-all cursor-pointer ${
                          activeManualPageTab === pIdx
                            ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-sky-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {page.title || `الصفحة ${pIdx + 1}`} ({page.buttonIds.length})
                      </button>
                    ))}
                  </div>

                  {/* Active Page Toolbar */}
                  <div className="space-y-3 pt-2 border-t border-sky-200/70 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <input
                        type="text"
                        value={activePage.title || ''}
                        onChange={(e) => updateActivePage({ title: e.target.value })}
                        className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-200 font-semibold focus:border-sky-500 focus:outline-hidden"
                        placeholder="عنوان الصفحة"
                      />

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleMoveManualPage(activeManualPageTab, -1)}
                          disabled={activeManualPageTab === 0}
                          title="تحريك الصفحة لليمين / قبل"
                          className="p-1.5 rounded bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveManualPage(activeManualPageTab, 1)}
                          disabled={activeManualPageTab === manualPages.length - 1}
                          title="تحريك الصفحة لليسار / بعد"
                          className="p-1.5 rounded bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyManualPage(activeManualPageTab)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 text-sky-700 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 rounded cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>نسخ الصفحة</span>
                        </button>
                        {manualPages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteManualPage(activeManualPageTab)}
                            className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-1 px-2 py-1 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Per-Page Sub-Tabs */}
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-sky-200/80 dark:border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setManualSubTab('buttons')}
                        className={`flex-1 py-1.5 rounded-md font-medium cursor-pointer flex items-center justify-center gap-1 ${
                          manualSubTab === 'buttons'
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <LayoutGrid className="w-3 h-3" />
                        <span>الأزرار وترتيب الصفوف</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualSubTab('content')}
                        className={`flex-1 py-1.5 rounded-md font-medium cursor-pointer flex items-center justify-center gap-1 ${
                          manualSubTab === 'content'
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>رسالة ووسائط الصفحة</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualSubTab('nav')}
                        className={`flex-1 py-1.5 rounded-md font-medium cursor-pointer flex items-center justify-center gap-1 ${
                          manualSubTab === 'nav'
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <Navigation className="w-3 h-3" />
                        <span>تنقل مخصص للصفحة</span>
                      </button>
                    </div>

                    {/* Sub-Tab 1: Per-Page Buttons & Row Arrangement */}
                    {manualSubTab === 'buttons' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-600 dark:text-slate-400">
                            تعيين الأزرار إلى هذه الصفحة ({activePage.buttonIds.length} زر):
                          </span>
                          {activePageButtons.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setArrangerPageIdx(activeManualPageTab)}
                              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 border border-amber-200 dark:border-amber-500/30 rounded-lg cursor-pointer"
                            >
                              <LayoutGrid className="w-3 h-3" />
                              <span>ترتيب صفوف هذه الصفحة</span>
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                          {buttons.map((btn) => {
                            const isAssignedToThisPage = activePage.buttonIds.includes(btn.id);
                            const currentOwnerIndex = manualPages.findIndex((p) =>
                              p.buttonIds.includes(btn.id)
                            );

                            return (
                              <div
                                key={btn.id}
                                className={`p-2 rounded-lg border flex items-center justify-between text-xs ${
                                  isAssignedToThisPage
                                    ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-400 dark:border-sky-500/60 text-sky-950 dark:text-white'
                                    : 'bg-white dark:bg-slate-900/60 border-sky-200/75 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                <span className="truncate max-w-[140px] font-medium">
                                  {btn.text}
                                </span>
                                <select
                                  value={currentOwnerIndex !== -1 ? currentOwnerIndex : 0}
                                  onChange={(e) =>
                                    handleMoveButtonToPage(btn.id, Number(e.target.value))
                                  }
                                  className="bg-white dark:bg-slate-950 border border-sky-200 dark:border-slate-700 text-[11px] rounded px-1.5 py-0.5 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-sky-500 cursor-pointer"
                                >
                                  {manualPages.map((p, idx) => (
                                    <option key={p.id} value={idx}>
                                      {p.title || `صفحة ${idx + 1}`}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Sub-Tab 2: Independent Per-Page Message & Media */}
                    {manualSubTab === 'content' && (
                      <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-white dark:bg-slate-900/80 border border-sky-200/80 dark:border-slate-800 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer font-medium">
                              <input
                                type="checkbox"
                                checked={activePage.message !== undefined}
                                onChange={(e) =>
                                  updateActivePage({
                                    message: e.target.checked
                                      ? { text: '', parseMode: 'none', skipMessage: false }
                                      : undefined,
                                  })
                                }
                              />
                              <span>تخصيص رسالة مستقلة لهذه الصفحة</span>
                            </label>
                            {activePage.message && (
                              <label className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(activePage.message.skipMessage)}
                                  onChange={(e) =>
                                    updateActivePage({
                                      message: {
                                        ...(activePage.message || { text: '' }),
                                        skipMessage: e.target.checked,
                                      },
                                    })
                                  }
                                />
                                <span>تخطي النص في هذه الصفحة</span>
                              </label>
                            )}
                          </div>

                          {activePage.message && !activePage.message.skipMessage && (
                            <>
                              <textarea
                                rows={2}
                                value={activePage.message.text || ''}
                                onChange={(e) =>
                                  updateActivePage({
                                    message: {
                                      ...(activePage.message || { text: '' }),
                                      text: e.target.value,
                                    },
                                  })
                                }
                                placeholder="اكتب نص الرسالة الخاص بهذه الصفحة فقط..."
                                className="w-full bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg p-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 resize-none focus:outline-hidden focus:border-sky-500"
                              />
                              <select
                                value={activePage.message.parseMode || 'none'}
                                onChange={(e) =>
                                  updateActivePage({
                                    message: {
                                      ...(activePage.message || { text: '' }),
                                      parseMode: e.target.value as ParseMode,
                                    },
                                  })
                                }
                                className="bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-800 dark:text-slate-200"
                              >
                                <option value="none">نص عادي</option>
                                <option value="HTML">HTML</option>
                                <option value="MarkdownV2">MarkdownV2</option>
                              </select>
                            </>
                          )}
                        </div>

                        <div className="p-3 rounded-lg bg-white dark:bg-slate-900/80 border border-sky-200/80 dark:border-slate-800 space-y-2.5">
                          <label className="flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer font-medium">
                            <input
                              type="checkbox"
                              checked={activePage.media !== undefined}
                              onChange={(e) =>
                                updateActivePage({
                                  media: e.target.checked ? [] : undefined,
                                })
                              }
                            />
                            <ImageIcon className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                            <span>تخصيص وسائط مستقلة لهذه الصفحة</span>
                          </label>
                          {activePage.media !== undefined && (
                            <MediaUploader
                              mediaList={activePage.media}
                              onChange={(newMedia: MediaItem[]) =>
                                updateActivePage({ media: newMedia })
                              }
                              title={`وسائط ${activePage.title || 'الصفحة'}`}
                              description="تظهر هذه الوسائط عند فتح هذه الصفحة بالتحديد"
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {/* Sub-Tab 3: Per-Page Custom Navigation & Jump Buttons */}
                    {manualSubTab === 'nav' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 text-xs">
                          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(activePage.hideDefaultNav)}
                              onChange={(e) =>
                                updateActivePage({ hideDefaultNav: e.target.checked })
                              }
                            />
                            <span>إخفاء شريط التنقل الافتراضي في هذه الصفحة</span>
                          </label>
                        </div>

                        <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 space-y-2.5">
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                            إضافة أزرار تنقل مخصصة لهذه الصفحة (الانتقال لصفحة أو تدفق محدد):
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="text"
                              value={newCustomNavText}
                              onChange={(e) => setNewCustomNavText(e.target.value)}
                              placeholder="نص الزر..."
                              className="flex-1 min-w-[120px] bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400"
                            />
                            <select
                              value={newCustomNavRole}
                              onChange={(e) =>
                                setNewCustomNavRole(e.target.value as CustomNavButton['role'])
                              }
                              className="bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                            >
                              <option value="jump_page">الانتقال لصفحة رقم</option>
                              <option value="jump_flow">الانتقال لتدفق زر</option>
                              <option value="prev">السابق</option>
                              <option value="next">التالي</option>
                              <option value="back">رجوع</option>
                              <option value="home">الرئيسية</option>
                            </select>
                            {newCustomNavRole === 'jump_page' && (
                              <input
                                type="number"
                                min={1}
                                max={manualPages.length}
                                value={newCustomNavTargetPage + 1}
                                onChange={(e) =>
                                  setNewCustomNavTargetPage(
                                    Math.max(0, Number(e.target.value) - 1)
                                  )
                                }
                                className="w-16 bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono"
                              />
                            )}
                            {newCustomNavRole === 'jump_flow' && (
                              <select
                                value={newCustomNavTargetFlow}
                                onChange={(e) => setNewCustomNavTargetFlow(e.target.value)}
                                className="bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200"
                              >
                                <option value="">اختر التدفق...</option>
                                {availableFlows.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.title}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (!newCustomNavText.trim()) return;
                                const list = activePage.customNavButtons || [];
                                const nextBtn: CustomNavButton = {
                                  id: `cnav_${Date.now()}`,
                                  text: newCustomNavText.trim(),
                                  role: newCustomNavRole,
                                  targetPage:
                                    newCustomNavRole === 'jump_page'
                                      ? newCustomNavTargetPage
                                      : undefined,
                                  targetFlowId:
                                    newCustomNavRole === 'jump_flow'
                                      ? newCustomNavTargetFlow
                                      : undefined,
                                  row: 0,
                                  order: list.length,
                                  enabled: true,
                                };
                                updateActivePage({ customNavButtons: [...list, nextBtn] });
                                setNewCustomNavText('');
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer"
                            >
                              إضافة
                            </button>
                          </div>

                          {(activePage.customNavButtons || []).length > 0 && (
                            <div className="space-y-1">
                              {(activePage.customNavButtons || []).map((cb) => (
                                <div
                                  key={cb.id}
                                  className="flex items-center justify-between p-2 rounded bg-[#F5F9FD] dark:bg-slate-950 border border-sky-200/80 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200"
                                >
                                  <span>
                                    {cb.text}{' '}
                                    <span className="text-[10px] text-slate-500">({cb.role})</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateActivePage({
                                        customNavButtons: (
                                          activePage.customNavButtons || []
                                        ).filter((x) => x.id !== cb.id),
                                      })
                                    }
                                    className="text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Navigation Buttons Configuration */}
              <div className="p-4 rounded-xl bg-[#F5F9FD] dark:bg-slate-950/80 border border-sky-200/80 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <span>أزرار التنقل بين الصفحات</span>
                  </h4>

                  <select
                    value={navVisibility}
                    onChange={(e) => setNavVisibility(e.target.value as VisibilityMode)}
                    className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-800 dark:text-slate-200"
                  >
                    <option value="when_needed">تظهر عند تعدد الصفحات فقط</option>
                    <option value="always">تظهر دائماً</option>
                    <option value="hidden">إخفاء شريط التنقل</option>
                  </select>
                </div>

                {/* Prev / Next */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                      تفعيل زري (السابق / التالي):
                    </label>
                    <input
                      type="checkbox"
                      checked={showPrevNext}
                      onChange={(e) => setShowPrevNext(e.target.checked)}
                    />
                  </div>
                  {showPrevNext && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={prevText}
                        onChange={(e) => setPrevText(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                        placeholder="⬅️ السابق"
                      />
                      <input
                        type="text"
                        value={nextText}
                        onChange={(e) => setNextText(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                        placeholder="التالي ➡️"
                      />
                    </div>
                  )}
                </div>

                {/* First / Last */}
                <div className="space-y-3 pt-3 border-t border-sky-200/70 dark:border-slate-900">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                      تفعيل زري (الصفحة الأولى / الصفحة الأخيرة):
                    </label>
                    <input
                      type="checkbox"
                      checked={showFirstLast}
                      onChange={(e) => setShowFirstLast(e.target.checked)}
                    />
                  </div>
                  {showFirstLast && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={firstText}
                        onChange={(e) => setFirstText(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                        placeholder="⏮ الأولى"
                      />
                      <input
                        type="text"
                        value={lastText}
                        onChange={(e) => setLastText(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                        placeholder="الأخيرة ⏭"
                      />
                    </div>
                  )}
                </div>

                {/* Numeric Page Quick Jump */}
                <div className="flex items-center justify-between pt-3 border-t border-sky-200/70 dark:border-slate-900">
                  <label className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                    عرض أزرار أرقام الصفحات المباشرة (1, 2, 3...):
                  </label>
                  <input
                    type="checkbox"
                    checked={showPageNumbers}
                    onChange={(e) => setShowPageNumbers(e.target.checked)}
                  />
                </div>

                {/* Position */}
                <div className="pt-3 border-t border-sky-200/70 dark:border-slate-900">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    موضع شريط أزرار التنقل:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNavPosition('bottom')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border text-center cursor-pointer ${
                        navPosition === 'bottom'
                          ? 'bg-sky-600 text-white border-sky-500'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-sky-200 dark:border-slate-800'
                      }`}
                    >
                      أسفل الأزرار
                    </button>
                    <button
                      type="button"
                      onClick={() => setNavPosition('top')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border text-center cursor-pointer ${
                        navPosition === 'top'
                          ? 'bg-sky-600 text-white border-sky-500'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-sky-200 dark:border-slate-800'
                      }`}
                    >
                      أعلى الأزرار
                    </button>
                  </div>
                </div>
              </div>

              {/* Page Indicator */}
              <div className="p-4 rounded-xl bg-[#F5F9FD] dark:bg-slate-950/80 border border-sky-200/80 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    عرض مؤشر رقم الصفحة الحالية والإجمالي
                  </h4>
                  <input
                    type="checkbox"
                    checked={indicatorEnabled}
                    onChange={(e) => setIndicatorEnabled(e.target.checked)}
                  />
                </div>

                {indicatorEnabled && (
                  <div className="space-y-3 pt-2">
                    <input
                      type="text"
                      value={indicatorTemplate}
                      onChange={(e) => setIndicatorTemplate(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                      placeholder="📄 صفحة {current} من {total}"
                    />
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={indicatorInNav}
                        onChange={(e) => setIndicatorInNav(e.target.checked)}
                      />
                      <span>عرض المؤشر كزر داخل شريط التنقل</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Update Mode */}
              <div className="p-4 rounded-xl bg-[#F5F9FD] dark:bg-slate-950/80 border border-sky-200/80 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  سلوك الرسالة عند التنقل (Inline):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setUpdateMode('edit')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-center cursor-pointer ${
                      updateMode === 'edit'
                        ? 'bg-sky-600 text-white border-sky-500'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-sky-200 dark:border-slate-800'
                    }`}
                  >
                    تحديث الرسالة الحالية (Edit)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpdateMode('new')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-center cursor-pointer ${
                      updateMode === 'new'
                        ? 'bg-sky-600 text-white border-sky-500'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-sky-200 dark:border-slate-800'
                    }`}
                  >
                    إرسال رسالة جديدة (New)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sub-menu navigation buttons (ALWAYS accessible for sub-menus even when pagination is off!) */}
          {isSubMenu && (
            <div className="p-4 rounded-xl bg-[#F5F9FD] dark:bg-slate-950/80 border border-sky-200/80 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  أزرار الرجوع والعودة للرئيسية (تعمل وتُحذف باختيارك في كل المستويات)
                </h4>
                <select
                  value={backTarget}
                  onChange={(e) => setBackTarget(e.target.value as 'previous' | 'parent')}
                  className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-800 dark:text-slate-200"
                >
                  <option value="previous">سلوك الرجوع: خطوة سابقة (History)</option>
                  <option value="parent">سلوك الرجوع: القائمة الأب مباشرة</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer">
                    <span>زر الرجوع للقائمة السابقة:</span>
                    <input
                      type="checkbox"
                      checked={showBackButton}
                      onChange={(e) => setShowBackButton(e.target.checked)}
                    />
                  </label>
                  {showBackButton && (
                    <input
                      type="text"
                      value={backButtonText}
                      onChange={(e) => setBackButtonText(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer">
                    <span>زر القائمة الرئيسية:</span>
                    <input
                      type="checkbox"
                      checked={showMainMenuButton}
                      onChange={(e) => setShowMainMenuButton(e.target.checked)}
                    />
                  </label>
                  {showMainMenuButton && (
                    <input
                      type="text"
                      value={mainMenuButtonText}
                      onChange={(e) => setMainMenuButtonText(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-slate-100"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-sky-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-[#F5F9FD] dark:bg-slate-950/50">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {enabled ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                النظام مفعل ({mode === 'auto' ? 'تلقائي' : 'يدوي'} - {previewTotalPages} صفحة)
              </span>
            ) : (
              <span className="text-slate-500">نظام الصفحات معطل (صفحة واحدة)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-sky-100/80 dark:bg-slate-800 hover:bg-sky-200/70 dark:hover:bg-slate-700 rounded-xl cursor-pointer transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isSaving ? 'جاري الحفظ...' : 'حفظ إعدادات الصفحات'}
            </button>
          </div>
        </div>
      </div>

      {/* Per-Page Row Arranger Modal */}
      {arrangerPageIdx !== null && manualPages[arrangerPageIdx] && (
        <RowArrangerModal
          isOpen={true}
          onClose={() => setArrangerPageIdx(null)}
          buttons={activePageButtons}
          title={`صفوف ${manualPages[arrangerPageIdx].title || `الصفحة ${arrangerPageIdx + 1}`}`}
          onSave={async (arranged) => {
            const positions: Record<string, { row: number; order: number }> = {};
            arranged.forEach((b) => {
              positions[b.id] = { row: b.row, order: b.order };
            });
            setManualPages((prev) =>
              prev.map((p, idx) =>
                idx === arrangerPageIdx ? { ...p, buttonPositions: positions } : p
              )
            );
            setArrangerPageIdx(null);
          }}
        />
      )}
    </div>
  );
};
