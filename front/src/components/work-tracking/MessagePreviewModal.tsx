"use client";

import { useMemo } from "react";
import { findLinksInText } from "@/lib/url-utils";

export interface MessagePreview {
  channelTitle: string | null;
  channelId: string | null;
  userName: string | null;
  issuedAt: string | null;
  text: string;
}

interface Props {
  preview: MessagePreview | null;
  onClose: () => void;
}

export function MessagePreviewModal({ preview, onClose }: Props) {
  const parts = useMemo(() => {
    if (!preview) {
      return [] as Array<{
        kind: "text" | "link";
        value: string;
        href?: string;
      }>;
    }
    const items: Array<{ kind: "text" | "link"; value: string; href?: string }> =
      [];
    const text = preview.text;
    let lastIndex = 0;
    for (const match of findLinksInText(text)) {
      if (match.start > lastIndex) {
        items.push({ kind: "text", value: text.slice(lastIndex, match.start) });
      }
      items.push({ kind: "link", value: match.value, href: match.href });
      lastIndex = match.end;
    }
    if (lastIndex < text.length) {
      items.push({ kind: "text", value: text.slice(lastIndex) });
    }
    return items;
  }, [preview]);

  if (!preview) return null;

  const title = preview.channelTitle ?? "채팅방";

  return (
    <div
      className="modal-backdrop message-preview-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="message-preview-modal">
        <header className="message-preview-head">
          <div className="message-preview-head-main">
            <span className="message-preview-kicker">💬 Works 메시지</span>
            <h3>{title}</h3>
            <div className="message-preview-meta">
              {preview.userName ? <span>{preview.userName}</span> : null}
              {preview.issuedAt ? (
                <span>{formatDateTime(preview.issuedAt)}</span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="닫기"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="message-preview-body">
          {preview.text ? (
            <p className="message-preview-text">
              {parts.length === 0
                ? preview.text
                : parts.map((part, idx) =>
                    part.kind === "link" ? (
                      <a
                        key={idx}
                        href={part.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {part.value}
                      </a>
                    ) : (
                      <span key={idx}>{part.value}</span>
                    ),
                  )}
            </p>
          ) : (
            <p className="empty-note">본문이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
