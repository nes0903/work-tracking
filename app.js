const STORAGE_KEY = "work-tracking.dashboard.v1";

const elements = {
  selectedDate: document.querySelector("#selected-date"),
  previousDay: document.querySelector("#previous-day"),
  nextDay: document.querySelector("#next-day"),
  dateCaption: document.querySelector("#date-caption"),
  taskForm: document.querySelector("#task-form"),
  taskTitle: document.querySelector("#task-title"),
  taskCategory: document.querySelector("#task-category"),
  taskPriority: document.querySelector("#task-priority"),
  taskDueDate: document.querySelector("#task-due-date"),
  taskEstimate: document.querySelector("#task-estimate"),
  taskNote: document.querySelector("#task-note"),
  dailyNotes: document.querySelector("#daily-notes"),
  clearNotes: document.querySelector("#clear-notes"),
  clearCompleted: document.querySelector("#clear-completed"),
  metricTotal: document.querySelector("#metric-total"),
  metricDone: document.querySelector("#metric-done"),
  metricDoing: document.querySelector("#metric-doing"),
  metricFocus: document.querySelector("#metric-focus"),
  completionRate: document.querySelector("#completion-rate"),
  completionBar: document.querySelector("#completion-bar"),
  todoList: document.querySelector("#todo-list"),
  doingList: document.querySelector("#doing-list"),
  doneList: document.querySelector("#done-list"),
  countTodo: document.querySelector("#count-todo"),
  countDoing: document.querySelector("#count-doing"),
  countDone: document.querySelector("#count-done"),
  timerClock: document.querySelector("#timer-clock"),
  timerStart: document.querySelector("#timer-start"),
  timerPause: document.querySelector("#timer-pause"),
  timerReset: document.querySelector("#timer-reset"),
  timerDuration: document.querySelector("#timer-duration"),
  taskCardTemplate: document.querySelector("#task-card-template"),
  upcomingList: document.querySelector("#upcoming-list"),
  upcomingItemTemplate: document.querySelector("#upcoming-item-template"),
  activityList: document.querySelector("#activity-list"),
  activityItemTemplate: document.querySelector("#activity-item-template"),
  weeklyLine: document.querySelector("#weekly-line"),
  weeklyDots: document.querySelector("#weekly-dots"),
  weeklyLabels: document.querySelector("#weekly-labels"),
  notionSyncTime: document.querySelector("#notion-sync-time"),
  notionUpdatesList: document.querySelector("#notion-updates-list"),
  notionUpdateTemplate: document.querySelector("#notion-update-template"),
  githubSyncTime: document.querySelector("#github-sync-time"),
  githubFilters: document.querySelector("#github-filters"),
  githubDetailView: document.querySelector("#github-detail-view"),
  githubRepoTemplate: document.querySelector("#github-repo-template"),
  githubEventTemplate: document.querySelector("#github-event-template"),
};

const priorityLabel = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};

const state = {
  days: loadState(),
  activeDate: todayKey(),
  notionFeed: {
    lastSyncedAt: null,
    items: [],
  },
  githubFeed: {
    lastSyncedAt: null,
    repos: [],
  },
  githubFilter: "all",
  timer: {
    intervalId: null,
    remainingSeconds: 25 * 60,
    startedAt: null,
  },
};

initialize();

function initialize() {
  prepareDay(state.activeDate);
  elements.selectedDate.value = state.activeDate;
  syncTimerFromDay();
  syncTaskDueDate();
  render();
  loadNotionUpdates();
  loadGithubUpdates();
  window.setInterval(loadNotionUpdates, 60 * 1000);
  window.setInterval(loadGithubUpdates, 60 * 1000);

  elements.previousDay.addEventListener("click", () => changeDay(-1));
  elements.nextDay.addEventListener("click", () => changeDay(1));
  elements.selectedDate.addEventListener("change", handleDateChange);
  elements.taskForm.addEventListener("submit", handleCreateTask);
  elements.dailyNotes.addEventListener("input", handleNotesInput);
  elements.clearNotes.addEventListener("click", clearNotes);
  elements.clearCompleted.addEventListener("click", clearCompleted);
  elements.timerStart.addEventListener("click", startTimer);
  elements.timerPause.addEventListener("click", pauseTimer);
  elements.timerReset.addEventListener("click", resetTimer);
  elements.timerDuration.addEventListener("change", updateTimerDuration);
}

