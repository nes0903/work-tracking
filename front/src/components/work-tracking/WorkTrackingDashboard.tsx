"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GithubRepoCard } from "./GithubRepoCard";
import { TaskCard, type TaskAction } from "./TaskCard";
import {
  activityColor,
  activityIcon,
  buildActivitySubtitle,
  clamp,
  emptyGithubFeed,
  emptyNotionFeed,
  formatDateCaption,
  formatDateKey,
  formatDateTime,
  formatDeadlineLabel,
  getDay,
  getEffectivePriority,
  isTaskOverdue,
  loadDaysFromStorage,
  parseDateKey,
  priorityLabel,
  relativeTime,
  sortTasksForDisplay,
  statusLabel,
  todayKey,
  type GithubFeed,
  type NotionFeed,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type WorkDayMap,
} from "@/lib/work-tracking";

interface TaskFormState {
  title: string;
  category: string;
  priority: TaskPriority;
  dueDate: string;
  estimate: string;
  note: string;
}

const PROFILE_NAME = "Noh Yusung";
const PROFILE_ROLE = "Principal Operator";
const QUICK_LINKS = [
  {
    label: "Library Hub 열기",
    href: "https://dobedub.vogopang.com/library-hub",
  },
  {
    label: "푸딩툰 이용자",
    href: "https://www.puddingtoon.com/home",
  },
  {
    label: "푸딩툰 관리자",
    href: "https://admin2.puddingtoon.org",
  },
  {
    label: "덥라이트 운영",
    href: "https://staging.dubright.org",
  },
  {
    label: "픽미툰 이용자",
    href: "https://www.pickmetoon.com",
  },
  {
    label: "픽미툰 관리자",
    href: "https://admin.pickmetoon.com",
  },
] as const;

function createTaskFormState(dateKey: string): TaskFormState {
  return {
    title: "",
    category: "",
    priority: "medium",
    dueDate: dateKey,
    estimate: "30",
    note: "",
  };
}

