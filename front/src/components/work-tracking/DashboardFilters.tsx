"use client";

import type { TaskPriority, TaskSortKey, TaskStatus, UserRef } from "@/lib/tasks-api";

export interface FiltersValue {
  q: string;
  assignee: string;                 // userId | "me" | "all"
  priorities: TaskPriority[];
  statuses: TaskStatus[];
  sort: TaskSortKey;
  order: "asc" | "desc";
}

interface Props {
  value: FiltersValue;
  onChange: (next: FiltersValue) => void;
  users: UserRef[];
  counts: { todo: number; doing: number; done: number; total: number };
}

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: "high", label: "높음" },
  { value: "medium", label: "중간" },
  { value: "low", label: "낮음" },
];

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "todo", label: "할 일" },
  { value: "doing", label: "진행 중" },
  { value: "done", label: "완료" },
];

export function DashboardFilters({ value, onChange, users, counts }: Props) {
  const togglePriority = (p: TaskPriority) => {
    const next = value.priorities.includes(p)
      ? value.priorities.filter((v) => v !== p)
      : [...value.priorities, p];
    onChange({ ...value, priorities: next });
  };

  const toggleStatus = (s: TaskStatus) => {
    const next = value.statuses.includes(s)
      ? value.statuses.filter((v) => v !== s)
      : [...value.statuses, s];
    onChange({ ...value, statuses: next });
  };

  return (
    <div className="dashboard-filters">
      <div className="dashboard-filters-row">
        <input
          type="search"
          className="dashboard-search"
          placeholder="제목·카테고리·메모 검색..."
          value={value.q}
          onChange={(event) => onChange({ ...value, q: event.target.value })}
        />
        <select
          className="dashboard-select"
          value={value.assignee}
          onChange={(event) => onChange({ ...value, assignee: event.target.value })}
        >
          <option value="all">담당자: 전체</option>
          <option value="me">내가 담당</option>
          {users.map((user) => (
            <option key={user.userId} value={user.userId}>
              {user.userName ?? user.userId.slice(0, 8)}
            </option>
          ))}
        </select>
        <select
          className="dashboard-select"
          value={`${value.sort}:${value.order}`}
          onChange={(event) => {
            const [sort, order] = event.target.value.split(":") as [TaskSortKey, "asc" | "desc"];
            onChange({ ...value, sort, order });
          }}
        >
          <option value="priority:desc">우선순위 높은 순</option>
          <option value="priority:asc">우선순위 낮은 순</option>
          <option value="due:asc">마감 빠른 순</option>
          <option value="due:desc">마감 늦은 순</option>
          <option value="created:desc">최신 생성순</option>
          <option value="created:asc">오래된 생성순</option>
        </select>
      </div>

      <div className="dashboard-filters-row dashboard-filters-chips">
        <span className="field-label">우선순위</span>
        {PRIORITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`filter-chip ${value.priorities.includes(opt.value) ? "active" : ""}`.trim()}
            onClick={() => togglePriority(opt.value)}
          >
            {opt.label}
          </button>
        ))}
        <span className="dashboard-filters-divider">·</span>
        <span className="field-label">상태</span>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`filter-chip ${value.statuses.includes(opt.value) ? "active" : ""}`.trim()}
            onClick={() => toggleStatus(opt.value)}
          >
            {opt.label} ({counts[opt.value]})
          </button>
        ))}
      </div>
    </div>
  );
}
