"use client";

import { buildOfficePreviewUrl } from "@/lib/file-preview";

interface Props {
  fileName: string | null;
  sourceUrl: string;
  onClose: () => void;
}

export function FilePreviewModal({ fileName, sourceUrl, onClose }: Props) {
  const previewUrl = buildOfficePreviewUrl(sourceUrl);

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
      <div className="preview-modal">
        <header className="preview-modal-head">
          <div className="preview-modal-meta">
            <p className="field-label">미리보기</p>
            <h3 className="preview-modal-title" title={fileName ?? undefined}>
              {fileName ?? "파일"}
            </h3>
          </div>
          <div className="preview-modal-actions">
            <a
              className="primary-button"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              download={fileName ?? undefined}
            >
              다운로드
            </a>
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
        <div className="preview-modal-body">
          <iframe
            src={previewUrl}
            title={fileName ?? "file preview"}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        </div>
        <footer className="preview-modal-foot">
          Microsoft Office Online 뷰어로 렌더링됩니다. 복잡한 레이아웃은 다르게 보일 수 있습니다.
        </footer>
      </div>
    </div>
  );
}
