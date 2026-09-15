export const PHOTO_POLICY = 'bit-real-photo-v27';
export function bitUrl(value, base) {
  try {
    const u = new URL(value, base);
    if (!['bit.courts.go.jp', 'www.bit.courts.go.jp'].includes(u.hostname)) return null;
    if (u.username || u.password || (u.port && u.port !== '443')) return null;
    u.protocol = 'https:'; u.hostname = 'www.bit.courts.go.jp'; return u.href;
  } catch { return null; }
}
export function trustedPhoto(meta) {
  return meta?.policy === PHOTO_POLICY && !!bitUrl(meta.source) &&
    ['three-doc-pdf', 'bit-page-image', 'three-doc-render'].includes(meta.method);
}
export function blockedPage(html) {
  return /cf-chl-|challenge-platform|Just a moment|verify you are human|captcha|Cloudflare Ray ID/i.test(html);
}
