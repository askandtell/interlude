export interface SubtitleSettings {
  scale: 80 | 100 | 120;
  offset: number;
}
export const defaultSubtitleSettings: SubtitleSettings = { scale: 100, offset: 0 };

export function subtitleSettings(value: SubtitleSettings): SubtitleSettings {
  return {
    scale: [80, 100, 120].includes(value.scale) ? value.scale : 100,
    offset: Number.isFinite(value.offset)
      ? Math.round(Math.max(-10, Math.min(10, value.offset)) * 10) / 10
      : 0,
  };
}

export function wrapSubtitle(
  text: string,
  measure: (s: string) => number,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const char of Array.from(paragraph)) {
      if (line && measure(line + char) > width) {
        lines.push(line.trim());
        line = char;
      } else line += char;
    }
    if (line.trim()) lines.push(line.trim());
  }
  if (lines.length <= 3) return lines;
  let last = lines[2];
  while (last && measure(last + '…') > width) last = Array.from(last).slice(0, -1).join('');
  return [lines[0], lines[1], last + '…'];
}

export function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  settings: SubtitleSettings,
) {
  if (!text) return;
  const fontSize = (Math.max(12, Math.round(height * 0.042)) * settings.scale) / 100;
  const margin = Math.max(8, Math.round(height * 0.06));
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const lines = wrapSubtitle(text, (value) => ctx.measureText(value).width, width * 0.86);
  lines.forEach((line, i) => {
    const y = height - margin - (lines.length - i - 1) * fontSize * 1.35;
    ctx.lineWidth = fontSize * 0.18;
    ctx.strokeStyle = 'rgba(0,0,0,.9)';
    ctx.lineJoin = 'round';
    ctx.strokeText(line, width / 2, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(line, width / 2, y);
  });
}
