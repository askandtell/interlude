export interface ResumeRecord {
  name: string;
  size: number;
  modified: number;
  duration: number;
  position: number;
  at: number;
}
export function matchingResume(
  record: ResumeRecord | undefined,
  file: Pick<File, 'name' | 'size' | 'lastModified'>,
  duration: number,
  now = Date.now(),
) {
  if (
    !record ||
    !Number.isFinite(record.position) ||
    !Number.isFinite(record.duration) ||
    !Number.isFinite(record.at) ||
    now - record.at > 86400000 ||
    record.at > now + 1000
  )
    return;
  if (
    record.name !== file.name ||
    record.size !== file.size ||
    record.modified !== file.lastModified ||
    Math.abs(record.duration - duration) > 1
  )
    return;
  if (record.position > 1 && record.position < duration - 1) return record.position;
}
export function readResume(id: string): ResumeRecord | undefined {
  try {
    return JSON.parse(sessionStorage.getItem(`interlude-resume:${id}`) || 'null') || undefined;
  } catch {
    return;
  }
}
export function saveResume(id: string, file: File, duration: number, position: number) {
  try {
    const prefix = 'interlude-resume:';
    const records = Object.keys(sessionStorage).filter((key) => key.startsWith(prefix));
    const others = records
      .filter((key) => key !== prefix + id)
      .sort((a, b) => {
        try {
          return (
            JSON.parse(sessionStorage.getItem(b) || '{}').at -
            JSON.parse(sessionStorage.getItem(a) || '{}').at
          );
        } catch {
          return 0;
        }
      });
    others.slice(3).forEach((key) => sessionStorage.removeItem(key));
    sessionStorage.setItem(
      `interlude-resume:${id}`,
      JSON.stringify({
        name: file.name,
        size: file.size,
        modified: file.lastModified,
        duration,
        position,
        at: Date.now(),
      }),
    );
  } catch {
    /* optional tab-local preference */
  }
}
