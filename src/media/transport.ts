export interface MediaTransport {
  readonly kind: 'direct' | 'relay';
  readonly state: string;
  publish(stream: MediaStream, height: 720 | 1080): Promise<void>;
  microphone(enabled: boolean, deviceId?: string): Promise<void>;
  setVoiceVolume(volume: number): void;
  resumeAudio(): Promise<void>;
  outputDevice(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
}
