"use client";

import { useMemo, useState } from "react";
import type { Task, TaskPriority } from "@/lib/work-tracking";
import {
  attachReference,
  sourceIcon,
  sourceLabel,
  type CreateReferenceInput,
  type ReferenceSource,
} from "@/lib/task-references";

export interface AttachCandidate {
  source: ReferenceSource;
  externalId: string;
  title: string;
  excerpt?: string | null;
  externalUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface NewTaskPayload {
  title: string;
  category: string;
  priority: TaskPriority;
  dueDate: string;
  estimate: number;
  note: string;
}

export interface QuickCreateTaskResult {
  taskId: string;
}

interface Props {
  candidate: AttachCandidate | null;         // null ⇒ URL paste 모드
  tasks: Task[];
  activeDate: string;
  onClose: () => void;
  onAttached?: (taskId: string) => void;
  onCreateQuickTask: (payload: NewTaskPayload) => Promise<QuickCreateTaskResult | null>;
}

type Mode = "existing" | "new";

export function AttachToTaskModal({
  candidate: initialCandidate,
  tasks,
  activeDate,
  onClose,
  onAttached,
  onCreateQuickTask,
}: Props) {
  // URL 모드: candidate 가 null 이면 유저가 URL 직접 입력
  const isUrlMode = initialCandidate === null;
  const [urlInput, setUrlInput] = useState("");
  const [urlTitle, setUrlTitle] = useState("");

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("existing");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  // 새 태스크 폼 state
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newDueDate, setNewDueDate] = useState(activeDate);
  const [newEstimate, setNewEstimate] = useState("30");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source = q ? tasks.filter((task) => task.title.toLowerCase().includes(q)) : tasks;
    return source.slice(0, 20);
  }, [query, tasks]);

  function resolveCandidate(): AttachCandidate | null {
    if (!isUrlMode) {
      return initialCandidate;
    }
    const url = urlInput.trim();
    if (!url) {
      return null;
    }
    return {
      source: "url",
      externalId: url,
      title: urlTitle.trim() || url,
      externalUrl: url,
    };
  }

  async function attachTo(taskId: string) {
    const candidate = resolveCandidate();
    if (!candidate) {
      setStatus({ ok: false, text: "URL을 먼저 입력하세요." });
      return;
    }
    setBusy(true);
    setStatus(null);
    const payload: CreateReferenceInput = {
      taskId,
      source: candidate.source,
      externalId: candidate.externalId,
      title: candidate.title,
      excerpt: candidate.excerpt ?? null,
      externalUrl: candidate.externalUrl ?? null,
      metadata: candidate.metadata ?? null,
    };
    const result = await attachReference(payload);
    setBusy(false);
    if (result) {
      setStatus({ ok: true, text: "태스크에 연결했습니다." });
      onAttached?.(taskId);
      setTimeout(() => onClose(), 700);
    } else {
      setStatus({ ok: false, text: "연결 실패. 잠시 후 다시 시도하세요." });
    }
  }

  async function handleCreateAndAttach() {
    if (!newTitle.trim()) {
      setStatus({ ok: false, text: "제목을 입력하세요." });
      return;
    }
    const candidate = resolveCandidate();
    if (!candidate) {
      setStatus({ ok: false, text: "URL을 먼저 입력하세요." });
      return;
    }
    setBusy(true);
    setStatus(null);
    const created = await onCreateQuickTask({
      title: newTitle.trim(),
      category: newCategory.trim(),
      priority: newPriority,
      dueDate: newDueDate || activeDate,
      estimate: Number(newEstimate || 0),
      note: "",
    });
    if (!created) {
      setBusy(false);
      setStatus({ ok: false, text: "태스크 생성 실패." });
      return;
    }
    const ref = await attachReference({
      taskId: created.taskId,
      source: candidate.source,
      externalId: candidate.externalId,
      title: candidate.title,
      excerpt: candidate.excerpt ?? null,
      externalUrl: candidate.externalUrl ?? null,
      metadata: candidate.metadata ?? null,
    });
    setBusy(false);
    if (ref) {
      setStatus({ ok: true, text: "새 태스크 생성 + 연결 완료" });
      onAttached?.(created.taskId);
      setTimeout(() => onClose(), 700);
    } else {
      setStatus({ ok: false, text: "태스크는 만들었으나 참조 연결에 실패했습니다." });
    }
  }

  const displayCandidate = resolveCandidate() ?? initialCandidate;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-card">
        <header className="modal-head">
          <div>
            <p className="field-label">태스크에 연결</p>
            <h3 className="modal-title">
              <span className="attach-source-chip">
                {sourceIcon(displayCandidate?.source ?? "url")}{" "}
                {sourceLabel(displayCandidate?.source ?? "url")}
              </span>
              {displayCandidate?.title ?? "새 URL 참조"}
            </h3>
            {displayCandidate?.excerpt ? (
              <p className="modal-subtitle">{displayCandidate.excerpt}</p>
            ) : null}
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

        <div className="modal-body">
          {isUrlMode ? (
            <div className="modal-url-inputs">
              <input
                type="url"
                className="modal-search"
                placeholder="https://..."
                value={urlInput}
                onChange={(event) => setUrlInput(event.target.value)}
                autoFocus
              />
              <input
                type="text"
                className="modal-search"
                placeholder="표시 이름 (선택)"
                value={urlTitle}
                onChange={(event) => setUrlTitle(event.target.value)}
              />
            </div>
          ) : null}

          <div className="modal-tabs">
            <button
              type="button"
              className={`modal-tab ${mode === "existing" ? "active" : ""}`.trim()}
              onClick={() => setMode("existing")}
            >
              기존 태스크 선택
            </button>
            <button
              type="button"
              className={`modal-tab ${mode === "new" ? "active" : ""}`.trim()}
              onClick={() => setMode("new")}
            >
              + 새 태스크 만들기
            </button>
          </div>

          {mode === "existing" ? (
            <>
              <input
                type="text"
                className="modal-search"
                placeholder="태스크 제목 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />

              {filtered.length === 0 ? (
                <p className="empty-note">일치하는 태스크가 없습니다.</p>
              ) : (
                <ul className="modal-task-list">
                  {filtered.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        className="modal-task-item"
                        onClick={() => {
                          void attachTo(task.id);
                        }}
                        disabled={busy}
                      >
                        <span className="modal-task-title">{task.title}</span>
                        <span className="modal-task-meta">
                          {task.category || "분류 없음"} · {task.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="modal-new-task">
              <label>
                <span className="field-label">업무명</span>
                <input
                  type="text"
                  className="modal-search"
                  placeholder="예: 로그인 UI 피드백 반영"
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  autoFocus
                />
              </label>
              <label>
                <span className="field-label">카테고리 (선택)</span>
                <input
                  type="text"
                  className="modal-search"
                  placeholder="예: 프론트, 디자인 리뷰"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                />
              </label>
              <div className="modal-new-task-row">
                <label>
                  <span className="field-label">우선순위</span>
                  <select
                    className="modal-search"
                    value={newPriority}
                    onChange={(event) => setNewPriority(event.target.value as TaskPriority)}
                  >
                    <option value="high">높음</option>
                    <option value="medium">중간</option>
                    <option value="low">낮음</option>
                  </select>
                </label>
                <label>
                  <span className="field-label">마감</span>
                  <input
                    type="date"
                    className="modal-search"
                    value={newDueDate}
                    onChange={(event) => setNewDueDate(event.target.value)}
                  />
                </label>
                <label>
                  <span className="field-label">예상(분)</span>
                  <input
                    type="number"
                    className="modal-search"
                    min="0"
                    step="5"
                    value={newEstimate}
                    onChange={(event) => setNewEstimate(event.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  void handleCreateAndAttach();
                }}
                disabled={busy}
              >
                {busy ? "처리 중…" : "생성 + 연결"}
              </button>
            </div>
          )}

          {status ? (
            <p className={`modal-status ${status.ok ? "ok" : "err"}`}>{status.text}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
