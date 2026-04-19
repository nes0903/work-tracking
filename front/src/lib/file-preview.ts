const OFFICE_EXTENSIONS = new Set([
  "xlsx",
  "xls",
  "xlsm",
  "docx",
  "doc",
  "pptx",
  "ppt",
  "csv",
]);

const OFFICE_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "text/csv",
]);

export function isOfficeFile(
  fileName: string | null | undefined,
  mimeType?: string | null,
): boolean {
  if (mimeType && OFFICE_MIMES.has(mimeType)) return true;
  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext && OFFICE_EXTENSIONS.has(ext)) return true;
  }
  return false;
}

export function buildOfficePreviewUrl(publicSourceUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicSourceUrl)}`;
}
