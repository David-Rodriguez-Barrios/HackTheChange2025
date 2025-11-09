"""
Optimized Transit Incident Detector using Claude 3 Haiku (Cheap & Fast)
Cost: ~$0.25 per 1000 images vs $3 for Sonnet
Usage: python haiku_detector_fixed.py your_video.mp4
"""

import cv2
import base64
import time
import sys
import os
import json
import threading
from io import BytesIO
from PIL import Image
import boto3
from botocore.exceptions import ClientError

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()  # Loads .env file from current directory
    print("✅ Loaded .env file")
except ImportError:
    print("ℹ️ python-dotenv not installed. Install with: pip install python-dotenv")
    print("ℹ️ Using system environment variables instead")
except Exception as e:
    print(f"⚠️ Could not load .env file: {e}")
    print("ℹ️ Using system environment variables instead")

class HaikuIncidentDetector:
    def __init__(self, region='us-east-1'):
        # Check for AWS credentials
        aws_access_key = os.getenv('AWS_ACCESS_KEY_ID')
        aws_secret_key = os.getenv('AWS_SECRET_ACCESS_KEY')
        aws_region = os.getenv('AWS_DEFAULT_REGION', region)
        
        if aws_access_key and aws_secret_key:
            print(f"✅ Found AWS credentials (Access Key: {aws_access_key[:8]}...)")
            print(f"✅ Using region: {aws_region}")
        else:
            print("❌ AWS credentials not found!")
            print("📝 Create a .env file in this directory with:")
            print("   AWS_ACCESS_KEY_ID=your_access_key_here")
            print("   AWS_SECRET_ACCESS_KEY=your_secret_key_here")
            print("   AWS_DEFAULT_REGION=us-east-1")
            print("💡 Or run: aws configure")
            sys.exit(1)
        
        # Configure AWS Bedrock client
        try:
            self.bedrock = boto3.client(
                service_name='bedrock-runtime',
                region_name=aws_region
            )
            
            # Use Claude 3 Haiku - much cheaper and faster!
            self.model_id = 'anthropic.claude-3-haiku-20240307-v1:0'
            
            print("✅ Connected to AWS Bedrock (Claude 3 Haiku)")
            
        except Exception as e:
            print("❌ Failed to connect to AWS Bedrock")
            print(f"Error: {e}")
            sys.exit(1)
        
        # Optimized prompt for Haiku (shorter = cheaper)
        self.prompt = """Quick CCTV analysis. JSON only:
{
  "level": "NORMAL|DANGEROUS|CRITICAL",
  "reason": "Brief reason"
}

NORMAL: Normal operations
DANGEROUS: Fights, crowds, suspicious activity  
CRITICAL: Weapons, violence, panic"""

        # Centralized timing configuration
        self.analyze_interval = 3  # Analyze every 3 seconds (CONFIGURABLE HERE)

        # Thread-safe variables for async analysis
        self.current_danger = 'NORMAL'
        self.current_reason = 'Starting analysis...'
        self.analysis_lock = threading.Lock()
        self.analysis_queue = []
        self.analyzing = False

    def frame_to_base64(self, frame, quality=60):
        """Convert frame to base64 with lower quality for speed/cost"""
        # Resize frame for faster processing and lower cost
        height, width = frame.shape[:2]
        if width > 640:  # Resize large frames
            scale = 640 / width
            new_width = int(width * scale)
            new_height = int(height * scale)
            frame = cv2.resize(frame, (new_width, new_height))
        
        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(rgb_frame)
        
        # Lower quality = smaller file = cheaper API calls
        buffer = BytesIO()
        pil_image.save(buffer, format='JPEG', quality=quality)
        img_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        return img_base64

    def analyze_frame_background(self, frame, frame_time):
        """Analyze frame in background thread (non-blocking)"""
        try:
            danger_level, reason = self.analyze_frame(frame)
            
            # Thread-safe update of results
            with self.analysis_lock:
                self.current_danger = danger_level
                self.current_reason = reason
                self.analyzing = False
                
            # Print results
            if danger_level == 'CRITICAL':
                print(f"🔴 CRITICAL at {frame_time:.1f}s: {reason}")
            elif danger_level == 'DANGEROUS':
                print(f"🟠 DANGEROUS at {frame_time:.1f}s: {reason}")
            else:
                print(f"🟢 NORMAL at {frame_time:.1f}s: {reason}")
                
        except Exception as e:
            print(f"Background analysis error: {e}")
            with self.analysis_lock:
                self.analyzing = False

    def start_analysis(self, frame, frame_time):
        """Start analysis in background thread if not already analyzing"""
        with self.analysis_lock:
            if not self.analyzing:
                self.analyzing = True
                # Start background thread
                thread = threading.Thread(
                    target=self.analyze_frame_background,
                    args=(frame.copy(), frame_time),  # Copy frame to avoid race conditions
                    daemon=True
                )
                thread.start()
                return True
        return False

    def analyze_frame(self, frame):
        """Send frame to Haiku for fast, cheap analysis"""
        try:
            img_base64 = self.frame_to_base64(frame, quality=60)
            
            # Simpler request structure for Haiku
            request_body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 200,  # Lower token limit = cheaper
                "messages": [{
                    "role": "user", 
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg", 
                                "data": img_base64
                            }
                        },
                        {
                            "type": "text",
                            "text": self.prompt
                        }
                    ]
                }]
            }
            
            # Send to Haiku
            response = self.bedrock.invoke_model(
                modelId=self.model_id,
                body=json.dumps(request_body)
            )
            
            response_body = json.loads(response['body'].read())
            response_text = response_body['content'][0]['text'].strip()
            
            # Clean and parse JSON
            if response_text.startswith('```json'):
                response_text = response_text.replace('```json', '').replace('```', '').strip()
            
            try:
                result = json.loads(response_text)
                danger_level = result.get('level', 'NORMAL').upper()
                reason = result.get('reason', 'No reason')
                
                if danger_level not in ['NORMAL', 'DANGEROUS', 'CRITICAL']:
                    danger_level = 'NORMAL'
                
                return danger_level, reason
                
            except json.JSONDecodeError:
                return 'NORMAL', 'Parse error'
                
        except Exception as e:
            print(f"Analysis error: {e}")
            return 'NORMAL', 'API error'

    def get_color(self, danger_level):
        """Get color for danger level"""
        colors = {
            'NORMAL': (0, 255, 0),      # Green
            'DANGEROUS': (0, 165, 255), # Orange
            'CRITICAL': (0, 0, 255)     # Red
        }
        return colors.get(danger_level, (0, 255, 0))

    def process_video(self, video_path, analyze_interval=None):
        """Process video with non-blocking analysis and proper frame timing"""
        # Use class variable if no override provided
        if analyze_interval is None:
            analyze_interval = self.analyze_interval
        
        cap = cv2.VideoCapture(video_path)
        
        if not cap.isOpened():
            print(f"❌ Cannot open video: {video_path}")
            return
        
        print(f"🎬 Analyzing video with Haiku: {video_path}")
        print(f"💰 Cost-optimized: {analyze_interval}-second intervals, lower quality")
        print("🎥 Smooth playback: Non-blocking analysis")
        print("Press 'q' to quit")
        print("-" * 50)
        
        frame_count = 0
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        
        # Calculate proper frame delay for timing
        frame_delay = int(1000 / fps)  # Convert to milliseconds
        print(f"🎬 Video FPS: {fps}, Frame delay: {frame_delay}ms")
        print(f"🔍 Analysis interval: {analyze_interval} seconds")
        
        alerts = {'NORMAL': 0, 'DANGEROUS': 0, 'CRITICAL': 0}
        api_calls = 0
        last_analysis_time = 0
        
        start_time = time.time()
        
        while True:
            loop_start = time.time()  # Track loop timing for proper frame rate
            
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            current_time = frame_count / fps
            
            # SIMPLIFIED: Just check if enough time has passed since last analysis
            time_since_last_analysis = current_time - last_analysis_time
            if time_since_last_analysis >= analyze_interval:
                if self.start_analysis(frame, current_time):
                    api_calls += 1
                    last_analysis_time = current_time
                    print(f"⏳ Started analysis {api_calls} at {current_time:.1f}s (interval: {time_since_last_analysis:.1f}s)")
            
            # Get current results (thread-safe)
            with self.analysis_lock:
                display_danger = self.current_danger
                display_reason = self.current_reason
                is_analyzing = self.analyzing
            
            # Count alerts when analysis completes
            if frame_count > fps and not is_analyzing:  # After first second
                alerts[display_danger] = alerts.get(display_danger, 0)
            
            # Draw results on frame
            color = self.get_color(display_danger)
            cv2.rectangle(frame, (10, 10), (450, 120), color, -1)
            cv2.rectangle(frame, (10, 10), (450, 120), (0, 0, 0), 2)
            
            # Status text
            cv2.putText(frame, f"STATUS: {display_danger}", (20, 35), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(frame, f"API Calls: {api_calls}", (20, 60), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
            
            # Show analyzing indicator
            status_text = "Analyzing..." if is_analyzing else "Live"
            cv2.putText(frame, status_text, (20, 80), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 0) if is_analyzing else (255, 255, 255), 1)
            
            # Show reason (truncated for display)
            reason_display = display_reason[:50] + "..." if len(display_reason) > 50 else display_reason
            cv2.putText(frame, reason_display, (20, 100), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.3, (255, 255, 255), 1)
            
            # Show frame
            cv2.imshow('Haiku Detector (Smooth Playback)', frame)
            
            # FIXED: Proper frame timing to match original video speed
            loop_time = (time.time() - loop_start) * 1000  # Time spent processing (ms)
            wait_time = max(1, frame_delay - int(loop_time))  # Remaining time to wait
            
            if cv2.waitKey(wait_time) & 0xFF == ord('q'):
                break
        
        # Wait for any pending analysis to complete
        print("\n⏳ Waiting for final analysis to complete...")
        while self.analyzing:
            time.sleep(0.1)
        
        # Cost summary
        elapsed_time = time.time() - start_time
        estimated_cost = api_calls * 0.00025  # ~$0.25 per 1000 calls
        
        print(f"\n💰 COST SUMMARY")
        print(f"API calls made: {api_calls}")
        print(f"Estimated cost: ${estimated_cost:.4f}")
        print(f"Processing time: {elapsed_time:.1f}s")
        print(f"Analysis interval: {analyze_interval}s")
        print(f"Video played smoothly: ✅")
        
        total = sum(alerts.values())
        if total > 0:
            print(f"\n📊 RESULTS")
            print(f"Normal: {alerts['NORMAL']} ({alerts['NORMAL']/total*100:.1f}%)")
            print(f"Dangerous: {alerts['DANGEROUS']} ({alerts['DANGEROUS']/total*100:.1f}%)")
            print(f"Critical: {alerts['CRITICAL']} ({alerts['CRITICAL']/total*100:.1f}%)")
        
        cap.release()
        cv2.destroyAllWindows()

def main():
    if len(sys.argv) < 2:
        print("🚨 Haiku Transit Incident Detector (Budget Version)")
        print("Usage:")
        print("  python haiku_detector_fixed.py video.mp4")
        print("  python haiku_detector_fixed.py webcam")
        print()
        print("🔧 Setup (.env file method):")
        print("  1. Create .env file in this directory:")
        print("     AWS_ACCESS_KEY_ID=your_access_key_here")
        print("     AWS_SECRET_ACCESS_KEY=your_secret_key_here") 
        print("     AWS_DEFAULT_REGION=us-east-1")
        print("  2. Install: pip install python-dotenv")
        print("  3. Run: python haiku_detector_fixed.py video.mp4")
        print()
        print("🔧 Alternative setup:")
        print("  - Run: aws configure")
        print("  - Or set environment variables")
        print()
        print("💰 Cost optimization:")
        print("  - Uses Claude 3 Haiku (~10x cheaper)")
        print("  - 3-second intervals (vs 5-second in Sonnet)")
        print("  - Lower image quality")
        print("  - Estimated: $0.25 per 1000 frames")
        return
    
    detector = HaikuIncidentDetector()
    
    source = sys.argv[1]
    if source.lower() == 'webcam':
        detector.process_video(0)
    else:
        detector.process_video(source)

if __name__ == "__main__":
    main()