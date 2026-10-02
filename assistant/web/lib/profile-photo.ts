/** Store only resized pixels, with no original photo metadata. */
export async function prepareProfilePhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, WebP or GIF photo.");
  }
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose a profile photo smaller than 5 MB.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("This photo couldn't be opened. Try another image."); }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser couldn't prepare the photo.");
    const side = Math.min(bitmap.width, bitmap.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 256, 256);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally { bitmap.close(); }
}

export function isProfilePhoto(value: unknown): value is string {
  return typeof value === "string" && value.length < 200_000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value);
}