function loadState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {});
  } catch {
    return {};
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.days));
}

function todayKey() {
  return formatDateKey(new Date());
}

function createEmptyDay() {
  return {
    tasks: [],
    notes: "",
    focusMinutes: 0,
    timerDuration: 25,
  };
}

function prepareDay(dateKey) {
  let changed = false;

  if (!state.days[dateKey]) {
    state.days[dateKey] = createEmptyDay();
    changed = true;
  }

  if (rolloverPendingTasks(dateKey)) {
    changed = true;
  }

  if (changed) {
    saveState();
  }
}

function getActiveDay() {
  if (!state.days[state.activeDate]) {
    state.days[state.activeDate] = createEmptyDay();
  }
  return state.days[state.activeDate];
}

function handleDateChange(event) {
  const nextDate = event.target.value;
  if (!nextDate) return;
  switchToDate(nextDate);
}

function changeDay(offset) {
  const current = parseDateKey(state.activeDate);
  current.setDate(current.getDate() + offset);
  switchToDate(formatDateKey(current));
}

function switchToDate(dateKey) {
  pauseTimer();
  state.activeDate = dateKey;
  prepareDay(dateKey);
  elements.selectedDate.value = dateKey;
  syncTimerFromDay();
  syncTaskDueDate();
  render();
}

function syncTimerFromDay() {
  const day = getActiveDay();
  state.timer.remainingSeconds = day.timerDuration * 60;
  elements.timerDuration.value = day.timerDuration;
}

function syncTaskDueDate() {
  elements.taskDueDate.value = state.activeDate;
}

function render() {
  const day = getActiveDay();
  const tasks = day.tasks;

  const todo = sortTasksForDisplay(tasks.filter((task) => task.status === "todo"));
  const doing = sortTasksForDisplay(tasks.filter((task) => task.status === "doing"));
  const done = sortTasksForDisplay(tasks.filter((task) => task.status === "done"));

  elements.dateCaption.textContent = formatDateCaption(state.activeDate);
  elements.dailyNotes.value = day.notes;
  elements.metricTotal.textContent = String(tasks.length);
  elements.metricDone.textContent = String(done.length);
  elements.metricDoing.textContent = String(doing.length);
  elements.metricFocus.textContent = `${day.focusMinutes}분`;

  const completion = tasks.length === 0 ? 0 : Math.round((done.length / tasks.length) * 100);
  elements.completionRate.textContent = `${completion}%`;
  elements.completionBar.style.width = `${completion}%`;

  elements.countTodo.textContent = String(todo.length);
  elements.countDoing.textContent = String(doing.length);
  elements.countDone.textContent = String(done.length);

  renderTaskList(elements.todoList, todo);
  renderTaskList(elements.doingList, doing);
  renderTaskList(elements.doneList, done);
  renderUpcomingList(tasks);
  renderActivityList(tasks);
  renderWeeklyChart();
  renderNotionUpdates();
  renderGithubUpdates();
  renderClock();
}

