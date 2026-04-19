"use client";

import { useMemo, useState } from "react";
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

type TabId = "url" | "notion" | "line-works" | "storage";

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
  const [tab, setTab] = useState<TabId>("url");

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
          className={`ref-tab ${tab === "url" ? "active" : ""}`.trim()}
          onClick={() => setTab("url")}
        >
          URL
        </button>
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
          className={`ref-tab ${tab === "storage" ? "active" : ""}`.trim()}
          onClick={() => setTab("storage")}
        >
          파일 저장소{storageItems.length > 0 ? ` (${storageItems.length})` : ""}
        </button>
      </div>

      <div className="ref-tab-content">
        {tab === "url" ? <UrlTab onAdd={addFresh} /> : null}
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
        {tab === "storage" ? (
          <StorageTab
            items={storageItems}
            channelLabels={channelLabels}
            pending={pending}
            onToggle={toggle}
          />
        ) : null}
      </div>

      <PendingList items={pending} onRemove={handleRemove} />
    </div>
  );
}

/* ============================================================
   URL 탭
   ============================================================ */
function UrlTab({ onAdd }: { onAdd: (ref: PendingReference) => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  function handleAdd() {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    onAdd({
      source: "url",
      externalId: trimmedUrl,
      title: title.trim() || trimmedUrl,
      externalUrl: trimmedUrl,
    });
    setUrl("");
    setTitle("");
  }

  return (
    <div className="ref-url-tab">
      <input
        type="url"
        placeholder="https://..."
        value={url}
        onChange={(event) => setUrl(event.target.value)}
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
    return <p className="empty-note">LINE WORKS 메시지가 아직 없습니다.</p>;
  }

  const channelLabel = (channelId: string) => {
    const channel = channels.find((c) => c.channelId === channelId);
    if (channel?.title) {
      return channel.channelType === "SINGLE_USER"
        ? `DM · ${channel.title}`
        : channel.title;
    }
    return channelId.slice(0, 10) + "…";
  };

  return (
    <div className="ref-picker">
      <div className="ref-picker-filters">
        <select
          value={selectedChannel ?? ""}
          onChange={(event) =>
            setSelectedChannel(event.target.value || null)
          }
        >
          <option value="">전체 채널</option>
          {channels.map((c) => (
            <option key={c.channelId} value={c.channelId}>
              {channelLabel(c.channelId)} ({c.count})
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

      <ul className="ref-picker-list">
        {filtered.map((msg) => {
          const msgTitle = msg.text
            ? msg.text.length > 60
              ? `${msg.text.slice(0, 60)}…`
              : msg.text
            : `[${msg.contentType}]`;

          const msgRef: PendingReference = {
            source: "line_works_message",
            externalId: msg.messageId,
            title: msgTitle,
            excerpt: `${channelLabel(msg.channelId)} · ${msg.userId ?? "unknown"}`,
            metadata: {
              channelId: msg.channelId,
              channelTitle: msg.channelTitle,
              channelType: msg.channelType,
              userId: msg.userId,
              issuedAt: msg.issuedAt,
              contentType: msg.contentType,
            },
          };
          const msgSelected = isPendingSelected(pending, {
            source: "line_works_message",
            externalId: msg.messageId,
          });

          return (
            <li key={msg.messageId}>
              <button
                type="button"
                className={`ref-picker-item ${msgSelected ? "selected" : ""}`.trim()}
                onClick={() => onToggle(msgRef)}
              >
                <div className="ref-picker-main">
                  <span className="ref-picker-title">{msgRef.title}</span>
                  <span className="ref-picker-meta">{msgRef.excerpt}</span>
                </div>
                <span className="ref-picker-indicator">
                  {msgSelected ? "✓" : "+"}
                </span>
              </button>

              {msg.attachments.length > 0 ? (
                <div className="ref-picker-sublist">
                  {msg.attachments.map((att) => {
                    const attRef: PendingReference = {
                      source: "line_works_attachment",
                      externalId: String(att.id),
                      title: att.fileName ?? "파일",
                      excerpt: [
                        att.mimeType,
                        formatFileSize(att.fileSize),
                      ]
                        .filter(Boolean)
                        .join(" · "),
                      metadata: {
                        attachmentId: att.id,
                        messageId: msg.messageId,
                        channelId: msg.channelId,
                        fileName: att.fileName,
                        fileSize: att.fileSize,
                        mimeType: att.mimeType,
                      },
                    };
                    const attSelected = isPendingSelected(pending, {
                      source: "line_works_attachment",
                      externalId: String(att.id),
                    });
                    return (
                      <button
                        key={att.id}
                        type="button"
                        className={`ref-picker-attachment ${attSelected ? "selected" : ""}`.trim()}
                        onClick={() => onToggle(attRef)}
                      >
                        📎 {attRef.title}
                        {attRef.excerpt ? (
                          <span className="ref-picker-attachment-meta">
                            {" "}
                            · {attRef.excerpt}
                          </span>
                        ) : null}
                        <span className="ref-picker-indicator">
                          {attSelected ? "✓" : "+"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
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
