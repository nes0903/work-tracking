"use client";

import { useMemo, useState } from "react";
import { isFigmaUrl, parseFigmaUrl } from "@/lib/figma-url";
import { formatFileSize } from "@/lib/line-works-archive";
import type {
  LineWorksArchiveChannelSummary,
  LineWorksArchiveMessage,
} from "@/lib/line-works-archive";
import {
  isPendingSelected,
  pendingKey,
  removePending,
  sourceIcon,
  sourceLabel,
  togglePending,
  type PendingReference,
} from "@/lib/pending-references";
import type { ChannelLabelMap, StorageItem } from "@/lib/storage";
import type { NotionUpdateItem } from "@/lib/work-tracking";

type TabId = "notion" | "line-works" | "figma" | "storage" | "other-url";

interface Props {
  pending: PendingReference[];
  onPendingChange: (next: PendingReference[]) => void;
  notionItems: NotionUpdateItem[];
  lineWorksItems: LineWorksArchiveMessage[];
  lineWorksChannels: LineWorksArchiveChannelSummary[];
  storageItems: StorageItem[];
  channelLabels: ChannelLabelMap;
}

export function ReferenceCollector({
  pending,
  onPendingChange,
  notionItems,
  lineWorksItems,
  lineWorksChannels,
  storageItems,
  channelLabels,
}: Props) {
  const [tab, setTab] = useState<TabId>("notion");

  const toggle = (ref: PendingReference) =>
    onPendingChange(togglePending(pending, ref));

  const handleRemove = (ref: PendingReference) =>
    onPendingChange(removePending(pending, ref));

  const addFresh = (ref: PendingReference) =>
    onPendingChange([
      ...pending.filter((r) => pendingKey(r) !== pendingKey(ref)),
      ref,
    ]);

  return (
    <div className="ref-collector">
      <div className="ref-tabs">
        <button
          type="button"
          className={`ref-tab ${tab === "notion" ? "active" : ""}`.trim()}
          onClick={() => setTab("notion")}
        >
          Notion{notionItems.length > 0 ? ` (${notionItems.length})` : ""}
        </button>
        <button
          type="button"
          className={`ref-tab ${tab === "line-works" ? "active" : ""}`.trim()}
          onClick={() => setTab("line-works")}
        >
          LINE WORKS{lineWorksItems.length > 0 ? ` (${lineWorksItems.length})` : ""}
        </button>
        <button
          type="button"
          className={`ref-tab ${tab === "figma" ? "active" : ""}`.trim()}
          onClick={() => setTab("figma")}
        >
          Figma
        </button>
        <button
          type="button"
          className={`ref-tab ${tab === "storage" ? "active" : ""}`.trim()}
          onClick={() => setTab("storage")}
        >
          파일 저장소{storageItems.length > 0 ? ` (${storageItems.length})` : ""}
        </button>
        <button
          type="button"
          className={`ref-tab ${tab === "other-url" ? "active" : ""}`.trim()}
          onClick={() => setTab("other-url")}
        >
          기타 URL
        </button>
      </div>

      <div className="ref-tab-content">
        {tab === "notion" ? (
          <NotionTab items={notionItems} pending={pending} onToggle={toggle} />
        ) : null}
        {tab === "line-works" ? (
          <LineWorksTab
            items={lineWorksItems}
            channels={lineWorksChannels}
            pending={pending}
            onToggle={toggle}
          />
        ) : null}
        {tab === "figma" ? <FigmaTab onAdd={addFresh} /> : null}
        {tab === "storage" ? (
          <StorageTab
            items={storageItems}
            channelLabels={channelLabels}
            pending={pending}
            onToggle={toggle}
          />
        ) : null}
        {tab === "other-url" ? <OtherUrlTab onAdd={addFresh} /> : null}
      </div>

      <PendingList items={pending} onRemove={handleRemove} />
    </div>
  );
}

/* ============================================================
   기타 URL 탭 (범용 외부 링크)
   ============================================================ */
