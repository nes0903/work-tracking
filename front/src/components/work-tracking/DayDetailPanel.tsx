"use client";

import type {
  CalendarDayBucket,
  CalendarGithubSummary,
  CalendarLineWorksSummary,
  CalendarNotionSummary,
  CalendarStorageSummary,
  CalendarTaskSummary,
} from "@/lib/calendar-api";
import { dayLabel } from "@/lib/calendar-api";
import { formatFileSize } from "@/lib/line-works-archive";

interface Props {
  dateKey: string;
  bucket: CalendarDayBucket;
  onOpenAttachment: (
    id: number,
    fileName: string | null,
    mimeType: string | null,
  ) => void;
  onOpenMessage: (message: CalendarLineWorksSummary) => void;
}

export function DayDetailPanel({
  dateKey,
  bucket,
  onOpenAttachment,
  onOpenMessage,
}: Props) {
  const total =
    bucket.tasks.length +
    bucket.notion.length +
    bucket.github.length +
    bucket.lineWorks.length +
    bucket.storage.length;

  return (
    <aside className="calendar-day-panel">
      <header className="calendar-day-panel-head">
        <h3>{dayLabel(dateKey)}</h3>
        <span className="calendar-day-panel-total">이벤트 {total}건</span>
      </header>

      <Section title="태스크" count={bucket.tasks.length}>
        {bucket.tasks.map((task) => (
          <TaskItem key={task.id} task={task} />
        ))}
      </Section>

      <Section title="Notion" count={bucket.notion.length}>
        {bucket.notion.map((item) => (
          <NotionItem key={item.eventId} item={item} />
        ))}
      </Section>

      <Section title="GitHub" count={bucket.github.length}>
        {bucket.github.map((item, idx) => (
          <GithubItem key={`${item.kind}-${item.url}-${idx}`} item={item} />
        ))}
      </Section>

      <Section title="Works" count={bucket.lineWorks.length}>
        {bucket.lineWorks.map((item) => (
          <LineWorksItem
            key={item.messageId}
            item={item}
            onOpen={() => onOpenMessage(item)}
          />
        ))}
      </Section>

      <Section title="파일 저장소" count={bucket.storage.length}>
        {bucket.storage.map((item) => (
          <StorageItem
            key={item.id}
            item={item}
            onOpen={() =>
              onOpenAttachment(item.id, item.fileName, item.mimeType)
            }
          />
        ))}
      </Section>
    </aside>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="calendar-day-section">
      <h4>
        {title} <span className="calendar-day-section-count">{count}</span>
      </h4>
      {count === 0 ? <p className="empty-note">없음</p> : <ul>{children}</ul>}
    </section>
  );
}

function TaskItem({ task }: { task: CalendarTaskSummary }) {
  return (
    <li className="calendar-day-item">
      <span className={`task-row-priority priority-${task.priority}`}>
        {task.priority === "high"
          ? "H"
          : task.priority === "medium"
            ? "M"
            : "L"}
      </span>
      <div className="calendar-day-item-main">
        <span className="calendar-day-item-title">
          {task.title || "제목 없음"}
        </span>
        <span className="calendar-day-item-meta">
          {task.category ? <span>📂 {task.category}</span> : null}
          {task.dueTime ? <span>⏰ {task.dueTime}</span> : null}
          <span>👤 {task.assigneeName ?? "미지정"}</span>
          <span className={`status-tag status-${task.status}`}>
            {task.status === "todo"
              ? "할 일"
              : task.status === "doing"
                ? "진행 중"
                : "완료"}
          </span>
        </span>
      </div>
    </li>
  );
}

function NotionItem({ item }: { item: CalendarNotionSummary }) {
  return (
    <li className="calendar-day-item">
      <span className="calendar-day-item-icon">📄</span>
      <div className="calendar-day-item-main">
        <a
          className="calendar-day-item-title as-link"
          href={item.url}
          target="_blank"
          rel="noreferrer"
        >
          {item.title || "제목 없음"}
        </a>
        <span className="calendar-day-item-meta">
          {[item.section, item.parent].filter(Boolean).join(" / ") ||
            "경로 없음"}
          {item.editor ? <span>· {item.editor}</span> : null}
        </span>
      </div>
    </li>
  );
}

function GithubItem({ item }: { item: CalendarGithubSummary }) {
  return (
    <li className="calendar-day-item">
      <span className="calendar-day-item-icon">
        {item.kind === "pr" ? "🔀" : "🔖"}
      </span>
      <div className="calendar-day-item-main">
        <a
          className="calendar-day-item-title as-link"
          href={item.url}
          target="_blank"
          rel="noreferrer"
        >
          {item.title || "제목 없음"}
        </a>
        <span className="calendar-day-item-meta">
          <span>{item.repo}</span>
          {item.author ? <span>· {item.author}</span> : null}
          {item.status ? <span>· {item.status}</span> : null}
        </span>
      </div>
    </li>
  );
}

function LineWorksItem({
  item,
  onOpen,
}: {
  item: CalendarLineWorksSummary;
  onOpen: () => void;
}) {
  const channel =
    item.channelTitle ?? (item.channelId.startsWith("dm:") ? "DM" : "채팅방");
  const body = item.text ?? "";
  const trimmed = body.replace(/\s+/g, " ").trim();
  const preview = trimmed
    ? trimmed.length > 120
      ? `${trimmed.slice(0, 120)}…`
      : trimmed
    : `[${item.contentType}]`;

  return (
    <li className="calendar-day-item">
      <span className="calendar-day-item-icon">💬</span>
      <button
        type="button"
        className="calendar-day-item-main as-button"
        onClick={onOpen}
      >
        <span className="calendar-day-item-title">{preview}</span>
        <span className="calendar-day-item-meta">
          <span>{channel}</span>
        </span>
      </button>
    </li>
  );
}

function StorageItem({
  item,
  onOpen,
}: {
  item: CalendarStorageSummary;
  onOpen: () => void;
}) {
  return (
    <li className="calendar-day-item">
      <span className="calendar-day-item-icon">📎</span>
      <div className="calendar-day-item-main">
        <button
          type="button"
          className="calendar-day-item-title as-link"
          onClick={onOpen}
        >
          {item.fileName ?? `파일 #${item.id}`}
        </button>
        <span className="calendar-day-item-meta">
          {item.channelTitle ? <span>{item.channelTitle}</span> : null}
          {item.fileSize ? (
            <span>· {formatFileSize(item.fileSize)}</span>
          ) : null}
          {item.mimeType ? <span>· {item.mimeType}</span> : null}
        </span>
      </div>
    </li>
  );
}
