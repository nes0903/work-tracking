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
import { sourceIcon, sourceLabel, type TaskReference } from "@/lib/task-references";

export interface TaskAction {
  label: string;
  kind?: string;
  onClick: () => void;
}

interface TaskCardProps {
  task: Task;
  activeDate: string;
  actions: TaskAction[];
  references?: TaskReference[];
  onRemoveReference?: (referenceId: number, taskId: string) => void;
}

export function TaskCard({
  task,
  activeDate,
  actions,
  references,
  onRemoveReference,
}: TaskCardProps) {
  const effectivePriority = getEffectivePriority(task);
  const flagInfo = getTaskFlag(task, activeDate);
  const refList = references ?? [];

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

      {refList.length > 0 ? (
        <div className="task-references">
          {refList.map((reference) => (
            <div key={reference.id} className="task-reference">
              <span className="task-reference-icon">{sourceIcon(reference.source)}</span>
              {reference.externalUrl ? (
                <a
                  className="task-reference-title"
                  href={reference.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={reference.excerpt ?? reference.title ?? ""}
                >
                  {reference.title ?? reference.externalId}
                </a>
              ) : (
                <span
                  className="task-reference-title"
                  title={reference.excerpt ?? reference.title ?? ""}
                >
                  {reference.title ?? reference.externalId}
                </span>
              )}
              <span className="task-reference-source">{sourceLabel(reference.source)}</span>
              {onRemoveReference ? (
                <button
                  type="button"
                  className="task-reference-remove"
                  onClick={() => onRemoveReference(reference.id, task.id)}
                  aria-label="참조 해제"
                  title="참조 해제"
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

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
