import { useEffect, useRef } from 'react';


interface StreamPlayerProps {
  streamId?: string;
  backendUrl?: string;
}

function StreamPlayer({ 
  streamId = 'stream-1', 
  backendUrl = import.meta.env.VITE_BACKEND_URL
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isWebcam = streamId === 'webcam';

  useEffect(() => {
    if (isWebcam) {
      const img = imgRef.current;
      if (!img) return;

      const streamUrl = `${backendUrl}/api/stream?streamId=${streamId}`;
      img.src = streamUrl;
    } else {
      const video = videoRef.current;
      if (!video) return;

      const streamUrl = `${backendUrl}/api/stream?streamId=${streamId}`;
      video.src = streamUrl;
      video.load();
    }
  }, [streamId, backendUrl, isWebcam]);

  if (isWebcam) {
    return (
      <img
        ref={imgRef}
        style={{
          width: '100%',
          height: 'auto',
          maxHeight: '600px',
          objectFit: 'contain'
        }}
      />
    );
  }

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      muted
      playsInline
      style={{
        width: '100%',
        height: 'auto',
        maxHeight: '600px'
      }}
    >
    </video>
  );
}

export default StreamPlayer;

