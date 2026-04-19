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
  estimate: number;
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
  estimateHours: string;
  estimateMinutes: string;
  note: string;
}

function initialForm(dueDate: string): FormState {
  return {
    title: "",
    category: "",
    priority: "medium",
    dueDate,
    estimateHours: "0",
    estimateMinutes: "30",
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

    const hours = Number(form.estimateHours || 0);
    const minutes = Number(form.estimateMinutes || 0);
    const estimate = Math.max(0, hours) * 60 + Math.max(0, minutes);

    setSubmitting(true);
    try {
      await onSubmit({
        title: form.title,
        category: form.category,
        priority: form.priority,
        dueDate: form.dueDate || defaultDueDate,
        estimate,
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

          <div className="split-fields">
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
          </div>

          <div className="split-fields time-split">
            <label>
              <span className="field-label">예상 시간</span>
              <input
                type="number"
                min="0"
                step="1"
                name="estimateHours"
                value={form.estimateHours}
                onChange={(event) =>
                  setForm((current) => ({ ...current, estimateHours: event.target.value }))
                }
              />
            </label>
            <label>
              <span className="field-label">예상 분</span>
              <input
                type="number"
                min="0"
                max="59"
                step="5"
                name="estimateMinutes"
                value={form.estimateMinutes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, estimateMinutes: event.target.value }))
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
