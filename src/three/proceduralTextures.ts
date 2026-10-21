import * as THREE from 'three';

export function createSignboardTexture(
  renderer: THREE.WebGLRenderer,
  title: string,
  subtitle = '',
  bgColor = '#4a1822',
  borderColor = '#f4b855',
  textColor = '#fff3d6'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  // Rich festive gradient background
  const grad = ctx.createLinearGradient(0, 0, 768, 192);
  grad.addColorStop(0, bgColor);
  grad.addColorStop(0.5, '#2b0e16');
  grad.addColorStop(1, bgColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 768, 192);

  // Double golden zari border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 752, 176);

  ctx.strokeStyle = 'rgba(255, 228, 160, 0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, 732, 156);

  // Corner marigold / diya dots
  const corners = [
    [28, 28],
    [740, 28],
    [28, 164],
    [740, 164],
  ];
  ctx.fillStyle = borderColor;
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Title text
  ctx.fillStyle = textColor;
  const fontSize = title.length > 26 ? 34 : title.length > 18 ? 42 : 48;
  ctx.font = `700 ${fontSize}px "Playfair Display", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 384, subtitle ? 78 : 96, 700);

  if (subtitle) {
    ctx.fillStyle = borderColor;
    ctx.font = `600 24px "DM Sans", system-ui, sans-serif`;
    ctx.fillText(subtitle, 384, 134, 700);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

export function createRangoliTexture(
  renderer: THREE.WebGLRenderer,
  primaryHex = '#ff9933',
  secondaryHex = '#e62e6b',
  tealHex = '#17a589'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 512, 512);
  const cx = 256;
  const cy = 256;

  // Outer scalloped petals
  const petals = 16;
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2;
    const px = cx + Math.cos(angle) * 195;
    const py = cy + Math.sin(angle) * 195;
    ctx.fillStyle = i % 2 === 0 ? primaryHex : secondaryHex;
    ctx.beginPath();
    ctx.arc(px, py, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(px, py, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Concentric festive rings
  const rings = [
    { r: 195, color: '#ffd27d' },
    { r: 175, color: tealHex },
    { r: 145, color: secondaryHex },
    { r: 112, color: primaryHex },
    { r: 78, color: '#5b1829' },
  ];
  for (const ring of rings) {
    ctx.fillStyle = ring.color;
    ctx.beginPath();
    ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lotus inner geometry
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = i % 2 === 0 ? '#ffd77a' : '#ff7597';
    ctx.beginPath();
    ctx.ellipse(90, 0, 38, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // White rangoli dot border
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    ctx.fillStyle = '#fff7e0';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * 160, cy + Math.sin(angle) * 160, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Center golden star
  ctx.fillStyle = '#ffe699';
  ctx.beginPath();
  ctx.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

export function createCanopyStripeTexture(
  renderer: THREE.WebGLRenderer,
  mainColor: string,
  stripeColor = '#fff1cf'
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const stripes = 8;
  const w = 256 / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? mainColor : stripeColor;
    ctx.fillRect(i * w, 0, w, 256);
  }

  // Bottom golden zari trim
  ctx.fillStyle = '#f2b749';
  ctx.fillRect(0, 232, 256, 24);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

export function createWoodPlankTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4a3221';
  ctx.fillRect(0, 0, 512, 256);

  for (let i = 0; i < 32; i++) {
    ctx.fillStyle = i % 3 === 0 ? '#5c3f2a' : i % 2 === 0 ? '#3e291b' : '#4f3624';
    const y = i * 8;
    ctx.fillRect(0, y, 512, 7);
    ctx.fillStyle = '#26180f';
    ctx.fillRect(0, y + 7, 512, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 2);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

export function createRadialGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 252, 235, 1)');
  grad.addColorStop(0.18, 'rgba(255, 210, 115, 0.85)');
  grad.addColorStop(0.45, 'rgba(255, 145, 45, 0.35)');
  grad.addColorStop(1, 'rgba(255, 110, 20, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(5, 8, 15, 0.65)');
  grad.addColorStop(0.55, 'rgba(5, 8, 15, 0.28)');
  grad.addColorStop(1, 'rgba(5, 8, 15, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  return new THREE.CanvasTexture(canvas);
}
