export interface StorageItem {
  id: number;
  messageId: string;
  fileId: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  s3Bucket: string;
  s3Key: string;
  uploadedAt: string | null;
}

export async function fetchStorageItems(): Promise<StorageItem[]> {
  try {
    const response = await fetch("/api/storage/files", { cache: "no-store" });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      ok: boolean;
      items?: StorageItem[];
    };
    return payload.ok && Array.isArray(payload.items) ? payload.items : [];
  } catch {
    return [];
  }
}

export async function deleteStorageItem(id: number): Promise<boolean> {
  try {
    const response = await fetch(`/api/storage/files/${id}`, { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}

export interface StorageTreeFolder {
  segment: string;
  fullPath: string;
  folders: Map<string, StorageTreeFolder>;
  files: StorageItem[];
}

export function buildStorageTree(items: StorageItem[]): StorageTreeFolder {
  const root: StorageTreeFolder = {
    segment: "",
    fullPath: "",
    folders: new Map(),
    files: [],
  };

  for (const item of items) {
    const parts = item.s3Key.split("/").filter(Boolean);
    if (parts.length === 0) {
      root.files.push(item);
      continue;
    }
    // last segment is the file name
    const fileName = parts.pop()!;
    let cursor = root;
    let accumulated = "";
    for (const segment of parts) {
      accumulated = accumulated ? `${accumulated}/${segment}` : segment;
      let next = cursor.folders.get(segment);
      if (!next) {
        next = { segment, fullPath: accumulated, folders: new Map(), files: [] };
        cursor.folders.set(segment, next);
      }
      cursor = next;
    }
    // preserve actual filename on item
    cursor.files.push({ ...item, fileName: item.fileName ?? fileName });
  }

  return root;
}
