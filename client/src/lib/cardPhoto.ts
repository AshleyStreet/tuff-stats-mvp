const MAX_EDGE = 720;
const JPEG_QUALITY = 0.82;
const MAX_BYTES = 15 * 1024 * 1024;

export function readCardPhoto(file: File): Promise<string> {
  if (file.size > MAX_BYTES) {
    return Promise.reject(new Error("That photo is too large. Try one under 15 MB."));
  }
  const type = file.type.toLowerCase();
  if (type && !type.startsWith("image/")) {
    return Promise.reject(new Error("Choose a photo (JPEG, PNG, or WebP)."));
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        resolve(drawCardPhoto(img));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Couldn't process that photo."));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image. Try a JPEG or PNG."));
    };
    img.src = url;
  });
}

function drawCardPhoto(img: HTMLImageElement): string {
  const sourceW = img.naturalWidth || img.width;
  const sourceH = img.naturalHeight || img.height;
  if (!sourceW || !sourceH) throw new Error("Couldn't read that image.");

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceW, sourceH));
  const width = Math.max(1, Math.round(sourceW * scale));
  const height = Math.max(1, Math.round(sourceH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that photo.");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
