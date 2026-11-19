import React, { useState } from 'react';
import {
  Image,
  Video,
  Mic,
  Music,
  FileText,
  Plus,
  Trash2,
  Upload,
  AlertCircle,
  GripVertical,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { MediaItem, MediaType } from '../types/bot';
import { api } from '../services/api';
import { ConfirmModal } from './ConfirmModal';

interface MediaUploaderProps {
  mediaList: MediaItem[];
  onChange: (newList: MediaItem[]) => void;
  title?: string;
  description?: string;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  mediaList,
  onChange,
  title = 'قسم الوسائط',
  description = 'إضافة صور أو فيديوهات أو تسجيلات صوتية أو مقاطع موسيقية أو ملفات تظهر عند الضغط على الزر',
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedType, setSelectedType] = useState<MediaType>('photo');
  const [caption, setCaption] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hasSpoiler, setHasSpoiler] = useState(false);
  const [showCaptionAboveMedia, setShowCaptionAboveMedia] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);

  // Drag and drop state for media reordering
  const [draggingMediaId, setDraggingMediaId] = useState<string | null>(null);
  const [dragOverMediaId, setDragOverMediaId] = useState<string | null>(null);

  const resetForm = () => {
    setIsAdding(false);
    setSelectedType('photo');
    setCaption('');
    setUrlInput('');
    setSelectedFile(null);
    setHasSpoiler(false);
    setShowCaptionAboveMedia(false);
    setErrorMessage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setErrorMessage(null);
    }
  };

  const handleConfirmAdd = async () => {
    if (!selectedFile && !urlInput.trim()) {
      setErrorMessage('يرجى اختيار ملف لرفعه أو إدخال رابط الوسائط');
      return;
    }

    try {
      setIsUploading(true);
      setErrorMessage(null);

      let finalUrl = urlInput.trim();
      let fileName = selectedFile?.name;

      if (selectedFile) {
        const uploadResult = await api.uploadFile(selectedFile);
        finalUrl = uploadResult.url;
        fileName = uploadResult.fileName;
      }

      const newItem: MediaItem = {
        id: `media_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: selectedType,
        url: finalUrl,
        fileName,
        caption: caption.trim() || undefined,
        order: mediaList.length,
        ...(hasSpoiler ? { hasSpoiler: true } : {}),
        ...(showCaptionAboveMedia ? { showCaptionAboveMedia: true } : {}),
      };

      onChange([...mediaList, newItem]);
      resetForm();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل رفع الوسائط، يرجى المحاولة مرة أخرى');
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleItemFlag = (id: string, field: 'hasSpoiler' | 'showCaptionAboveMedia') => {
    const updated = mediaList.map((m) =>
      m.id === id ? { ...m, [field]: !m[field] } : m
    );
    onChange(updated);
  };

  const handleDeleteItem = () => {
    if (!itemToDelete) return;
    const updated = mediaList
      .filter((m) => m.id !== itemToDelete.id)
      .map((item, idx) => ({ ...item, order: idx }));
    onChange(updated);
    setItemToDelete(null);
  };

  // 11.6 ترتيب الوسائط
  const handleMoveMedia = (id: string, direction: 'up' | 'down') => {
    const list = [...mediaList];
    const index = list.findIndex((m) => m.id === id);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      const temp = list[index];
      list[index] = list[index - 1];
      list[index - 1] = temp;
    } else if (direction === 'down' && index < list.length - 1) {
      const temp = list[index];
      list[index] = list[index + 1];
      list[index + 1] = temp;
    }

    const reordered = list.map((item, idx) => ({ ...item, order: idx }));
    onChange(reordered);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggingMediaId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== draggingMediaId) {
      setDragOverMediaId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = draggingMediaId;
    setDraggingMediaId(null);
    setDragOverMediaId(null);

    if (!sourceId || sourceId === targetId) return;

    const list = [...mediaList];
    const sourceIndex = list.findIndex((m) => m.id === sourceId);
    const targetIndex = list.findIndex((m) => m.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const [moved] = list.splice(sourceIndex, 1);
    list.splice(targetIndex, 0, moved);

    const reordered = list.map((item, idx) => ({ ...item, order: idx }));
    onChange(reordered);
  };

  const mediaTypeLabels: Record<MediaType, { label: string; icon: any }> = {
    photo: { label: 'صور (Photo)', icon: Image },
    video: { label: 'فيديو (Video)', icon: Video },
    voice: { label: 'صوت (Voice)', icon: Mic },
    audio: { label: 'موسيقى (Audio)', icon: Music },
    document: { label: 'ملف / مستند (Document)', icon: FileText },
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between pb-3 border-b border-sky-100 dark:border-slate-800/80">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-200">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
        </div>

        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 rounded-lg transition-colors border border-sky-200 dark:border-sky-500/20 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة وسائط</span>
          </button>
        )}
      </div>

      {/* Add Media Modal / Inline Form */}
      {isAdding && (
        <div className="bg-[#F5F9FD] dark:bg-slate-950/80 border border-sky-200 dark:border-slate-700/80 rounded-xl p-4 space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-sky-200/70 dark:border-slate-800 pb-2.5">
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              إضافة عنصر وسائط جديد
            </h4>
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              إلغاء
            </button>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Type Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              نوع الوسائط (محدد وفق معايير تيليجرام):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(Object.keys(mediaTypeLabels) as MediaType[]).map((type) => {
                const info = mediaTypeLabels[type];
                const Icon = info.icon;
                const isSelected = selectedType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-sky-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{info.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* File Picker or URL */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                رفع ملف من جهازك:
              </label>
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-sky-300/80 dark:border-slate-700/80 hover:border-sky-500 dark:hover:border-sky-500/60 rounded-xl bg-white dark:bg-slate-900/40 cursor-pointer transition-colors p-2 text-center group">
                <Upload className="w-5 h-5 text-sky-500 dark:text-slate-400 group-hover:text-sky-600 dark:group-hover:text-sky-400 mb-1" />
                <span className="text-xs text-slate-700 dark:text-slate-300">
                  {selectedFile ? selectedFile.name : 'اضغط لاختيار ملف'}
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  يدعم الصور والفيديو والصوتيات والمستندات حتى 25MB
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept={
                    selectedType === 'photo'
                      ? 'image/*'
                      : selectedType === 'video'
                      ? 'video/*'
                      : selectedType === 'document'
                      ? '*/*'
                      : 'audio/*'
                  }
                />
              </label>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="grow border-t border-sky-200/80 dark:border-slate-800"></div>
              <span className="shrink mx-3 text-[11px] text-slate-500">أو رابط مباشر</span>
              <div className="grow border-t border-sky-200/80 dark:border-slate-800"></div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                رابط مباشر للوسائط (Direct URL):
              </label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/media.jpg"
                className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                نص توضيحي (Caption اختياري):
              </label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="وصف يظهر مع الوسائط في تيليجرام..."
                className="w-full bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-sky-500"
              />
            </div>

            <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-slate-700 dark:text-slate-300">
              {(selectedType === 'photo' || selectedType === 'video') && (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasSpoiler}
                    onChange={(e) => setHasSpoiler(e.target.checked)}
                  />
                  <span>تمويه ضبابي (has_spoiler)</span>
                </label>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCaptionAboveMedia}
                  onChange={(e) => setShowCaptionAboveMedia(e.target.checked)}
                />
                <span>إظهار الوصف أعلى الوسائط (API 7.4+)</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-sky-100/80 dark:bg-slate-800 hover:bg-sky-200/70 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleConfirmAdd}
              disabled={isUploading}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg shadow-sm cursor-pointer"
            >
              {isUploading ? 'جاري الرفع...' : 'تأكيد الإضافة'}
            </button>
          </div>
        </div>
      )}

      {/* Media Items List with 11.6 Reorder Capabilities */}
      {mediaList.length === 0 ? (
        <div className="text-center py-6 px-4 bg-[#F5F9FD] dark:bg-slate-950/40 border border-sky-200/70 dark:border-slate-800/60 rounded-xl">
          <p className="text-xs text-slate-500">
            لا توجد وسائط مضافة حالياً.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {mediaList.length > 1 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
              <GripVertical className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
              <span>يمكنك إعادة ترتيب الوسائط بالسحب والإفلات أو باستخدام أزرار الأسهم:</span>
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mediaList.map((item, idx) => {
              const Icon = mediaTypeLabels[item.type]?.icon || Image;
              const isDragging = draggingMediaId === item.id;
              const isOver = dragOverMediaId === item.id;

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDrop={(e) => handleDrop(e, item.id)}
                  onDragEnd={() => {
                    setDraggingMediaId(null);
                    setDragOverMediaId(null);
                  }}
                  className={`relative bg-[#F5F9FD] dark:bg-slate-950 border rounded-xl p-3 flex flex-col justify-between group transition-all cursor-grab active:cursor-grabbing ${
                    isOver
                      ? 'border-sky-500 ring-2 ring-sky-500/20 bg-sky-50 dark:bg-sky-950/20'
                      : isDragging
                      ? 'opacity-40 border-sky-300 dark:border-slate-700'
                      : 'border-sky-200/80 dark:border-slate-800 hover:border-sky-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-slate-400 dark:text-slate-600 group-hover:text-slate-600 dark:group-hover:text-slate-400 shrink-0" />
                      <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200 block truncate max-w-[130px]">
                          {item.fileName || mediaTypeLabels[item.type]?.label.split(' ')[0]}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          ترتيب #{idx + 1}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {mediaList.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleMoveMedia(item.id, 'up')}
                            disabled={idx === 0}
                            title="تحريك للأعلى"
                            className="p-1 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-sky-100 dark:hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveMedia(item.id, 'down')}
                            disabled={idx === mediaList.length - 1}
                            title="تحريك للأسفل"
                            className="p-1 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-sky-100 dark:hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        title="حذف الوسائط"
                        onClick={() => setItemToDelete(item)}
                        className="p-1 rounded-md text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Preview Thumbnail */}
                  <div className="mt-2.5 rounded-lg overflow-hidden bg-white dark:bg-slate-900 border border-sky-200/80 dark:border-slate-800/80">
                    {item.type === 'photo' && (
                      <img
                        src={item.url}
                        alt={item.caption || 'صورة البوت'}
                        className="w-full h-24 object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500';
                        }}
                      />
                    )}
                    {item.type === 'video' && (
                      <video
                        src={item.url}
                        controls
                        className="w-full h-24 object-cover bg-black"
                      />
                    )}
                    {(item.type === 'audio' || item.type === 'voice') && (
                      <div className="p-2">
                        <audio src={item.url} controls className="w-full h-8" />
                      </div>
                    )}
                    {item.type === 'document' && (
                      <div className="p-3 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                        <FileText className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
                        <span className="truncate">{item.fileName || item.url}</span>
                      </div>
                    )}
                  </div>

                  {item.caption && (
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 italic truncate">
                      &ldquo;{item.caption}&rdquo;
                    </p>
                  )}

                  <div className="mt-2 pt-2 border-t border-sky-200/60 dark:border-slate-800/60 flex flex-wrap gap-2 text-[10px]">
                    {(item.type === 'photo' || item.type === 'video') && (
                      <button
                        type="button"
                        onClick={() => handleToggleItemFlag(item.id, 'hasSpoiler')}
                        className={`px-2 py-0.5 rounded-md border cursor-pointer transition-colors ${
                          item.hasSpoiler
                            ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/30 font-semibold'
                            : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-sky-200 dark:border-slate-800 hover:border-sky-300'
                        }`}
                      >
                        {item.hasSpoiler ? '✓ تمويه Spoiler' : 'تمويه Spoiler'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleItemFlag(item.id, 'showCaptionAboveMedia')}
                      className={`px-2 py-0.5 rounded-md border cursor-pointer transition-colors ${
                        item.showCaptionAboveMedia
                          ? 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-500/30 font-semibold'
                          : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-sky-200 dark:border-slate-800 hover:border-sky-300'
                      }`}
                    >
                      {item.showCaptionAboveMedia ? '✓ الوصف أعلى الوسائط' : 'الوصف أعلى الوسائط'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete Media Confirmation */}
      <ConfirmModal
        isOpen={!!itemToDelete}
        title="تأكيد حذف الوسائط"
        message="هل أنت متأكد من أنك تريد حذف هذا العنصر من الوسائط؟"
        confirmLabel="نعم، حذف"
        cancelLabel="لا"
        onConfirm={handleDeleteItem}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
};
