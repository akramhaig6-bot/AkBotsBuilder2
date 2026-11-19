import React, { useState } from 'react';
import {
  Layers,
  X,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  GripVertical,
  Check,
  LayoutGrid,
  Sparkles,
} from 'lucide-react';
import { BotButton } from '../types/bot';
import {
  getButtonColorClasses,
  LAYOUT_TEMPLATES,
  applyLayoutTemplate,
} from '../utils/telegramFormatters';

interface RowArrangerModalProps {
  isOpen: boolean;
  onClose: () => void;
  buttons: BotButton[];
  title: string;
  onSave: (arrangedButtons: BotButton[]) => Promise<void>;
}

export const RowArrangerModal: React.FC<RowArrangerModalProps> = ({
  isOpen,
  onClose,
  buttons,
  title,
  onSave,
}) => {
  if (!isOpen) return null;

  // Internal state: 2D array of buttons representing rows
  const [rows, setRows] = useState<BotButton[][]>(() => {
    if (!buttons || buttons.length === 0) return [[]];

    const rowMap = new Map<number, BotButton[]>();
    buttons.forEach((btn) => {
      const r = btn.row ?? 0;
      if (!rowMap.has(r)) rowMap.set(r, []);
      rowMap.get(r)!.push(btn);
    });

    const sortedRowIndices = Array.from(rowMap.keys()).sort((a, b) => a - b);
    return sortedRowIndices.map((idx) => {
      const rowButtons = rowMap.get(idx)!;
      return rowButtons.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });
  });

  const [draggingBtnId, setDraggingBtnId] = useState<string | null>(null);
  const [dragOverRowIdx, setDragOverRowIdx] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [customPatternInput, setCustomPatternInput] = useState('');

  // Add a new empty row
  const handleAddRow = () => {
    setRows([...rows, []]);
  };

  // Apply custom row pattern (e.g. "1, 3, 2" or "5")
  const handleApplyCustomPattern = () => {
    const parsed = customPatternInput
      .split(/[\s,،]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1);
    if (parsed.length === 0) return;

    const allCurrentButtons = rows.flat();
    const rearranged = applyLayoutTemplate(allCurrentButtons, 'custom_pattern', parsed);
    const rowMap = new Map<number, BotButton[]>();
    rearranged.forEach((b) => {
      const r = b.row ?? 0;
      if (!rowMap.has(r)) rowMap.set(r, []);
      rowMap.get(r)!.push(b);
    });
    const sorted = Array.from(rowMap.keys()).sort((a, b) => a - b);
    setRows(sorted.map((k) => rowMap.get(k)!));
  };

  // Split last button of row into a new row below
  const handleSplitRow = (rowIdx: number) => {
    if (rows[rowIdx].length <= 1) return;
    const newRows = [...rows];
    const source = [...newRows[rowIdx]];
    const lastBtn = source.pop()!;
    newRows[rowIdx] = source;
    newRows.splice(rowIdx + 1, 0, [lastBtn]);
    setRows(newRows);
  };

  // Merge row with the next row
  const handleMergeWithNext = (rowIdx: number) => {
    if (rowIdx >= rows.length - 1) return;
    const newRows = [...rows];
    newRows[rowIdx] = [...newRows[rowIdx], ...newRows[rowIdx + 1]];
    newRows.splice(rowIdx + 1, 1);
    setRows(newRows);
  };

  // Move entire row up / down
  const handleMoveRow = (rowIdx: number, direction: 'up' | 'down') => {
    if (direction === 'up' && rowIdx === 0) return;
    if (direction === 'down' && rowIdx === rows.length - 1) return;

    const targetIdx = direction === 'up' ? rowIdx - 1 : rowIdx + 1;
    const newRows = [...rows];
    const temp = newRows[rowIdx];
    newRows[rowIdx] = newRows[targetIdx];
    newRows[targetIdx] = temp;
    setRows(newRows);
  };

  // Delete an empty row
  const handleDeleteRow = (rowIdx: number) => {
    if (rows.length <= 1) return;
    const targetRow = rows[rowIdx];
    if (targetRow.length > 0) {
      // Reassign buttons in deleted row to row 0
      const newRows = rows.filter((_, idx) => idx !== rowIdx);
      newRows[0] = [...newRows[0], ...targetRow];
      setRows(newRows);
    } else {
      setRows(rows.filter((_, idx) => idx !== rowIdx));
    }
  };

  // Move button horizontally within row
  const handleMoveButtonHorizontal = (
    rowIdx: number,
    btnIdx: number,
    direction: 'left' | 'right'
  ) => {
    const row = [...rows[rowIdx]];
    if (direction === 'left' && btnIdx < row.length - 1) {
      // In RTL, moving left means moving to index + 1
      const temp = row[btnIdx];
      row[btnIdx] = row[btnIdx + 1];
      row[btnIdx + 1] = temp;
    } else if (direction === 'right' && btnIdx > 0) {
      // In RTL, moving right means moving to index - 1
      const temp = row[btnIdx];
      row[btnIdx] = row[btnIdx - 1];
      row[btnIdx - 1] = temp;
    } else {
      return;
    }

    const newRows = [...rows];
    newRows[rowIdx] = row;
    setRows(newRows);
  };

  // Move button vertically to adjacent row
  const handleMoveButtonVertical = (
    rowIdx: number,
    btnIdx: number,
    direction: 'up' | 'down'
  ) => {
    if (direction === 'up' && rowIdx === 0) return;
    if (direction === 'down' && rowIdx === rows.length - 1) {
      // Automatically create new row below if moving down from last row
      const newRows = [...rows, []];
      const sourceRow = [...newRows[rowIdx]];
      const [btn] = sourceRow.splice(btnIdx, 1);
      newRows[rowIdx] = sourceRow;
      newRows[newRows.length - 1].push(btn);
      setRows(newRows);
      return;
    }

    const targetRowIdx = direction === 'up' ? rowIdx - 1 : rowIdx + 1;
    const newRows = [...rows];
    const sourceRow = [...newRows[rowIdx]];
    const [btn] = sourceRow.splice(btnIdx, 1);
    newRows[rowIdx] = sourceRow;
    newRows[targetRowIdx] = [...newRows[targetRowIdx], btn];
    setRows(newRows);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, btnId: string) => {
    e.dataTransfer.setData('text/plain', btnId);
    setDraggingBtnId(btnId);
  };

  const handleDragOverRow = (e: React.DragEvent, rowIdx: number) => {
    e.preventDefault();
    setDragOverRowIdx(rowIdx);
  };

  const handleDropOnRow = (e: React.DragEvent, targetRowIdx: number) => {
    e.preventDefault();
    setDragOverRowIdx(null);
    if (!draggingBtnId) return;

    let foundBtn: BotButton | null = null;
    const newRows = rows.map((row) => {
      const idx = row.findIndex((b) => b.id === draggingBtnId);
      if (idx !== -1) {
        foundBtn = row[idx];
        return row.filter((b) => b.id !== draggingBtnId);
      }
      return row;
    });

    if (foundBtn) {
      newRows[targetRowIdx].push(foundBtn);
      setRows(newRows);
    }
    setDraggingBtnId(null);
  };

  // Flatten and normalize row and order indices
  const handleSaveArrangement = async () => {
    setIsSaving(true);
    try {
      const flattened: BotButton[] = [];
      let currentRowNumber = 0;

      rows.forEach((row) => {
        if (row.length === 0) return; // skip empty rows in final output
        row.forEach((btn, orderIdx) => {
          flattened.push({
            ...btn,
            row: currentRowNumber,
            order: orderIdx,
          });
        });
        currentRowNumber++;
      });

      await onSave(flattened);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-sky-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-[#F5F9FD] dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>نظام ترتيب الأزرار والصفوف المختلطة</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-sky-200 dark:border-slate-700">
                  {title}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                توزيع مرن: يمكنك وضع زر واحد أو أي عدد مخصص من الأزرار في كل صف بشكل حر ومختلط مع السحب والإفلات
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

        {/* Rows & Templates Container */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Quick Layout Templates Bar */}
          <div className="p-4 rounded-xl bg-[#F5F9FD] dark:bg-slate-950/80 border border-sky-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  قوالب التوزيع الجاهزة (تطبيق فوري مع المعاينة):
                </span>
              </div>
              <span className="text-[11px] text-slate-500">
                اختر قالباً أو أدخل نمط صفوف مخصص ثم عدّل بحرية بالسحب
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {LAYOUT_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => {
                    const allCurrentButtons = rows.flat();
                    const rearranged = applyLayoutTemplate(allCurrentButtons, tmpl.id);
                    const rowMap = new Map<number, BotButton[]>();
                    rearranged.forEach((b) => {
                      const r = b.row ?? 0;
                      if (!rowMap.has(r)) rowMap.set(r, []);
                      rowMap.get(r)!.push(b);
                    });
                    const sorted = Array.from(rowMap.keys()).sort((a, b) => a - b);
                    setRows(sorted.map((k) => rowMap.get(k)!));
                  }}
                  title={tmpl.description}
                  className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-500/60 hover:bg-sky-50/70 dark:hover:bg-sky-950/20 text-right transition-all cursor-pointer group flex flex-col justify-between gap-1.5"
                >
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 group-hover:text-sky-800 dark:group-hover:text-white leading-tight">
                    {tmpl.name}
                  </span>
                  <div className="space-y-1 w-full pt-1">
                    {tmpl.previewRows.map((pRow, rIdx) => (
                      <div key={rIdx} className="flex gap-1 w-full">
                        {pRow.map((_, cIdx) => (
                          <div
                            key={cIdx}
                            className="h-1.5 bg-sky-200 dark:bg-slate-700 group-hover:bg-sky-500 rounded-sm flex-1 transition-colors"
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            {/* Custom Arbitrary Pattern Distribution */}
            <div className="pt-2 border-t border-sky-200/70 dark:border-slate-900 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium shrink-0">
                توزيع حر (عدد الأزرار في كل صف):
              </span>
              <input
                type="text"
                value={customPatternInput}
                onChange={(e) => setCustomPatternInput(e.target.value)}
                placeholder="مثال: 1, 3, 2 أو 5 (صف 1 زر، صف 3 أزرار، صف 2 زر)"
                className="flex-1 bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-sky-500"
              />
              <button
                type="button"
                onClick={handleApplyCustomPattern}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer shrink-0"
              >
                تطبيق النمط المخصص
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-sky-100 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              صفوف الأزرار الحالية ({rows.filter((r) => r.length > 0).length} صفوف نشطة):
            </span>
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-all cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة صف جديد</span>
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, rowIdx) => {
              const isOver = dragOverRowIdx === rowIdx;

              return (
                <div
                  key={rowIdx}
                  onDragOver={(e) => handleDragOverRow(e, rowIdx)}
                  onDrop={(e) => handleDropOnRow(e, rowIdx)}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isOver
                      ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 ring-2 ring-sky-500/30'
                      : 'bg-[#F5F9FD] dark:bg-slate-950 border-sky-200/80 dark:border-slate-800 hover:border-sky-300 dark:hover:border-slate-700'
                  }`}
                >
                  {/* Row Header & Controls */}
                  <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-sky-200/70 dark:border-slate-900">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-300">
                        الصف #{rowIdx + 1}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-sky-200/80 dark:border-slate-800">
                        {row.length} {row.length === 1 ? 'زر واحد' : `${row.length} أزرار`}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {row.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleSplitRow(rowIdx)}
                          className="px-2 py-0.5 rounded text-[10px] text-sky-700 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 cursor-pointer"
                          title="فصل آخر زر إلى صف مستقل بالأسفل"
                        >
                          تقسيم الصف
                        </button>
                      )}
                      {rowIdx < rows.length - 1 && (
                        <button
                          type="button"
                          onClick={() => handleMergeWithNext(rowIdx)}
                          className="px-2 py-0.5 rounded text-[10px] text-amber-700 dark:text-amber-400 hover:bg-amber-100/70 dark:hover:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 cursor-pointer"
                          title="دمج هذا الصف مع الصف التالي"
                        >
                          دمج بالتالي
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleMoveRow(rowIdx, 'up')}
                        disabled={rowIdx === 0}
                        title="تحريك الصف بالكامل لأعلى"
                        className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-sky-100 dark:hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveRow(rowIdx, 'down')}
                        disabled={rowIdx === rows.length - 1}
                        title="تحريك الصف بالكامل لأسفل"
                        className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-sky-100 dark:hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(rowIdx)}
                        title="حذف هذا الصف"
                        className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Buttons inside this row */}
                  {row.length === 0 ? (
                    <div className="p-4 border border-dashed border-sky-200 dark:border-slate-800 rounded-lg text-center text-xs text-slate-500">
                      صف فارغ. اسحب أزراراً وأفلتها هنا، أو استخدم أزرار النقل.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {row.map((btn, btnIdx) => {
                        const colorClass = getButtonColorClasses(
                          btn.style || btn.color,
                          false
                        );
                        const isDragging = draggingBtnId === btn.id;

                        return (
                          <div
                            key={btn.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, btn.id)}
                            className={`flex-1 min-w-[120px] max-w-full p-2 rounded-lg border flex flex-col justify-between group transition-all select-none cursor-grab active:cursor-grabbing ${colorClass} ${
                              isDragging ? 'opacity-30' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="text-xs font-bold truncate">
                                {btn.text}
                              </span>
                              <GripVertical className="w-3 h-3 opacity-60 shrink-0" />
                            </div>

                            {/* Precise Position Controls */}
                            <div className="flex items-center justify-between pt-1 border-t border-slate-400/25 dark:border-white/10 text-[10px]">
                              {/* Horizontal (Left/Right) */}
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMoveButtonHorizontal(
                                      rowIdx,
                                      btnIdx,
                                      'right'
                                    )
                                  }
                                  disabled={btnIdx === 0}
                                  title="تحريك لليمين داخل الصف"
                                  className="p-0.5 rounded bg-black/10 dark:bg-black/20 hover:bg-black/20 dark:hover:bg-black/40 disabled:opacity-20 cursor-pointer"
                                >
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMoveButtonHorizontal(
                                      rowIdx,
                                      btnIdx,
                                      'left'
                                    )
                                  }
                                  disabled={btnIdx === row.length - 1}
                                  title="تحريك لليسار داخل الصف"
                                  className="p-0.5 rounded bg-black/10 dark:bg-black/20 hover:bg-black/20 dark:hover:bg-black/40 disabled:opacity-20 cursor-pointer"
                                >
                                  <ArrowLeft className="w-2.5 h-2.5" />
                                </button>
                              </div>

                              {/* Vertical (Up/Down) to other rows */}
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMoveButtonVertical(
                                      rowIdx,
                                      btnIdx,
                                      'up'
                                    )
                                  }
                                  disabled={rowIdx === 0}
                                  title="نقل الزر للصف السابق"
                                  className="p-0.5 rounded bg-black/10 dark:bg-black/20 hover:bg-black/20 dark:hover:bg-black/40 disabled:opacity-20 cursor-pointer"
                                >
                                  <ArrowUp className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMoveButtonVertical(
                                      rowIdx,
                                      btnIdx,
                                      'down'
                                    )
                                  }
                                  title="نقل الزر للصف التالي"
                                  className="p-0.5 rounded bg-black/10 dark:bg-black/20 hover:bg-black/20 dark:hover:bg-black/40 cursor-pointer"
                                >
                                  <ArrowDown className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-sky-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-[#F5F9FD] dark:bg-slate-950/50">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            يمكنك سحب أي زر وإسقاطه في أي صف، أو استخدام أسهم التوجيه.
          </span>
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
              onClick={handleSaveArrangement}
              disabled={isSaving}
              className="px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'جاري الحفظ...' : 'حفظ ترتيب الصفوف'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
