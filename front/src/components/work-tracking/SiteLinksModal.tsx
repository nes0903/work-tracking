"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createSiteLinkCategory,
  createSiteLink,
  deleteSiteLink,
  fetchSiteLinkCategories,
  fetchSiteLinks,
  renameSiteLinkCategory,
  saveSiteLinkOrganization,
  updateSiteLink,
  type SiteLink,
} from "@/lib/site-links-api";
import { toExternalHref } from "@/lib/url-utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
}

interface WorkspaceProps {
  active: boolean;
  onClose?: () => void;
}

const DEFAULT_NEW_CATEGORY = "기타";
const MOVE_TARGET_NONE = "";

type MovePlacement = "top" | "bottom";

interface MoveTarget {
  category: string;
  placement: MovePlacement;
}

function normalizeCategory(value: string | null | undefined): string {
  return value?.trim() || DEFAULT_NEW_CATEGORY;
}

function mergeCategories(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      const category = normalizeCategory(item);
      if (seen.has(category)) continue;
      seen.add(category);
      result.push(category);
    }
  }
  if (!seen.has(DEFAULT_NEW_CATEGORY)) result.push(DEFAULT_NEW_CATEGORY);
  return result;
}

function moveLinkToCategory(
  list: SiteLink[],
  linkId: number,
  category: string,
  beforeId?: number,
): SiteLink[] {
  const currentIndex = list.findIndex((link) => link.id === linkId);
  if (currentIndex < 0) return list;

  const moved = { ...list[currentIndex], category };
  const withoutMoved = list.filter((link) => link.id !== linkId);
  let insertIndex = withoutMoved.length;

  if (beforeId !== undefined && beforeId !== linkId) {
    const beforeIndex = withoutMoved.findIndex((link) => link.id === beforeId);
    if (beforeIndex >= 0) {
      insertIndex = beforeIndex;
    }
  } else {
    for (let i = 0; i < withoutMoved.length; i += 1) {
      if (normalizeCategory(withoutMoved[i].category) === category) {
        insertIndex = i + 1;
      }
    }
  }

  const next = [...withoutMoved];
  next.splice(insertIndex, 0, moved);
  return next;
}

function encodeMoveTarget(category: string, placement: MovePlacement): string {
  return `${placement}:${category}`;
}

function parseMoveTarget(value: string): MoveTarget | null {
  const [placement, ...categoryParts] = value.split(":");
  const category = normalizeCategory(categoryParts.join(":"));
  if ((placement !== "top" && placement !== "bottom") || !category) {
    return null;
  }
  return { category, placement };
}

