"use client";

import { useState } from "react";
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

export function StorageTreeView({
  items,
  channelLabels = {},
  onOpen,
  onDelete,
}: Props) {
  const tree = buildStorageTree(items);

  if (items.length === 0) {
    return <p className="empty-note">저장된 파일이 없습니다.</p>;
  }

  return (
    <div className="storage-tree">
      <FolderNode
        folder={tree}
        depth={0}
        parentSegment=""
        channelLabels={channelLabels}
        onOpen={onOpen}
        onDelete={onDelete}
        defaultOpen
      />
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
}: {
  folder: StorageTreeFolder;
  depth: number;
  parentSegment: string;
  channelLabels: ChannelLabelMap;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
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
    if (isChannelSegment && folder.segment.startsWith("dm_")) {
      return `DM · ${folder.segment.slice(3, 10)}…`;
    }
    if (isChannelSegment && folder.segment.length > 14) {
      return `${folder.segment.slice(0, 6)}…${folder.segment.slice(-4)}`;
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
        >
          <span className="storage-caret">{open ? "▾" : "▸"}</span>
          <span className="storage-folder-name">📁 {label}</span>
          <span className="storage-folder-count">{totalCount}</span>
        </button>
      ) : null}
      {open ? (
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
            />
          ))}
          {folder.files.map((file) => (
            <FileRow key={file.id} file={file} onOpen={onOpen} onDelete={onDelete} />
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
}: {
  file: StorageItem;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="storage-file">
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
