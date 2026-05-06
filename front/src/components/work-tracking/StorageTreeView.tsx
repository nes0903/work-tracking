"use client";

import { useMemo, useState } from "react";
import { formatFileSize } from "@/lib/line-works-archive";
import {
  buildStorageTree,
  type ChannelLabel,
  type ChannelLabelMap,
  type StorageItem,
  type StorageTreeFolder,
} from "@/lib/storage";

interface Props {
  items: StorageItem[];
  channelLabels?: ChannelLabelMap;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
}

function channelDisplay(
  channelId: string | null | undefined,
  channelLabels: ChannelLabelMap,
): string {
  if (!channelId) return "";
  const info = channelLabels[channelId];
  if (info?.title) {
    return info.channelType === "SINGLE_USER" ? `DM · ${info.title}` : info.title;
  }
  return channelId;
}

function channelIdFromKey(s3Key: string): string | null {
  // line-works/<channelId>/<date>/<fileId>-<fileName>
  const parts = s3Key.split("/");
  return parts[1] ?? null;
}

/**
 * 한국어 파일명 검색을 위해 NFC 정규화 + 소문자화.
 * macOS 업로드 파일명은 NFD 로 저장되는 경우가 있어 검색어(NFC)와 매칭 실패할 수 있음.
 */
function normalize(s: string): string {
  return s.normalize("NFC").toLowerCase();
}

export function StorageTreeView({
  items,
  channelLabels = {},
  onOpen,
  onDelete,
}: Props) {
  const [query, setQuery] = useState("");
  const rawQ = query.trim();
  const q = normalize(rawQ);
  const qNoDot = q.startsWith(".") ? q.slice(1) : q;
  const searchMode = q.length > 0;

  // 전체 트리는 항상 유지 — 검색 시에도 A/B/C 폴더는 모두 보여야 함
  const tree = useMemo(() => buildStorageTree(items), [items]);

  const { matchedIds, expandedPaths, matchCount } = useMemo(() => {
    if (!searchMode) {
      return {
        matchedIds: new Set<number>(),
        expandedPaths: new Set<string>(),
        matchCount: 0,
      };
    }
    const ids = new Set<number>();
    const paths = new Set<string>();
    for (const file of items) {
      const name = normalize(file.fileName ?? "");
      const dotIdx = name.lastIndexOf(".");
      const ext = dotIdx >= 0 ? name.slice(dotIdx + 1) : "";

      const matchesName = name.includes(q);
      const matchesExt = qNoDot.length > 0 && ext.length > 0 && ext.includes(qNoDot);
      if (!matchesName && !matchesExt) continue;

      ids.add(file.id);
      const parts = file.s3Key.split("/").filter(Boolean);
      parts.pop();
      let accumulated = "";
      for (const segment of parts) {
        accumulated = accumulated ? `${accumulated}/${segment}` : segment;
        paths.add(accumulated);
      }
    }
    return { matchedIds: ids, expandedPaths: paths, matchCount: ids.size };
  }, [items, q, qNoDot, searchMode]);

  return (
    <div className="storage-view">
      <div className="storage-search">
        <input
          type="text"
          placeholder="파일명 또는 확장자(예: pdf, .xlsx, 계약서)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button
            type="button"
            className="text-button"
            onClick={() => setQuery("")}
          >
            초기화
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="empty-note">저장된 파일이 없습니다.</p>
      ) : (
        <>
          {searchMode ? (
            <p className="field-label storage-search-count">
              {matchCount > 0
                ? `"${rawQ}" 매칭 ${matchCount}건 — 해당 폴더 자동 펼침`
                : `"${rawQ}" 검색 결과가 없습니다.`}
            </p>
          ) : null}
          <div
            className="storage-tree"
            // 쿼리가 바뀔 때마다 트리 재마운트 → defaultOpen(=expandedPaths 포함 여부) 반영
            key={searchMode ? `search:${q}` : "tree"}
          >
            <FolderNode
              folder={tree}
              depth={0}
              parentSegment=""
              channelLabels={channelLabels}
              onOpen={onOpen}
              onDelete={onDelete}
              defaultOpen
              expandedPaths={expandedPaths}
              matchedIds={matchedIds}
            />
          </div>
        </>
      )}
    </div>
  );
}

