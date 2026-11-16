# Browser media fixture

`social-video.webm` is a generated one-second, 160×120 solid-purple VP8/WebM video with no audio or user data. WebM permits the headless Chromium playback checks to run without proprietary codec support. It does not establish MP4/device compatibility.

Reproduction (FFmpeg with libvpx):

```sh
ffmpeg -f lavfi -i color=c=purple:s=160x120:d=1 -an -c:v libvpx -pix_fmt yuv420p social-video.webm
```