async function loadNotionUpdates() {
  try {
    const response = await fetch(`./data/notion-updates.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.notionFeed = {
      lastSyncedAt: payload.lastSyncedAt ?? null,
      items: Array.isArray(payload.items) ? payload.items : [],
    };
  } catch (error) {
    state.notionFeed = {
      lastSyncedAt: null,
      items: [],
    };
  }
  renderNotionUpdates();
}

async function loadGithubUpdates() {
  try {
    const response = await fetch(`./data/github-updates.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.githubFeed = {
      lastSyncedAt: payload.lastSyncedAt ?? null,
      repos: Array.isArray(payload.repos) ? payload.repos : [],
      items: Array.isArray(payload.items) ? payload.items : [],
    };
  } catch {
    state.githubFeed = {
      lastSyncedAt: null,
      repos: [],
      items: [],
    };
  }
  renderGithubUpdates();
}

function renderTaskList(container, tasks) {
  container.innerHTML = "";

  if (tasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "task-note";
    empty.textContent = "아직 항목이 없습니다.";
    container.appendChild(empty);
    return;
  }

  for (const task of tasks) {
    const fragment = elements.taskCardTemplate.content.cloneNode(true);
    const root = fragment.querySelector(".task-card");
    fragment.querySelector(".task-category").textContent = task.category || "분류 없음";
    fragment.querySelector(".task-title").textContent = task.title;

    const effectivePriority = getEffectivePriority(task);
    const priority = fragment.querySelector(".task-priority");
    priority.textContent = priorityLabel[effectivePriority];
    priority.className = `task-priority priority-${effectivePriority}`;

    const flag = fragment.querySelector(".task-flag");
    const flagInfo = getTaskFlag(task);
    if (flagInfo) {
      flag.textContent = flagInfo.label;
      flag.className = `task-flag ${flagInfo.kind}`;
    } else {
      flag.remove();
    }

    fragment.querySelector(".task-note").textContent = task.note || "메모 없음";
    fragment.querySelector(".task-estimate").textContent = `예상 ${task.estimate}분`;
    const deadline = fragment.querySelector(".task-deadline");
    deadline.textContent = formatDeadlineLabel(task);
    deadline.className = `task-deadline ${isTaskOverdue(task) ? "is-overdue" : ""}`.trim();
    fragment.querySelector(".task-origin").textContent = task.carryoverCount > 0
      ? `${formatShortDate(task.carriedFromDate)}에서 승계`
      : `등록 ${formatTime(task.createdAt)}`;

    const actions = fragment.querySelector(".task-actions");
    for (const action of buildActions(task)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `task-action ${action.kind ?? ""}`.trim();
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      actions.appendChild(button);
    }

    container.appendChild(root);
  }
}

function renderUpcomingList(tasks) {
  elements.upcomingList.innerHTML = "";
  const upcoming = sortTasksForDisplay(
    tasks
    .filter((task) => task.status !== "done")
  )
    .slice(0, 4);

  if (upcoming.length === 0) {
    const empty = document.createElement("p");
    empty.className = "task-note";
    empty.textContent = "남아 있는 우선 업무가 없습니다.";
    elements.upcomingList.appendChild(empty);
    return;
  }

  for (const task of upcoming) {
    const fragment = elements.upcomingItemTemplate.content.cloneNode(true);
    fragment.querySelector(".upcoming-title").textContent = task.title;
    fragment.querySelector(".upcoming-note").textContent = task.note || "메모 없음";
    fragment.querySelector(".upcoming-priority").textContent =
      `우선순위 ${priorityLabel[getEffectivePriority(task)]}`;
    const deadline = fragment.querySelector(".upcoming-deadline");
    deadline.textContent = formatDeadlineLabel(task);
    deadline.className = `upcoming-deadline ${isTaskOverdue(task) ? "is-overdue" : ""}`.trim();
    fragment.querySelector(".upcoming-status").textContent =
      task.status === "doing" ? "진행 중" : "할 일";
    elements.upcomingList.appendChild(fragment);
  }
}

function renderActivityList(tasks) {
  elements.activityList.innerHTML = "";
  const activities = [...tasks]
    .sort((left, right) => new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt))
    .slice(0, 5);

  if (activities.length === 0) {
    const empty = document.createElement("p");
    empty.className = "task-note";
    empty.textContent = "아직 활동 기록이 없습니다.";
    elements.activityList.appendChild(empty);
    return;
  }

  for (const task of activities) {
    const fragment = elements.activityItemTemplate.content.cloneNode(true);
    const icon = fragment.querySelector(".activity-icon");
    const effectivePriority = getEffectivePriority(task);
    icon.textContent = activityIcon(effectivePriority);
    icon.style.display = "grid";
    icon.style.placeItems = "center";
    icon.style.fontWeight = "800";
    icon.style.color = activityColor(effectivePriority);

    fragment.querySelector(".activity-title").textContent = task.title;
    fragment.querySelector(".activity-subtitle").textContent =
      task.note || buildActivitySubtitle(task);
    fragment.querySelector(".activity-time").textContent = relativeTime(task.updatedAt || task.createdAt);
    fragment.querySelector(".activity-badge").textContent = statusLabel(task.status);
    elements.activityList.appendChild(fragment);
  }
}

