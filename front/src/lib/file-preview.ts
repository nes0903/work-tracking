export type FilePreviewKind =
  | "office"
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "text"
  | "other";

const EXT_MAP: Record<string, FilePreviewKind> = {
  // Office
  xlsx: "office",
  xls: "office",
  xlsm: "office",
  docx: "office",
  doc: "office",
  pptx: "office",
  ppt: "office",
  csv: "office",
  // PDF
  pdf: "pdf",
  // Image
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  svg: "image",
  avif: "image",
  heic: "image",
  // Video
  mp4: "video",
  webm: "video",
  mov: "video",
  mkv: "video",
  m4v: "video",
  ogv: "video",
  // Audio
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  aac: "audio",
  flac: "audio",
  ogg: "audio",
  // Text
  txt: "text",
  md: "text",
  log: "text",
  json: "text",
  yaml: "text",
  yml: "text",
};

const MIME_PREFIX_MAP: Array<[string, FilePreviewKind]> = [
  ["application/pdf", "pdf"],
  ["image/", "image"],
  ["video/", "video"],
  ["audio/", "audio"],
  ["text/", "text"],
];

const OFFICE_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "text/csv",
]);

export function detectFileKind(
  fileName: string | null | undefined,
  mimeType?: string | null,
): FilePreviewKind {
  if (mimeType) {
    if (OFFICE_MIMES.has(mimeType)) return "office";
    for (const [prefix, kind] of MIME_PREFIX_MAP) {
      if (mimeType === prefix || mimeType.startsWith(prefix)) return kind;
    }
  }
  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext && EXT_MAP[ext]) return EXT_MAP[ext];
  }
  return "other";
}

/** 기존 호출부 호환 — Office 계열인지. */
export function isOfficeFile(
  fileName: string | null | undefined,
  mimeType?: string | null,
): boolean {
  return detectFileKind(fileName, mimeType) === "office";
}

/** 모달로 미리보기가 가능한 파일인지. "other" 는 다운로드 버튼만 표시. */
export function canPreviewInModal(
  fileName: string | null | undefined,
  mimeType?: string | null,
): boolean {
  const kind = detectFileKind(fileName, mimeType);
  return kind !== "other";
}

export function buildOfficePreviewUrl(publicSourceUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicSourceUrl)}`;
}
