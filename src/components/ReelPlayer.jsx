import React, { useEffect, useRef } from 'react';

export default function ReelPlayer({ active, ...props }) {
  const videoRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    let resume = false;
    const visible = () => document.visibilityState !== 'hidden';
    const play = () => {
      // Autoplay can be denied by browser/OS policy. Native controls stay usable.
      const attempt = video.play();
      attempt?.then(() => {
        if (videoRef.current !== video || !video.isConnected || !activeRef.current || !visible()) video.pause();
      }).catch(() => {});
    };
    const visibility = () => {
      if (!visible()) {
        resume = active && !video.paused;
        video.pause();
      } else if (active && resume) {
        resume = false;
        play();
      }
    };
    if (active && visible()) play();
    else video.pause();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      video.pause();
    };
  }, [active, props.src]);

  return <video {...props} ref={videoRef} autoPlay={active && document.visibilityState !== 'hidden'} />;
}