export function WorkTrackingDashboard() {
  const initialDate = todayKey();
  const taskTitleRef = useRef<HTMLInputElement>(null);
  const [days, setDays] = useState<WorkDayMap>({});
  const [activeDate, setActiveDate] = useState(initialDate);
  const [taskForm, setTaskForm] = useState<TaskFormState>(() => createTaskFormState(initialDate));
  const [notionFeed, setNotionFeed] = useState<NotionFeed>(() => emptyNotionFeed());
  const [githubFeed, setGithubFeed] = useState<GithubFeed>(() => emptyGithubFeed());
  const [githubFilter, setGithubFilter] = useState("all");
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const activeDay = useMemo(() => getDay(days, activeDate), [activeDate, days]);

  useEffect(() => {
    let mounted = true;

    async function initializeDashboard() {
      const today = todayKey();

      try {
        const legacyDays = loadDaysFromStorage();
        const hasLegacyDays = Object.keys(legacyDays).length > 0;

        if (hasLegacyDays) {
          const imported = await postDashboardAction({
            action: "importLegacyDays",
            date: today,
            days: legacyDays,
          });
          if (!mounted) {
            return;
          }
          applyDashboardState(today, imported.days, { resetTaskForm: true, syncNotes: true });
        } else {
          const state = await fetchDashboardState(today);
          if (!mounted) {
            return;
          }
          applyDashboardState(today, state.days, { resetTaskForm: true, syncNotes: true });
        }
      } catch (error) {
        console.error("[dashboard] failed to initialize", error);
      } finally {
        if (mounted) {
          setHasHydrated(true);
        }
      }
    }

    void initializeDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated || notesDraft === activeDay.notes) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await postDashboardAction({
            action: "updateNotes",
            date: activeDate,
            notes: notesDraft,
          });
          applyDashboardState(activeDate, result.days, {
            syncNotes: false,
          });
        } catch (error) {
          console.error("[dashboard] failed to save notes", error);
        }
      })();
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeDate, activeDay.notes, hasHydrated, notesDraft]);

  useEffect(() => {
    let mounted = true;

    async function loadNotionUpdates() {
      try {
        const response = await fetch(`/api/notion-updates?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as NotionFeed;
        if (!mounted) {
          return;
        }

        setNotionFeed({
          lastSyncedAt: payload.lastSyncedAt ?? null,
          items: Array.isArray(payload.items) ? payload.items : [],
        });
      } catch {
        if (mounted) {
          setNotionFeed(emptyNotionFeed());
        }
      }
    }

    async function loadGithubUpdates() {
      try {
        const response = await fetch(`/api/github-updates?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as GithubFeed;
        if (!mounted) {
          return;
        }

        setGithubFeed({
          lastSyncedAt: payload.lastSyncedAt ?? null,
          repos: Array.isArray(payload.repos) ? payload.repos : [],
          items: Array.isArray(payload.items) ? payload.items : [],
        });
      } catch {
        if (mounted) {
          setGithubFeed(emptyGithubFeed());
        }
      }
    }

    loadNotionUpdates();
    loadGithubUpdates();

    const notionIntervalId = window.setInterval(loadNotionUpdates, 60 * 1000);
    const githubIntervalId = window.setInterval(loadGithubUpdates, 60 * 1000);

    return () => {
      mounted = false;
      window.clearInterval(notionIntervalId);
      window.clearInterval(githubIntervalId);
    };
  }, []);

  useEffect(() => {
    if (githubFilter === "all") {
      return;
    }

    const filterStillExists = githubFeed.repos.some((repo) => repo.repo === githubFilter);
    if (!filterStillExists) {
      setGithubFilter("all");
    }
  }, [githubFeed.repos, githubFilter]);

  useEffect(() => {
    if (!isTimerRunning) {
      return;
    }

    const sessionDate = activeDate;
    const sessionDuration = activeDay.timerDuration;
    const intervalId = window.setInterval(() => {
      setTimerRemainingSeconds((previous) => {
        if (previous <= 1) {
          window.clearInterval(intervalId);
          setIsTimerRunning(false);
          void (async () => {
            try {
              const result = await postDashboardAction({
                action: "recordFocusSession",
                date: sessionDate,
                durationMinutes: sessionDuration,
              });
              applyDashboardState(sessionDate, result.days, {
                syncNotes: sessionDate === activeDate,
              });
            } catch (error) {
              console.error("[dashboard] failed to record focus session", error);
            }
          })();
          return sessionDuration * 60;
        }

        return previous - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeDate, activeDay.timerDuration, isTimerRunning]);

  const todoTasks = useMemo(
    () => sortTasksForDisplay(activeDay.tasks.filter((task) => task.status === "todo")),
    [activeDay.tasks],
  );
  const doingTasks = useMemo(
    () => sortTasksForDisplay(activeDay.tasks.filter((task) => task.status === "doing")),
    [activeDay.tasks],
  );
  const doneTasks = useMemo(
    () => sortTasksForDisplay(activeDay.tasks.filter((task) => task.status === "done")),
    [activeDay.tasks],
  );
  const upcomingTasks = useMemo(
    () =>
      sortTasksForDisplay(activeDay.tasks.filter((task) => task.status !== "done")).slice(0, 4),
    [activeDay.tasks],
  );
  const activityTasks = useMemo(
    () =>
      [...activeDay.tasks]
        .sort(
          (left, right) =>
            new Date(right.updatedAt || right.createdAt).getTime() -
            new Date(left.updatedAt || left.createdAt).getTime(),
        )
        .slice(0, 5),
    [activeDay.tasks],
  );
  const completion = activeDay.tasks.length
    ? Math.round((doneTasks.length / activeDay.tasks.length) * 100)
    : 0;

  const weeklyChart = useMemo(() => {
    const points: number[] = [];
    const labels: string[] = [];
    const today = parseDateKey(activeDate);

    for (let index = 6; index >= 0; index -= 1) {
      const current = new Date(today);
      current.setDate(today.getDate() - index);
      const key = formatDateKey(current);
      const day = getDay(days, key);
      const completedCount = day.tasks.filter((task) => task.status === "done").length;
      points.push(completedCount * 20 + day.focusMinutes);
      labels.push(
        new Intl.DateTimeFormat("ko-KR", {
          month: "numeric",
          day: "numeric",
        }).format(current),
      );
    }

    const max = Math.max(60, ...points);
    const chartPoints = points.map((value, index) => {
      const x = 60 + (540 / 6) * index;
      const y = 220 - (value / max) * 160;
      return { x, y, value, label: labels[index] };
    });

    return {
      chartPoints,
      polylinePoints: chartPoints.map((point) => `${point.x},${point.y}`).join(" "),
    };
  }, [activeDate, days]);

  const githubFilters = useMemo(
    () => ["all", ...githubFeed.repos.map((repo) => repo.repo).filter(Boolean)] as string[],
    [githubFeed.repos],
  );

  const visibleRepos = useMemo(
    () =>
      githubFeed.repos.filter((repo) => (githubFilter === "all" ? true : repo.repo === githubFilter)),
    [githubFeed.repos, githubFilter],
  );

  function applyDashboardState(
    dateKey: string,
    nextDays: WorkDayMap,
    options?: {
      resetTaskForm?: boolean;
      syncNotes?: boolean;
    },
  ) {
    setIsTimerRunning(false);
    setDays(nextDays);
    setActiveDate(dateKey);
    setTimerRemainingSeconds(getDay(nextDays, dateKey).timerDuration * 60);

    if (options?.resetTaskForm) {
      setTaskForm(createTaskFormState(dateKey));
    }

    if (options?.syncNotes) {
      setNotesDraft(getDay(nextDays, dateKey).notes);
    }
  }

  async function fetchDashboardState(dateKey: string) {
    const response = await fetch(`/api/dashboard?date=${encodeURIComponent(dateKey)}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as { ok: boolean; days?: WorkDayMap; error?: string };

    if (!response.ok || !payload.ok || !payload.days) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    return {
      days: payload.days,
    };
  }

  async function postDashboardAction(payload: Record<string, unknown>) {
    const response = await fetch("/api/dashboard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as { ok: boolean; days?: WorkDayMap; error?: string };

    if (!response.ok || !body.ok || !body.days) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }

    return {
      days: body.days,
    };
  }

  async function mutateDashboard(
    payload: Record<string, unknown>,
    options?: {
      date?: string;
      resetTaskForm?: boolean;
      syncNotes?: boolean;
    },
  ) {
    const result = await postDashboardAction(payload);
    applyDashboardState(options?.date || activeDate, result.days, {
      resetTaskForm: options?.resetTaskForm,
      syncNotes: options?.syncNotes,
    });
    return result;
  }

  async function switchToDate(dateKey: string) {
    const result = await fetchDashboardState(dateKey);
    applyDashboardState(dateKey, result.days, {
      resetTaskForm: true,
      syncNotes: true,
    });
  }

  function changeDay(offset: number) {
    const current = parseDateKey(activeDate);
    current.setDate(current.getDate() + offset);
    void switchToDate(formatDateKey(current));
  }

  async function handleCreateTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await mutateDashboard(
        {
          action: "createTask",
          date: activeDate,
          task: {
            title: taskForm.title,
            category: taskForm.category,
            priority: taskForm.priority,
            dueDate: taskForm.dueDate || activeDate,
            estimate: Number(taskForm.estimate || 0),
            note: taskForm.note,
          },
        },
        {
          date: activeDate,
          resetTaskForm: true,
          syncNotes: false,
        },
      );
    } catch (error) {
      console.error("[dashboard] failed to create task", error);
    }
  }

  function updateTaskStatus(taskId: string, nextStatus: TaskStatus) {
    void mutateDashboard(
      {
        action: "updateTaskStatus",
        date: activeDate,
        taskId,
        status: nextStatus,
      },
      {
        date: activeDate,
        syncNotes: false,
      },
    ).catch((error) => {
      console.error("[dashboard] failed to update task status", error);
    });
  }

  function deleteTask(taskId: string) {
    void mutateDashboard(
      {
        action: "deleteTask",
        date: activeDate,
        taskId,
      },
      {
        date: activeDate,
        syncNotes: false,
      },
    ).catch((error) => {
      console.error("[dashboard] failed to delete task", error);
    });
  }

  function clearCompleted() {
    void mutateDashboard(
      {
        action: "clearCompleted",
        date: activeDate,
      },
      {
        date: activeDate,
        syncNotes: false,
      },
    ).catch((error) => {
      console.error("[dashboard] failed to clear completed tasks", error);
    });
  }

  function clearNotes() {
    setNotesDraft("");
    void mutateDashboard(
      {
        action: "updateNotes",
        date: activeDate,
        notes: "",
      },
      {
        date: activeDate,
        syncNotes: true,
      },
    ).catch((error) => {
      console.error("[dashboard] failed to clear notes", error);
    });
  }

  function updateTimerDuration(value: string) {
    const minutes = clamp(Number(value || 25), 1, 180);
    setIsTimerRunning(false);
    void mutateDashboard(
      {
        action: "updateTimerDuration",
        date: activeDate,
        timerDuration: minutes,
      },
      {
        date: activeDate,
        syncNotes: false,
      },
    ).catch((error) => {
      console.error("[dashboard] failed to update timer duration", error);
      setTimerRemainingSeconds(minutes * 60);
    });
  }

  function resetTimer() {
    setIsTimerRunning(false);
    setTimerRemainingSeconds(activeDay.timerDuration * 60);
  }

  function buildActions(task: Task): TaskAction[] {
    const actions: TaskAction[] = [];

    if (task.status === "todo") {
      actions.push({
        label: "진행 시작",
        onClick: () => updateTaskStatus(task.id, "doing"),
      });
    }

    if (task.status === "doing") {
      actions.push({
        label: "할 일로 되돌리기",
        onClick: () => updateTaskStatus(task.id, "todo"),
      });
      actions.push({
        label: "완료 처리",
        onClick: () => updateTaskStatus(task.id, "done"),
      });
    }

    if (task.status === "done") {
      actions.push({
        label: "다시 할 일",
        onClick: () => updateTaskStatus(task.id, "todo"),
      });
    }

    actions.push({
      label: "삭제",
      kind: "delete",
      onClick: () => deleteTask(task.id),
    });

    return actions;
  }

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>Executive</h1>
          <p>WORK TRACKING SUITE</p>
        </div>

        <nav className="sidebar-nav">
          <button className="nav-item nav-item-active" type="button">
            Dashboard
          </button>
          <button className="nav-item" type="button">
            Analytics
          </button>
          <button className="nav-item" type="button">
            Reports
          </button>
          <button className="nav-item" type="button">
            Archive
          </button>
        </nav>

        <div className="sidebar-footer">
          {QUICK_LINKS.map((link) => (
            <a
              key={link.href}
              className="sidebar-link"
              href={link.href}
              target="_blank"
              rel="noreferrer"
            >
              {link.label}
            </a>
          ))}
          <button className="sidebar-cta" type="button">
            오늘 계획 정리
          </button>
        </div>
      </aside>

      <div className="app-shell">
        <header className="topbar">
          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              type="text"
              placeholder="업무, 메모, 카테고리 검색은 다음 단계에서 붙일 예정입니다."
              disabled
            />
          </div>

          <div className="topbar-right">
            <div className="date-panel">
              <label className="field-label" htmlFor="selected-date">
                기준 날짜
              </label>
              <div className="date-row">
                <button
                  id="previous-day"
                  className="icon-button"
                  type="button"
                  aria-label="이전 날짜"
                  onClick={() => changeDay(-1)}
                >
                  ◀
                </button>
                  <input
                    id="selected-date"
                    type="date"
                    value={activeDate}
                    onChange={(event) => {
                      void switchToDate(event.target.value);
                    }}
                  />
                <button
                  id="next-day"
                  className="icon-button"
                  type="button"
                  aria-label="다음 날짜"
                  onClick={() => changeDay(1)}
                >
                  ▶
                </button>
              </div>
              <p id="date-caption" className="date-caption">
                {formatDateCaption(activeDate)}
              </p>
            </div>

            <div className="profile-chip">
              <div className="profile-avatar">NY</div>
              <div>
                <strong>{PROFILE_NAME}</strong>
                <p>{PROFILE_ROLE}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="content">
          <section className="page-header">
            <div>
              <h2>Work Tracking Dashboard</h2>
              <p>오늘 해야 할 일과 집중 시간을 고급 대시보드 형태로 관리합니다.</p>
            </div>
            <div className="page-header-actions">
              <button id="clear-completed" className="secondary-button" type="button" onClick={clearCompleted}>
                완료 항목 정리
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => taskTitleRef.current?.focus()}
              >
                + 새 업무
              </button>
            </div>
          </section>

          <section className="stats-grid">
            <StatCard icon="▣" pillClassName="positive" pillLabel="오늘 기준" label="전체 할 일" value={String(activeDay.tasks.length)} iconClassName="stat-icon-primary" />
            <StatCard icon="✓" pillClassName="positive" pillLabel={`${completion}%`} label="완료" value={String(doneTasks.length)} iconClassName="stat-icon-warm" />
            <StatCard icon="↻" pillClassName="neutral" pillLabel="Live" label="진행 중" value={String(doingTasks.length)} iconClassName="stat-icon-cool" />
            <StatCard icon="◔" pillClassName="alert" pillLabel="Focus" label="집중 시간" value={`${activeDay.focusMinutes}분`} iconClassName="stat-icon-alert" />
          </section>

          <section className="hero-grid">
            <article className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <h3>Weekly Momentum</h3>
                  <p>최근 7일간 완료/집중 흐름을 요약합니다.</p>
                </div>
              </div>

              <div className="chart-meta">
                <span>완료율</span>
                <div className="progress-track">
                  <div id="completion-bar" className="progress-bar" style={{ width: `${completion}%` }} />
                </div>
              </div>

              <div className="chart-wrap">
                <svg id="weekly-chart" viewBox="0 0 640 260" role="img" aria-label="주간 업무 추이 차트">
                  <g className="chart-grid">
                    <line x1="60" y1="30" x2="60" y2="220" />
                    <line x1="60" y1="220" x2="600" y2="220" />
                    <line x1="60" y1="180" x2="600" y2="180" />
                    <line x1="60" y1="140" x2="600" y2="140" />
                    <line x1="60" y1="100" x2="600" y2="100" />
                    <line x1="60" y1="60" x2="600" y2="60" />
                  </g>
                  <polyline id="weekly-line" className="chart-line" points={weeklyChart.polylinePoints} />
                  <g id="weekly-dots">
                    {weeklyChart.chartPoints.map((point) => (
                      <circle
                        key={`dot-${point.label}`}
                        className="chart-dot"
                        cx={point.x}
                        cy={point.y}
                        r="6"
                      />
                    ))}
                  </g>
                  <g id="weekly-labels">
                    {weeklyChart.chartPoints.map((point) => (
                      <text key={`label-${point.label}`} className="chart-label" x={point.x} y="244">
                        {point.label}
                      </text>
                    ))}
                  </g>
                </svg>
              </div>
            </article>

            <aside className="panel side-panel">
              <div className="panel-heading">
                <div>
                  <h3>Upcoming Priorities</h3>
                  <p>아직 끝나지 않은 중요한 업무를 상단에 보여줍니다.</p>
                </div>
                <a className="mini-link" href="https://dobedub.vogopang.com/library-hub" target="_blank" rel="noreferrer">
                  View Hub
                </a>
              </div>
              <div id="upcoming-list" className="stack-list">
                {upcomingTasks.length === 0 ? (
                  <p className="task-note">남아 있는 우선 업무가 없습니다.</p>
                ) : (
                  upcomingTasks.map((task) => (
                    <article key={`upcoming-${task.id}`} className="upcoming-item">
                      <div>
                        <h4 className="upcoming-title">{task.title}</h4>
                        <p className="upcoming-note">{task.note || "메모 없음"}</p>
                      </div>
                      <div className="upcoming-meta">
                        <span className="upcoming-priority">
                          {`우선순위 ${priorityLabel[getEffectivePriority(task)]}`}
                        </span>
                        <span className={`upcoming-deadline ${isTaskOverdue(task, activeDate) ? "is-overdue" : ""}`.trim()}>
                          {formatDeadlineLabel(task, activeDate)}
                        </span>
                        <span className="upcoming-status">
                          {task.status === "doing" ? "진행 중" : "할 일"}
                        </span>
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="focus-card">
                <div className="panel-heading compact">
                  <div>
                    <h3>Focus Session</h3>
                    <p>한 세션이 끝나면 집중 시간이 누적됩니다.</p>
                  </div>
                </div>
                <strong id="timer-clock" className="focus-clock">
                  {formatClock(timerRemainingSeconds)}
                </strong>
                <div className="timer-controls">
                  <button
                    id="timer-start"
                    className="primary-button"
                    type="button"
                    onClick={() => setIsTimerRunning(true)}
                    disabled={isTimerRunning}
                  >
                    시작
                  </button>
                  <button
                    id="timer-pause"
                    className="secondary-button"
                    type="button"
                    onClick={() => setIsTimerRunning(false)}
                  >
                    일시정지
                  </button>
                  <button id="timer-reset" className="secondary-button" type="button" onClick={resetTimer}>
                    리셋
                  </button>
                </div>
                <label className="timer-duration-wrap">
                  <span className="field-label">세션 길이(분)</span>
                  <input
                    id="timer-duration"
                    type="number"
                    min="1"
                    max="180"
                    step="1"
                    value={activeDay.timerDuration}
                    onChange={(event) => updateTimerDuration(event.target.value)}
                  />
                </label>
              </div>
            </aside>
          </section>

          <section className="panel github-panel">
            <div className="panel-heading">
              <div>
                <h3>GitHub Watch</h3>
                <p>대상 레포의 최신 커밋과 PR 상태를 주기적으로 반영합니다.</p>
              </div>
              <div className="github-meta">
                <span>마지막 동기화</span>
                <strong id="github-sync-time">
                  {notionOrGithubSyncLabel(githubFeed.lastSyncedAt)}
                </strong>
              </div>
            </div>

            <div id="github-filters" className="github-filters">
              {githubFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`github-filter-chip ${githubFilter === filter ? "active" : ""}`.trim()}
                  onClick={() => setGithubFilter(filter)}
                >
                  {filter === "all" ? "전체" : filter}
                </button>
              ))}
            </div>

            <div id="github-detail-view" className="github-detail-view">
              {visibleRepos.length === 0 ? (
                <p className="task-note">동기화된 GitHub 레포 현황이 없습니다.</p>
              ) : (
                visibleRepos.map((repo) => (
                  <GithubRepoCard key={`${repo.repo}-${repo.defaultBranch}`} repo={repo} />
                ))
              )}
            </div>
          </section>

          <section className="lower-grid">
            <section className="panel board-panel">
              <div className="panel-heading">
                <div>
                  <h3>Task Board</h3>
                  <p>오늘 업무를 할 일, 진행 중, 완료 상태로 관리합니다.</p>
                </div>
              </div>

              <div className="board-grid">
                <TaskColumn title="할 일" count={todoTasks.length} tasks={todoTasks} activeDate={activeDate} buildActions={buildActions} />
                <TaskColumn title="진행 중" count={doingTasks.length} tasks={doingTasks} activeDate={activeDate} buildActions={buildActions} />
                <TaskColumn title="완료" count={doneTasks.length} tasks={doneTasks} activeDate={activeDate} buildActions={buildActions} />
              </div>
            </section>

            <section className="panel utility-stack">
              <section className="utility-panel">
                <div className="panel-heading compact">
                  <div>
                    <h3>오늘 할 일 추가</h3>
                    <p>작은 메모까지 같이 저장합니다.</p>
                  </div>
                </div>
                <form id="task-form" className="task-form" onSubmit={handleCreateTask}>
                  <label>
                    <span className="field-label">업무명</span>
                    <input
                      ref={taskTitleRef}
                      id="task-title"
                      type="text"
                      name="title"
                      placeholder="예: 통계 API 검증"
                      value={taskForm.title}
                      onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    <span className="field-label">카테고리</span>
                    <input
                      id="task-category"
                      type="text"
                      name="category"
                      placeholder="예: 백엔드, 회의, 문서"
                      value={taskForm.category}
                      onChange={(event) => setTaskForm((current) => ({ ...current, category: event.target.value }))}
                    />
                  </label>
                  <div className="split-fields">
                    <label>
                      <span className="field-label">우선순위</span>
                      <select
                        id="task-priority"
                        name="priority"
                        value={taskForm.priority}
                        onChange={(event) =>
                          setTaskForm((current) => ({
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
                        id="task-due-date"
                        type="date"
                        name="dueDate"
                        value={taskForm.dueDate}
                        onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span className="field-label">예상 시간(분)</span>
                      <input
                        id="task-estimate"
                        type="number"
                        min="0"
                        step="5"
                        name="estimate"
                        value={taskForm.estimate}
                        onChange={(event) => setTaskForm((current) => ({ ...current, estimate: event.target.value }))}
                      />
                    </label>
                  </div>
                  <label>
                    <span className="field-label">메모</span>
                    <textarea
                      id="task-note"
                      name="note"
                      rows={3}
                      placeholder="오늘 이 업무에서 꼭 확인할 점을 적으세요."
                      value={taskForm.note}
                      onChange={(event) => setTaskForm((current) => ({ ...current, note: event.target.value }))}
                    />
                  </label>
                  <button className="primary-button" type="submit">
                    업무 추가
                  </button>
                </form>
              </section>

              <section className="utility-panel">
                <div className="panel-heading compact">
                  <div>
                    <h3>Notion Updates</h3>
                    <p>플랫폼 본부 하위의 최근 변경 내역을 표시합니다.</p>
                  </div>
                </div>
                <div className="notion-meta">
                  <span>마지막 동기화</span>
                  <strong id="notion-sync-time">
                    {notionOrGithubSyncLabel(notionFeed.lastSyncedAt)}
                  </strong>
                </div>
                <div id="notion-updates-list" className="notion-updates-list">
                  {notionFeed.items.length === 0 ? (
                    <p className="task-note">동기화된 Notion 업데이트가 없습니다.</p>
                  ) : (
                    notionFeed.items.slice(0, 6).map((item, index) => (
                      <article key={`${item.title}-${item.editedAt}-${index}`} className="notion-update-item">
                        <div className="notion-update-main">
                          <h4 className="notion-update-title">{item.title || "제목 없음"}</h4>
                          <p className="notion-update-subtitle">
                            {[item.section, item.parent, item.editor].filter(Boolean).join(" · ") || "메타데이터 없음"}
                          </p>
                        </div>
                        <div className="notion-update-side">
                          <span className="notion-update-time">
                            {item.editedAt ? relativeTime(item.editedAt) : "시간 없음"}
                          </span>
                          <a className="notion-update-link" href={item.url || "#"} target="_blank" rel="noreferrer">
                            열기
                          </a>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="utility-panel">
                <div className="panel-heading compact">
                  <div>
                    <h3>Daily Notes</h3>
                    <p>회고, blocker, 다음 액션을 짧게 정리합니다.</p>
                  </div>
                </div>
                <textarea
                  id="daily-notes"
                  rows={9}
                  placeholder="오늘 있었던 일, 막힌 점, 내일 이어갈 일을 적으세요."
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                />
                <div className="notes-footer">
                  <span>자동 저장</span>
                  <button id="clear-notes" className="text-button" type="button" onClick={clearNotes}>
                    메모 비우기
                  </button>
                </div>
              </section>
            </section>
          </section>

          <section className="panel activity-panel">
            <div className="panel-heading">
              <div>
                <h3>Recent Activity</h3>
                <p>오늘 생성/변경된 업무를 시간순으로 봅니다.</p>
              </div>
            </div>
            <div id="activity-list" className="activity-list">
              {activityTasks.length === 0 ? (
                <p className="task-note">아직 활동 기록이 없습니다.</p>
              ) : (
                activityTasks.map((task) => {
                  const effectivePriority = getEffectivePriority(task);

                  return (
                    <article key={`activity-${task.id}`} className="activity-item">
                      <div
                        className="activity-icon"
                        style={{
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 800,
                          color: activityColor(effectivePriority),
                        }}
                      >
                        {activityIcon(effectivePriority)}
                      </div>
                      <div className="activity-main">
                        <h4 className="activity-title">{task.title}</h4>
                        <p className="activity-subtitle">{task.note || buildActivitySubtitle(task)}</p>
                      </div>
                      <div className="activity-side">
                        <span className="activity-time">
                          {relativeTime(task.updatedAt || task.createdAt)}
                        </span>
                        <span className="activity-badge">{statusLabel(task.status)}</span>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </main>
      </div>
    </>
  );
}

function StatCard({
  icon,
  pillClassName,
  pillLabel,
  label,
  value,
  iconClassName,
}: {
  icon: string;
  pillClassName: string;
  pillLabel: string;
  label: string;
  value: string;
  iconClassName: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <div className={`stat-icon ${iconClassName}`}>{icon}</div>
        <span className={`stat-pill ${pillClassName}`}>{pillLabel}</span>
      </div>
      <p className="stat-label">{label}</p>
      <strong className="stat-value">{value}</strong>
    </article>
  );
}

function TaskColumn({
  title,
  count,
  tasks,
  activeDate,
  buildActions,
}: {
  title: string;
  count: number;
  tasks: Task[];
  activeDate: string;
  buildActions: (task: Task) => TaskAction[];
}) {
  return (
    <section className="board-column">
      <header>
        <h4>{title}</h4>
        <span className="column-count">{count}</span>
      </header>
      <div className="task-list">
        {tasks.length === 0 ? (
          <p className="task-note">아직 항목이 없습니다.</p>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} activeDate={activeDate} actions={buildActions(task)} />
          ))
        )}
      </div>
    </section>
  );
}

function notionOrGithubSyncLabel(value: string | null) {
  return value ? formatDateTime(value) : "아직 없음";
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.max(totalSeconds % 60, 0)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}
