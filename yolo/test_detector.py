"""
Simple video tester for incident detector
Just run: python test_detector.py path/to/your/video.mp4
"""

import sys
import os
from incident_detector import IncidentDetector

def test_video(video_path):
    """Test incident detector on a specific video file"""
    
    if not os.path.exists(video_path):
        print(f"❌ Video file not found: {video_path}")
        return
    
    print(f"🎬 Testing video: {video_path}")
    print("Press 'q' to quit, 's' to skip to next test")
    print("-" * 50)
    
    # Initialize detector
    detector = IncidentDetector()
    
    # Process the video
    detector.process_video(video_path)
    
    print(f"✅ Finished testing: {video_path}")

def test_multiple_videos(video_directory):
    """Test all videos in a directory"""
    
    video_extensions = ['.mp4', '.avi', '.mov', '.mkv', '.wmv']
    video_files = []
    
    for file in os.listdir(video_directory):
        if any(file.lower().endswith(ext) for ext in video_extensions):
            video_files.append(os.path.join(video_directory, file))
    
    if not video_files:
        print(f"❌ No video files found in: {video_directory}")
        return
    
    print(f"📁 Found {len(video_files)} videos in {video_directory}")
    
    for i, video_path in enumerate(video_files, 1):
        print(f"\n🎬 Testing video {i}/{len(video_files)}: {os.path.basename(video_path)}")
        test_video(video_path)
        
        if i < len(video_files):
            choice = input("\nContinue to next video? (y/n): ").lower()
            if choice != 'y':
                break

def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  Test single video: python test_detector.py video.mp4")
        print("  Test directory:    python test_detector.py /path/to/videos/")
        print("  Use webcam:        python test_detector.py webcam")
        return
    
    path = sys.argv[1]
    
    if path.lower() == 'webcam':
        print("🎥 Testing with webcam...")
        detector = IncidentDetector()
        detector.process_video(0)
    elif os.path.isfile(path):
        test_video(path)
    elif os.path.isdir(path):
        test_multiple_videos(path)
    else:
        print(f"❌ Path not found: {path}")

if __name__ == "__main__":
    main()