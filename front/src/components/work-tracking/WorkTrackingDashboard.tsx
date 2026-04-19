"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildMessageClipboardText,
  copyToClipboard,
  emptyLineWorksArchive,
  fetchLineWorksArchive,
  formatFileSize,
  type LineWorksArchive,
  type LineWorksArchiveMessage,
} from "@/lib/line-works-archive";
import { isOfficeFile } from "@/lib/file-preview";
import { fetchCurrentUser, logout, type SessionUser } from "@/lib/session";
import {
  attachReference,
  detachReference,
  fetchReferencesForTasks,
  type TaskReference,
} from "@/lib/task-references";
import {
  deleteStorageItem,
  fetchStorageBundle,
  type ChannelLabelMap,
  type StorageItem,
} from "@/lib/storage";
import { fetchLastSeenMap, markLastSeen, parseTimestamp } from "@/lib/last-seen";
import { AttachToTaskModal, type AttachCandidate } from "./AttachToTaskModal";
import { CalendarView } from "./CalendarView";
import { DashboardFilters, type FiltersValue } from "./DashboardFilters";
import { FilePreviewModal } from "./FilePreviewModal";
import { GithubRepoCard } from "./GithubRepoCard";
import { Pagination } from "./Pagination";
import { SiteLinksModal } from "./SiteLinksModal";
import { StorageTreeView } from "./StorageTreeView";
import { TaskCard, type TaskAction } from "./TaskCard";
import {
  TaskCreateModal,
  type TaskCreateSubmit,
  type TaskEditInitial,
} from "./TaskCreateModal";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import { TaskList } from "./TaskList";
import { TaskReferenceAddModal } from "./TaskReferenceAddModal";
import {
  fetchTasks,
  PER_PAGE_OPTIONS,
  thisWeekRange,
  type PerPageOption,
  type TaskListItem,
  type TaskQueryResponse,
  type TaskStatus as DashboardTaskStatus,
} from "@/lib/tasks-api";
import {
  emptyGithubFeed,
  emptyNotionFeed,
  formatDateCaption,
  formatDateKey,
  formatDateTime,
  getDay,
  loadDaysFromStorage,
  parseDateKey,
  relativeTime,
  sortTasksForDisplay,
  todayKey,
  type GithubFeed,
  type NotionFeed,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type WorkDayMap,
} from "@/lib/work-tracking";

