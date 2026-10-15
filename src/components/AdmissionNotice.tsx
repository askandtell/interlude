import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconUserPlus } from '@tabler/icons-react';
import type { MemberView } from '../../shared/protocol';

export function AdmissionNotice({
  pending,
  reviewing,
  connected,
  onReview,
}: {
  pending: MemberView[];
  reviewing: boolean;
  connected: boolean;
  onReview: () => void;
}) {
  const [fullscreen, setFullscreen] = useState<Element | null>(document.fullscreenElement);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  if (!pending.length || (reviewing && !fullscreen)) return null;
  const first = pending[0];
  return createPortal(
    <div className="admission-notice" role="status" aria-live="polite" aria-atomic="true">
      <IconUserPlus size={20} aria-hidden="true" />
      <div>
        <strong>
          {first.nickname}
          {pending.length > 1 ? ` 等 ${pending.length} 人申请加入` : '申请加入房间'}
        </strong>
        <span>{connected ? '批准后，朋友才能观看和聊天。' : '连接恢复后可处理申请。'}</span>
      </div>
      <button
        className="secondary-button"
        onClick={async () => {
          if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
          onReview();
        }}
      >
        查看申请
      </button>
    </div>,
    fullscreen || document.body,
  );
}