function OtherUrlTab({ onAdd }: { onAdd: (ref: PendingReference) => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  function handleAdd() {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    // Figma URL 이면 안내
    if (isFigmaUrl(trimmedUrl)) {
      setHint("Figma URL 입니다. 더 정확한 연결을 위해 Figma 탭을 사용하세요.");
      return;
    }
    onAdd({
      source: "url",
      externalId: trimmedUrl,
      title: title.trim() || trimmedUrl,
      externalUrl: trimmedUrl,
    });
    setUrl("");
    setTitle("");
    setHint(null);
  }

  return (
    <div className="ref-url-tab-wrap">
      <div className="ref-url-tab">
        <input
          type="url"
          placeholder="https://..."
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (hint) setHint(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAdd();
            }
          }}
        />
        <input
          type="text"
          placeholder="표시 이름 (선택)"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAdd();
            }
          }}
        />
        <button type="button" className="secondary-button" onClick={handleAdd}>
          + 추가
        </button>
      </div>
      {hint ? <p className="ref-url-hint">{hint}</p> : null}
    </div>
  );
}

/* ============================================================
   Figma 탭
   ============================================================ */
function FigmaTab({ onAdd }: { onAdd: (ref: PendingReference) => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("Figma URL을 입력하세요.");
      return;
    }
    const parsed = parseFigmaUrl(trimmedUrl);
    if (!parsed) {
      setError("Figma URL이 아닙니다. 예) https://www.figma.com/file/<key>/?node-id=1:2");
      return;
    }
    const cleanedTitle =
      title.trim() ||
      (parsed.nodeId ? `Figma 노드 ${parsed.nodeId}` : `Figma 파일 ${parsed.fileKey.slice(0, 6)}`);
    onAdd({
      source: "figma_node",
      externalId: trimmedUrl,
      title: cleanedTitle,
      externalUrl: trimmedUrl,
      metadata: {
        fileKey: parsed.fileKey,
        nodeId: parsed.nodeId,
        urlType: parsed.urlType,
      },
    });
    setUrl("");
    setTitle("");
    setError(null);
  }

  return (
    <div className="ref-url-tab-wrap">
      <div className="ref-url-tab">
        <input
          type="url"
          placeholder="https://www.figma.com/file/... 또는 .../design/...?node-id=..."
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAdd();
            }
          }}
        />
        <input
          type="text"
          placeholder="표시 이름 (선택)"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAdd();
            }
          }}
        />
        <button type="button" className="secondary-button" onClick={handleAdd}>
          + 추가
        </button>
      </div>
      {error ? <p className="ref-url-error">{error}</p> : null}
      <p className="ref-url-tip">
        Figma 파일 URL 을 붙여넣으면 <code>fileKey</code>·<code>nodeId</code> 가 자동으로 추출됩니다.
      </p>
    </div>
  );
}

/* ============================================================
   Notion 탭
   ============================================================ */
