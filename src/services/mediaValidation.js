// Documents stay in private chats. Public social uploads keep their existing
// image/audio/video contract; HTML, scripts and unknown binary types are denied.
export function validateMediaFile(file, bucket, encryptionOverhead = 0) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0) throw new Error('Choose a non-empty file.');
  const mime = file.type || '';
  const video = mime.startsWith('video/'), audio = mime.startsWith('audio/'), image = mime.startsWith('image/');
  const document = bucket === 'konnekt-chat-media' && ['application/pdf', 'text/plain'].includes(mime);
  if (!video && !audio && !image && !document) throw new Error(bucket === 'konnekt-chat-media' ? 'Choose an image, video, audio, PDF or plain-text file.' : 'Choose an image, video or audio file.');
  const max = (video ? 45 : 15) * 1024 * 1024;
  if (file.size + encryptionOverhead > max) throw new Error(video ? 'Videos must be 45 MB or smaller on this free-tier setup.' : 'Images, audio and documents must be smaller than 15 MB.');
  return video ? 'video' : audio ? 'audio' : image ? 'image' : 'document';
}
