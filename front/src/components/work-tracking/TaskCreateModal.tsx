"use client";

import { useEffect, useState } from "react";
import type {
  LineWorksArchiveChannelSummary,
  LineWorksArchiveMessage,
} from "@/lib/line-works-archive";
import type { PendingReference } from "@/lib/pending-references";
import type { ChannelLabelMap, StorageItem } from "@/lib/storage";
import type { NotionUpdateItem, TaskPriority } from "@/lib/work-tracking";
import { ReferenceCollector } from "./ReferenceCollector";

export interface TaskCreateSubmit {
  title: string;
  category: string;
  priority: TaskPriority;
  dueDate: string;
  dueTime: string | null;
  note: string;
  pendingReferences: PendingReference[];
}

interface Props {
  open: boolean;
  defaultDueDate: string;
  onClose: () => void;
  onSubmit: (payload: TaskCreateSubmit) => Promise<void>;
  notionItems: NotionUpdateItem[];
  lineWorksItems: LineWorksArchiveMessage[];
  lineWorksChannels: LineWorksArchiveChannelSummary[];
  storageItems: StorageItem[];
  channelLabels: ChannelLabelMap;
}

interface FormState {
  title: string;
  category: string;
  priority: TaskPriority;
  dueDate: string;
  dueTime: string;
  note: string;
}

function initialForm(dueDate: string): FormState {
  return {
    title: "",
    category: "",
    priority: "medium",
    dueDate,
    dueTime: "",
    note: "",
  };
}

export function TaskCreateModal({
  open,
  defaultDueDate,
  onClose,
  onSubmit,
  notionItems,
  lineWorksItems,
  lineWorksChannels,
  storageItems,
  channelLabels,
}: Props) {
  const [form, setForm] = useState<FormState>(() => initialForm(defaultDueDate));
  const [pendingReferences, setPendingReferences] = useState<PendingReference[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialForm(defaultDueDate));
      setPendingReferences([]);
      setSubmitting(false);
    }
  }, [open, defaultDueDate]);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const dueTime = /^\d{2}:\d{2}$/.test(form.dueTime.trim()) ? form.dueTime.trim() : null;

    setSubmitting(true);
    try {
      await onSubmit({
        title: form.title,
        category: form.category,
        priority: form.priority,
        dueDate: form.dueDate || defaultDueDate,
        dueTime,
        note: form.note,
        pendingReferences,
      });
      onClose();
    } catch (error) {
      console.error("[task-create-modal] submit failed", error);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop task-create-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div className="task-create-modal">
        <header className="task-create-modal-head">
          <h3>태스크 생성</h3>
          <button
            type="button"
            className="modal-close"
            aria-label="닫기"
            onClick={onClose}
            disabled={submitting}
          >
            ×
          </button>
        </header>

        <form className="task-form task-create-modal-form" onSubmit={handleSubmit}>
          <label>
            <span className="field-label">업무명</span>
            <input
              type="text"
              name="title"
              placeholder="예: 통계 API 검증"
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              required
              autoFocus
            />
          </label>

          <label>
            <span className="field-label">카테고리</span>
            <input
              type="text"
              name="category"
              placeholder="예: 백엔드, 회의, 문서"
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value }))
              }
            />
          </label>

          <div className="split-fields due-split">
            <label>
              <span className="field-label">우선순위</span>
              <select
                name="priority"
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value as TaskPriority,
                  }))
                }
              >
                <option value="high">높음</option>
                <option value="medium">중간</option>
                <option value="low">낮음</option>
              </select>
            </label>
            <label>
              <span className="field-label">마감일</span>
              <input
                type="date"
                name="dueDate"
                value={form.dueDate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, dueDate: event.target.value }))
                }
              />
            </label>
            <label>
              <span className="field-label">마감 시각</span>
              <input
                type="time"
                name="dueTime"
                value={form.dueTime}
                onChange={(event) =>
                  setForm((current) => ({ ...current, dueTime: event.target.value }))
                }
              />
            </label>
          </div>

          <label>
            <span className="field-label">메모</span>
            <textarea
              name="note"
              rows={3}
              placeholder="이 업무에서 꼭 확인할 점을 적으세요."
              value={form.note}
              onChange={(event) =>
                setForm((current) => ({ ...current, note: event.target.value }))
              }
            />
          </label>

          <ReferenceCollector
            pending={pendingReferences}
            onPendingChange={setPendingReferences}
            notionItems={notionItems}
            lineWorksItems={lineWorksItems}
            lineWorksChannels={lineWorksChannels}
            storageItems={storageItems}
            channelLabels={channelLabels}
          />

          <div className="task-create-modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={submitting}
            >
              취소
            </button>
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? "저장 중..." : "업무 추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
