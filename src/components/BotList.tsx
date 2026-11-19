import React, { useState } from 'react';
import { Bot, Plus, Trash2, Calendar, CheckCircle2, XCircle, ArrowUpLeft, FileJson, Radar, Download, Check } from 'lucide-react';
import { BotConfig } from '../types/bot';
import { downloadBotBackupFile } from '../utils/botBackupExport';
import { ConfirmModal } from './ConfirmModal';

interface BotListProps {
  bots: BotConfig[];
  isLoading: boolean;
  onSelectBot: (bot: BotConfig) => void;
  onCreateBot: () => void;
  onDeleteBot: (botId: string) => Promise<void>;
  onOpenJsonSection?: () => void;
  onOpenScanSection?: () => void;
}

export const BotList: React.FC<BotListProps> = ({
  bots,
  isLoading,
  onSelectBot,
  onCreateBot,
  onDeleteBot,
  onOpenJsonSection,
  onOpenScanSection,
}) => {
  const [botToDelete, setBotToDelete] = useState<BotConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportedBotId, setExportedBotId] = useState<string | null>(null);

  const handleDeleteConfirm = async () => {
    if (!botToDelete) return;
    try {
      setIsDeleting(true);
      await onDeleteBot(botToDelete.id);
      setBotToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
        <div className="w-10 h-10 border-3 border-sky-500/20 border-t-sky-600 dark:border-t-sky-500 rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-500 dark:text-slate-400">جاري تحميل قائمة البوتات...</p>
      </div>
    );
  }

  // 4.2 الحالة الفارغة
  if (bots.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="max-w-md mx-auto p-8 rounded-2xl bg-white dark:bg-slate-900/60 border border-sky-200/80 dark:border-slate-800/80 shadow-[0_8px_30px_rgba(2,132,199,0.08)] dark:shadow-xl backdrop-blur-xs">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400 shadow-inner">
            <Bot className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            لا توجد بوتات حالياً
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
            ابدأ بإنشاء بوت تيليجرام الخاص بك، وقم بتصميم رسالة البداية وتدفقات الأزرار والوسائط التفاعلية بسهولة.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onCreateBot}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl transition-all shadow-md shadow-sky-600/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء بوت جديد</span>
            </button>
            {onOpenJsonSection && (
              <button
                type="button"
                onClick={onOpenJsonSection}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200 dark:border-slate-700 rounded-xl transition-all cursor-pointer"
              >
                <FileJson className="w-4 h-4" />
                <span>تفعيل بكود JSON</span>
              </button>
            )}
            {onOpenScanSection && (
              <button
                type="button"
                onClick={onOpenScanSection}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200 dark:border-slate-700 rounded-xl transition-all cursor-pointer font-mono"
              >
                <Radar className="w-4 h-4" />
                <span>scan Telegram</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 4.3 وجود بوتات سابقة
  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-10" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-sky-200/80 dark:border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            إدارة البوتات
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            قائمة البوتات التي تم إنشاؤها وإمكانية تعديل إعداداتها وتدفقاتها
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onOpenScanSection && (
            <button
              type="button"
              onClick={onOpenScanSection}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-sky-700 dark:text-sky-300 bg-white dark:bg-slate-900 hover:bg-sky-50 dark:hover:bg-slate-800 border border-sky-200 dark:border-sky-500/30 rounded-xl transition-all cursor-pointer shadow-xs font-mono"
            >
              <Radar className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>scan Telegram</span>
            </button>
          )}
          {onOpenJsonSection && (
            <button
              type="button"
              onClick={onOpenJsonSection}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-sky-700 dark:text-sky-300 bg-white dark:bg-slate-900 hover:bg-sky-50 dark:hover:bg-slate-800 border border-sky-200 dark:border-sky-500/30 rounded-xl transition-all cursor-pointer shadow-xs"
            >
              <FileJson className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>تفعيل بكود JSON</span>
            </button>
          )}
          <button
            type="button"
            onClick={onCreateBot}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl transition-all shadow-sm hover:scale-[1.02] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء بوت جديد</span>
          </button>
        </div>
      </div>

      {/* Grid of bots */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {bots.map((bot) => {
          const formattedDate = new Date(bot.createdAt).toLocaleDateString('ar-EG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });

          const totalButtons =
            (bot.inlineButtons?.length || 0) + (bot.replyButtons?.length || 0);

          return (
            <div
              key={bot.id}
              className="group relative bg-white dark:bg-slate-900/70 border border-sky-200/80 dark:border-slate-800 hover:border-sky-300 dark:hover:border-slate-700/80 rounded-2xl p-5 shadow-[0_2px_14px_-4px_rgba(14,116,144,0.08)] dark:shadow-lg transition-all duration-200 hover:-translate-y-0.5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-sky-50 dark:bg-slate-800 border border-sky-200/80 dark:border-slate-700/60 flex items-center justify-center text-sky-600 dark:text-sky-400 group-hover:border-sky-400/60 dark:group-hover:border-sky-500/40 group-hover:bg-sky-100/70 dark:group-hover:bg-sky-500/10 transition-colors">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base leading-snug truncate max-w-[180px]">
                        {bot.name}
                      </h3>
                      {bot.botUsername ? (
                        <p className="text-xs text-sky-600 dark:text-sky-400 font-mono direction-ltr text-right mt-0.5">
                          @{bot.botUsername}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 mt-0.5">
                          لم يتم الربط بتيليجرام
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="تصدير نسخة احتياطية JSON"
                      aria-label={`تصدير إعدادات ${bot.name} إلى JSON`}
                      onClick={() => {
                        downloadBotBackupFile(bot);
                        setExportedBotId(bot.id);
                        setTimeout(() => {
                          setExportedBotId((prev) => (prev === bot.id ? null : prev));
                        }, 2000);
                      }}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        exportedBotId === bot.id
                          ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                          : 'text-slate-400 dark:text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10'
                      }`}
                    >
                      {exportedBotId === bot.id ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      title="حذف البوت"
                      aria-label={`حذف البوت ${bot.name}`}
                      onClick={() => setBotToDelete(bot)}
                      className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 pt-3 border-t border-sky-100 dark:border-slate-800/60">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">حالة الاتصال:</span>
                    {bot.isConnected ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        متصل بالخادم
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <XCircle className="w-3.5 h-3.5" />
                        غير متصل
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">رسالة البداية:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {bot.startMessage?.isSaved ? 'تم الإعداد' : 'غير معدة'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">إجمالي الأزرار:</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium tabular-nums">
                      {totalButtons} أزرار
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      تاريخ الإنشاء:
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      {formattedDate}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="mt-5 pt-3">
                <button
                  type="button"
                  onClick={() => onSelectBot(bot)}
                  className="w-full flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-sky-700 dark:text-slate-200 bg-sky-50 dark:bg-slate-800 hover:bg-sky-600 hover:text-white border border-sky-200/80 dark:border-transparent hover:border-sky-600 rounded-xl transition-all cursor-pointer group/btn"
                >
                  <span>إدارة البوت ومحتواه</span>
                  <ArrowUpLeft className="w-3.5 h-3.5 group-hover/btn:-translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!botToDelete}
        title="تأكيد حذف البوت"
        message={`هل أنت متأكد من رغبتك في حذف البوت "${botToDelete?.name}" نهائياً؟ سيتم إيقاف الربط وحذف جميع الأزرار والتدفقات المرتبطة به.`}
        confirmLabel={isDeleting ? 'جاري الحذف...' : 'نعم، احذف البوت'}
        cancelLabel="إلغاء"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setBotToDelete(null)}
      />
    </div>
  );
};