function renderNotionUpdates() {
  elements.notionSyncTime.textContent = state.notionFeed.lastSyncedAt
    ? formatDateTime(state.notionFeed.lastSyncedAt)
    : "아직 없음";

  elements.notionUpdatesList.innerHTML = "";
  const items = state.notionFeed.items.slice(0, 6);

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "task-note";
    empty.textContent = "동기화된 Notion 업데이트가 없습니다.";
    elements.notionUpdatesList.appendChild(empty);
    return;
  }

  for (const item of items) {
    const fragment = elements.notionUpdateTemplate.content.cloneNode(true);
    fragment.querySelector(".notion-update-title").textContent = item.title || "제목 없음";
    fragment.querySelector(".notion-update-subtitle").textContent =
      [item.section, item.parent, item.editor].filter(Boolean).join(" · ") || "메타데이터 없음";
    fragment.querySelector(".notion-update-time").textContent = item.editedAt
      ? relativeTime(item.editedAt)
      : "시간 없음";
    const link = fragment.querySelector(".notion-update-link");
    link.href = item.url || "#";
    elements.notionUpdatesList.appendChild(fragment);
  }
}

function renderGithubUpdates() {
  elements.githubSyncTime.textContent = state.githubFeed.lastSyncedAt
    ? formatDateTime(state.githubFeed.lastSyncedAt)
    : "아직 없음";

  renderGithubFilters();
  elements.githubDetailView.innerHTML = "";

  const repos = state.githubFeed.repos.filter((repo) =>
    state.githubFilter === "all" ? true : repo.repo === state.githubFilter,
  );
  if (repos.length === 0) {
    const empty = document.createElement("p");
    empty.className = "task-note";
    empty.textContent = "동기화된 GitHub 레포 현황이 없습니다.";
    elements.githubDetailView.appendChild(empty);
  } else {
    for (const repo of repos) {
      const fragment = elements.githubRepoTemplate.content.cloneNode(true);
      fragment.querySelector(".github-repo-name").textContent = repo.repo || "unknown";
      fragment.querySelector(".github-repo-branch").textContent = `branch ${repo.defaultBranch || "unknown"}`;
      fragment.querySelector(".github-pr-badge").textContent = `Open PR ${repo.openPrCount ?? 0}`;
      fragment.querySelector(".github-commit-message").textContent =
        repo.latestCommit?.message || "최근 커밋 정보 없음";
      fragment.querySelector(".github-commit-sha").textContent =
        repo.latestCommit?.shortSha || repo.latestCommit?.sha?.slice(0, 7) || "-";
      fragment.querySelector(".github-commit-time").textContent = repo.latestCommit?.committedAt
        ? relativeTime(repo.latestCommit.committedAt)
        : "시간 없음";
      const commitLink = fragment.querySelector(".github-commit-link");
      commitLink.href = repo.latestCommit?.url || repo.repoUrl || "#";
      const repoLink = fragment.querySelector(".github-repo-link");
      repoLink.href = repo.repoUrl || "#";
      renderGithubEventGroup(
        fragment.querySelector(".github-commit-events"),
        repo.recentCommitEvents,
        "최근 커밋 이벤트가 없습니다.",
      );
      renderGithubPrSection(
        fragment.querySelector(".github-pr-events"),
        repo,
      );
      elements.githubDetailView.appendChild(fragment);
    }
  }
}

function renderGithubFilters() {
  elements.githubFilters.innerHTML = "";
  const filters = ["all", ...state.githubFeed.repos.map((repo) => repo.repo)];
  for (const filter of filters) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `github-filter-chip ${state.githubFilter === filter ? "active" : ""}`.trim();
    button.textContent = filter === "all" ? "전체" : filter;
    button.addEventListener("click", () => {
      state.githubFilter = filter;
      renderGithubUpdates();
    });
    elements.githubFilters.appendChild(button);
  }
}

function renderGithubEventGroup(container, events, emptyMessage) {
  container.innerHTML = "";
  const items = Array.isArray(events) ? events : [];
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "github-event-placeholder";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }

  for (const item of items) {
    const fragment = elements.githubEventTemplate.content.cloneNode(true);
    fragment.querySelector(".github-event-title").textContent = item.title || "제목 없음";
    fragment.querySelector(".github-event-subtitle").textContent =
      [item.kind, item.author, item.status].filter(Boolean).join(" · ") || "메타데이터 없음";
    fragment.querySelector(".github-event-time").textContent = item.occurredAt
      ? relativeTime(item.occurredAt)
      : "시간 없음";
    const link = fragment.querySelector(".github-event-link");
    link.href = item.url || "#";
    container.appendChild(fragment);
  }
}