function NotionTab({
  items,
  pending,
  onToggle,
}: {
  items: NotionUpdateItem[];
  pending: PendingReference[];
  onToggle: (ref: PendingReference) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter((item) =>
          (item.title ?? "").toLowerCase().includes(q) ||
          (item.section ?? "").toLowerCase().includes(q) ||
          (item.parent ?? "").toLowerCase().includes(q),
        )
      : items;
    return list.slice(0, 30);
  }, [items, query]);

  if (items.length === 0) {
    return <p className="empty-note">Notion 업데이트가 아직 없습니다.</p>;
  }

  return (
    <div className="ref-picker">
      <input
        type="text"
        className="ref-search"
        placeholder="제목·경로 검색..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="ref-picker-list">
        {filtered.map((item, index) => {
          const externalId =
            item.url || item.eventId || `${item.title ?? "?"}-${index}`;
          const ref: PendingReference = {
            source: "notion_page",
            externalId,
            title: item.title || "제목 없음",
            excerpt:
              [item.section, item.parent].filter(Boolean).join(" / ") || null,
            externalUrl: item.url || null,
            metadata: {
              section: item.section ?? null,
              parent: item.parent ?? null,
              editor: item.editor ?? null,
              editedAt: item.editedAt ?? null,
            },
          };
          const selected = isPendingSelected(pending, {
            source: "notion_page",
            externalId,
          });
          return (
            <li key={externalId}>
              <button
                type="button"
                className={`ref-picker-item ${selected ? "selected" : ""}`.trim()}
                onClick={() => onToggle(ref)}
              >
                <div className="ref-picker-main">
                  <span className="ref-picker-title">{ref.title}</span>
                  <span className="ref-picker-meta">
                    {ref.excerpt || "경로 없음"}
                  </span>
                </div>
                <span className="ref-picker-indicator">
                  {selected ? "✓" : "+"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ============================================================
   LINE WORKS 탭 (메시지 + 첨부)
   ============================================================ */
function LineWorksTab({
  items,
  channels,
  pending,
  onToggle,
}: {
  items: LineWorksArchiveMessage[];
  channels: LineWorksArchiveChannelSummary[];
  pending: PendingReference[];
  onToggle: (ref: PendingReference) => void;
}) {
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let list = items;
    if (selectedChannel) {
      list = list.filter((m) => m.channelId === selectedChannel);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          (m.text ?? "").toLowerCase().includes(q) ||
          m.attachments.some((a) =>
            (a.fileName ?? "").toLowerCase().includes(q),
          ),
      );
    }
    return list.slice(0, 50);
  }, [items, selectedChannel, query]);

  if (items.length === 0) {
    return <p className="empty-note">Works 메시지가 아직 없습니다.</p>;
  }

  const channelLabel = (
    channelId: string,
    title: string | null,
    channelType: string | null,
  ) => {
    const t = typeof title === "string" ? title.trim() : "";
    const isDM = channelType === "SINGLE_USER" || channelId.startsWith("dm:");
    if (t) return isDM ? `DM · ${t}` : t;
    return isDM ? "DM" : "채팅방";
  };

  const authorLabel = (userName: string | null, userId: string | null) => {
    const n = typeof userName === "string" ? userName.trim() : "";
    if (n) return n;
    if (userId && userId.length > 14 && /-/.test(userId)) {
      return `${userId.slice(0, 4)}…${userId.slice(-4)}`;
    }
    return userId ?? "";
  };

  return (
    <div className="ref-picker">
      <div className="ref-picker-filters">
        <select
          value={selectedChannel ?? ""}
          onChange={(event) => setSelectedChannel(event.target.value || null)}
        >
          <option value="">전체 채널</option>
          {channels.map((c) => (
            <option key={c.channelId} value={c.channelId}>
              {channelLabel(c.channelId, c.title, c.channelType)} ({c.count})
            </option>
          ))}
        </select>
        <input
          type="text"
          className="ref-search"
          placeholder="본문·파일명 검색..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <ul className="ref-picker-list works-picker-list">
        {filtered.flatMap((msg) => {
          const rows: React.ReactNode[] = [];
          const channel = channelLabel(msg.channelId, msg.channelTitle, msg.channelType);
          const author = authorLabel(msg.userName, msg.userId);
          const hasText = Boolean(msg.text && msg.text.trim());

          if (hasText) {
            const preview =
              msg.text!.length > 140 ? `${msg.text!.slice(0, 140)}…` : msg.text!;
            const msgRef: PendingReference = {
              source: "line_works_message",
              externalId: msg.messageId,
              title: preview,
              excerpt: [channel, author, msg.contentType].filter(Boolean).join(" / "),
              metadata: {
                channelId: msg.channelId,
                channelTitle: msg.channelTitle,
                channelType: msg.channelType,
                userId: msg.userId,
                userName: msg.userName,
                issuedAt: msg.issuedAt,
                contentType: msg.contentType,
                text: msg.text,
              },
            };
            const msgSelected = isPendingSelected(pending, {
              source: "line_works_message",
              externalId: msg.messageId,
            });
            const subtitle = [channel, author, msg.contentType]
              .filter(Boolean)
              .join(" / ");
            rows.push(
              <li key={`msg:${msg.messageId}`}>
                <button
                  type="button"
                  className={`ref-picker-item works-row ${msgSelected ? "selected" : ""}`.trim()}
                  onClick={() => onToggle(msgRef)}
                >
                  <div className="ref-picker-main">
                    <span className="ref-picker-title works-row-title">
                      <span className="works-row-icon">💬</span>
                      <span className="works-row-title-text">{preview}</span>
                    </span>
                    {subtitle ? (
                      <span className="ref-picker-meta">{subtitle}</span>
                    ) : null}
                  </div>
                  <span className="ref-picker-indicator">
                    {msgSelected ? "✓" : "+"}
                  </span>
                </button>
              </li>,
            );
          }

          for (const att of msg.attachments) {
            const fileName = att.fileName ?? "파일";
            const subtitleParts = [channel, author, att.mimeType, att.fileSize ? formatFileSize(att.fileSize) : null];
            const subtitle = subtitleParts.filter(Boolean).join(" / ");
            const attRef: PendingReference = {
              source: "line_works_attachment",
              externalId: String(att.id),
              title: fileName,
              excerpt: subtitle,
              metadata: {
                attachmentId: att.id,
                messageId: msg.messageId,
                channelId: msg.channelId,
                channelTitle: msg.channelTitle,
                channelType: msg.channelType,
                userId: msg.userId,
                userName: msg.userName,
                fileName: att.fileName,
                fileSize: att.fileSize,
                mimeType: att.mimeType,
              },
            };
            const attSelected = isPendingSelected(pending, {
              source: "line_works_attachment",
              externalId: String(att.id),
            });
            rows.push(
              <li key={`att:${att.id}`}>
                <button
                  type="button"
                  className={`ref-picker-item works-row ${attSelected ? "selected" : ""}`.trim()}
                  onClick={() => onToggle(attRef)}
                >
                  <div className="ref-picker-main">
                    <span className="ref-picker-title works-row-title">
                      <span className="works-row-icon">📎</span>
                      <span className="works-row-title-text">{fileName}</span>
                    </span>
                    {subtitle ? (
                      <span className="ref-picker-meta">{subtitle}</span>
                    ) : null}
                  </div>
                  <span className="ref-picker-indicator">
                    {attSelected ? "✓" : "+"}
                  </span>
                </button>
              </li>,
            );
          }

          return rows;
        })}
      </ul>
    </div>
  );
}

/* ============================================================
   파일 저장소 탭 (플랫 리스트)
   ============================================================ */
function StorageTab({
  items,
  channelLabels,
  pending,
  onToggle,
}: {
  items: StorageItem[];
  channelLabels: ChannelLabelMap;
  pending: PendingReference[];
  onToggle: (ref: PendingReference) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter((file) =>
          ((file.fileName ?? "") + file.s3Key).toLowerCase().includes(q),
        )
      : items;
    return list.slice(0, 100);
  }, [items, query]);

  if (items.length === 0) {
    return <p className="empty-note">저장된 파일이 없습니다.</p>;
  }

  return (
    <div className="ref-picker">
      <input
        type="text"
        className="ref-search"
        placeholder="파일명·경로 검색..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="ref-picker-list">
        {filtered.map((file) => {
          const parts = file.s3Key.split("/");
          const channelSeg = parts[1] ?? "";
          const info = channelLabels[channelSeg];
          const channelName = info?.title
            ? info.channelType === "SINGLE_USER"
              ? `DM · ${info.title}`
              : info.title
            : channelSeg;

          const ref: PendingReference = {
            source: "line_works_attachment",
            externalId: String(file.id),
            title: file.fileName ?? "파일",
            excerpt: `${channelName} · ${formatFileSize(file.fileSize)}`,
            metadata: {
              attachmentId: file.id,
              messageId: file.messageId,
              fileName: file.fileName,
              fileSize: file.fileSize,
              mimeType: file.mimeType,
            },
          };
          const selected = isPendingSelected(pending, {
            source: "line_works_attachment",
            externalId: String(file.id),
          });

          return (
            <li key={file.id}>
              <button
                type="button"
                className={`ref-picker-item ${selected ? "selected" : ""}`.trim()}
                onClick={() => onToggle(ref)}
                title={file.s3Key}
              >
                <div className="ref-picker-main">
                  <span className="ref-picker-title">
                    📄 {ref.title}
                  </span>
                  <span className="ref-picker-meta">{ref.excerpt}</span>
                </div>
                <span className="ref-picker-indicator">
                  {selected ? "✓" : "+"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ============================================================
   선택된 참조 목록
   ============================================================ */
function PendingList({
  items,
  onRemove,
}: {
  items: PendingReference[];
  onRemove: (ref: PendingReference) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="ref-pending">
        <p className="field-label">추가된 참조 (0)</p>
        <p className="empty-note">아직 선택된 참조가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="ref-pending">
      <p className="field-label">추가된 참조 ({items.length})</p>
      <ul className="ref-pending-list">
        {items.map((ref) => (
          <li key={pendingKey(ref)} className="ref-pending-item">
            <span className="ref-pending-source">
              {sourceIcon(ref.source)} {sourceLabel(ref.source)}
            </span>
            <div className="ref-pending-main">
              <span className="ref-pending-title">{ref.title}</span>
              {ref.excerpt ? (
                <span className="ref-pending-excerpt">{ref.excerpt}</span>
              ) : null}
            </div>
            <button
              type="button"
              className="ref-pending-remove"
              onClick={() => onRemove(ref)}
              aria-label="제거"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