function FolderNode({
  folder,
  depth,
  parentSegment,
  channelLabels,
  onOpen,
  onDelete,
  defaultOpen = false,
  expandedPaths,
  matchedIds,
}: {
  folder: StorageTreeFolder;
  depth: number;
  parentSegment: string;
  channelLabels: ChannelLabelMap;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  defaultOpen?: boolean;
  expandedPaths: Set<string>;
  matchedIds: Set<number>;
}) {
  // defaultOpen 은 루트 OR 매칭 경로에 포함된 폴더일 때 true.
  // 사용자가 수동으로 토글 가능. (쿼리 변경 시 부모가 key 로 재마운트하여 다시 초기화)
  const initialOpen = defaultOpen || expandedPaths.has(folder.fullPath);
  const [open, setOpen] = useState(initialOpen);
  const isOpen = open;
  const isRoot = folder.segment === "";
  const childFolders = Array.from(folder.folders.values());

  // 채널 ID 세그먼트(= line-works 바로 아래 폴더)면 이름으로 치환
  const isChannelSegment = parentSegment === "line-works";
  const channelInfo: ChannelLabel | undefined = isChannelSegment
    ? channelLabels[folder.segment]
    : undefined;
  const label = (() => {
    if (folder.segment === "") return "/ (root)";
    if (channelInfo?.title) {
      return channelInfo.channelType === "SINGLE_USER"
        ? `DM · ${channelInfo.title}`
        : channelInfo.title;
    }
    return folder.segment;
  })();

  const totalCount =
    folder.files.length +
    childFolders.reduce<number>((sum, sub) => sum + countFiles(sub), 0);

  return (
    <div className="storage-folder" style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      {!isRoot ? (
        <button
          type="button"
          className="storage-folder-head"
          onClick={() => setOpen((prev) => !prev)}
          title={folder.fullPath}
          aria-expanded={isOpen}
        >
          <span className="storage-caret">{isOpen ? "▾" : "▸"}</span>
          <span className="storage-folder-name">📁 {label}</span>
          <span className="storage-folder-count">{totalCount}</span>
        </button>
      ) : null}
      {isOpen ? (
        <div className="storage-folder-body">
          {childFolders.map((child) => (
            <FolderNode
              key={child.fullPath}
              folder={child}
              depth={depth + 1}
              parentSegment={folder.segment}
              channelLabels={channelLabels}
              onOpen={onOpen}
              onDelete={onDelete}
              expandedPaths={expandedPaths}
              matchedIds={matchedIds}
            />
          ))}
          {folder.files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              onOpen={onOpen}
              onDelete={onDelete}
              highlight={matchedIds.has(file.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FileRow({
  file,
  onOpen,
  onDelete,
  highlight = false,
}: {
  file: StorageItem;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  highlight?: boolean;
}) {
  return (
    <div className={`storage-file ${highlight ? "matched" : ""}`.trim()}>
      <button
        type="button"
        className="storage-file-main"
        onClick={() => onOpen(file.id)}
        title={file.s3Key}
      >
        <span className="storage-file-icon">📄</span>
        <span className="storage-file-name">{file.fileName ?? "파일"}</span>
        <span className="storage-file-meta">
          {[file.mimeType, formatFileSize(file.fileSize)].filter(Boolean).join(" · ")}
        </span>
      </button>
      <button
        type="button"
        className="storage-file-delete"
        onClick={() => onDelete(file.id)}
        aria-label="삭제"
        title="삭제"
      >
        ×
      </button>
    </div>
  );
}

function countFiles(folder: StorageTreeFolder): number {
  let count = folder.files.length;
  for (const child of folder.folders.values()) {
    count += countFiles(child);
  }
  return count;
}
