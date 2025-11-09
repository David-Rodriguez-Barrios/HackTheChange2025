import { useState, useRef, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export function WebcamConnection() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  const startWebcam = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsStreaming(true);
        
        const url = BACKEND_URL.replace('http://', 'ws://').replace('https://', 'wss://');
        const websocket = new WebSocket(`${url}/api/websocket/webcam`);
        wsRef.current = websocket;
        
        websocket.onopen = () => {
          console.log('WebSocket connected');
          startFrameCapture();
        };
        
        websocket.onerror = (err) => {
          console.error('WebSocket error:', err);
          setError('Failed to connect to server');
        };
        
        websocket.onclose = () => {
          console.log('WebSocket disconnected');
        };
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to access webcam');
      console.error('Error accessing webcam:', err);
    }
  };

  const startFrameCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ws = wsRef.current;
    
    if (!video || !canvas || !ws) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const captureFrame = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA && ws.readyState === WebSocket.OPEN) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob && ws.readyState === WebSocket.OPEN) {
            blob.arrayBuffer().then((buffer) => {
              ws.send(buffer);
            });
          }
        }, 'image/jpeg', 0.8);
      }
    };
    
    frameIntervalRef.current = window.setInterval(captureFrame, 33);
  };

  const stopWebcam = () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsStreaming(false);
  };

  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  return (
    <div style={{ 
      padding: '20px', 
      maxWidth: '800px', 
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    }}>
      
      {error && (
        <div style={{
          padding: '10px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: '5px',
          border: '1px solid #f5c6cb'
        }}>
          {error}
        </div>
      )}
      
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={isStreaming ? stopWebcam : startWebcam}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: isStreaming ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          {isStreaming ? 'Stop Webcam' : 'Start Webcam'}
        </button>
      </div>

      <div style={{
        width: '100%',
        backgroundColor: '#000',
        borderRadius: '8px',
        overflow: 'hidden',
        aspectRatio: '16/9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain'
          }}
        />
        <canvas
          ref={canvasRef}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}

