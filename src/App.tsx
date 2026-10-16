import { WebsiteRoom } from './components/WebsiteRoom';
import { useWebsiteBridge } from './hooks/useWebsiteBridge';
import { websiteSource } from '../shared/website';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Modal,
  Select,
  Slider,
  Switch,
  TextInput,
  useMantineColorScheme,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconArrowRight,
  IconCheck,
  IconChevronLeft,
  IconClock,
  IconFile,
  IconLink,
  IconLogout,
  IconPlus,
  IconSettings,
  IconShieldLock,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import type { PlaybackCommand, RoomView } from '../shared/protocol';
import { api, session } from './api';
import { AdmissionNotice } from './components/AdmissionNotice';
import { Player } from './components/Player';
import { RoomSidebar } from './components/RoomSidebar';
import { useLocalFilm } from './hooks/useLocalFilm';
import { useTogetherPlayback } from './hooks/useTogetherPlayback';
import { useRoomSession } from './hooks/useRoomSession';
import { rememberRoom, recents } from './ui';

function Logo() {
  return (
    <span className="wordmark">
      <strong>一起看</strong>
      <i />
      <span>私人放映室</span>
    </span>
  );
}
function preference(key: string, fallback: number) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : Math.max(0, Math.min(1, Number(value) || 0));
  } catch {
    return fallback;
  }
}
export default function App() {
  const [path, setPath] = useState(location.pathname),
    [ready, setReady] = useState(false),
    [failure, setFailure] = useState(''),
    [toast, setToast] = useState('');
  const [createOpen, setCreateOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [endOpen, setEndOpen] = useState(false);
  const [nickname, setNickname] = useState(''),
    [title, setTitle] = useState('今晚的放映'),
    [joinUrl, setJoinUrl] = useState(''),
    [busy, setBusy] = useState(false);
  const [side, setSide] = useState<'chat' | 'members'>('chat'),
    [sidebar, setSidebar] = useState(true),
    [mobileSidebar, setMobileSidebar] = useState(false);
  const [convert, setConvert] = useState(false),
    [time, setTime] = useState(0);
  const [filmVolume, setFilmVolume] = useState(() => preference('interlude-film-volume', 0.8));
  const [recentList, setRecentList] = useState(recents);
  const stage = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    subtitleInput = useRef<HTMLInputElement>(null);
  const initialInvite = useRef(new URLSearchParams(location.hash.slice(1)).get('invite') || '');
  const roomId = path.match(/^\/room\/([A-Za-z0-9_-]{16,64})$/)?.[1];
  const mobile = useMediaQuery('(max-width: 760px)');
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const error = useCallback(
    (e: unknown) => setFailure(e instanceof Error ? e.message : '操作失败，请重试'),
    [],
  );
  const run = useCallback(
    (promise: Promise<unknown>) => {
      void promise.catch(error);
    },
    [error],
  );
  const roomSession = useRoomSession(roomId, ready, error);
  const { room, connected } = roomSession;
  const host = !!room && room.selfId === room.hostId;
  useWebsiteBridge(room, connected);
  const [websiteOpen, setWebsiteOpen] = useState(false),
    [websiteUrl, setWebsiteUrl] = useState('');
  const film = useLocalFilm({
    room,
    connected,
    stage,
    control: roomSession.control,
    volume: filmVolume,
    onError: error,
  });
  const playback = useTogetherPlayback(
    room,
    connected,
    film,
    roomSession.clockOffset,
    roomSession.control,
    roomSession.report,
  );
  const control = useCallback(
    async (value: PlaybackCommand) => {
      const source = film.source.current,
        id = roomSession.current.current?.id;
      if (
        value.kind === 'play' &&
        film.source.current &&
        film.source.current.element.currentTime >= film.source.current.element.duration - 0.2
      ) {
        await roomSession.control({ kind: 'seek', position: 0 });
        if (film.source.current !== source || roomSession.current.current?.id !== id)
          throw new Error('影片或房间已变化');
        source!.seek(0);
      }
      const updated = await roomSession.control(value);
      if (
        value.kind === 'seek' &&
        film.source.current === source &&
        roomSession.current.current?.id === id
      )
        source?.seek(updated.playback.position);
      return updated;
    },
    [roomSession.control, roomSession.current, film.source],
  );
  function navigate(next: string) {
    history.pushState({}, '', next);
    setPath(location.pathname);
    setFailure('');
    setMobileSidebar(false);
  }
  useEffect(() => {
    const pop = () => {
      setPath(location.pathname);
      initialInvite.current = new URLSearchParams(location.hash.slice(1)).get('invite') || '';
    };
    addEventListener('popstate', pop);
    void session()
      .then(() => setReady(true))
      .catch(error);
    return () => removeEventListener('popstate', pop);
  }, [error]);
  useEffect(() => {
    const target = roomId ? 'dark' : 'light';
    // Mantine's setter also disables transitions; only call it on an actual theme change.
    if (colorScheme !== target) setColorScheme(target);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', roomId ? '#181a1b' : '#f7f6f2');
  }, [roomId, colorScheme, setColorScheme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    try {
      localStorage.setItem('interlude-film-volume', String(filmVolume));
    } catch {}
  }, [filmVolume]);
  useEffect(() => {
    if (!room || room.closed || room.selfStatus !== 'approved') {
      setSettingsOpen(false);
      setMobileSidebar(false);
      setEndOpen(false);
    }
  }, [room?.id, room?.closed, room?.selfStatus]);
  useEffect(() => {
    const timer = setInterval(() => {
      const view = roomSession.current.current;
      setTime(
        film.source.current
          ? film.source.current.element.currentTime
          : view
            ? Math.min(
                view.playback.duration,
                view.playback.position +
                  (!view.playback.paused ? (Date.now() - view.playback.updatedAt) / 1000 : 0),
              )
            : 0,
      );
    }, 250);
    return () => clearInterval(timer);
  }, [film.source, roomSession.current]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.closest(
          'input,textarea,button,[contenteditable="true"],[role="dialog"],[role="slider"]',
        ) ||
          document.querySelector('[role="dialog"]'))
      )
        return;
      const view = roomSession.current.current;
      if (e.code === 'Space' && view?.selfId === view?.hostId && film.source.current && connected) {
        e.preventDefault();
        run(control({ kind: film.source.current.element.paused ? 'play' : 'pause' }));
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [connected, control, run, film.source, roomSession.current]);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure('');
    try {
      const data = await api<{ room: RoomView; invite: string }>('/api/rooms', {
        nickname: nickname.trim() || '放映者',
        title: title.trim() || '今晚的放映',
      });
      rememberRoom({ id: data.room.id, title: data.room.title, at: Date.now() });
      setRecentList(recents());
      setCreateOpen(false);
      navigate(`/room/${data.room.id}`);
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  async function join(e: FormEvent) {
    e.preventDefault();
    if (!roomId) return;
    setBusy(true);
    setFailure('');
    try {
      roomSession.accept(
        await api<RoomView>(`/api/rooms/${roomId}/join`, {
          nickname: nickname.trim() || '观众',
          invite: initialInvite.current,
        }),
      );
      initialInvite.current = '';
      history.replaceState({}, '', `/room/${roomId}`);
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  function openInvitation(e: FormEvent) {
    e.preventDefault();
    try {
      const url = new URL(joinUrl);
      if (
        url.origin !== location.origin ||
        !/^\/room\/[\w-]{16,64}$/.test(url.pathname) ||
        !new URLSearchParams(url.hash.slice(1)).get('invite')
      )
        throw new Error('请输入这个站点的完整邀请链接，包含 #invite=…');
      initialInvite.current = new URLSearchParams(url.hash.slice(1)).get('invite') || '';
      navigate(url.pathname + url.hash);
    } catch (e) {
      error(e);
    }
  }
  async function copyInvite() {
    const data = await roomSession.manage('rotate');
    if (!data.invite) throw new Error('生成邀请失败');
    await navigator.clipboard.writeText(`${location.origin}/room/${roomId}#invite=${data.invite}`);
    setToast('新邀请已复制 · 旧邀请失效，2 小时有效');
  }
  async function startWatching() {
    await playback.start();
  }
  async function leave() {
    try {
      if (roomId) await api(`/api/rooms/${roomId}/leave`, {});
    } catch {}
    navigate('/');
  }
  function showChat() {
    if (mobile) setMobileSidebar(!mobileSidebar);
    else setSidebar(!sidebar);
  }
  const sidebarContent = room && (
    <RoomSidebar
      room={room}
      connected={connected}
      host={host}
      tab={side}
      onTab={setSide}
      onClose={() => (mobile ? setMobileSidebar(false) : setSidebar(false))}
      send={roomSession.message}
      manage={roomSession.manage}
      pause={() => control({ kind: 'pause' })}
      run={run}
    />
  );
  return (
    <div className={`app ${roomId ? 'room-app' : 'home-app'}`}>
      <header className="topbar">
        <button
          className="logo-button"
          aria-label="一起看首页"
          onClick={() => (roomId ? run(leave()) : navigate('/'))}
        >
          <Logo />
        </button>
        {roomId ? (
          <div className="room-top-actions">
            <span className="top-room-title">{room?.title || '私人放映室'}</span>
            {room?.selfStatus === 'approved' && !room.closed && (
              <>
                <span className="member-count">
                  <IconUsers size={17} />
                  {room.members.length} / 8
                </span>
                {host && (
                  <button
                    className="secondary-button invite-button"
                    disabled={!connected}
                    onClick={() => run(copyInvite())}
                  >
                    <IconLink size={17} /> 邀请朋友
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label="房间设置"
                  title="房间设置"
                  onClick={() => setSettingsOpen(true)}
                >
                  <IconSettings size={20} />
                </button>
              </>
            )}
            <button
              className="icon-button"
              aria-label="离开放映室"
              title="离开放映室"
              onClick={() => run(leave())}
            >
              <IconLogout size={20} />
            </button>
          </div>
        ) : (
          <span className="home-header-note">
            <IconShieldLock size={16} /> 好友私人放映室
          </span>
        )}
      </header>
      {host && room && !room.closed && room.selfStatus === 'approved' && (
        <AdmissionNotice
          pending={room.pending}
          connected={connected}
          reviewing={side === 'members' && (mobile ? mobileSidebar : sidebar)}
          onReview={() => {
            setSettingsOpen(false);
            setEndOpen(false);
            setWebsiteOpen(false);
            setSide('members');
            setSidebar(true);
            setMobileSidebar(true);
            requestAnimationFrame(() => document.getElementById('pending-admissions')?.focus());
          }}
        />
      )}
      {failure && (
        <div className="error-banner" role="alert">
          <span>{failure}</span>
          <button className="icon-button" aria-label="关闭错误提示" onClick={() => setFailure('')}>
            <IconX size={18} />
          </button>
        </div>
      )}
      {!roomId ? (
        <main className="home-main">
          <section className="home-intro">
            <span className="section-caption">给今晚留一点时间</span>
            <h1>今晚，和谁一起看？</h1>
            <p>
              创建一个房间，邀请朋友。
              <br />
              在同一时间，看同一部影片。
            </p>
          </section>
          <section className="home-actions" aria-label="开始观影">
            <div className="create-action">
              <span className="field-label">新的放映</span>
              <button
                className="primary-button create-room"
                disabled={!ready}
                onClick={() => setCreateOpen(true)}
              >
                <IconPlus size={22} />
                <span>创建放映室</span>
                <IconArrowRight size={19} />
              </button>
              <p>无需注册 · 最多 8 人 · 房主批准加入</p>
            </div>
            <form className="join-action" onSubmit={openInvitation}>
              <label className="field-label" htmlFor="invite-url">
                已有朋友的邀请？
              </label>
              <div className="invitation-input">
                <IconLink size={19} />
                <input
                  id="invite-url"
                  aria-label="房间邀请链接"
                  value={joinUrl}
                  onChange={(e) => setJoinUrl(e.currentTarget.value)}
                  placeholder="粘贴完整邀请链接"
                  required
                />
                <button type="submit" disabled={!joinUrl.trim()}>
                  加入 <IconArrowRight size={17} />
                </button>
              </div>
              <p>使用朋友发来的完整链接，不需要房间码。</p>
            </form>
          </section>
          <section className="recent-section">
            <div className="section-heading">
              <h2>最近的放映室</h2>
              <button
                className="text-button"
                disabled={!recentList.length}
                onClick={() => {
                  try {
                    localStorage.removeItem('interlude-recent');
                  } catch {}
                  setRecentList([]);
                }}
              >
                清空记录
              </button>
            </div>
            {recentList.length ? (
              <ul className="recent-list">
                {recentList.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => navigate(`/room/${r.id}`)}>
                      <span className="recent-icon">
                        <IconClock size={20} />
                      </span>
                      <span>
                        <strong>{r.title}</strong>
                        <small>{new Date(r.at).toLocaleDateString('zh-CN')} · 仅保存在本机</small>
                      </span>
                      <IconArrowRight size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="recent-empty">
                <IconClock size={23} stroke={1.3} />
                <div>
                  <strong>还没有放映记录</strong>
                  <p>创建房间后，可以从这里返回。记录只保存在这台设备。</p>
                </div>
              </div>
            )}
          </section>
          <footer className="home-footer">
            <span>各自准备影片，一起同步观看。</span>
            <nav aria-label="帮助与开源">
              <a
                href="https://github.com/askandtell/interlude/blob/main/docs/GETTING_STARTED.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                使用指南
              </a>
              <a
                href="https://github.com/askandtell/interlude"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub 源码
              </a>
              <a
                href="https://github.com/howardchung/watchparty"
                target="_blank"
                rel="noopener noreferrer"
              >
                基于 WatchParty
              </a>
            </nav>
          </footer>
        </main>
      ) : (
        <main className="room-main">
          {!room ? (
            <section className="entry-panel">
              <button className="text-button" onClick={() => navigate('/')}>
                <IconChevronLeft size={17} /> 返回首页
              </button>
              <IconFile size={34} stroke={1.3} />
              <h1>加入私人放映室</h1>
              {roomSession.joinAttempt ? (
                <form onSubmit={join}>
                  <p>填写昵称，等待房主批准后即可入座。</p>
                  <TextInput
                    label="你的昵称"
                    placeholder="朋友该怎么称呼你？"
                    value={nickname}
                    maxLength={24}
                    onChange={(e) => setNickname(e.currentTarget.value)}
                    required
                  />
                  <Button fullWidth type="submit" loading={busy} mt="lg">
                    敲门，申请加入
                  </Button>
                  {!initialInvite.current && (
                    <p className="muted">
                      当前没有有效邀请。请联系房主获取完整链接；房间也可能已经过期。
                    </p>
                  )}
                </form>
              ) : (
                <p role="status">正在读取房间…</p>
              )}
            </section>
          ) : room.closed ? (
            <section className="entry-panel">
              <IconCheck size={34} />
              <h1>本次放映已结束</h1>
              <p>房间邀请已失效，聊天记录已清理。</p>
              <button className="primary-button" onClick={() => navigate('/')}>
                回到首页 <IconArrowRight size={18} />
              </button>
            </section>
          ) : room.selfStatus !== 'approved' ? (
            <section className="entry-panel">
              <IconClock size={34} />
              <h1>{room.selfStatus === 'denied' ? '申请未通过' : '等待房主批准'}</h1>
              <p>
                {room.selfStatus === 'denied'
                  ? '请联系房主确认。'
                  : '批准后会自动进入。等待期间无法查看影片和聊天。'}
              </p>
              <button className="text-button" onClick={() => run(leave())}>
                返回首页
              </button>
            </section>
          ) : (
            <>
              {!connected && (
                <div className="connection-banner" role="status">
                  <span>
                    <strong>控制连接中断</strong> ·{' '}
                    {host
                      ? '影片已暂停，正在尝试恢复房间状态。'
                      : '暂时无法发送消息和操作，正在恢复房间状态。'}
                  </span>
                  <button className="secondary-button" onClick={roomSession.retry}>
                    重试连接
                  </button>
                </div>
              )}
              <div className="connection-notice" role="status">
                各自播放 · 只同步进度 · 不传输影片或语音
              </div>
              {room.playback.website && host && film.preflight.phase !== 'idle' && (
                <Alert
                  color={film.preflight.error ? 'red' : 'gray'}
                  title={
                    film.preflight.error ? '本地影片准备失败，仍保留网站影片' : '正在检测本地影片'
                  }
                >
                  <p>{film.preflight.error || film.preflight.name}</p>
                  <button className="secondary-button" onClick={film.cancel}>
                    取消检测
                  </button>
                  {film.preflight.error && (
                    <button className="secondary-button" onClick={() => run(film.retry(true))}>
                      尝试兼容转换
                    </button>
                  )}
                </Alert>
              )}
              <div className={`theater-layout ${!sidebar ? 'sidebar-hidden' : ''}`}>
                {room.playback.website && (
                  <>
                    <WebsiteRoom
                      room={room}
                      connected={connected}
                      control={control}
                      onChat={showChat}
                      run={run}
                      change={() => setWebsiteOpen(true)}
                      local={() => fileInput.current?.click()}
                    />
                  </>
                )}
                <div
                  className="player-column"
                  style={{ display: room.playback.website ? 'none' : undefined }}
                >
                  {host && (
                    <button
                      className="website-entry text-button"
                      disabled={!connected}
                      onClick={() => setWebsiteOpen(true)}
                    >
                      使用视频网站一起看 ↗
                    </button>
                  )}
                  <Player
                    room={room}
                    host={host}
                    connected={connected}
                    film={film}
                    playback={playback}
                    stage={stage}
                    time={time}
                    volume={filmVolume}
                    onVolume={setFilmVolume}
                    control={control}
                    onSelect={() => fileInput.current?.click()}
                    onSubtitle={() => subtitleInput.current?.click()}
                    onStart={startWatching}
                    onChat={showChat}
                    run={run}
                    onTime={setTime}
                  />
                </div>
                {!mobile && sidebar && sidebarContent}
              </div>
              {host &&
                !film.info &&
                !room.playback.website &&
                room.playback.title &&
                film.preflight.phase === 'idle' && (
                  <div className="file-lost" role="status">
                    <strong>请重新选择影片文件</strong>
                    <p>
                      页面刷新后无法自动恢复本地文件权限。选择原文件，检测通过后可确认继续播放。
                    </p>
                    <button className="secondary-button" onClick={() => fileInput.current?.click()}>
                      重新选择文件
                    </button>
                  </div>
                )}
              <input
                ref={fileInput}
                hidden
                type="file"
                accept="video/*,.mkv,.mov,.webm"
                onChange={(e) => {
                  const selectedFile = e.currentTarget.files?.[0];
                  run(
                    (async () => {
                      if (!selectedFile) return;
                      if (room.playback.website) await roomSession.control({ kind: 'pause' });
                      await film.select(selectedFile, convert);
                    })(),
                  );
                  e.currentTarget.value = '';
                }}
              />
              <input
                ref={subtitleInput}
                hidden
                type="file"
                accept=".srt,.vtt"
                onChange={(e) => {
                  run(film.loadSubtitle(e.currentTarget.files?.[0]));
                  e.currentTarget.value = '';
                }}
              />
            </>
          )}
        </main>
      )}
      <Modal
        opened={websiteOpen && !!room && !room.closed && host}
        onClose={() => setWebsiteOpen(false)}
        title="视频网站一起看"
        centered
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              (async () => {
                const selected = websiteSource(websiteUrl);
                await roomSession.control({ kind: 'website', url: selected.url });
                film.clear();
                setWebsiteOpen(false);
                setWebsiteUrl('');
              })(),
            );
          }}
        >
          <p>
            哔哩哔哩、优酷、爱奇艺、腾讯视频。每个人在官方网页使用自己的账号观看，一起看同步时间。
          </p>
          <TextInput
            label="官方视频完整链接"
            placeholder="https://www.bilibili.com/video/BV…/"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            required
            maxLength={2048}
          />
          <p>不接收短链、下载地址或含账号凭证的链接。广告和会员权限由视频网站处理。</p>
          <Button type="submit" disabled={!connected}>
            使用这个视频
          </Button>
        </form>
      </Modal>
      <Drawer
        opened={!!mobile && mobileSidebar && !!room && room.selfStatus === 'approved'}
        onClose={() => setMobileSidebar(false)}
        position="bottom"
        size="78dvh"
        title="聊天与成员"
        keepMounted={false}
      >
        {sidebarContent}
      </Drawer>
      <Modal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        title="创建放映室"
        centered
        radius="md"
      >
        <form onSubmit={create}>
          <p className="modal-intro">先创建房间，再选择影片和邀请朋友。</p>
          <TextInput
            label="你的昵称"
            placeholder="放映者"
            maxLength={24}
            value={nickname}
            onChange={(e) => setNickname(e.currentTarget.value)}
            required
          />
          <TextInput
            label="房间名字"
            mt="md"
            maxLength={48}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            required
          />
          <p className="muted modal-note">
            <IconShieldLock size={16} /> 私密邀请 · 房主准入 · 最多 8 人
          </p>
          <Button type="submit" fullWidth loading={busy}>
            创建放映室
          </Button>
        </form>
      </Modal>
      <Modal
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="房间设置"
        centered
        radius="md"
        size="md"
      >
        <div className="settings-content">
          <h3>播放设置</h3>
          <Slider
            aria-label="设置电影音量"
            value={filmVolume * 100}
            onChange={(v) => setFilmVolume(v / 100)}
          />
          <Switch
            mt="lg"
            label="兼容转换（下次选片生效）"
            checked={convert}
            onChange={(e) => setConvert(e.currentTarget.checked)}
          />
          {host && (
            <>
              <Button
                variant="default"
                fullWidth
                disabled={!connected}
                leftSection={<IconLink size={17} />}
                onClick={() => run(copyInvite())}
              >
                复制邀请链接
              </Button>
              <p className="muted">每次生成新邀请都会使旧邀请失效，新邀请两小时有效。</p>
              <Button
                variant="subtle"
                fullWidth
                disabled={!connected}
                onClick={() =>
                  run(roomSession.manage('rotate').then(() => setToast('旧邀请已失效')))
                }
              >
                让旧邀请失效
              </Button>
              {room && room.members.some((m) => m.id !== room.selfId && m.online) && (
                <Select
                  label="转交房间管理（需新房主重新选片）"
                  mt="md"
                  placeholder="选择在线成员"
                  data={room.members
                    .filter((m) => m.id !== room.selfId && m.online)
                    .map((m) => ({ value: m.id, label: m.nickname }))}
                  value={null}
                  disabled={!connected}
                  onChange={(id) => {
                    if (id)
                      run(roomSession.manage('transfer', id).then(() => setSettingsOpen(false)));
                  }}
                />
              )}
              <Button
                fullWidth
                color="red"
                variant="light"
                mt="lg"
                disabled={!connected}
                onClick={() => {
                  setSettingsOpen(false);
                  setEndOpen(true);
                }}
              >
                结束本次放映
              </Button>
            </>
          )}
          <p className="privacy-note">
            影片与字幕只在各自设备播放，房间服务仅处理同步状态与文字聊天。
          </p>
        </div>
      </Modal>
      <Modal opened={endOpen} onClose={() => setEndOpen(false)} title="结束本次放映？" centered>
        <p>所有人将离开房间，聊天记录会清理，邀请随即失效。</p>
        <div className="modal-actions">
          <Button variant="default" onClick={() => setEndOpen(false)}>
            取消
          </Button>
          <Button
            color="red"
            onClick={() => run(roomSession.manage('end').then(() => setEndOpen(false)))}
          >
            结束放映
          </Button>
        </div>
      </Modal>
      {toast && (
        <div className="toast" role="status">
          <IconCheck size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
