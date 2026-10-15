export interface Cue {
  start: number;
  end: number;
  text: string;
}
function time(value: string) {
  const match = value.trim().match(/^(?:(\d{1,3}):)?(\d{2}):(\d{2})[.,](\d{3})$/);
  if (!match) return NaN;
  return (
    Number(match[1] || 0) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}
export function parseSubtitles(text: string): Cue[] {
  if (new TextEncoder().encode(text).length > 1024 * 1024) throw new Error('字幕不能超过 1 MB');
  const blocks = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n'),
      index = lines.findIndex((line) => line.includes('-->'));
    if (index < 0) continue;
    const [a, b] = lines[index].split('-->'),
      start = time(a),
      end = time(b.trim().split(/\s/)[0]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > 864000) continue;
    const content = lines
      .slice(index + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\{\\[^}]*\}/g, '')
      .replace(/[\u0000-\u0008\u000b-\u001f]/g, '')
      .slice(0, 400);
    if (content) cues.push({ start, end, text: content });
    if (cues.length > 10000) throw new Error('字幕条目不能超过 10000 条');
  }
  if (!cues.length) throw new Error('没有找到有效的 SRT / VTT 字幕');
  return cues.sort((a, b) => a.start - b.start);
}
export async function readSubtitles(file: File) {
  if (file.size > 1024 * 1024) throw new Error('字幕不能超过 1 MB');
  const bytes = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(bytes);
  if (text.includes('\uFFFD')) text = new TextDecoder('gb18030').decode(bytes);
  return parseSubtitles(text);
}
