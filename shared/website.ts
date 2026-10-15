/** Accept only canonical public watch pages. Never retain tracking, tokens or credentials. */
export function websiteSource(value: string): { provider: string; url: string } {
  if (value.length > 2048) throw new Error('视频链接过长');
  let u: URL;
  try {
    u = new URL(value.trim());
  } catch {
    throw new Error('请粘贴完整的官方视频链接');
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port)
    throw new Error('请使用不含登录信息的 HTTPS 官方视频链接');
  const h = u.hostname.toLowerCase(),
    p = u.pathname;
  let provider = '',
    path = p,
    query = '';
  if (
    ['www.bilibili.com', 'bilibili.com'].includes(h) &&
    /^\/video\/(BV[a-zA-Z0-9]+|av\d+)\/?$/.test(p)
  ) {
    provider = '哔哩哔哩';
    path = p.replace(/\/$/, '') + '/';
    const page = u.searchParams.get('p');
    if (page && /^\d{1,4}$/.test(page) && Number(page) > 0) query = `?p=${Number(page)}`;
  }
  if (h === 'v.youku.com' && /^\/v_show\/id_[a-zA-Z0-9=]+\.html$/.test(p)) provider = '优酷';
  if (h === 'www.iqiyi.com' && /^\/v_[a-zA-Z0-9]+\.html$/.test(p)) provider = '爱奇艺';
  if (
    h === 'v.qq.com' &&
    /^\/x\/(cover\/[a-zA-Z0-9]+(\/[a-zA-Z0-9]+)?|page\/[a-zA-Z0-9]+)\.html$/.test(p)
  )
    provider = '腾讯视频';
  if (!provider)
    throw new Error(
      '暂支持哔哩哔哩普通视频、优酷、爱奇艺、腾讯视频的桌面版播放页。请在浏览器中打开短链后复制完整地址。',
    );
  return {
    provider,
    url: `https://${h === 'bilibili.com' ? 'www.bilibili.com' : h}${path}${query}`,
  };
}
