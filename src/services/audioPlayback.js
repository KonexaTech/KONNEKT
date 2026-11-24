let current = null;
export function claimAudioPlayback(audio) {
  if (current && current !== audio) current.pause();
  current = audio;
}
export function releaseAudioPlayback(audio) {
  if (current === audio) current = null;
}
