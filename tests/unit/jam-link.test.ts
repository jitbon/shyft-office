import { describe, expect, it } from 'vitest';
import { parseTrackLink } from '../../shared/jam';

const ID = 'dQw4w9WgXcQ';
const ok = (ref = ID) => ({ ok: true, provider: 'youtube', ref });

describe('parseTrackLink', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PLx&t=42s&si=abc`,
    `http://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&list=RDAMVM${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=30&si=zzz`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}?start=3`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `  https://youtu.be/${ID}  `,
  ])('accepts %s and keeps only the id', (url) => {
    expect(parseTrackLink(url)).toEqual(ok());
  });

  it.each([
    ['not a link', 'hello'],
    ['empty', ''],
    ['not a string', 42],
    ['wrong scheme', `ftp://youtube.com/watch?v=${ID}`],
    ['javascript scheme', `javascript:alert(1)//youtube.com/watch?v=${ID}`],
    ['no scheme', `youtube.com/watch?v=${ID}`],
    ['too long', `https://youtube.com/watch?v=${ID}&x=${'a'.repeat(300)}`],
    ['id too short', 'https://youtu.be/abc'],
    ['id too long', `https://youtu.be/${ID}x`],
    ['id with bad characters', 'https://youtu.be/abc<script>de'],
    ['watch without v', 'https://www.youtube.com/watch'],
    ['a channel page', 'https://www.youtube.com/@someone'],
    ['a playlist page', 'https://www.youtube.com/playlist?list=PLxxxxxxxxxxx'],
    ['userinfo on the right host', `https://me@youtube.com/watch?v=${ID}`],
  ])('rejects %s as bad-link', (_, url) => {
    expect(parseTrackLink(url)).toEqual({ ok: false, reason: 'bad-link' });
  });

  it.each([
    'https://vimeo.com/123456789',
    `https://youtube.com.evil.test/watch?v=${ID}`,
    `https://evilyoutube.com/watch?v=${ID}`,
    `https://notyoutu.be/${ID}`,
    `https://youtube.com@evil.test/watch?v=${ID}`,
    `https://evil.test/https://youtube.com/watch?v=${ID}`,
    `https://youtube.evil.test/${ID}`,
  ])('rejects %s as unsupported-site', (url) => {
    expect(parseTrackLink(url)).toEqual({ ok: false, reason: 'unsupported-site' });
  });
});
