// Pravidlá pre nahrávanie hero videa a posteru v administrácii.
// Formáty a rozmery sú tie isté, aké používa backend (backend/src/lib/media/video-rules.ts).
export const HERO_VIDEO_TYPES = ['video/mp4', 'video/webm'];
export const HERO_POSTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const HERO_VIDEO_VARIANTS = [
  { label: '1080p', width: 1920, height: 1080 },
  { label: '720p', width: 1280, height: 720 },
  { label: '480p', width: 854, height: 480 },
];
export const HERO_VIDEO_MAX_SIZE = 25 * 1024 * 1024;
export const HERO_POSTER_MAX_SIZE = 5 * 1024 * 1024;

/** Rozmery videa z prehrávača (null, ak sa nepodarilo zistiť). */
export const videoSize = (file) => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.onloadedmetadata = () => {
    const size = { width: video.videoWidth, height: video.videoHeight };
    URL.revokeObjectURL(url);
    resolve(size);
  };
  video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
  video.src = url;
});

/** Prehľadná hláška, ak súbor nespĺňa pravidlá; inak null. */
export const checkHeroVideo = async (file) => {
  const name = file.name || 'súbor';
  if (!HERO_VIDEO_TYPES.includes(file.type)) {
    return `Video musí byť MP4 alebo WEBM, „${name}“ má typ ${file.type || 'neznámy'}.`;
  }
  if (file.size > HERO_VIDEO_MAX_SIZE) {
    return `Video je príliš veľké (maximálne ${Math.round(HERO_VIDEO_MAX_SIZE / 1024 / 1024)} MB), „${name}“ má ${Math.round(file.size / 1024 / 1024)} MB.`;
  }
  const size = await videoSize(file);
  if (!size) return `Video sa nepodarilo prečítať (neplatný súbor „${name}“).`;
  const variant = HERO_VIDEO_VARIANTS.find(v => v.width === size.width && v.height === size.height);
  if (!variant) {
    const allowed = HERO_VIDEO_VARIANTS.map(v => `${v.label} (${v.width}×${v.height})`).join(', ');
    return `Video má rozmery ${size.width}×${size.height}. Podporované sú: ${allowed}.`;
  }
  return null;
};

/** Prehľadná hláška pre poster; inak null. */
export const checkHeroPoster = (file) => {
  const name = file.name || 'súbor';
  if (!HERO_POSTER_TYPES.includes(file.type)) {
    return `Poster musí byť obrázok (${HERO_POSTER_TYPES.join(', ')}), „${name}“ má typ ${file.type || 'neznámy'}.`;
  }
  if (file.size > HERO_POSTER_MAX_SIZE) {
    return `Poster je príliš veľký (maximálne ${Math.round(HERO_POSTER_MAX_SIZE / 1024 / 1024)} MB), „${name}“ má ${Math.round(file.size / 1024 / 1024)} MB.`;
  }
  return null;
};