function moveLinkToPlacement(
  list: SiteLink[],
  linkId: number,
  category: string,
  placement: MovePlacement,
): SiteLink[] {
  const beforeId =
    placement === "top"
      ? list.find(
          (link) =>
            link.id !== linkId && normalizeCategory(link.category) === category,
        )?.id
      : undefined;
  return moveLinkToCategory(list, linkId, category, beforeId);
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
  const [categories, setCategories] = useState<string[]>([DEFAULT_NEW_CATEGORY]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [draggingLinkId, setDraggingLinkId] = useState<number | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const [organizationDirty, setOrganizationDirty] = useState(false);
  const [organizationSaving, setOrganizationSaving] = useState(false);

  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newCategory, setNewCategory] = useState(DEFAULT_NEW_CATEGORY);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editCategory, setEditCategory] = useState(DEFAULT_NEW_CATEGORY);
  const [editMoveTarget, setEditMoveTarget] = useState(MOVE_TARGET_NONE);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    setLoading(true);
    void Promise.all([fetchSiteLinks(), fetchSiteLinkCategories()])
      .then(([items, fetchedCategories]) => {
        if (!mounted) return;
        setLinks(items);
        setCategories(
          mergeCategories(
            fetchedCategories,
            items.map((item) => item.category ?? ""),
          ),
        );
        setOrganizationDirty(false);
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
    setCategoryDraft("");
    setEditingId(null);
    setDraggingLinkId(null);
    setDragOverCategory(null);
    setOrganizationDirty(false);
    setEditMoveTarget(MOVE_TARGET_NONE);
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
    const map = new Map<string, SiteLink[]>();
    for (const cat of categories) {
      map.set(cat, []);
    }
    for (const link of filtered) {
      const cat = normalizeCategory(link.category);
      const list = map.get(cat) ?? [];
      list.push(link);
      map.set(cat, list);
    }
    return map;
  }, [categories, filtered]);

  const visibleCategories = useMemo(() => {
    const hasQuery = query.trim().length > 0;
    return categories.filter((cat) => {
      const count = grouped.get(cat)?.length ?? 0;
      if (count > 0) return true;
      return editMode && !hasQuery;
    });
  }, [categories, editMode, grouped, query]);

  async function handleCreate() {
    const label = newLabel.trim();
    const url = newUrl.trim();
    if (!label || !url) return;
    setSubmitting(true);
    const category = normalizeCategory(newCategory);
    const created = await createSiteLink({
      label,
      url,
      category,
    });
    setSubmitting(false);
    if (created) {
      setLinks((prev) => [...prev, created]);
      setCategories((prev) => mergeCategories(prev, [category]));
      setNewLabel("");
      setNewUrl("");
      setNewCategory(category);
    } else {
      window.alert("추가 실패. URL과 이름을 확인하세요.");
    }
  }

  async function reloadLinksFromServer() {
    setLoading(true);
    try {
      const [items, fetchedCategories] = await Promise.all([
        fetchSiteLinks(),
        fetchSiteLinkCategories(),
      ]);
      setLinks(items);
      setCategories(
        mergeCategories(
          fetchedCategories,
          items.map((item) => item.category ?? ""),
        ),
      );
      setOrganizationDirty(false);
      setDraggingLinkId(null);
      setDragOverCategory(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveOrganization() {
    if (!organizationDirty || organizationSaving) return;
    setOrganizationSaving(true);
    const saved = await saveSiteLinkOrganization(
      links.map((link, index) => ({
        id: link.id,
        category: normalizeCategory(link.category),
        sortOrder: index,
      })),
    );
    setOrganizationSaving(false);
    if (!saved) {
      window.alert("링크 정리 저장에 실패했습니다.");
      return;
    }
    setLinks(saved);
    setCategories((prev) =>
      mergeCategories(
        prev,
        saved.map((item) => item.category ?? ""),
      ),
    );
    setOrganizationDirty(false);
  }

  async function handleCreateCategory() {
    const category = normalizeCategory(categoryDraft);
    if (!categoryDraft.trim()) return;
    const next = await createSiteLinkCategory(category);
    setCategories((prev) => mergeCategories(next, prev, [category]));
    setNewCategory(category);
    setCategoryDraft("");
  }

  async function handleRenameCategory(category: string) {
    const nextName = window.prompt("새 분류명을 입력하세요.", category);
    if (nextName === null) return;
    const next = normalizeCategory(nextName);
    if (!next || next === category) return;
    const nextCategories = await renameSiteLinkCategory(category, next);
    if (nextCategories.length === 0) {
      window.alert("분류명 변경에 실패했습니다.");
      return;
    }
    setCategories(mergeCategories(nextCategories));
    setLinks((prev) =>
      prev.map((link) =>
        normalizeCategory(link.category) === category
          ? { ...link, category: next }
          : link,
      ),
    );
    if (newCategory === category) setNewCategory(next);
    if (editCategory === category) setEditCategory(next);
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
    setEditMoveTarget(MOVE_TARGET_NONE);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
    setEditUrl("");
    setEditCategory(DEFAULT_NEW_CATEGORY);
    setEditMoveTarget(MOVE_TARGET_NONE);
  }

  async function saveEdit() {
    if (editingId === null) return;
    const label = editLabel.trim();
    const url = editUrl.trim();
    if (!label || !url) return;
    const moveTarget = parseMoveTarget(editMoveTarget);
    const category = moveTarget?.category ?? normalizeCategory(editCategory);
    const updated = await updateSiteLink(editingId, {
      label,
      url,
      category,
    });
    if (updated) {
      const updatedLinks = links.map((link) =>
        link.id === updated.id ? updated : link,
      );
      if (moveTarget) {
        const moved = moveLinkToPlacement(
          updatedLinks,
          updated.id,
          moveTarget.category,
          moveTarget.placement,
        );
        const saved = await saveSiteLinkOrganization(
          moved.map((link, index) => ({
            id: link.id,
            category: normalizeCategory(link.category),
            sortOrder: index,
          })),
        );
        if (saved) {
          setLinks(saved);
          setOrganizationDirty(false);
        } else {
          setLinks(moved);
          setOrganizationDirty(true);
          window.alert("위치 저장에 실패했습니다. 정리 저장을 다시 눌러주세요.");
        }
      } else {
        setLinks(updatedLinks);
      }
      setCategories((prev) =>
        mergeCategories(prev, [normalizeCategory(updated.category)]),
      );
      cancelEdit();
    } else {
      window.alert("수정 실패");
    }
  }

  function handleOpen(link: SiteLink) {
    window.open(toExternalHref(link.url), "_blank", "noopener");
  }

  function handleDragStart(
    event: React.DragEvent<HTMLLIElement>,
    linkId: number,
  ) {
    if (!editMode || editingId === linkId) return;
    setDraggingLinkId(linkId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(linkId));
  }

  function handleDragOverBody(event: React.DragEvent<HTMLDivElement>) {
    if (draggingLinkId === null) return;
    event.preventDefault();
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const threshold = 56;
    if (event.clientY < rect.top + threshold) {
      target.scrollTop -= 18;
    } else if (event.clientY > rect.bottom - threshold) {
      target.scrollTop += 18;
    }
  }

  function handleDragOverCategory(
    event: React.DragEvent<HTMLElement>,
    category: string,
  ) {
    if (draggingLinkId === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverCategory(category);
  }

  function handleDropOnCategory(
    event: React.DragEvent<HTMLElement>,
    category: string,
    beforeId?: number,
  ) {
    if (draggingLinkId === null) return;
    event.preventDefault();
    event.stopPropagation();
    const linkId = draggingLinkId;
    if (beforeId === linkId) {
      setDraggingLinkId(null);
      setDragOverCategory(null);
      return;
    }
    setLinks((prev) => moveLinkToCategory(prev, linkId, category, beforeId));
    setOrganizationDirty(true);
    setDraggingLinkId(null);
    setDragOverCategory(null);
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
            onClick={() => {
              if (editMode && organizationDirty) {
                const ok = window.confirm(
                  "저장하지 않은 링크 정리 변경을 버릴까요?",
                );
                if (!ok) return;
                void reloadLinksFromServer();
              }
              setEditMode((v) => !v);
            }}
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

      <datalist id="site-link-category-options">
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      <div className="site-links-body" onDragOver={handleDragOverBody}>
        {editMode ? (
          <div className="site-links-category-tools">
            <input
              type="text"
              value={categoryDraft}
              onChange={(event) => setCategoryDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCreateCategory();
                }
              }}
              placeholder="새 분류명"
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleCreateCategory()}
              disabled={!categoryDraft.trim()}
            >
              분류 추가
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleSaveOrganization()}
              disabled={!organizationDirty || organizationSaving}
            >
              {organizationSaving ? "저장 중..." : "정리 저장"}
            </button>
            {organizationDirty ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void reloadLinksFromServer()}
                disabled={loading || organizationSaving}
              >
                되돌리기
              </button>
            ) : null}
          </div>
        ) : null}
        {loading ? (
          <p className="empty-note">불러오는 중...</p>
        ) : totalFiltered === 0 ? (
          <p className="empty-note">
            {query ? `"${query}" 검색 결과가 없습니다.` : "등록된 링크가 없습니다."}
          </p>
        ) : (
          visibleCategories.map((cat) => {
            const items = grouped.get(cat) ?? [];
            return (
              <section
                key={cat}
                className={`site-links-section ${dragOverCategory === cat ? "drag-over" : ""}`.trim()}
                onDragOver={(event) => handleDragOverCategory(event, cat)}
                onDragLeave={() => setDragOverCategory(null)}
                onDrop={(event) => handleDropOnCategory(event, cat)}
              >
                <h4 className="site-links-section-title">
                  <span>{cat}</span>
                  <span className="site-links-section-count">{items.length}</span>
                  {editMode ? (
                    <button
                      type="button"
                      className="text-button site-links-category-rename"
                      onClick={() => void handleRenameCategory(cat)}
                    >
                      이름 변경
                    </button>
                  ) : null}
                </h4>
                <ul className="site-links-list">
                  {items.map((link) => {
                    const isEditing = editingId === link.id;
                    return (
                      <li
                        key={link.id}
                        className={`site-links-item ${draggingLinkId === link.id ? "dragging" : ""}`.trim()}
                        draggable={editMode && !isEditing}
                        onDragStart={(event) =>
                          handleDragStart(event, link.id)
                        }
                        onDragEnd={() => {
                          setDraggingLinkId(null);
                          setDragOverCategory(null);
                        }}
                        onDragOver={(event) =>
                          handleDragOverCategory(event, cat)
                        }
                        onDrop={(event) =>
                          handleDropOnCategory(event, cat, link.id)
                        }
                      >
                        {editMode && isEditing ? (
                          <div className="site-links-edit">
                            <input
                              type="text"
                              value={editLabel}
                              onChange={(event) => setEditLabel(event.target.value)}
                              placeholder="이름"
                            />
                            <input
                              type="text"
                              value={editUrl}
                              onChange={(event) => setEditUrl(event.target.value)}
                              placeholder="https:// 또는 example.com"
                            />
                            <input
                              type="text"
                              list="site-link-category-options"
                              value={editCategory}
                              onChange={(event) =>
                                setEditCategory(event.target.value)
                              }
                              placeholder="분류"
                            />
                            <select
                              value={editMoveTarget}
                              onChange={(event) => {
                                const value = event.target.value;
                                setEditMoveTarget(value);
                                const target = parseMoveTarget(value);
                                if (target) setEditCategory(target.category);
                              }}
                            >
                              <option value={MOVE_TARGET_NONE}>위치 유지</option>
                              {categories.flatMap((category) => [
                                <option
                                  key={`${category}:top`}
                                  value={encodeMoveTarget(category, "top")}
                                >
                                  {category} 맨 위
                                </option>,
                                <option
                                  key={`${category}:bottom`}
                                  value={encodeMoveTarget(category, "bottom")}
                                >
                                  {category} 맨 아래
                                </option>,
                              ])}
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
                            {editMode ? (
                              <span
                                className="site-links-drag-grip"
                                aria-hidden="true"
                              >
                                ::
                              </span>
                            ) : null}
                            {editMode ? (
                              <div
                                className="site-links-open site-links-open-static"
                                title={link.url}
                              >
                                <span className="site-links-label">
                                  {link.label}
                                </span>
                                <span className="site-links-url">{link.url}</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="site-links-open"
                                onClick={() => handleOpen(link)}
                                title={link.url}
                              >
                                <span className="site-links-label">
                                  {link.label}
                                </span>
                                <span className="site-links-url">{link.url}</span>
                              </button>
                            )}
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
              type="text"
              value={newUrl}
              onChange={(event) => setNewUrl(event.target.value)}
              placeholder="https:// 또는 example.com"
              disabled={submitting}
            />
            <input
              type="text"
              list="site-link-category-options"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="분류"
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
    </>
  );
}
