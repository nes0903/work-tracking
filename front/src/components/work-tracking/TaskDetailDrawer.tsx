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
import { safeHostname } from "@/lib/url-utils";

interface Props {
  task: TaskListItem | null;
  onClose: () => void;
  onDelete: (task: TaskListItem) => Promise<void> | void;
  onChangeStatus: (
    task: TaskListItem,
    status: TaskStatus,
  ) => Promise<void> | void;
  onOpenReference: (ref: TaskReference) => void;
  onAddReference: (task: TaskListItem) => void;
  onEdit: (task: TaskListItem) => void;
}

export function TaskDetailDrawer({
  task,
  onClose,
  onDelete,
  onChangeStatus,
  onOpenReference,
  onAddReference,
  onEdit,
}: Props) {
  const [references, setReferences] = useState<TaskReference[]>([]);
  const [loadedTaskId, setLoadedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!task) {
      return;
    }
    let mounted = true;
    void fetchReferencesForTasks([task.id])
      .then((map) => {
        if (!mounted) return;
        setReferences(map[task.id] ?? []);
        setLoadedTaskId(task.id);
      })
      .catch(() => {
        if (!mounted) return;
        setReferences([]);
        setLoadedTaskId(task.id);
      });
    return () => {
      mounted = false;
    };
  }, [task]);

  if (!task) return null;

  const loading = loadedTaskId !== task.id;

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
            <strong>
              {task.assignees.length === 0
                ? "미지정"
                : task.assignees.map((a) => a.userName ?? a.userId).join(", ")}
            </strong>
          </p>
        </section>

        {task.parentTitle ? (
          <section className="task-drawer-section">
            <p className="field-label">상위 태스크</p>
            <p className="task-drawer-meta">{task.parentTitle}</p>
          </section>
        ) : null}

        {task.childCount > 0 ? (
          <section className="task-drawer-section">
            <p className="field-label">하위 태스크</p>
            <p className="task-drawer-meta">{task.childCount}개 포함</p>
          </section>
        ) : null}

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
              {references.map((ref) => {
                const { title, excerpt } = buildRefDisplay(ref);
                return (
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
                        <span className="task-drawer-ref-title">{title}</span>
                        {excerpt ? (
                          <span className="task-drawer-ref-excerpt">
                            {excerpt}
                          </span>
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
                );
              })}
            </ul>
          )}
        </section>

        <footer className="task-drawer-foot">
          <div className="task-drawer-foot-actions">
            {task.status !== "done" ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => void onChangeStatus(task, "done")}
              >
                완료
              </button>
            ) : null}
            <button
              type="button"
              className="secondary-button"
              onClick={() => onEdit(task)}
            >
              수정
            </button>
          </div>
          <button
            type="button"
            className="text-button task-drawer-delete"
            disabled={task.childCount > 0}
            title={
              task.childCount > 0
                ? "하위 태스크가 있으면 삭제할 수 없습니다."
                : undefined
            }
            onClick={() => void onDelete(task)}
          >
            태스크 삭제
          </button>
        </footer>
      </aside>
    </div>
  );
}

function buildRefDisplay(ref: TaskReference): {
  title: string;
  excerpt: string | null;
} {
  const metadata = (ref.metadata ?? {}) as Record<string, unknown>;
  const channelTitle =
    typeof metadata.channelTitle === "string" && metadata.channelTitle
      ? metadata.channelTitle
      : null;

  if (ref.source === "line_works_message") {
    const body =
      (typeof metadata.text === "string" && metadata.text) ||
      ref.excerpt ||
      ref.title ||
      "";
    const displayBody = body.replace(/\s+/g, " ").trim();
    const truncated =
      displayBody.length > 100 ? `${displayBody.slice(0, 100)}…` : displayBody;
    return {
      title: truncated || "(본문 없음)",
      excerpt: channelTitle ? `채팅방: ${channelTitle}` : null,
    };
  }

  if (ref.source === "line_works_attachment") {
    const fileName =
      (typeof metadata.fileName === "string" && metadata.fileName) ||
      ref.title ||
      "파일";
    const parts: string[] = [];
    if (channelTitle) parts.push(`채팅방: ${channelTitle}`);
    if (typeof metadata.mimeType === "string" && metadata.mimeType) {
      parts.push(metadata.mimeType);
    }
    return {
      title: fileName,
      excerpt: parts.length > 0 ? parts.join(" · ") : null,
    };
  }

  if (ref.source === "site_link") {
    const url =
      (typeof metadata.url === "string" && metadata.url) ||
      ref.externalUrl ||
      null;
    const category =
      typeof metadata.category === "string" && metadata.category
        ? metadata.category
        : null;
    const host = url ? safeHostname(url) : null;
    const parts = [category, host].filter(Boolean);
    return {
      title: ref.title ?? url ?? "링크",
      excerpt: parts.length > 0 ? parts.join(" · ") : ref.excerpt ?? url,
    };
  }

  return {
    title: ref.title ?? "제목 없음",
    excerpt: ref.excerpt ?? null,
  };
}