export function WorkTrackingDashboard() {
  const initialDate = todayKey();
  const [days, setDays] = useState<WorkDayMap>({});
  const [activeDate, setActiveDate] = useState(initialDate);
  const [notionFeed, setNotionFeed] = useState<NotionFeed>(() => emptyNotionFeed());
  const [isLoadingMoreNotion, setIsLoadingMoreNotion] = useState(false);
  const [githubFeed, setGithubFeed] = useState<GithubFeed>(() => emptyGithubFeed());
  const [activeView, setActiveView] = useState<
    "dashboard" | "calendar" | "github" | "notion" | "line-works" | "storage"
  >("dashboard");
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [taskEditTarget, setTaskEditTarget] = useState<TaskEditInitial | null>(null);
  const [refAddTaskId, setRefAddTaskId] = useState<string | null>(null);
  const [siteLinksOpen, setSiteLinksOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);

  // 새 대시보드 리스트 상태
  const initialWeek = thisWeekRange();
  const [taskQuery, setTaskQuery] = useState<TaskQueryResponse | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [dashFilters, setDashFilters] = useState<FiltersValue>({
    q: "",
    assignee: "all",
    priorities: [],
    statuses: [],
    sort: "priority",
    order: "desc",
  });
  const [dashRange] = useState<{ from: string; to: string }>(initialWeek);
  const [dashPage, setDashPage] = useState(1);
  const [dashPerPage, setDashPerPage] = useState<PerPageOption>(() => {
    if (typeof window === "undefined") return 20;
    const raw = window.localStorage.getItem("wt:perPage:tasks");
    const n = raw ? Number(raw) : 20;
    return (PER_PAGE_OPTIONS.includes(n as PerPageOption) ? n : 20) as PerPageOption;
  });
  const [selectedTask, setSelectedTask] = useState<TaskListItem | null>(null);
  const [lineWorksArchive, setLineWorksArchive] = useState<LineWorksArchive>(() =>
    emptyLineWorksArchive(),
  );
  const [selectedLineWorksChannel, setSelectedLineWorksChannel] = useState<string | null>(null);
  const [taskReferences, setTaskReferences] = useState<Record<string, TaskReference[]>>({});
  const [attachCandidate, setAttachCandidate] = useState<AttachCandidate | null>(null);
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [storageItems, setStorageItems] = useState<StorageItem[]>([]);
  const [storageChannelLabels, setStorageChannelLabels] = useState<ChannelLabelMap>({});
  const [previewState, setPreviewState] = useState<
    { fileName: string | null; url: string } | null
  >(null);
  const [lastSeenNotion, setLastSeenNotion] = useState<number>(0);
  const [lastSeenLineWorks, setLastSeenLineWorks] = useState<number>(0);
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

    async function loadLineWorks() {
      try {
        const archive = await fetchLineWorksArchive(null);
        if (mounted) {
          setLineWorksArchive(archive);
        }
      } catch (error) {
        console.error("[dashboard] failed to load line works archive", error);
      }
    }

    loadNotionUpdates();
    loadGithubUpdates();
    loadLineWorks();

    const eventSource = new EventSource("/api/events");

    eventSource.addEventListener("feed-update", (event) => {
      if (!mounted) {
        return;
      }
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          source?: "notion" | "github" | "line-works";
        };
        if (payload.source === "notion") {
          void loadNotionUpdates();
        } else if (payload.source === "github") {
          void loadGithubUpdates();
        } else if (payload.source === "line-works") {
          void loadLineWorks();
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
    let mounted = true;
    void fetchCurrentUser().then((user) => {
      if (mounted) {
        setCurrentUser(user);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // 로그인 직후 서버에서 lastSeen 로드
  useEffect(() => {
    if (!currentUser) return;
    let mounted = true;
    void fetchLastSeenMap().then((map) => {
      if (!mounted) return;
      setLastSeenNotion(parseTimestamp(map.notion));
      setLastSeenLineWorks(parseTimestamp(map["line-works"]));
    });
    return () => {
      mounted = false;
    };
  }, [currentUser]);

  // 뷰 진입 시 서버에 읽음 기록
  useEffect(() => {
    if (!currentUser) return;
    if (activeView !== "notion" && activeView !== "line-works") return;
    const source = activeView;
    void markLastSeen(source).then((at) => {
      if (!at) return;
      const ts = parseTimestamp(at);
      if (source === "notion") {
        setLastSeenNotion(ts);
      } else if (source === "line-works") {
        setLastSeenLineWorks(ts);
      }
    });
  }, [activeView, currentUser]);

  const notionNewCount = useMemo(() => {
    if (!lastSeenNotion) return 0;
    return notionFeed.items.reduce<number>((count, item) => {
      const ts = parseTimestamp(item.editedAt);
      return ts > lastSeenNotion ? count + 1 : count;
    }, 0);
  }, [notionFeed.items, lastSeenNotion]);

  const lineWorksNewCount = useMemo(() => {
    if (!lastSeenLineWorks) return 0;
    return lineWorksArchive.items.reduce<number>((count, item) => {
      const ts = parseTimestamp(item.issuedAt ?? item.receivedAt);
      return ts > lastSeenLineWorks ? count + 1 : count;
    }, 0);
  }, [lineWorksArchive.items, lastSeenLineWorks]);

  function isNotionItemNew(editedAt: string | null | undefined): boolean {
    if (!lastSeenNotion) return false;
    const ts = parseTimestamp(editedAt);
    return ts > 0 && ts > lastSeenNotion;
  }

  function isLineWorksItemNew(issuedAt: string | null, receivedAt: string): boolean {
    if (!lastSeenLineWorks) return false;
    const ts = parseTimestamp(issuedAt ?? receivedAt);
    return ts > 0 && ts > lastSeenLineWorks;
  }

  useEffect(() => {
    if (selectedRepo === null) {
      return;
    }

    const stillExists = githubFeed.repos.some((repo) => repo.repo === selectedRepo);
    if (!stillExists) {
      setSelectedRepo(null);
    }
  }, [githubFeed.repos, selectedRepo]);

  useEffect(() => {
    // 채널 필터가 변경되면 재조회. 필터 없음(null)일 땐 mount/SSE 경로로 충분.
    if (activeView !== "line-works" || selectedLineWorksChannel === null) {
      return;
    }
    let mounted = true;
    void fetchLineWorksArchive(selectedLineWorksChannel)
      .then((next) => {
        if (mounted) {
          setLineWorksArchive(next);
        }
      })
      .catch((error) => {
        console.error("[dashboard] failed to load line works archive", error);
      });
    return () => {
      mounted = false;
    };
  }, [activeView, selectedLineWorksChannel]);

  const reloadTaskReferences = useCallback(async () => {
    const taskIds = activeDay.tasks.map((task) => task.id);
    if (taskIds.length === 0) {
      setTaskReferences({});
      return;
    }
    const result = await fetchReferencesForTasks(taskIds);
    setTaskReferences(result);
  }, [activeDay.tasks]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }
    void reloadTaskReferences();
  }, [hasHydrated, reloadTaskReferences]);

  const reloadStorage = useCallback(async () => {
    const bundle = await fetchStorageBundle();
    setStorageItems(bundle.items);
    setStorageChannelLabels(bundle.channelLabels);
  }, []);

  useEffect(() => {
    if (activeView !== "storage") {
      return;
    }
    void reloadStorage();
  }, [activeView, reloadStorage]);

  // 대시보드 태스크 리스트 fetch
  const reloadDashboardTasks = useCallback(async () => {
    setTaskLoading(true);
    try {
      const result = await fetchTasks({
        from: dashRange.from,
        to: dashRange.to,
        assignee: dashFilters.assignee,
        statuses: dashFilters.statuses,
        priorities: dashFilters.priorities,
        q: dashFilters.q || undefined,
        sort: dashFilters.sort,
        order: dashFilters.order,
        page: dashPage,
        perPage: dashPerPage,
      });
      setTaskQuery(result);
    } catch (error) {
      console.error("[dashboard] failed to fetch tasks", error);
    } finally {
      setTaskLoading(false);
    }
  }, [dashRange, dashFilters, dashPage, dashPerPage]);

  useEffect(() => {
    if (activeView !== "dashboard") return;
    void reloadDashboardTasks();
  }, [activeView, reloadDashboardTasks]);

  // 필터 변경 시 페이지 1 로 리셋
  useEffect(() => {
    setDashPage(1);
  }, [dashFilters, dashRange]);

  function handleDashPerPageChange(next: PerPageOption) {
    setDashPerPage(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("wt:perPage:tasks", String(next));
    }
    setDashPage(1);
  }

  async function handleDrawerStatusChange(task: TaskListItem, status: DashboardTaskStatus) {
    try {
      await postDashboardAction({
        action: "updateTaskStatus",
        date: task.workDate,
        taskId: task.id,
        status,
      });
      setSelectedTask((prev) => (prev && prev.id === task.id ? { ...prev, status } : prev));
      if (activeView === "dashboard") {
        await reloadDashboardTasks();
      }
    } catch (error) {
      console.error("[dashboard] status change failed", error);
    }
  }

  async function handleDrawerDelete(task: TaskListItem) {
    const ok = window.confirm("이 태스크를 삭제합니다. 연결된 참조도 함께 제거됩니다.");
    if (!ok) return;
    try {
      await postDashboardAction({
        action: "deleteTask",
        date: task.workDate,
        taskId: task.id,
      });
      setSelectedTask(null);
      await reloadDashboardTasks();
    } catch (error) {
      console.error("[dashboard] delete failed", error);
    }
  }

  function handleOpenReference(ref: TaskReference) {
    switch (ref.source) {
      case "url":
      case "figma_node":
      case "notion_page":
        if (ref.externalUrl) {
          window.open(ref.externalUrl, "_blank", "noopener");
        }
        break;
      case "line_works_attachment": {
        const metadata = ref.metadata as
          | { attachmentId?: number | string; fileName?: string; mimeType?: string }
          | null;
        const raw = metadata?.attachmentId ?? ref.externalId;
        const id = Number(raw);
        if (Number.isFinite(id) && id > 0) {
          void openAttachment(id, metadata?.fileName ?? null, metadata?.mimeType ?? null);
        } else {
          console.warn("[reference] invalid attachment id", ref);
        }
        break;
      }
      case "line_works_message": {
        const metadata = ref.metadata as { channelId?: string } | null;
        window.alert(
          [
            `채팅방: ${metadata?.channelId ?? "?"}`,
            ``,
            ref.title ?? "",
            ref.excerpt ? `\n${ref.excerpt}` : "",
          ].join("\n"),
        );
        break;
      }
      default:
        break;
    }
  }

  async function handleStorageDelete(id: number) {
    const confirmed = window.confirm("이 파일을 S3와 DB에서 영구 삭제합니다. 진행할까요?");
    if (!confirmed) return;
    const ok = await deleteStorageItem(id);
    if (ok) {
      setStorageItems((prev) => prev.filter((item) => item.id !== id));
    } else {
      window.alert("삭제 실패. 다시 시도하세요.");
    }
  }

  async function resolveAttachmentUrl(
    id: number,
  ): Promise<{ url: string; fileName: string | null; mimeType: string | null } | null> {
    try {
      const response = await fetch(`/api/line-works-attachments/${id}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = (await response.json()) as {
        ok: boolean;
        url?: string;
        attachment?: {
          fileName?: string | null;
          mimeType?: string | null;
        };
      };
      if (!payload.ok || !payload.url) return null;
      return {
        url: payload.url,
        fileName: payload.attachment?.fileName ?? null,
        mimeType: payload.attachment?.mimeType ?? null,
      };
    } catch (error) {
      console.error("[attachment] failed to get presigned url", error);
      return null;
    }
  }

  async function openAttachment(
    id: number,
    hintedFileName?: string | null,
    hintedMimeType?: string | null,
  ) {
    // Office 파일이 아닐 가능성을 대비해 클릭 시점에 빈 탭을 먼저 열어둠(팝업 차단 회피)
    const officeHint = isOfficeFile(hintedFileName ?? null, hintedMimeType ?? null);
    const pendingTab = officeHint ? null : window.open("about:blank", "_blank", "noopener");

    const resolved = await resolveAttachmentUrl(id);
    if (!resolved) {
      pendingTab?.close();
      return;
    }
    const fileName = resolved.fileName ?? hintedFileName ?? null;
    const mimeType = resolved.mimeType ?? hintedMimeType ?? null;
    if (isOfficeFile(fileName, mimeType)) {
      pendingTab?.close();
      setPreviewState({ fileName, url: resolved.url });
    } else {
      if (pendingTab) {
        pendingTab.location.href = resolved.url;
      } else {
        window.open(resolved.url, "_blank", "noopener");
      }
    }
  }

  async function handleStorageOpen(id: number) {
    await openAttachment(id);
  }

  async function handleRemoveReference(referenceId: number, taskId: string) {
    const ok = await detachReference(referenceId);
    if (ok) {
      setTaskReferences((prev) => {
        const next = { ...prev };
        const list = (next[taskId] ?? []).filter((ref) => ref.id !== referenceId);
        if (list.length === 0) {
          delete next[taskId];
        } else {
          next[taskId] = list;
        }
        return next;
      });
    }
  }

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
    _options?: {
      resetTaskForm?: boolean;
      syncNotes?: boolean;
    },
  ) {
    setDays(nextDays);
    setActiveDate(dateKey);
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

  async function handleTaskCreateSubmit(payload: TaskCreateSubmit) {
    if (payload.taskId && taskEditTarget) {
      await postDashboardAction({
        action: "updateTask",
        date: taskEditTarget.workDate,
        taskId: payload.taskId,
        patch: {
          title: payload.title,
          category: payload.category,
          priority: payload.priority,
          dueDate: payload.dueDate || taskEditTarget.workDate,
          dueTime: payload.dueTime,
          note: payload.note,
        },
      });

      if (payload.status && payload.status !== taskEditTarget.status) {
        await postDashboardAction({
          action: "updateTaskStatus",
          date: taskEditTarget.workDate,
          taskId: payload.taskId,
          status: payload.status,
        });
      }

      const nextStatus = payload.status ?? taskEditTarget.status;
      setTaskEditTarget(null);
      setSelectedTask((prev) =>
        prev && prev.id === payload.taskId
          ? {
              ...prev,
              title: payload.title,
              category: payload.category,
              priority: payload.priority,
              status: nextStatus,
              dueDate: payload.dueDate || taskEditTarget.workDate,
              dueTime: payload.dueTime,
              note: payload.note,
            }
          : prev,
      );
      if (activeView === "dashboard") {
        await reloadDashboardTasks();
      }
      return;
    }

    const result = await postDashboardAction({
      action: "createTask",
      date: activeDate,
      task: {
        title: payload.title,
        category: payload.category,
        priority: payload.priority,
        dueDate: payload.dueDate || activeDate,
        dueTime: payload.dueTime,
        estimate: 0,
        note: payload.note,
      },
    });
    applyDashboardState(activeDate, result.days, { syncNotes: false });

    if (payload.pendingReferences.length > 0) {
      const tasksForDate = getDay(result.days, activeDate).tasks;
      const latest = tasksForDate.reduce<Task | null>((acc, task) => {
        if (!acc) return task;
        return new Date(task.createdAt).getTime() > new Date(acc.createdAt).getTime()
          ? task
          : acc;
      }, null);
      if (latest) {
        for (const ref of payload.pendingReferences) {
          await attachReference({
            taskId: latest.id,
            source: ref.source,
            externalId: ref.externalId,
            title: ref.title,
            excerpt: ref.excerpt ?? null,
            externalUrl: ref.externalUrl ?? null,
            metadata: ref.metadata ?? null,
          });
        }
        void reloadTaskReferences();
      }
    }

    if (activeView === "dashboard") {
      await reloadDashboardTasks();
    }
  }

  function openTaskCreateModal() {
    void reloadStorage();
    setTaskCreateOpen(true);
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

  async function handleCopyMessage(message: LineWorksArchiveMessage) {
    const text = buildMessageClipboardText(message);
    const ok = await copyToClipboard(text);
    if (!ok) {
      console.warn("[line-works] clipboard write failed");
    }
  }

  function openAttachCandidate(candidate: AttachCandidate) {
    setAttachCandidate(candidate);
    setAttachModalOpen(true);
  }

  function openUrlAttachModal() {
    setAttachCandidate(null);
    setAttachModalOpen(true);
  }

  function closeAttachModal() {
    setAttachModalOpen(false);
    setAttachCandidate(null);
  }

  async function quickCreateTask(payload: {
    title: string;
    category: string;
    priority: TaskPriority;
    dueDate: string;
    estimate: number;
    note: string;
  }): Promise<{ taskId: string } | null> {
    try {
      const result = await postDashboardAction({
        action: "createTask",
        date: activeDate,
        task: payload,
      });
      applyDashboardState(activeDate, result.days, { syncNotes: false });
      const tasksForDate = getDay(result.days, activeDate).tasks;
      const latest = tasksForDate.reduce<Task | null>((acc, task) => {
        if (!acc) return task;
        return new Date(task.createdAt).getTime() > new Date(acc.createdAt).getTime()
          ? task
          : acc;
      }, null);
      return latest ? { taskId: latest.id } : null;
    } catch (error) {
      console.error("[dashboard] quick task creation failed", error);
      return null;
    }
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/dobedub-logo.jpg"
            alt="DOBE DUB"
            className="sidebar-brand-logo"
            width={200}
            height={64}
          />
          <p>Work Tracking Suite</p>
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
            className={`sidebar-nav-link ${activeView === "calendar" ? "active" : ""}`.trim()}
            onClick={() => setActiveView("calendar")}
          >
            Calendar
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
            {notionNewCount > 0 ? (
              <span className="sidebar-nav-count new">{notionNewCount}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={`sidebar-nav-link ${activeView === "line-works" ? "active" : ""}`.trim()}
            onClick={() => setActiveView("line-works")}
          >
            Works
            {lineWorksNewCount > 0 ? (
              <span className="sidebar-nav-count new">{lineWorksNewCount}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={`sidebar-nav-link ${activeView === "storage" ? "active" : ""}`.trim()}
            onClick={() => setActiveView("storage")}
          >
            파일 저장소
            {storageItems.length > 0 ? (
              <span className="sidebar-nav-count">{storageItems.length}</span>
            ) : null}
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-link sidebar-site-links-trigger"
            onClick={() => setSiteLinksOpen(true)}
          >
            🔗 사이트 링크
          </button>

          {currentUser ? (
            <div className="sidebar-user">
              <div className="sidebar-user-info">
                <p className="sidebar-user-name">{currentUser.userName ?? "조직 구성원"}</p>
                {currentUser.email ? (
                  <p className="sidebar-user-email">{currentUser.email}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="sidebar-user-logout"
                onClick={() => {
                  void logout();
                }}
              >
                로그아웃
              </button>
            </div>
          ) : null}
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
            ) : activeView === "calendar" ? (
              <>
                <h2>Calendar</h2>
                <p>월간 달력에서 모든 이벤트를 한눈에 확인합니다.</p>
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
            ) : activeView === "notion" ? (
              <>
                <h2>Notion Updates</h2>
                <p>플랫폼 본부 하위의 최근 변경 내역입니다.</p>
              </>
            ) : activeView === "line-works" ? (
              <>
                <h2>Works</h2>
                <p>
                  {selectedLineWorksChannel === null
                    ? "수집된 채팅 메시지와 첨부를 전체 조회합니다."
                    : `채팅방 ${shortChannelLabel(
                        selectedLineWorksChannel,
                        lineWorksArchive.channels.find(
                          (channel) => channel.channelId === selectedLineWorksChannel,
                        )?.title,
                      )} 의 수신 내역입니다.`}
                </p>
              </>
            ) : (
              <>
                <h2>파일 저장소</h2>
                <p>S3 에 아카이브된 모든 첨부 파일입니다. 클릭하면 다운로드 URL이 발급됩니다.</p>
              </>
            )}
          </div>
          <div className="topbar-right">
            {activeView === "dashboard" || activeView === "calendar" ? null : (
              <div className="github-meta">
                <span>마지막 동기화</span>
                <strong>
                  {syncLabel(
                    activeView === "notion"
                      ? notionFeed.lastSyncedAt
                      : activeView === "github"
                        ? githubFeed.lastSyncedAt
                        : lineWorksArchive.lastReceivedAt,
                  )}
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
                <p className="date-caption">
                  <span className="date-caption-label">Today:</span>{" "}
                  {formatDateCaption(todayKey())}
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="content">

          {activeView === "calendar" ? (
            <CalendarView onOpenAttachment={openAttachment} />
          ) : activeView === "github" ? (
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
                        <h4 className="notion-update-title">
                          {isNotionItemNew(item.editedAt) ? (
                            <span className="new-pill">NEW</span>
                          ) : null}
                          {item.title || "제목 없음"}
                        </h4>
                        <p className="notion-update-subtitle">
                          {[item.section, item.parent].filter(Boolean).join(" / ") || "경로 없음"}
                        </p>
                      </div>
                      <div className="notion-update-side">
                        <span className="notion-update-time">
                          {item.editedAt ? relativeTime(item.editedAt) : "시간 없음"}
                        </span>
                        <div className="notion-update-actions">
                          <a className="notion-update-link" href={item.url || "#"} target="_blank" rel="noreferrer">
                            열기
                          </a>
                          {item.url ? (
                            <button
                              type="button"
                              className="notion-update-link as-button"
                              onClick={() =>
                                openAttachCandidate({
                                  source: "notion_page",
                                  externalId: item.url!,
                                  title: item.title || "Notion 페이지",
                                  excerpt:
                                    [item.section, item.parent].filter(Boolean).join(" / ") ||
                                    null,
                                  externalUrl: item.url!,
                                  metadata: {
                                    section: item.section,
                                    parent: item.parent,
                                    editor: item.editor,
                                    editedAt: item.editedAt,
                                  },
                                })
                              }
                            >
                              태스크 추가
                            </button>
                          ) : null}
                        </div>
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
          ) : activeView === "storage" ? (
            <section className="panel storage-panel">
              <StorageTreeView
                items={storageItems}
                channelLabels={storageChannelLabels}
                onOpen={handleStorageOpen}
                onDelete={handleStorageDelete}
              />
            </section>
          ) : activeView === "line-works" ? (
            <section className="panel line-works-panel">
              {lineWorksArchive.channels.length > 0 ? (
                <div className="github-filters">
                  <button
                    type="button"
                    className={`github-filter-chip ${selectedLineWorksChannel === null ? "active" : ""}`.trim()}
                    onClick={() => setSelectedLineWorksChannel(null)}
                  >
                    전체
                  </button>
                  {lineWorksArchive.channels.map((channel) => (
                    <button
                      key={channel.channelId}
                      type="button"
                      className={`github-filter-chip ${selectedLineWorksChannel === channel.channelId ? "active" : ""}`.trim()}
                      onClick={() => setSelectedLineWorksChannel(channel.channelId)}
                      title={channel.channelId}
                    >
                      {shortChannelLabel(channel.channelId, channel.title)} · {channel.count}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="line-works-messages">
                {lineWorksArchive.items.length === 0 ? (
                  <p className="empty-note">수신된 메시지가 없습니다.</p>
                ) : (
                  lineWorksArchive.items.map((message) => (
                    <article key={message.messageId} className="line-works-message">
                      <header className="line-works-message-head">
                        <div className="line-works-message-meta">
                          <span className="line-works-channel" title={message.channelId}>
                            {shortChannelLabel(message.channelId, message.channelTitle)}
                          </span>
                          <span className="line-works-user">
                            {message.userId ?? "unknown"}
                          </span>
                          <span className="line-works-time">
                            {relativeTime(message.issuedAt ?? message.receivedAt)}
                          </span>
                        </div>
                        <div className="line-works-message-tags">
                          {isLineWorksItemNew(message.issuedAt, message.receivedAt) ? (
                            <span className="new-pill">NEW</span>
                          ) : null}
                          <span className={`line-works-type type-${message.contentType}`}>
                            {message.contentType}
                          </span>
                        </div>
                      </header>

                      {message.text ? (
                        <p className="line-works-text">{message.text}</p>
                      ) : null}

                      {message.attachments.length > 0 ? (
                        <div className="line-works-attachments">
                          {message.attachments.map((attachment) => (
                            <div key={attachment.id} className="line-works-attachment-row">
                              <button
                                type="button"
                                className="line-works-attachment"
                                onClick={() => {
                                  void openAttachment(
                                    attachment.id,
                                    attachment.fileName,
                                    attachment.mimeType,
                                  );
                                }}
                              >
                                <span className="line-works-attachment-name">
                                  📎 {attachment.fileName ?? "파일"}
                                </span>
                                {attachment.fileSize ? (
                                  <span className="line-works-attachment-size">
                                    {formatFileSize(attachment.fileSize)}
                                  </span>
                                ) : null}
                              </button>
                              <button
                                type="button"
                                className="line-works-attach-tiny"
                                onClick={() =>
                                  openAttachCandidate({
                                    source: "line_works_attachment",
                                    externalId: String(attachment.id),
                                    title: attachment.fileName ?? "첨부 파일",
                                    excerpt: attachment.mimeType,
                                    metadata: {
                                      fileSize: attachment.fileSize,
                                      mimeType: attachment.mimeType,
                                      messageId: message.messageId,
                                      channelId: message.channelId,
                                    },
                                  })
                                }
                                title="이 파일을 태스크에 연결"
                              >
                                + 태스크
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {message.links.length > 0 ? (
                        <ul className="line-works-links">
                          {message.links.map((link) => (
                            <li key={link.id}>
                              <a href={link.url} target="_blank" rel="noreferrer">
                                {link.url}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      <div className="line-works-message-actions">
                        <button
                          type="button"
                          className="line-works-action"
                          onClick={() => {
                            void handleCopyMessage(message);
                          }}
                        >
                          복사
                        </button>
                        <button
                          type="button"
                          className="line-works-action"
                          onClick={() =>
                            openAttachCandidate({
                              source: "line_works_message",
                              externalId: message.messageId,
                              title:
                                message.text?.slice(0, 60) ??
                                `[${message.contentType}] ${shortChannelLabel(message.channelId, message.channelTitle)}`,
                              excerpt: message.text,
                              metadata: {
                                channelId: message.channelId,
                                userId: message.userId,
                                contentType: message.contentType,
                                issuedAt: message.issuedAt,
                              },
                            })
                          }
                        >
                          태스크 추가
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          ) : (
            <>
              <DashboardFilters
                value={dashFilters}
                onChange={setDashFilters}
                users={taskQuery?.users ?? []}
                counts={taskQuery?.counts ?? { todo: 0, doing: 0, done: 0, total: 0 }}
              />

              <div className="dashboard-tasks-toolbar">
                <button
                  type="button"
                  className="primary-button task-create-trigger"
                  onClick={openTaskCreateModal}
                >
                  + 태스크 생성
                </button>
              </div>

              <section className="panel dashboard-tasks-panel">
                {taskLoading && !taskQuery ? (
                  <p className="empty-note">불러오는 중...</p>
                ) : (
                  <TaskList
                    items={taskQuery?.items ?? []}
                    onSelect={setSelectedTask}
                    currentUserId={currentUser?.userId ?? null}
                  />
                )}
              </section>

              {taskQuery ? (
                <Pagination
                  page={taskQuery.pagination.page}
                  perPage={taskQuery.pagination.perPage}
                  total={taskQuery.pagination.total}
                  totalPages={taskQuery.pagination.totalPages}
                  onPageChange={setDashPage}
                  onPerPageChange={handleDashPerPageChange}
                  disabled={taskLoading}
                />
              ) : null}
            </>
          )}
        </main>
      </div>

      {attachModalOpen ? (
        <AttachToTaskModal
          candidate={attachCandidate}
          tasks={activeDay.tasks}
          activeDate={activeDate}
          onClose={closeAttachModal}
          onAttached={() => {
            void reloadTaskReferences();
          }}
          onCreateQuickTask={quickCreateTask}
        />
      ) : null}
      {previewState ? (
        <FilePreviewModal
          fileName={previewState.fileName}
          sourceUrl={previewState.url}
          onClose={() => setPreviewState(null)}
        />
      ) : null}
      {selectedTask ? (
        <TaskDetailDrawer
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onChangeStatus={handleDrawerStatusChange}
          onDelete={handleDrawerDelete}
          onOpenReference={handleOpenReference}
          onAddReference={(task) => {
            setRefAddTaskId(task.id);
          }}
          onEdit={(task) => {
            setSelectedTask(null);
            setTaskEditTarget({
              id: task.id,
              title: task.title,
              category: task.category,
              priority: task.priority,
              status: task.status,
              dueDate: task.dueDate,
              dueTime: task.dueTime,
              note: task.note,
              workDate: task.workDate,
            });
            setTaskCreateOpen(true);
          }}
        />
      ) : null}
      <TaskCreateModal
        open={taskCreateOpen}
        defaultDueDate={activeDate}
        mode={taskEditTarget ? "edit" : "create"}
        initialTask={taskEditTarget}
        onClose={() => {
          setTaskCreateOpen(false);
          setTaskEditTarget(null);
        }}
        onSubmit={handleTaskCreateSubmit}
        notionItems={notionFeed.items}
        lineWorksItems={lineWorksArchive.items}
        lineWorksChannels={lineWorksArchive.channels}
        storageItems={storageItems}
        channelLabels={storageChannelLabels}
      />
      <TaskReferenceAddModal
        open={refAddTaskId !== null}
        taskId={refAddTaskId}
        onClose={() => setRefAddTaskId(null)}
        onAttached={() => {
          // drawer 내부 참조 목록 재조회 트리거
          setSelectedTask((prev) => (prev ? { ...prev } : prev));
        }}
        notionItems={notionFeed.items}
        lineWorksItems={lineWorksArchive.items}
        lineWorksChannels={lineWorksArchive.channels}
        storageItems={storageItems}
        channelLabels={storageChannelLabels}
      />
      <SiteLinksModal
        open={siteLinksOpen}
        onClose={() => setSiteLinksOpen(false)}
      />
    </>
  );
}

function TaskColumn({
  title,
  count,
  tasks,
  activeDate,
  buildActions,
  taskReferences,
  onRemoveReference,
}: {
  title: string;
  count: number;
  tasks: Task[];
  activeDate: string;
  buildActions: (task: Task) => TaskAction[];
  taskReferences: Record<string, TaskReference[]>;
  onRemoveReference: (referenceId: number, taskId: string) => void;
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
            <TaskCard
              key={task.id}
              task={task}
              activeDate={activeDate}
              actions={buildActions(task)}
              references={taskReferences[task.id]}
              onRemoveReference={onRemoveReference}
            />
          ))
        )}
      </div>
    </section>
  );
}

function syncLabel(value: string | null) {
  return value ? formatDateTime(value) : "아직 없음";
}

function shortChannelLabel(channelId: string, title?: string | null): string {
  if (title && title.trim()) {
    return channelId.startsWith("dm:") ? `DM · ${title}` : title;
  }
  if (channelId.startsWith("dm:")) {
    const userId = channelId.slice(3);
    return userId.length <= 10 ? `DM · ${userId}` : `DM · ${userId.slice(0, 4)}…${userId.slice(-4)}`;
  }
  if (channelId.length <= 14) {
    return channelId;
  }
  return `${channelId.slice(0, 6)}…${channelId.slice(-4)}`;
}
