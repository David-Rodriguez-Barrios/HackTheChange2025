import { useEffect, useRef, useState } from 'react';


interface StreamPlayerProps {
  streamId?: string;
  backendUrl?: string;
}

function StreamPlayer({ 
  streamId, 
  backendUrl = import.meta.env.VITE_BACKEND_URL
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [error, setError] = useState<string | null>(null);
  const isWebcam = streamId === 'webcam';

  useEffect(() => {
    if (!streamId) {
      setError('Stream ID is required');
      return;
    }
    
    setError(null);
    
    if (isWebcam) {
      const img = imgRef.current;
      if (!img) return;

      const streamUrl = `${backendUrl}/api/stream?streamId=${streamId}`;
      img.onerror = () => {
        setError('Failed to load webcam stream');
      };
      img.src = streamUrl;
    } else {
      const video = videoRef.current;
      if (!video) return;

      const streamUrl = `${backendUrl}/api/stream?streamId=${streamId}`;
      
      const handleError = () => {
        setError(`Failed to load stream: ${streamId}`);
      };
      
      const handleLoadStart = () => {
        setError(null);
      };
      
      video.addEventListener('error', handleError);
      video.addEventListener('loadstart', handleLoadStart);
      video.src = streamUrl;
      video.load();
      
      return () => {
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadstart', handleLoadStart);
      };
    }
  }, [streamId, backendUrl, isWebcam]);

  if (error) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: '#dc3545',
        backgroundColor: '#f8d7da',
        borderRadius: '8px',
        border: '1px solid #f5c6cb'
      }}>
        <p>{error}</p>
        {streamId !== 'webcam' && (
          <p style={{ fontSize: '0.9em', marginTop: '10px', color: '#721c24' }}>
            Stream ID must be numeric or 'webcam'
          </p>
        )}
      </div>
    );
  }

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

