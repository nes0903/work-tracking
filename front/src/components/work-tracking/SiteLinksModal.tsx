"use client";

import { useEffect, useState } from "react";
import {
  createSiteLink,
  deleteSiteLink,
  fetchSiteLinks,
  updateSiteLink,
  type SiteLink,
} from "@/lib/site-links-api";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SiteLinksModal({ open, onClose }: Props) {
  const [links, setLinks] = useState<SiteLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editUrl, setEditUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    void fetchSiteLinks()
      .then((items) => {
        if (mounted) setLinks(items);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEditMode(false);
      setNewLabel("");
      setNewUrl("");
      setEditingId(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleCreate() {
    const label = newLabel.trim();
    const url = newUrl.trim();
    if (!label || !url) return;
    setSubmitting(true);
    const created = await createSiteLink({ label, url });
    setSubmitting(false);
    if (created) {
      setLinks((prev) => [...prev, created]);
      setNewLabel("");
      setNewUrl("");
    } else {
      window.alert("추가 실패. URL과 이름을 확인하세요.");
    }
  }

  async function handleDelete(id: number) {
    const ok = window.confirm("이 링크를 삭제할까요?");
    if (!ok) return;
    const removed = await deleteSiteLink(id);
    if (removed) {
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } else {
      window.alert("삭제 실패");
    }
  }

  function startEdit(link: SiteLink) {
    setEditingId(link.id);
    setEditLabel(link.label);
    setEditUrl(link.url);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
    setEditUrl("");
  }

  async function saveEdit() {
    if (editingId === null) return;
    const label = editLabel.trim();
    const url = editUrl.trim();
    if (!label || !url) return;
    const updated = await updateSiteLink(editingId, { label, url });
    if (updated) {
      setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      cancelEdit();
    } else {
      window.alert("수정 실패");
    }
  }

  function handleOpen(link: SiteLink) {
    window.open(link.url, "_blank", "noopener");
  }

  return (
    <div
      className="modal-backdrop site-links-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="site-links-modal">
        <header className="site-links-head">
          <h3>사이트 링크</h3>
          <div className="site-links-head-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? "완료" : "편집"}
            </button>
            <button
              type="button"
              className="modal-close"
              aria-label="닫기"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>

        <div className="site-links-body">
          {loading ? (
            <p className="empty-note">불러오는 중...</p>
          ) : links.length === 0 ? (
            <p className="empty-note">등록된 링크가 없습니다.</p>
          ) : (
            <ul className="site-links-list">
              {links.map((link) => {
                const isEditing = editingId === link.id;
                return (
                  <li key={link.id} className="site-links-item">
                    {editMode && isEditing ? (
                      <div className="site-links-edit">
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(event) => setEditLabel(event.target.value)}
                          placeholder="이름"
                        />
                        <input
                          type="url"
                          value={editUrl}
                          onChange={(event) => setEditUrl(event.target.value)}
                          placeholder="https://..."
                        />
                        <div className="site-links-edit-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={cancelEdit}
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => void saveEdit()}
                          >
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="site-links-open"
                          onClick={() => handleOpen(link)}
                          disabled={editMode}
                          title={link.url}
                        >
                          <span className="site-links-label">{link.label}</span>
                          <span className="site-links-url">{link.url}</span>
                        </button>
                        {editMode ? (
                          <div className="site-links-item-actions">
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => startEdit(link)}
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              className="text-button site-links-remove"
                              onClick={() => void handleDelete(link.id)}
                            >
                              삭제
                            </button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {editMode ? (
            <div className="site-links-new">
              <p className="field-label">+ 새 링크</p>
              <input
                type="text"
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                placeholder="이름 (예: 새 프로젝트)"
                disabled={submitting}
              />
              <input
                type="url"
                value={newUrl}
                onChange={(event) => setNewUrl(event.target.value)}
                placeholder="https://..."
                disabled={submitting}
              />
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleCreate()}
                disabled={submitting || !newLabel.trim() || !newUrl.trim()}
              >
                {submitting ? "추가 중..." : "추가"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
