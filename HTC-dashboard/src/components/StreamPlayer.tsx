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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const streamUrl = `${backendUrl}/api/stream?streamId=${streamId}`;

    video.src = streamUrl;
    video.load();
  }, [streamId, backendUrl]);

  return (
        <video
          ref={videoRef}
          controls
          autoPlay
          muted
          playsInline
        >
        </video>
  );
}

export default StreamPlayer;

