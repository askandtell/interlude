export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${s >= 3600 ? `${Math.floor(s / 3600)}:` : ''}${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
export interface RecentRoom {
  id: string;
  title: string;
  at: number;
}
export function recents(): RecentRoom[] {
  try {
    const data = JSON.parse(localStorage.getItem('interlude-recent') || '[]');
    return Array.isArray(data)
      ? data
          .filter(
            (r) =>
              r &&
              /^[\w-]{16,64}$/.test(r.id) &&
              typeof r.title === 'string' &&
              Number.isFinite(r.at),
          )
          .slice(0, 4)
      : [];
  } catch {
    return [];
  }
}
export function rememberRoom(value: RecentRoom) {
  try {
    localStorage.setItem(
      'interlude-recent',
      JSON.stringify([value, ...recents().filter((r) => r.id !== value.id)].slice(0, 4)),
    );
  } catch {}
}
