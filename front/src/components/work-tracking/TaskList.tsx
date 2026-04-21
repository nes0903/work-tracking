"use client";

import {
  dueBadge,
  priorityLabel,
  statusLabel,
  type TaskListItem,
} from "@/lib/tasks-api";

interface Props {
  items: TaskListItem[];
  onSelect: (task: TaskListItem) => void;
  currentUserId?: string | null;
}

export function TaskList({ items, onSelect, currentUserId }: Props) {
  if (items.length === 0) {
    return <p className="empty-note">조건에 맞는 태스크가 없습니다.</p>;
  }

  const groups: Record<"todo" | "doing" | "done", TaskListItem[]> = {
    todo: [],
    doing: [],
    done: [],
  };
  for (const item of items) {
    groups[item.status].push(item);
  }

  return (
    <div className="task-list-groups">
      {(["todo", "doing", "done"] as const).map((status) =>
        groups[status].length === 0 ? null : (
          <section key={status} className={`task-list-section status-${status}`}>
            <header className="task-list-section-head">
              <h3>{statusLabel(status)}</h3>
              <span className="task-list-section-count">{groups[status].length}</span>
            </header>
            <ul className="task-rows">
              {groups[status].map((task) => (
                <li key={task.id}>
                  <TaskRow task={task} onSelect={onSelect} currentUserId={currentUserId ?? null} />
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

function TaskRow({
  task,
  onSelect,
  currentUserId,
}: {
  task: TaskListItem;
  onSelect: (task: TaskListItem) => void;
  currentUserId: string | null;
}) {
  const badge = dueBadge(task.dueDate);
  const isMine =
    currentUserId !== null &&
    task.assignees.some((a) => a.userId === currentUserId);

  return (
    <button type="button" className="task-row" onClick={() => onSelect(task)}>
      <span className={`task-row-priority priority-${task.priority}`}>
        {priorityLabel(task.priority)}
      </span>
      <div className="task-row-main">
        <span className="task-row-title">{task.title || "제목 없음"}</span>
        <span className="task-row-meta">
          {task.category ? (
            <span className="task-row-category">{task.category}</span>
          ) : null}
          <span className="task-row-assignees">
            {formatAssignment(task)}
            {isMine ? <span className="task-row-mine">내 담당</span> : null}
          </span>
        </span>
      </div>
      <span className={`task-row-due tone-${badge.tone}`}>{badge.text}</span>
      {task.referenceCount > 0 ? (
        <span className="task-row-ref" title={`참조 ${task.referenceCount}건`}>
          📎 {task.referenceCount}
        </span>
      ) : null}
    </button>
  );
}

function formatAssignment(task: TaskListItem): string {
  const creator = task.createdBy?.userName ?? "미지정";
  const assigneeNames =
    task.assignees.length === 0
      ? "미지정"
      : task.assignees
          .slice(0, 3)
          .map((a) => a.userName ?? a.userId)
          .join(", ") + (task.assignees.length > 3 ? ` 외 ${task.assignees.length - 3}명` : "");
  if (task.assignees.length === 0) return creator;
  if (task.assignees.length === 1 && task.assignees[0].userName === creator) {
    return creator;
  }
  return `${creator} → ${assigneeNames}`;
}
