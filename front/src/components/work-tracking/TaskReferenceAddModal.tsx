"use client";

import { useState } from "react";
import type {
  LineWorksArchiveChannelSummary,
  LineWorksArchiveMessage,
} from "@/lib/line-works-archive";
import type { PendingReference } from "@/lib/pending-references";
import type { ChannelLabelMap, StorageItem } from "@/lib/storage";
import { attachReference } from "@/lib/task-references";
import type { NotionUpdateItem } from "@/lib/work-tracking";
import { ReferenceCollector } from "./ReferenceCollector";

interface Props {
  open: boolean;
  taskId: string | null;
  onClose: () => void;
  onAttached?: () => void;
  notionItems: NotionUpdateItem[];
  lineWorksItems: LineWorksArchiveMessage[];
  lineWorksChannels: LineWorksArchiveChannelSummary[];
  storageItems: StorageItem[];
  channelLabels: ChannelLabelMap;
}

export function TaskReferenceAddModal({
  open,
  taskId,
  onClose,
  onAttached,
  notionItems,
  lineWorksItems,
  lineWorksChannels,
  storageItems,
  channelLabels,
}: Props) {
  const [pending, setPending] = useState<PendingReference[]>([]);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function handleClose() {
    if (submitting) return;
    setPending([]);
    setSubmitting(false);
    onClose();
  }

  async function handleAdd() {
    if (!taskId || pending.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      for (const ref of pending) {
        await attachReference({
          taskId,
          source: ref.source,
          externalId: ref.externalId,
          title: ref.title,
          excerpt: ref.excerpt ?? null,
          externalUrl: ref.externalUrl ?? null,
          metadata: ref.metadata ?? null,
        });
      }
      setPending([]);
      setSubmitting(false);
      onAttached?.();
      onClose();
    } catch (error) {
      console.error("[task-reference-add-modal] attach failed", error);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop task-create-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div className="task-create-modal">
        <header className="task-create-modal-head">
          <h3>참조 추가</h3>
          <button
            type="button"
            className="modal-close"
            aria-label="닫기"
            onClick={handleClose}
            disabled={submitting}
          >
            ×
          </button>
        </header>

        <div className="task-create-modal-form">
          <ReferenceCollector
            pending={pending}
            onPendingChange={setPending}
            notionItems={notionItems}
            lineWorksItems={lineWorksItems}
            lineWorksChannels={lineWorksChannels}
            storageItems={storageItems}
            channelLabels={channelLabels}
          />

          <div className="task-create-modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={submitting}
            >
              취소
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleAdd()}
              disabled={submitting || pending.length === 0}
            >
              {submitting
                ? "추가 중..."
                : pending.length === 0
                  ? "참조를 선택하세요"
                  : `${pending.length}건 추가`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
