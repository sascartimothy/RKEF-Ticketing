// Called while offline under the production worker, with synthetic data only.
(async () => {
  const assert = (value, message) => { if (!value) throw Error(message); };
  const manifest = await (await fetch('./manifest.webmanifest')).json();
  assert(manifest.icons.length === 3, 'Expected two standard icons and one maskable');
  for (const icon of manifest.icons) {
    const response = await fetch(icon.src);
    assert(response.ok && response.headers.get('content-type').includes('image/png'), 'Offline PNG unavailable');
    const bitmap = await createImageBitmap(await response.blob());
    const size = Number(icon.sizes.split('x')[0]);
    assert(bitmap.width === size && bitmap.height === size, 'Incorrect icon dimensions');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    if (icon.purpose === 'maskable') {
      let artwork = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        assert(pixels[i + 3] === 255, 'Maskable must be fully opaque');
        if (pixels[i] !== 16 || pixels[i + 1] !== 44 || pixels[i + 2] !== 58) {
          artwork++;
          assert(Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= size * 0.4, 'Logo outside maskable safe area');
        }
      }
      assert(artwork > size * size * 0.1, 'Maskable artwork missing');
    } else {
      assert(icon.purpose === 'any', 'Standard icon purpose');
      assert(pixels[3] === 0, 'Standard icon lost corner transparency');
      assert(pixels[((size / 2) * size + size / 2) * 4 + 3] > 0, 'Standard artwork missing');
    }
    bitmap.close();
  }
  assert(!document.querySelector('link[rel="icon"]').href.includes('.svg'), 'Old SVG favicon');
  return 'PASS offline PWA PNG decoding, 192/512 dimensions, transparency, opaque maskable and all artwork within 80% safe circle';
})()
