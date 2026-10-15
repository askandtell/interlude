/** Probe the native API, not the browser name. The temporary peer never gathers ICE. */
export function canUpdateRtcConfiguration(
  createPeer: () => Pick<RTCPeerConnection, 'setConfiguration' | 'close'> = () =>
    new RTCPeerConnection({ iceServers: [] }),
): boolean {
  let peer: ReturnType<typeof createPeer> | undefined;
  try {
    peer = createPeer();
    peer.setConfiguration({ iceServers: [] });
    return true;
  } catch {
    return false;
  } finally {
    peer?.close();
  }
}

export function rtcConnectionError(error: unknown): Error {
  if (error instanceof Error && /setConfiguration|unsupported way/i.test(error.message))
    return new Error(
      '当前浏览器无法更新实时连接配置。请重试连接；仍失败时可在桌面 Chrome 或 Edge 中打开本房间。',
      { cause: error },
    );
  return error instanceof Error ? error : new Error('媒体连接失败，请重试');
}
