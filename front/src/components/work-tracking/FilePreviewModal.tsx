"use client";

import {
  buildOfficePreviewUrl,
  detectFileKind,
} from "@/lib/file-preview";

interface Props {
  fileName: string | null;
  sourceUrl: string;
  /** 다운로드 전용 presigned URL (Content-Disposition: attachment). 없으면 sourceUrl 재사용. */
  downloadUrl?: string | null;
  mimeType?: string | null;
  onClose: () => void;
}

export function FilePreviewModal({
  fileName,
  sourceUrl,
  downloadUrl,
  mimeType,
  onClose,
}: Props) {
  const kind = detectFileKind(fileName, mimeType);
  const dlUrl = downloadUrl ?? sourceUrl;

  let body: React.ReactNode;
  let footerNote: string | null = null;

  switch (kind) {
    case "office": {
      body = (
        <iframe
          src={buildOfficePreviewUrl(sourceUrl)}
          title={fileName ?? "file preview"}
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      );
      footerNote =
        "Microsoft Office Online 뷰어로 렌더링됩니다. 복잡한 레이아웃은 다르게 보일 수 있습니다.";
      break;
    }
    case "pdf": {
      body = (
        <iframe
          src={sourceUrl}
          title={fileName ?? "PDF preview"}
          className="preview-pdf"
        />
      );
      break;
    }
    case "image": {
      body = (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sourceUrl}
          alt={fileName ?? "image"}
          className="preview-image"
        />
      );
      break;
    }
    case "video": {
      body = (
        <video
          src={sourceUrl}
          controls
          className="preview-video"
          preload="metadata"
        />
      );
      break;
    }
    case "audio": {
      body = (
        <div className="preview-audio-wrap">
          <audio src={sourceUrl} controls className="preview-audio" />
        </div>
      );
      break;
    }
    case "text": {
      // 텍스트는 iframe 으로 동일 출처가 아닐 수 있으니 단순히 새 탭 안내 + iframe 시도
      body = (
        <iframe
          src={sourceUrl}
          title={fileName ?? "text preview"}
          className="preview-text"
        />
      );
      break;
    }
    default: {
      body = (
        <div className="preview-unsupported">
          <p className="preview-unsupported-title">
            이 형식은 미리보기가 제공되지 않습니다.
          </p>
          <p className="preview-unsupported-meta">
            파일을 다운로드하거나 새 탭에서 열어 확인해주세요.
          </p>
          <div className="preview-unsupported-actions">
            <a
              className="primary-button"
              href={dlUrl}
              target="_blank"
              rel="noreferrer"
              download={fileName ?? undefined}
            >
              다운로드
            </a>
            <a
              className="secondary-button"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              새 탭에서 열기
            </a>
          </div>
        </div>
      );
    }
  }

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
      <div className={`preview-modal preview-kind-${kind}`}>
        <header className="preview-modal-head">
          <div className="preview-modal-meta">
            <p className="field-label">미리보기</p>
            <h3 className="preview-modal-title" title={fileName ?? undefined}>
              {fileName ?? "파일"}
            </h3>
            {mimeType ? (
              <p className="preview-modal-mime">{mimeType}</p>
            ) : null}
          </div>
          <div className="preview-modal-actions">
            <a
              className="primary-button"
              href={dlUrl}
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
        <div className="preview-modal-body">{body}</div>
        {footerNote ? (
          <footer className="preview-modal-foot">{footerNote}</footer>
        ) : null}
      </div>
    </div>
  );
}
