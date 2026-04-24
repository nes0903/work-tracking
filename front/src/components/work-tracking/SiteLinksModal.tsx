"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createSiteLink,
  deleteSiteLink,
  fetchSiteLinks,
  SITE_LINK_CATEGORIES,
  updateSiteLink,
  type SiteLink,
  type SiteLinkCategory,
} from "@/lib/site-links-api";

interface ModalProps {
  open: boolean;
  onClose: () => void;
}

interface WorkspaceProps {
  active: boolean;
  onClose?: () => void;
}

const DEFAULT_NEW_CATEGORY: SiteLinkCategory = "기타";

function normalizeCategory(value: string | null | undefined): SiteLinkCategory {
  if (value && (SITE_LINK_CATEGORIES as readonly string[]).includes(value)) {
    return value as SiteLinkCategory;
  }
  return "기타";
}

export function SiteLinksPanel() {
  return (
    <section className="panel site-links-panel">
      <SiteLinksWorkspace active={true} />
    </section>
  );
}

export function SiteLinksModal({ open, onClose }: ModalProps) {
  if (!open) return null;

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
        <SiteLinksWorkspace active={open} onClose={onClose} />
      </div>
    </div>
  );
}

function SiteLinksWorkspace({ active, onClose }: WorkspaceProps) {
  const [links, setLinks] = useState<SiteLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [query, setQuery] = useState("");

  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newCategory, setNewCategory] =
    useState<SiteLinkCategory>(DEFAULT_NEW_CATEGORY);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editCategory, setEditCategory] =
    useState<SiteLinkCategory>(DEFAULT_NEW_CATEGORY);

  useEffect(() => {
    if (!active) return;
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
  }, [active]);

  useEffect(() => {
    if (active) return;
    setEditMode(false);
    setQuery("");
    setNewLabel("");
    setNewUrl("");
    setNewCategory(DEFAULT_NEW_CATEGORY);
    setEditingId(null);
  }, [active]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return links;
    return links.filter((link) => {
      return (
        link.label.toLowerCase().includes(q) ||
        link.url.toLowerCase().includes(q) ||
        (link.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [links, query]);

  const grouped = useMemo(() => {
    const map = new Map<SiteLinkCategory, SiteLink[]>();
    for (const cat of SITE_LINK_CATEGORIES) {
      map.set(cat, []);
    }
    for (const link of filtered) {
      const cat = normalizeCategory(link.category);
      map.get(cat)!.push(link);
    }
    return map;
  }, [filtered]);

  async function handleCreate() {
    const label = newLabel.trim();
    const url = newUrl.trim();
    if (!label || !url) return;
    setSubmitting(true);
    const created = await createSiteLink({
      label,
      url,
      category: newCategory,
    });
    setSubmitting(false);
    if (created) {
      setLinks((prev) => [...prev, created]);
      setNewLabel("");
      setNewUrl("");
      setNewCategory(DEFAULT_NEW_CATEGORY);
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
    setEditCategory(normalizeCategory(link.category));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
    setEditUrl("");
    setEditCategory(DEFAULT_NEW_CATEGORY);
  }

  async function saveEdit() {
    if (editingId === null) return;
    const label = editLabel.trim();
    const url = editUrl.trim();
    if (!label || !url) return;
    const updated = await updateSiteLink(editingId, {
      label,
      url,
      category: editCategory,
    });
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

  const totalFiltered = filtered.length;

  return (
    <>
      <header className="site-links-head">
        <h3>링크 저장소</h3>
        <div className="site-links-head-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? "완료" : "편집"}
          </button>
          {onClose ? (
            <button
              type="button"
              className="modal-close"
              aria-label="닫기"
              onClick={onClose}
            >
              ×
            </button>
          ) : null}
        </div>
      </header>

      <div className="site-links-search">
        <input
          type="text"
          placeholder="이름·URL·카테고리 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button
            type="button"
            className="text-button site-links-search-clear"
            onClick={() => setQuery("")}
          >
            초기화
          </button>
        ) : null}
      </div>

      <div className="site-links-body">
        {loading ? (
          <p className="empty-note">불러오는 중...</p>
        ) : totalFiltered === 0 ? (
          <p className="empty-note">
            {query ? `"${query}" 검색 결과가 없습니다.` : "등록된 링크가 없습니다."}
          </p>
        ) : (
          SITE_LINK_CATEGORIES.map((cat) => {
            const items = grouped.get(cat) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={cat} className="site-links-section">
                <h4 className="site-links-section-title">
                  {cat}
                  <span className="site-links-section-count">{items.length}</span>
                </h4>
                <ul className="site-links-list">
                  {items.map((link) => {
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
                            <select
                              value={editCategory}
                              onChange={(event) =>
                                setEditCategory(event.target.value as SiteLinkCategory)
                              }
                            >
                              {SITE_LINK_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
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
              </section>
            );
          })
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
            <select
              value={newCategory}
              onChange={(event) =>
                setNewCategory(event.target.value as SiteLinkCategory)
              }
              disabled={submitting}
            >
              {SITE_LINK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
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
    </>
  );
}
