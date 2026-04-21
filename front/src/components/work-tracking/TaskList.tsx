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

interface TreeRow {
  task: TaskListItem;
  visibleDepth: number;
}

export function TaskList({ items, onSelect, currentUserId }: Props) {
  if (items.length === 0) {
    return <p className="empty-note">조건에 맞는 태스크가 없습니다.</p>;
  }

  const rows = buildTreeRows(items);

  return (
    <div className="task-list-groups">
      <div className="task-list-section-head">
        <h3>태스크 트리</h3>
        <span className="task-list-section-count">{items.length}</span>
      </div>
      <ul className="task-rows task-tree-rows">
        {rows.map(({ task, visibleDepth }) => (
          <li key={task.id}>
            <TaskRow
              task={task}
              visibleDepth={visibleDepth}
              onSelect={onSelect}
              currentUserId={currentUserId ?? null}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildTreeRows(items: TaskListItem[]): TreeRow[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const rankById = new Map(items.map((item, index) => [item.id, index]));
  const childrenByParent = new Map<string, TaskListItem[]>();

  for (const item of items) {
    if (!item.parentTaskId || !itemById.has(item.parentTaskId)) {
      continue;
    }
    const list = childrenByParent.get(item.parentTaskId) ?? [];
    list.push(item);
    childrenByParent.set(item.parentTaskId, list);
  }

  const sortByRank = (left: TaskListItem, right: TaskListItem) =>
    (rankById.get(left.id) ?? 0) - (rankById.get(right.id) ?? 0);

  const roots = items
    .filter((item) => !item.parentTaskId || !itemById.has(item.parentTaskId))
    .sort(sortByRank);

  const rows: TreeRow[] = [];
  const walk = (task: TaskListItem, visibleDepth: number) => {
    rows.push({ task, visibleDepth });
    const children = (childrenByParent.get(task.id) ?? []).sort(sortByRank);
    for (const child of children) {
      walk(child, visibleDepth + 1);
    }
  };

  for (const root of roots) {
    walk(root, 1);
  }

  return rows;
}

function TaskRow({
  task,
  visibleDepth,
  onSelect,
  currentUserId,
}: {
  task: TaskListItem;
  visibleDepth: number;
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
      <div
        className="task-row-main"
        style={{ paddingLeft: `${Math.max(0, visibleDepth - 1) * 20}px` }}
      >
        <span className="task-row-title">
          {visibleDepth > 1 ? <span className="task-row-branch">↳</span> : null}
          {task.title || "제목 없음"}
        </span>
        <span className="task-row-meta">
          <span className={`task-row-status status-${task.status}`}>
            {statusLabel(task.status)}
          </span>
          {task.category ? (
            <span className="task-row-category">{task.category}</span>
          ) : null}
          {task.parentTitle && visibleDepth === 1 ? (
            <span className="task-row-parent">상위: {task.parentTitle}</span>
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
      ) : task.childCount > 0 ? (
        <span
          className="task-row-ref"
          title={`하위 태스크 ${task.childCount}개`}
        >
          ↳ {task.childCount}
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
          .join(", ") +
        (task.assignees.length > 3 ? ` 외 ${task.assignees.length - 3}명` : "");
  if (task.assignees.length === 0) return creator;
  if (task.assignees.length === 1 && task.assignees[0].userName === creator) {
    return creator;
  }
  return `${creator} → ${assigneeNames}`;
}
