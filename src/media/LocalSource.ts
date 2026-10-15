import { ClientTranscoder, isClientTranscodeSupported } from './ClientTranscoder';
import type { Cue } from './subtitles';
import {
  drawSubtitle,
  subtitleSettings,
  defaultSubtitleSettings,
  type SubtitleSettings,
} from './subtitleLayout';
export class SourceError extends Error {
  constructor(
    public code: 'DECODE' | 'TIMEOUT',
    message: string,
  ) {
    super(message);
  }
}
export interface SourceInfo {
  title: string;
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  converted: boolean;
}
export interface MediaSourceAdapter {
  element: HTMLVideoElement;
  mount(container: HTMLElement, height: 720 | 1080): void;
  prepare(file: File, convert: boolean): Promise<SourceInfo>;
  stream(height: 720 | 1080): Promise<MediaStream>;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  dispose(): void;
  setSubtitles(cues: Cue[]): void;
  setSubtitleSettings(settings: SubtitleSettings): void;
}
export class LocalSource implements MediaSourceAdapter {
  element = document.createElement('video');
  private url?: string;
  private transcoder?: ClientTranscoder;
  private captured?: MediaStream;
  private output?: MediaStream;
  private canvas?: HTMLCanvasElement;
  private timer?: number;
  private cues: Cue[] = [];
  private disposed = false;
  private settings = defaultSubtitleSettings;
  private draw?: () => void;
  constructor(private onError: (error: Error) => void) {
    this.element.playsInline = true;
    this.element.preload = 'auto';
    this.element.className = 'movie-element';
    this.element.setAttribute('aria-label', '本地影片预览');
  }
  static supported() {
    return (
      !!(HTMLMediaElement.prototype as HTMLMediaElement & { captureStream?: () => MediaStream })
        .captureStream && typeof RTCPeerConnection !== 'undefined'
    );
  }
  async prepare(file: File, convert: boolean) {
    if (!file.size) throw new Error('这个文件是空的，请重新选择');
    if (!LocalSource.supported())
      throw new Error('本浏览器不能放映本地文件，请使用桌面 Chrome 或 Edge；仍可以观看朋友的放映');
    const mb = await import('mediabunny');
    if (this.disposed) throw new Error('已取消选片');
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    let info: SourceInfo;
    try {
      const [v, a, d] = await Promise.all([
        input.getPrimaryVideoTrack(),
        input.getPrimaryAudioTrack(),
        input.computeDuration(),
      ]);
      if (!v || !Number.isFinite(d) || d <= 0 || d > 864000)
        throw new Error('文件没有有效视频轨，或影片时长不受支持');
      info = {
        title: file.name,
        duration: d,
        width: v.displayWidth,
        height: v.displayHeight,
        videoCodec: v.codec || '未知',
        audioCodec: a?.codec || '无音轨',
        converted: convert,
      };
    } catch (e) {
      if (e instanceof Error && /[\u4e00-\u9fff]/.test(e.message)) throw e;
      throw new Error('无法识别影片内容。请确认文件未损坏、下载完整，或重新选择影片。');
    } finally {
      input.dispose();
    }
    if (this.disposed) throw new Error('已取消选片');
    if (convert) {
      if (!isClientTranscodeSupported())
        throw new Error('本浏览器不支持本地转换，请换用桌面 Chrome/Edge');
      this.transcoder = new ClientTranscoder({
        source: file,
        video: this.element,
        onError: this.onError,
      });
      await this.timeout(this.transcoder.start(), 30000);
    } else {
      this.url = URL.createObjectURL(file);
      const ready = new Promise<void>((resolve, reject) => {
        const clear = () => {
          this.element.removeEventListener('loadeddata', loaded);
          this.element.removeEventListener('error', failed);
        };
        const loaded = () => {
            clear();
            resolve();
          },
          failed = () => {
            clear();
            reject(new SourceError('DECODE', '浏览器无法解码这个文件，可开启「兼容转换」重试'));
          };
        this.element.addEventListener('loadeddata', loaded, { once: true });
        this.element.addEventListener('error', failed, { once: true });
      });
      this.element.src = this.url;
      await this.timeout(ready, 15000);
    }
    if (this.disposed) throw new Error('已取消选片');
    this.element.pause();
    return info;
  }
  private timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new SourceError('TIMEOUT', '影片准备超时，请尝试兼容转换或选择其他影片')),
        ms,
      );
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }
  async stream(height: 720 | 1080) {
    if (this.output) return this.output;
    const el = this.element as HTMLVideoElement & { captureStream(): MediaStream };
    // Decoders create audio tracks when playback begins. A short muted warm-up is local only.
    const wasMuted = el.muted;
    el.muted = true;
    await el.play();
    this.captured = el.captureStream();
    await new Promise((resolve) => setTimeout(resolve, 120));
    el.pause();
    el.muted = wasMuted;
    if (this.disposed) {
      this.captured.getTracks().forEach((track) => track.stop());
      throw new Error('放映已取消');
    }
    this.compositor(height);
    const canvas = this.canvas!;
    this.output = new MediaStream([
      ...canvas.captureStream(30).getVideoTracks(),
      ...this.captured.getAudioTracks(),
    ]);
    return this.output;
  }
  mount(container: HTMLElement, height: 720 | 1080) {
    container.appendChild(this.element);
    this.compositor(height);
    container.appendChild(this.canvas!);
  }
  private compositor(height: 720 | 1080) {
    if (this.canvas) return;
    const el = this.element;
    const scale = Math.min(1, height / (el.videoHeight || height));
    const canvas = (this.canvas = document.createElement('canvas'));
    canvas.className = 'local-composite';
    canvas.setAttribute('aria-label', '共享画面预览');
    canvas.width = Math.max(2, Math.round(((el.videoWidth || 1280) * scale) / 2) * 2);
    canvas.height = Math.max(2, Math.round(((el.videoHeight || 720) * scale) / 2) * 2);
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const draw = () => {
      if (this.disposed || !this.canvas) return;
      if (el.readyState >= 2) ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      drawSubtitle(
        ctx,
        canvas.width,
        canvas.height,
        this.subtitleAt(el.currentTime),
        this.settings,
      );
    };
    this.draw = draw;
    draw();
    this.timer = window.setInterval(draw, 1000 / 30);
  }
  subtitleAt(seconds: number) {
    const t = seconds - this.settings.offset;
    return this.cues
      .filter((c) => c.start <= t && t < c.end)
      .slice(0, 3)
      .map((c) => c.text)
      .join('\n');
  }
  setSubtitles(cues: Cue[]) {
    this.cues = cues;
    this.draw?.();
  }
  setSubtitleSettings(settings: SubtitleSettings) {
    this.settings = subtitleSettings(settings);
    this.draw?.();
  }
  play() {
    return this.element.play();
  }
  pause() {
    this.element.pause();
  }
  seek(seconds: number) {
    this.element.currentTime = Math.min(Math.max(seconds, 0), this.element.duration || seconds);
  }
  dispose() {
    this.disposed = true;
    this.element.pause();
    this.transcoder?.stop();
    window.clearInterval(this.timer);
    for (const stream of [this.output, this.captured]) stream?.getTracks().forEach((t) => t.stop());
    if (this.url) URL.revokeObjectURL(this.url);
    this.element.removeAttribute('src');
    this.element.load();
    this.element.remove();
    this.canvas?.remove();
    this.canvas = undefined;
    this.draw = undefined;
    this.cues = [];
  }
}