function renderGithubPrSection(container, repo) {
  container.innerHTML = "";

  const prs = Array.isArray(repo.prs) ? repo.prs : [];
  const prEvents = Array.isArray(repo.prEvents) ? repo.prEvents : [];

  if (prs.length === 0 && prEvents.length === 0) {
    const empty = document.createElement("p");
    empty.className = "github-event-placeholder";
    empty.textContent = "열린 PR이 없습니다.";
    container.appendChild(empty);
    return;
  }

  for (const pr of prs) {
    const item = document.createElement("article");
    item.className = "github-pr-summary-item";

    const main = document.createElement("div");
    const title = document.createElement("h6");
    title.className = "github-pr-summary-title";
    title.textContent = `#${pr.number} ${pr.title}`;
    const subtitle = document.createElement("p");
    subtitle.className = "github-pr-summary-subtitle";
    subtitle.textContent = [pr.base, pr.head, pr.author, pr.draft ? "draft" : "ready"]
      .filter(Boolean)
      .join(" · ");
    main.appendChild(title);
    main.appendChild(subtitle);

    const side = document.createElement("div");
    side.className = "github-pr-summary-side";
    const time = document.createElement("span");
    time.className = "github-pr-summary-time";
    time.textContent = pr.updatedAt ? relativeTime(pr.updatedAt) : "시간 없음";
    const link = document.createElement("a");
    link.className = "github-pr-summary-link";
    link.href = pr.url || "#";
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = pr.state || "open";
    side.appendChild(time);
    side.appendChild(link);

    item.appendChild(main);
    item.appendChild(side);
    container.appendChild(item);
  }

  if (prEvents.length > 0) {
    for (const event of prEvents) {
      const fragment = elements.githubEventTemplate.content.cloneNode(true);
      fragment.querySelector(".github-event-title").textContent = event.title || "제목 없음";
      fragment.querySelector(".github-event-subtitle").textContent =
        [event.kind, event.author, event.status].filter(Boolean).join(" · ") || "메타데이터 없음";
      fragment.querySelector(".github-event-time").textContent = event.occurredAt
        ? relativeTime(event.occurredAt)
        : "시간 없음";
      const link = fragment.querySelector(".github-event-link");
      link.href = event.url || "#";
      container.appendChild(fragment);
    }
  }
}

function renderWeeklyChart() {
  const points = [];
  const labels = [];
  const today = parseDateKey(state.activeDate);

  for (let index = 6; index >= 0; index -= 1) {
    const current = new Date(today);
    current.setDate(today.getDate() - index);
    const key = formatDateKey(current);
    const day = state.days[key] || { tasks: [], focusMinutes: 0 };
    const completedCount = day.tasks.filter((task) => task.status === "done").length;
    const score = completedCount * 20 + day.focusMinutes;
    points.push(score);
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

  elements.weeklyLine.setAttribute(
    "points",
    chartPoints.map((point) => `${point.x},${point.y}`).join(" "),
  );

  elements.weeklyDots.innerHTML = "";
  elements.weeklyLabels.innerHTML = "";

  for (const point of chartPoints) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("class", "chart-dot");
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("r", 6);
    elements.weeklyDots.appendChild(circle);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("class", "chart-label");
    text.setAttribute("x", point.x);
    text.setAttribute("y", "244");
    text.textContent = point.label;
    elements.weeklyLabels.appendChild(text);
  }
}

