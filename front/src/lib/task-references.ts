export type ReferenceSource =
  | "line_works_message"
  | "line_works_attachment"
  | "notion_page"
  | "figma_node"
  | "url";

export interface TaskReference {
  id: number;
  taskId: string;
  source: ReferenceSource;
  externalId: string;
  title: string | null;
  excerpt: string | null;
  externalUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  createdBy: string | null;
}

export interface CreateReferenceInput {
  taskId: string;
  source: ReferenceSource;
  externalId: string;
  title?: string | null;
  excerpt?: string | null;
  externalUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function attachReference(
  input: CreateReferenceInput,
): Promise<TaskReference | null> {
  if (!input.taskId || !input.externalId.trim()) {
    console.warn("[task-references] skipping attach: missing taskId or externalId", input);
    return null;
  }
  try {
    const response = await fetch("/api/task-references", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      ok: boolean;
      reference?: TaskReference;
    };
    if (!payload.ok || !payload.reference) {
      return null;
    }
    return payload.reference;
  } catch {
    return null;
  }
}

export async function detachReference(id: number): Promise<boolean> {
  try {
    const response = await fetch(`/api/task-references/${id}`, {
      method: "DELETE",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchReferencesForTasks(
  taskIds: string[],
): Promise<Record<string, TaskReference[]>> {
  if (taskIds.length === 0) {
    return {};
  }
  try {
    const response = await fetch(
      `/api/task-references?taskIds=${encodeURIComponent(taskIds.join(","))}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return {};
    }
    const payload = (await response.json()) as {
      ok: boolean;
      references?: Record<string, TaskReference[]>;
    };
    if (!payload.ok || !payload.references) {
      return {};
    }
    return payload.references;
  } catch {
    return {};
  }
}

export function sourceLabel(source: ReferenceSource): string {
  switch (source) {
    case "line_works_message":
      return "LW 메시지";
    case "line_works_attachment":
      return "LW 파일";
    case "notion_page":
      return "Notion";
    case "figma_node":
      return "Figma";
    case "url":
      return "기타 URL";
  }
}

export function sourceIcon(source: ReferenceSource): string {
  switch (source) {
    case "line_works_message":
      return "💬";
    case "line_works_attachment":
      return "📎";
    case "notion_page":
      return "📝";
    case "figma_node":
      return "🎨";
    case "url":
      return "🔗";
  }
}
