"use client";

import { useEffect, useState } from "react";
import {
  detachReference,
  fetchReferencesForTasks,
  sourceIcon,
  sourceLabel,
  type TaskReference,
} from "@/lib/task-references";
import {
  dueBadge,
  priorityLabel,
  statusLabel,
  type TaskListItem,
  type TaskStatus,
} from "@/lib/tasks-api";

interface Props {
  task: TaskListItem | null;
  onClose: () => void;
  onChangeStatus: (task: TaskListItem, status: TaskStatus) => Promise<void> | void;
  onDelete: (task: TaskListItem) => Promise<void> | void;
  onOpenReference: (ref: TaskReference) => void;
  onAddReference: (task: TaskListItem) => void;
  onEdit: (task: TaskListItem) => void;
}

export function TaskDetailDrawer({
  task,
  onClose,
  onChangeStatus,
  onDelete,
  onOpenReference,
  onAddReference,
  onEdit,
}: Props) {
  const [references, setReferences] = useState<TaskReference[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!task) {
      setReferences([]);
      return;
    }
    let mounted = true;
    setLoading(true);
    void fetchReferencesForTasks([task.id]).then((map) => {
      if (!mounted) return;
      setReferences(map[task.id] ?? []);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [task]);

  if (!task) return null;

  async function handleRemoveRef(ref: TaskReference) {
    const ok = window.confirm("이 참조를 제거할까요?");
    if (!ok) return;
    const removed = await detachReference(ref.id);
    if (removed) {
      setReferences((prev) => prev.filter((r) => r.id !== ref.id));
    } else {
      window.alert("제거 실패");
    }
  }

  const badge = dueBadge(task.dueDate);

  return (
    <div
      className="drawer-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="task-drawer">
        <header className="task-drawer-head">
          <div className="task-drawer-head-top">
            <span className={`task-row-priority priority-${task.priority}`}>
              {priorityLabel(task.priority)}
            </span>
            <span className={`task-drawer-status status-${task.status}`}>
              {statusLabel(task.status)}
            </span>
            <button
              type="button"
              className="text-button task-drawer-edit"
              onClick={() => onEdit(task)}
            >
              편집
            </button>
            <button
              type="button"
              className="modal-close"
              aria-label="닫기"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <h3 className="task-drawer-title">{task.title || "제목 없음"}</h3>
          <div className="task-drawer-meta">
            {task.category ? <span>📂 {task.category}</span> : null}
            <span>
              📅 {task.workDate}
              {task.dueTime ? ` ${task.dueTime}` : ""}
            </span>
            <span className={`tone-${badge.tone}`}>⏰ {badge.text}</span>
          </div>
        </header>

        <section className="task-drawer-section">
          <p className="field-label">담당</p>
          <p className="task-drawer-meta">
            <strong>{task.createdBy?.userName ?? "미지정"}</strong>
            <span className="task-drawer-arrow">→</span>
            <strong>{task.assignee?.userName ?? "미지정"}</strong>
          </p>
        </section>

        {task.note ? (
          <section className="task-drawer-section">
            <p className="field-label">메모</p>
            <p className="task-drawer-note">{task.note}</p>
          </section>
        ) : null}

        <section className="task-drawer-section">
          <div className="task-drawer-refs-head">
            <p className="field-label">참조 ({references.length})</p>
            <button
              type="button"
              className="text-button"
              onClick={() => onAddReference(task)}
            >
              + 추가
            </button>
          </div>
          {loading ? (
            <p className="empty-note">불러오는 중...</p>
          ) : references.length === 0 ? (
            <p className="empty-note">연결된 참조가 없습니다.</p>
          ) : (
            <ul className="task-drawer-refs">
              {references.map((ref) => (
                <li key={ref.id}>
                  <button
                    type="button"
                    className="task-drawer-ref-item"
                    onClick={() => onOpenReference(ref)}
                  >
                    <span className="task-drawer-ref-source">
                      {sourceIcon(ref.source)} {sourceLabel(ref.source)}
                    </span>
                    <div className="task-drawer-ref-main">
                      <span className="task-drawer-ref-title">
                        {ref.title ?? "제목 없음"}
                      </span>
                      {ref.excerpt ? (
                        <span className="task-drawer-ref-excerpt">{ref.excerpt}</span>
                      ) : null}
                    </div>
                    <span className="task-drawer-ref-arrow">↗</span>
                  </button>
                  <button
                    type="button"
                    className="task-drawer-ref-remove"
                    onClick={() => void handleRemoveRef(ref)}
                    aria-label="참조 제거"
                    title="참조 제거"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="task-drawer-foot">
          <div className="task-drawer-status-actions">
            {task.status !== "todo" ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void onChangeStatus(task, "todo")}
              >
                할 일로
              </button>
            ) : null}
            {task.status !== "doing" ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void onChangeStatus(task, "doing")}
              >
                진행 중으로
              </button>
            ) : null}
            {task.status !== "done" ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => void onChangeStatus(task, "done")}
              >
                완료
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="text-button task-drawer-delete"
            onClick={() => void onDelete(task)}
          >
            태스크 삭제
          </button>
        </footer>
      </aside>
    </div>
  );
}