function buildActions(task) {
  const actions = [];

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

function handleCreateTask(event) {
  event.preventDefault();
  const day = getActiveDay();
  const timestamp = new Date().toISOString();
  const lineageId = crypto.randomUUID();
  const task = {
    id: lineageId,
    lineageId,
    title: elements.taskTitle.value.trim(),
    category: elements.taskCategory.value.trim(),
    priority: elements.taskPriority.value,
    dueDate: elements.taskDueDate.value || state.activeDate,
    estimate: Number(elements.taskEstimate.value || 0),
    note: elements.taskNote.value.trim(),
    status: "todo",
    createdAt: timestamp,
    updatedAt: timestamp,
    carryoverCount: 0,
    carriedFromDate: null,
    completedAt: null,
  };

  day.tasks.unshift(task);
  saveState();
  elements.taskForm.reset();
  elements.taskPriority.value = "medium";
  elements.taskDueDate.value = state.activeDate;
  elements.taskEstimate.value = "30";
  render();
}

function updateTaskStatus(taskId, nextStatus) {
  const day = getActiveDay();
  const task = day.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.status = nextStatus;
  task.updatedAt = new Date().toISOString();
  task.completedAt = nextStatus === "done" ? task.updatedAt : null;
  saveState();
  render();
}

function deleteTask(taskId) {
  const day = getActiveDay();
  day.tasks = day.tasks.filter((task) => task.id !== taskId);
  saveState();
  render();
}

function clearCompleted() {
  const day = getActiveDay();
  day.tasks = day.tasks.filter((task) => task.status !== "done");
  saveState();
  render();
}

function handleNotesInput(event) {
  const day = getActiveDay();
  day.notes = event.target.value;
  saveState();
}

function clearNotes() {
  const day = getActiveDay();
  day.notes = "";
  saveState();
  render();
}

function updateTimerDuration() {
  const day = getActiveDay();
  const minutes = clamp(Number(elements.timerDuration.value || 25), 1, 180);
  day.timerDuration = minutes;
  state.timer.remainingSeconds = minutes * 60;
  saveState();
  renderClock();
}

function startTimer() {
  if (state.timer.intervalId) return;

  state.timer.startedAt = Date.now();
  state.timer.intervalId = window.setInterval(() => {
    state.timer.remainingSeconds -= 1;
    renderClock();

    if (state.timer.remainingSeconds <= 0) {
      finishTimerSession();
    }
  }, 1000);
}

function pauseTimer() {
  if (!state.timer.intervalId) return;
  clearInterval(state.timer.intervalId);
  state.timer.intervalId = null;
  state.timer.startedAt = null;
}

function resetTimer() {
  pauseTimer();
  state.timer.remainingSeconds = getActiveDay().timerDuration * 60;
  renderClock();
}

function finishTimerSession() {
  pauseTimer();
  const day = getActiveDay();
  day.focusMinutes += day.timerDuration;
  saveState();
  state.timer.remainingSeconds = day.timerDuration * 60;
  render();
}

function renderClock() {
  const minutes = Math.floor(state.timer.remainingSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.max(state.timer.remainingSeconds % 60, 0)
    .toString()
    .padStart(2, "0");
  elements.timerClock.textContent = `${minutes}:${seconds}`;
}

function formatDateCaption(dateKey) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(parseDateKey(dateKey));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function relativeTime(value) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(elapsed / 60000));
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  return `${days}일 전`;
}

function statusLabel(status) {
  if (status === "done") return "완료";
  if (status === "doing") return "진행 중";
  return "등록됨";
}

function activityIcon(priority) {
  if (priority === "high") return "!";
  if (priority === "medium") return "•";
  return "○";
}

function activityColor(priority) {
  if (priority === "high") return "#ba1a1a";
  if (priority === "medium") return "#9e4300";
  return "#1f8d4d";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeState(rawState) {
  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawState)
      .filter(([dateKey]) => isDateKey(dateKey))
      .map(([dateKey, day]) => [dateKey, normalizeDay(day, dateKey)]),
  );
}

function normalizeDay(day, dateKey) {
  return {
    tasks: Array.isArray(day?.tasks) ? day.tasks.map((task) => normalizeTask(task, dateKey)) : [],
    notes: typeof day?.notes === "string" ? day.notes : "",
    focusMinutes: Math.max(0, Number(day?.focusMinutes) || 0),
    timerDuration: clamp(Number(day?.timerDuration || 25), 1, 180),
  };
}

function normalizeTask(task, dateKey) {
  const fallbackId = crypto.randomUUID();
  const id = typeof task?.id === "string" && task.id ? task.id : fallbackId;
  const createdAt = isValidDateTime(task?.createdAt) ? task.createdAt : new Date(`${dateKey}T09:00:00`).toISOString();
  const updatedAt = isValidDateTime(task?.updatedAt) ? task.updatedAt : createdAt;
  const allowedPriority = ["high", "medium", "low"];
  const allowedStatus = ["todo", "doing", "done"];

  return {
    id,
    lineageId: typeof task?.lineageId === "string" && task.lineageId ? task.lineageId : id,
    title: typeof task?.title === "string" ? task.title : "",
    category: typeof task?.category === "string" ? task.category : "",
    priority: allowedPriority.includes(task?.priority) ? task.priority : "medium",
    dueDate: isDateKey(task?.dueDate) ? task.dueDate : dateKey,
    estimate: Math.max(0, Number(task?.estimate) || 0),
    note: typeof task?.note === "string" ? task.note : "",
    status: allowedStatus.includes(task?.status) ? task.status : "todo",
    createdAt,
    updatedAt,
    carryoverCount: Math.max(0, Number(task?.carryoverCount) || 0),
    carriedFromDate: isDateKey(task?.carriedFromDate) ? task.carriedFromDate : null,
    completedAt: isValidDateTime(task?.completedAt) ? task.completedAt : null,
  };
}

