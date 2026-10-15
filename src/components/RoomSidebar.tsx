import { useEffect, useRef, useState } from 'react';
import {
  IconCheck,
  IconClock,
  IconMessageCircle,
  IconSend,
  IconUsers,
  IconX,
  IconMicrophone,
} from '@tabler/icons-react';
import type { RoomView } from '../../shared/protocol';

interface Props {
  room: RoomView;
  connected: boolean;
  host: boolean;
  mic: boolean;
  voices: Record<string, boolean>;
  tab: 'chat' | 'members';
  onTab: (tab: 'chat' | 'members') => void;
  onClose: () => void;
  send: (text?: string) => Promise<void>;
  manage: (action: 'approve' | 'deny' | 'kick', id: string) => Promise<unknown>;
  pause: () => Promise<unknown>;
  run: (p: Promise<unknown>) => void;
}
export function RoomSidebar(p: Props) {
  const [text, setText] = useState(''),
    [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({
      block: 'nearest',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }, [p.room.chat.length, p.tab]);
  return (
    <aside className="room-sidebar" aria-label="聊天与成员">
      <div className="sidebar-tabs">
        <button className={p.tab === 'chat' ? 'selected' : ''} onClick={() => p.onTab('chat')}>
          <IconMessageCircle size={17} /> 聊天
        </button>
        <button
          className={p.tab === 'members' ? 'selected' : ''}
          onClick={() => p.onTab('members')}
        >
          <IconUsers size={17} /> 座位{' '}
          <span>
            {p.room.members.length}
            {p.room.pending.length ? ` +${p.room.pending.length}` : ''}
          </span>
        </button>
        <button
          className="icon-button sidebar-close"
          aria-label="关闭聊天与成员"
          onClick={p.onClose}
        >
          <IconX size={18} />
        </button>
      </div>
      {p.tab === 'chat' ? (
        <>
          <div className="chat-scroll">
            {!p.room.chat.length && (
              <div className="chat-empty">
                <IconMessageCircle size={24} stroke={1.25} />
                <strong>还没有消息</strong>
                <p>
                  在这里和朋友聊聊。
                  <br />
                  消息仅在本次房间中保留。
                </p>
              </div>
            )}
            {p.room.chat.map((m) => (
              <div
                className={`chat-message ${m.memberId === p.room.selfId ? 'mine' : ''}`}
                key={m.id}
              >
                <span className="chat-avatar">{m.nickname.slice(0, 1)}</span>
                <div className="message-body">
                  <div>
                    <strong>{m.nickname}</strong>
                    <time>
                      {new Date(m.at).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <p>{m.text}</p>
                  {p.host && m.type === 'pause-request' && (
                    <button
                      className="text-button"
                      disabled={!p.connected}
                      onClick={() => p.run(p.pause())}
                    >
                      暂停，等一等
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              const value = text.trim();
              if (!value || sending) return;
              setSending(true);
              p.run(
                p
                  .send(value)
                  .then(() => setText(''))
                  .finally(() => setSending(false)),
              );
            }}
          >
            <input
              aria-label="聊天消息"
              placeholder={p.connected ? '说点什么吧…' : '等待房间连接恢复…'}
              value={text}
              maxLength={1000}
              onChange={(e) => setText(e.currentTarget.value)}
              disabled={!p.connected}
            />
            <button
              className="icon-button"
              aria-label="发送消息"
              disabled={!text.trim() || !p.connected || sending}
            >
              <IconSend size={20} />
            </button>
          </form>
          {!p.host && (
            <button
              className="pause-request"
              disabled={!p.connected}
              onClick={() => p.run(p.send())}
            >
              <IconClock size={15} /> 等我一下，请求暂停
            </button>
          )}
        </>
      ) : (
        <div className="members-list">
          {p.room.members.map((m) => (
            <div className="member-row" key={m.id}>
              <span className="chat-avatar">{m.nickname.slice(0, 1)}</span>
              <div>
                <strong>
                  {m.nickname}
                  {m.id === p.room.selfId ? '（你）' : ''}
                </strong>
                <small>
                  <i className={`status-dot ${m.online ? 'online' : ''}`} />
                  {m.id === p.room.hostId ? '放映者' : m.online ? '在线' : '暂时离开'}
                </small>
              </div>
              {(m.id === p.room.selfId ? p.mic : p.voices[m.id]) && (
                <IconMicrophone size={16} aria-label="麦克风开启" />
              )}
              {p.host && m.id !== p.room.selfId && (
                <button
                  className="icon-button danger"
                  disabled={!p.connected}
                  aria-label={`移除 ${m.nickname}`}
                  onClick={() => p.run(p.manage('kick', m.id))}
                >
                  <IconX size={17} />
                </button>
              )}
            </div>
          ))}
          {p.host && p.room.pending.length > 0 && (
            <>
              <h3>等待批准</h3>
              {p.room.pending.map((m) => (
                <div className="member-row pending" key={m.id}>
                  <span className="chat-avatar">{m.nickname.slice(0, 1)}</span>
                  <div>
                    <strong>{m.nickname}</strong>
                    <small>申请加入房间</small>
                  </div>
                  <button
                    className="icon-button"
                    disabled={!p.connected}
                    aria-label={`批准 ${m.nickname}`}
                    onClick={() => p.run(p.manage('approve', m.id))}
                  >
                    <IconCheck size={18} />
                  </button>
                  <button
                    className="icon-button danger"
                    disabled={!p.connected}
                    aria-label={`拒绝 ${m.nickname}`}
                    onClick={() => p.run(p.manage('deny', m.id))}
                  >
                    <IconX size={18} />
                  </button>
                </div>
              ))}
            </>
          )}
          <p className="muted">最多 8 人。只有通过批准的成员可以观看和聊天。</p>
        </div>
      )}
    </aside>
  );
}
