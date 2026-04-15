"use client";

import {
  formatDeadlineLabel,
  formatShortDate,
  formatTime,
  getEffectivePriority,
  getTaskFlag,
  isTaskOverdue,
  priorityLabel,
  type Task,
} from "@/lib/work-tracking";

export interface TaskAction {
  label: string;
  kind?: string;
  onClick: () => void;
}

interface TaskCardProps {
  task: Task;
  activeDate: string;
  actions: TaskAction[];
}

export function TaskCard({ task, activeDate, actions }: TaskCardProps) {
  const effectivePriority = getEffectivePriority(task);
  const flagInfo = getTaskFlag(task, activeDate);

  return (
    <article className="task-card">
      <div className="task-card-top">
        <div>
          <p className="task-category">{task.category || "분류 없음"}</p>
          <h4 className="task-title">{task.title}</h4>
        </div>
        <div className="task-badges">
          <span className={`task-priority priority-${effectivePriority}`}>
            {priorityLabel[effectivePriority]}
          </span>
          {flagInfo ? (
            <span className={`task-flag ${flagInfo.kind}`}>{flagInfo.label}</span>
          ) : null}
        </div>
      </div>

      <p className="task-note">{task.note || "메모 없음"}</p>

      <div className="task-meta">
        <span className="task-estimate">예상 {task.estimate}분</span>
        <span className={`task-deadline ${isTaskOverdue(task, activeDate) ? "is-overdue" : ""}`.trim()}>
          {formatDeadlineLabel(task, activeDate)}
        </span>
        <span className="task-origin">
          {task.carryoverCount > 0
            ? `${formatShortDate(task.carriedFromDate)}에서 승계`
            : `등록 ${formatTime(task.createdAt)}`}
        </span>
      </div>

      <div className="task-actions">
        {actions.map((action) => (
          <button
            key={`${task.id}-${action.label}`}
            type="button"
            className={`task-action ${action.kind ?? ""}`.trim()}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
    </article>
  );
}
