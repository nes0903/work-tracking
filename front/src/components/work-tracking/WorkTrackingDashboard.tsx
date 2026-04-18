"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GithubRepoCard } from "./GithubRepoCard";
import { TaskCard, type TaskAction } from "./TaskCard";
import {
  activityColor,
  activityIcon,
  buildActivitySubtitle,
  emptyGithubFeed,
  emptyNotionFeed,
  formatDateCaption,
  formatDateKey,
  formatDateTime,
  getDay,
  getEffectivePriority,
  loadDaysFromStorage,
  parseDateKey,
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
  const [isLoadingMoreNotion, setIsLoadingMoreNotion] = useState(false);
  const [githubFeed, setGithubFeed] = useState<GithubFeed>(() => emptyGithubFeed());
  const [activeView, setActiveView] = useState<"dashboard" | "github" | "notion">("dashboard");
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
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
        const response = await fetch(
          `/api/notion-updates?limit=10&t=${Date.now()}`,
          {
            cache: "no-store",
          },
        );
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
          nextCursor: payload.nextCursor ?? null,
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

    const eventSource = new EventSource("/api/events");

    eventSource.addEventListener("feed-update", (event) => {
      if (!mounted) {
        return;
      }
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          source?: "notion" | "github";
        };
        if (payload.source === "notion") {
          void loadNotionUpdates();
        } else if (payload.source === "github") {
          void loadGithubUpdates();
        }
      } catch (error) {
        console.error("[dashboard] failed to parse feed-update event", error);
      }
    });

    eventSource.onerror = () => {
      console.warn("[dashboard] SSE connection error; browser will retry");
    };

    return () => {
      mounted = false;
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    if (selectedRepo === null) {
      return;
    }

    const stillExists = githubFeed.repos.some((repo) => repo.repo === selectedRepo);
    if (!stillExists) {
      setSelectedRepo(null);
    }
  }, [githubFeed.repos, selectedRepo]);

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
  const repoList = useMemo(
    () =>
      githubFeed.repos
        .map((repo) => repo.repo)
        .filter((name): name is string => Boolean(name)),
    [githubFeed.repos],
  );

  const visibleRepos = useMemo(
    () =>
      githubFeed.repos.filter((repo) => (selectedRepo === null ? true : repo.repo === selectedRepo)),
    [githubFeed.repos, selectedRepo],
  );

  function applyDashboardState(
    dateKey: string,
    nextDays: WorkDayMap,
    options?: {
      resetTaskForm?: boolean;
      syncNotes?: boolean;
    },
  ) {
    setDays(nextDays);
    setActiveDate(dateKey);

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

  async function handleLoadMoreNotion() {
    if (!notionFeed.nextCursor || isLoadingMoreNotion) {
      return;
    }
    setIsLoadingMoreNotion(true);
    try {
      const response = await fetch(
        `/api/notion-updates?limit=10&cursor=${encodeURIComponent(notionFeed.nextCursor)}&t=${Date.now()}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as NotionFeed;
      const incoming = Array.isArray(payload.items) ? payload.items : [];
      setNotionFeed((prev) => {
        const existingIds = new Set(
          prev.items.map((entry) => entry.eventId).filter(Boolean),
        );
        const merged = [
          ...prev.items,
          ...incoming.filter(
            (entry) => !entry.eventId || !existingIds.has(entry.eventId),
          ),
        ];
        return {
          lastSyncedAt: payload.lastSyncedAt ?? prev.lastSyncedAt ?? null,
          items: merged,
          nextCursor: payload.nextCursor ?? null,
        };
      });
    } catch (error) {
      console.error("[dashboard] failed to load more notion updates", error);
    } finally {
      setIsLoadingMoreNotion(false);
    }
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
          <button
            type="button"
            className={`sidebar-nav-link ${activeView === "dashboard" ? "active" : ""}`.trim()}
            onClick={() => setActiveView("dashboard")}
          >
            대시보드
          </button>
          <button
            type="button"
            className={`sidebar-nav-link ${activeView === "github" ? "active" : ""}`.trim()}
            onClick={() => setActiveView("github")}
          >
            GitHub Watch
            {repoList.length > 0 ? (
              <span className="sidebar-nav-count">{repoList.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={`sidebar-nav-link ${activeView === "notion" ? "active" : ""}`.trim()}
            onClick={() => setActiveView("notion")}
          >
            Notion Updates
            {notionFeed.items.length > 0 ? (
              <span className="sidebar-nav-count">{notionFeed.items.length}</span>
            ) : null}
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
        </div>
      </aside>

      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-title">
            {activeView === "dashboard" ? (
              <>
                <h2>Work Tracking Dashboard</h2>
                <p>오늘 해야 할 일과 집중 시간을 한 화면에서 관리합니다.</p>
              </>
            ) : activeView === "github" ? (
              <>
                <h2>GitHub Watch</h2>
                <p>
                  {selectedRepo === null
                    ? "등록된 모든 레포의 최신 커밋과 PR 상태입니다."
                    : `${selectedRepo} 상세 현황입니다.`}
                </p>
              </>
            ) : (
              <>
                <h2>Notion Updates</h2>
                <p>플랫폼 본부 하위의 최근 변경 내역입니다.</p>
              </>
            )}
          </div>
          <div className="topbar-right">
            {activeView === "dashboard" ? (
              <div className="page-header-actions">
                <button className="secondary-button" type="button" onClick={clearCompleted}>
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
            ) : (
              <div className="github-meta">
                <span>마지막 동기화</span>
                <strong>
                  {syncLabel(activeView === "notion" ? notionFeed.lastSyncedAt : githubFeed.lastSyncedAt)}
                </strong>
              </div>
            )}
            <div className="date-panel">
              <div className="date-row">
                <button
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
                  className="icon-button"
                  type="button"
                  aria-label="다음 날짜"
                  onClick={() => changeDay(1)}
                >
                  ▶
                </button>
              </div>
              <p className="date-caption">{formatDateCaption(activeDate)}</p>
            </div>
          </div>
        </header>

        <main className="content">

          {activeView === "github" ? (
            <section className="panel github-panel">
              <div className="github-filters">
                <button
                  type="button"
                  className={`github-filter-chip ${selectedRepo === null ? "active" : ""}`.trim()}
                  onClick={() => setSelectedRepo(null)}
                >
                  전체
                </button>
                {repoList.map((repo) => (
                  <button
                    key={repo}
                    type="button"
                    className={`github-filter-chip ${selectedRepo === repo ? "active" : ""}`.trim()}
                    onClick={() => setSelectedRepo(repo)}
                  >
                    {repo}
                  </button>
                ))}
              </div>
              <div className="github-detail-view">
                {visibleRepos.length === 0 ? (
                  <p className="empty-note">
                    {selectedRepo === null
                      ? "동기화된 GitHub 레포 현황이 없습니다."
                      : `${selectedRepo}의 데이터를 찾을 수 없습니다.`}
                  </p>
                ) : (
                  visibleRepos.map((repo) => (
                    <GithubRepoCard key={`${repo.repo}-${repo.defaultBranch}`} repo={repo} />
                  ))
                )}
              </div>
            </section>
          ) : activeView === "notion" ? (
            <section className="panel notion-panel">
              <div className="notion-updates-list">
                {notionFeed.items.length === 0 ? (
                  <p className="empty-note">동기화된 Notion 업데이트가 없습니다.</p>
                ) : (
                  notionFeed.items.map((item, index) => (
                    <article
                      key={item.eventId ?? `${item.title}-${item.editedAt}-${index}`}
                      className="notion-update-item"
                    >
                      <div>
                        <h4 className="notion-update-title">{item.title || "제목 없음"}</h4>
                        <p className="notion-update-subtitle">
                          {[item.section, item.parent].filter(Boolean).join(" / ") || "경로 없음"}
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
                {notionFeed.nextCursor ? (
                  <button
                    type="button"
                    className="notion-load-more"
                    onClick={handleLoadMoreNotion}
                    disabled={isLoadingMoreNotion}
                  >
                    {isLoadingMoreNotion ? "불러오는 중…" : "더보기"}
                  </button>
                ) : null}
              </div>
            </section>
          ) : (
            <>
          <section className="lower-grid">
            <section className="panel board-panel">
              <div className="panel-heading">
                <div>
                  <h3>Task Board</h3>
                  <p>오늘 업무를 상태별로 관리합니다.</p>
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
                <form className="task-form" onSubmit={handleCreateTask}>
                  <label>
                    <span className="field-label">업무명</span>
                    <input
                      ref={taskTitleRef}
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
                        type="date"
                        name="dueDate"
                        value={taskForm.dueDate}
                        onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))}
                      />
                    </label>
                    <label>
                      <span className="field-label">예상(분)</span>
                      <input
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
                    <h3>Daily Notes</h3>
                    <p>회고, 막힌 점, 다음 액션을 짧게 정리합니다.</p>
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
                  <button className="text-button" type="button" onClick={clearNotes}>
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
                <p>오늘 생성 및 변경된 업무를 시간순으로 봅니다.</p>
              </div>
            </div>
            <div className="activity-list">
              {activityTasks.length === 0 ? (
                <p className="empty-note">아직 활동 기록이 없습니다.</p>
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
            </>
          )}
        </main>
      </div>
    </>
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

function syncLabel(value: string | null) {
  return value ? formatDateTime(value) : "아직 없음";
}
