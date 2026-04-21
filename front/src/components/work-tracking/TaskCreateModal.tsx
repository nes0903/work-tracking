"use client";

import { useEffect, useState } from "react";
import type {
  LineWorksArchiveChannelSummary,
  LineWorksArchiveMessage,
} from "@/lib/line-works-archive";
import type { PendingReference } from "@/lib/pending-references";
import type { ChannelLabelMap, StorageItem } from "@/lib/storage";
import type {
  NotionUpdateItem,
  TaskPriority,
  TaskStatus,
} from "@/lib/work-tracking";
import type { UserRef } from "@/lib/tasks-api";
import { ReferenceCollector } from "./ReferenceCollector";

export interface TaskCreateSubmit {
  taskId?: string;
  title: string;
  category: string;
  priority: TaskPriority;
  status?: TaskStatus;
  dueDate: string;
  dueTime: string | null;
  note: string;
  assigneeUserIds: string[];
  pendingReferences: PendingReference[];
}

export interface TaskEditInitial {
  id: string;
  title: string;
  category: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  dueTime: string | null;
  note: string;
  workDate: string;
  assigneeUserIds: string[];
}

interface Props {
  open: boolean;
  defaultDueDate: string;
  mode?: "create" | "edit";
  initialTask?: TaskEditInitial | null;
  users: UserRef[];
  currentUserId: string | null;
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
  status: TaskStatus;
  dueDate: string;
  dueTime: string;
  note: string;
  assigneeUserIds: string[];
}

function initialForm(dueDate: string, defaultAssignees: string[]): FormState {
  return {
    title: "",
    category: "",
    priority: "medium",
    status: "todo",
    dueDate,
    dueTime: "",
    note: "",
    assigneeUserIds: defaultAssignees,
  };
}

function formFromTask(task: TaskEditInitial): FormState {
  return {
    title: task.title,
    category: task.category,
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate || task.workDate,
    dueTime: task.dueTime ?? "",
    note: task.note,
    assigneeUserIds: task.assigneeUserIds,
  };
}

export function TaskCreateModal({
  open,
  defaultDueDate,
  mode = "create",
  initialTask = null,
  users,
  currentUserId,
  onClose,
  onSubmit,
  notionItems,
  lineWorksItems,
  lineWorksChannels,
  storageItems,
  channelLabels,
}: Props) {
  const isEdit = mode === "edit" && !!initialTask;
  const defaultCreateAssignees = currentUserId ? [currentUserId] : [];
  const [form, setForm] = useState<FormState>(() =>
    isEdit && initialTask
      ? formFromTask(initialTask)
      : initialForm(defaultDueDate, defaultCreateAssignees),
  );
  const [pendingReferences, setPendingReferences] = useState<PendingReference[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (mode === "edit" && initialTask) {
        setForm(formFromTask(initialTask));
      } else {
        setForm(initialForm(defaultDueDate, defaultCreateAssignees));
      }
      setPendingReferences([]);
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDueDate, mode, initialTask, currentUserId]);

  if (!open) return null;

  const toggleAssignee = (userId: string) => {
    setForm((current) => {
      const has = current.assigneeUserIds.includes(userId);
      return {
        ...current,
        assigneeUserIds: has
          ? current.assigneeUserIds.filter((id) => id !== userId)
          : [...current.assigneeUserIds, userId],
      };
    });
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const dueTime = /^\d{2}:\d{2}$/.test(form.dueTime.trim()) ? form.dueTime.trim() : null;

    setSubmitting(true);
    try {
      await onSubmit({
        taskId: isEdit && initialTask ? initialTask.id : undefined,
        title: form.title,
        category: form.category,
        priority: form.priority,
        status: isEdit ? form.status : undefined,
        dueDate: form.dueDate || defaultDueDate,
        dueTime,
        note: form.note,
        assigneeUserIds: form.assigneeUserIds,
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
          <h3>{isEdit ? "태스크 편집" : "태스크 생성"}</h3>
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
            {isEdit ? (
              <label>
                <span className="field-label">상태</span>
                <select
                  name="status"
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as TaskStatus,
                    }))
                  }
                >
                  <option value="todo">할 일</option>
                  <option value="doing">진행 중</option>
                  <option value="done">완료</option>
                </select>
              </label>
            ) : null}
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

          <div className="assignee-picker">
            <p className="field-label">
              담당자 ({form.assigneeUserIds.length}명)
            </p>
            {users.length === 0 ? (
              <p className="empty-note">선택 가능한 유저가 없습니다.</p>
            ) : (
              <ul className="assignee-picker-list">
                {users.map((u) => {
                  const active = form.assigneeUserIds.includes(u.userId);
                  return (
                    <li key={u.userId}>
                      <button
                        type="button"
                        className={`assignee-chip ${active ? "active" : ""}`.trim()}
                        onClick={() => toggleAssignee(u.userId)}
                      >
                        {active ? "✓" : "+"} {u.userName ?? u.userId}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
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

          {isEdit ? null : (
            <ReferenceCollector
              pending={pendingReferences}
              onPendingChange={setPendingReferences}
              notionItems={notionItems}
              lineWorksItems={lineWorksItems}
              lineWorksChannels={lineWorksChannels}
              storageItems={storageItems}
              channelLabels={channelLabels}
            />
          )}

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
              {submitting ? "저장 중..." : isEdit ? "저장" : "업무 추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
