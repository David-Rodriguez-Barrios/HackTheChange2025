"""
Optimized Transit Incident Detector using Claude 3 Haiku (Cheap & Fast)
Cost: ~$0.25 per 1000 images vs $3 for Sonnet
Usage: python haiku_detector.py your_video.mp4
"""

import cv2
import base64
import time
import sys
import os
import json
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
  "reason": "Brief reason",
}

NORMAL: Normal operations
DANGEROUS: Fights, crowds, suspicious activity  
CRITICAL: Weapons, violence, panic"""

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
        colors = {
            'NORMAL': (0, 255, 0),      # Green
            'DANGEROUS': (0, 165, 255), # Orange
            'CRITICAL': (0, 0, 255)     # Red
        }
        return colors.get(danger_level, (0, 255, 0))

    def process_video(self, video_path, analyze_interval=3):
        """Process video with optimized intervals for cost savings"""
        cap = cv2.VideoCapture(video_path)
        
        if not cap.isOpened():
            print(f"❌ Cannot open video: {video_path}")
            return
        
        print(f"🎬 Analyzing video with Haiku: {video_path}")
        print("💰 Cost-optimized: 7-second intervals, lower quality")
        print("Press 'q' to quit")
        print("-" * 50)
        
        frame_count = 0
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        analyze_every = int(fps * analyze_interval)  # Every 7 seconds
        
        current_danger = 'NORMAL'
        current_reason = 'Starting...'
        alerts = {'NORMAL': 0, 'DANGEROUS': 0, 'CRITICAL': 0}
        api_calls = 0
        
        start_time = time.time()
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            
            # Analyze less frequently to save money
            if frame_count % analyze_every == 0:
                api_calls += 1
                print(f"⏳ Analyzing frame {api_calls} at {frame_count/fps:.1f}s...")
                
                current_danger, current_reason = self.analyze_frame(frame)
                alerts[current_danger] += 1
                
                # Print results
                if current_danger == 'CRITICAL':
                    print(f"🔴 CRITICAL: {current_reason}")
                elif current_danger == 'DANGEROUS':
                    print(f"🟠 DANGEROUS: {current_reason}")
                else:
                    print(f"🟢 NORMAL: {current_reason}")
            
            # Simple display
            color = self.get_color(current_danger)
            cv2.rectangle(frame, (10, 10), (400, 80), color, -1)
            cv2.rectangle(frame, (10, 10), (400, 80), (0, 0, 0), 2)
            
            cv2.putText(frame, f"STATUS: {current_danger}", (20, 35), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(frame, f"API Calls: {api_calls}", (20, 60), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
            
            cv2.imshow('Haiku Detector (Cost Optimized)', frame)
            
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
        
        # Cost summary
        elapsed_time = time.time() - start_time
        estimated_cost = api_calls * 0.00025  # ~$0.25 per 1000 calls
        
        print(f"\n💰 COST SUMMARY")
        print(f"API calls made: {api_calls}")
        print(f"Estimated cost: ${estimated_cost:.4f}")
        print(f"Processing time: {elapsed_time:.1f}s")
        
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
        print("  python haiku_detector.py video.mp4")
        print("  python haiku_detector.py webcam")
        print()
        print("🔧 Setup (.env file method):")
        print("  1. Create .env file in this directory:")
        print("     AWS_ACCESS_KEY_ID=your_access_key_here")
        print("     AWS_SECRET_ACCESS_KEY=your_secret_key_here") 
        print("     AWS_DEFAULT_REGION=us-east-1")
        print("  2. Install: pip install python-dotenv")
        print("  3. Run: python haiku_detector.py video.mp4")
        print()
        print("🔧 Alternative setup:")
        print("  - Run: aws configure")
        print("  - Or set environment variables")
        print()
        print("💰 Cost optimization:")
        print("  - Uses Claude 3 Haiku (~10x cheaper)")
        print("  - 7-second intervals (vs 3-second)")
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