function rolloverPendingTasks(targetDateKey) {
  const targetDay = state.days[targetDateKey];
  const knownLineages = new Set(targetDay.tasks.map((task) => task.lineageId || task.id));
  const carriedTasks = [];
  let changed = false;

  const sourceDates = Object.keys(state.days)
    .filter((dateKey) => dateKey < targetDateKey)
    .sort((left, right) => right.localeCompare(left));

  for (const sourceDateKey of sourceDates) {
    const sourceDay = state.days[sourceDateKey];
    const remainingTasks = [];

    for (const task of sourceDay.tasks) {
      if (task.status === "done") {
        remainingTasks.push(task);
        continue;
      }

      const lineageId = task.lineageId || task.id;
      if (knownLineages.has(lineageId)) {
        changed = true;
        continue;
      }

      carriedTasks.push(createCarryoverTask(task, sourceDateKey));
      knownLineages.add(lineageId);
      changed = true;
    }

    if (remainingTasks.length !== sourceDay.tasks.length) {
      sourceDay.tasks = remainingTasks;
    }
  }

  if (carriedTasks.length > 0) {
    targetDay.tasks = [...sortTasksForDisplay(carriedTasks), ...targetDay.tasks];
  }

  return changed;
}

function createCarryoverTask(task, sourceDateKey) {
  const timestamp = new Date().toISOString();

  return {
    ...task,
    id: crypto.randomUUID(),
    priority: "high",
    updatedAt: timestamp,
    carryoverCount: (task.carryoverCount || 0) + 1,
    carriedFromDate: sourceDateKey,
    completedAt: null,
  };
}

function sortTasksForDisplay(tasks) {
  return [...tasks].sort(compareTasksForDisplay);
}

function compareTasksForDisplay(left, right) {
  const priorityScore = { high: 0, medium: 1, low: 2 };

  return (
    Number(isTaskOverdue(right)) - Number(isTaskOverdue(left)) ||
    priorityScore[getEffectivePriority(left)] - priorityScore[getEffectivePriority(right)] ||
    left.dueDate.localeCompare(right.dueDate) ||
    new Date(left.createdAt) - new Date(right.createdAt)
  );
}

function getEffectivePriority(task) {
  if (task.status !== "done" && (task.priority === "high" || task.carryoverCount > 0 || isTaskOverdue(task))) {
    return "high";
  }

  return task.priority;
}

function isTaskOverdue(task, referenceDateKey = state.activeDate) {
  return task.status !== "done" && isDateKey(task.dueDate) && task.dueDate < referenceDateKey;
}

function getTaskFlag(task) {
  if (isTaskOverdue(task)) {
    return {
      label: `${daysPastDue(task.dueDate)}일 지연`,
      kind: "overdue",
    };
  }

  if (task.carryoverCount > 0) {
    return {
      label: "전일 승계",
      kind: "carryover",
    };
  }

  return null;
}

function formatDeadlineLabel(task) {
  if (!isDateKey(task.dueDate)) {
    return "마감 미정";
  }

  if (isTaskOverdue(task)) {
    return `마감 ${formatShortDate(task.dueDate)} · ${daysPastDue(task.dueDate)}일 지남`;
  }

  if (task.dueDate === state.activeDate) {
    return "오늘 마감";
  }

  return `마감 ${formatShortDate(task.dueDate)}`;
}

function buildActivitySubtitle(task) {
  if (task.carryoverCount > 0) {
    return `${task.category || "분류 없음"} · ${formatShortDate(task.carriedFromDate)}에서 승계`;
  }

  return `${task.category || "분류 없음"} 카테고리로 저장됨`;
}

function daysPastDue(dateKey) {
  return Math.max(1, daysBetweenDateKeys(dateKey, state.activeDate));
}

function daysBetweenDateKeys(startDateKey, endDateKey) {
  const start = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);
  return Math.round((end - start) / 86400000);
}

function formatShortDate(dateKey) {
  if (!isDateKey(dateKey)) {
    return "날짜 미정";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(parseDateKey(dateKey));
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isDateKey(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidDateTime(value) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}
