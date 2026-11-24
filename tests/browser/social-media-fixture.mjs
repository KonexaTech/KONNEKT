import { readFile } from 'node:fs/promises';
export async function installPrivateSocialMedia(context, { deny = false } = {}) {
  const bytes = await readFile(new URL('../fixtures/social-video.webm', import.meta.url));
  const requests = [];
  await context.route('**/storage/v1/object/sign/konnekt-public-media/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === 'POST') {
      requests.push({ path: url.pathname, ...request.postDataJSON() });
      return route.fulfill({ status: deny ? 403 : 200, contentType: 'application/json', body: JSON.stringify(deny ? { message: 'Fixture storage denied' } : { signedURL: `${url.pathname.replace('/storage/v1', '')}?token=fixture-only` }) });
    }
    return route.fulfill({ status: 200, contentType: 'video/webm', body: bytes });
  });
  // Public object requests must fail, matching the inspected staging bucket.
  await context.route('**/storage/v1/object/public/konnekt-public-media/**', route => route.fulfill({ status: 403, body: 'Private bucket' }));
  return requests;
}
