import cv2
import numpy as np
from ultralytics import YOLO
import time
from collections import deque
import argparse

class IncidentDetector:
    def __init__(self):
        # Load YOLOv8 model (will download automatically first time)
        print("Loading YOLO model...")
        self.model = YOLO('yolov8n.pt')  # nano version for speed
        
        # Danger scoring weights for different objects
        self.danger_weights = {
            'person': 1,           # Base weight for people
            'knife': 50,           # Weapons
            'scissors': 30,
            'bottle': 5,           # Potential weapons
            'backpack': 3,         # Unattended bags
            'handbag': 2,
            'suitcase': 4,
            'bicycle': 2,          # Vehicles in wrong areas
            'motorcycle': 8,
            'car': 10,
            'truck': 15
        }
        
        # Track detection history for temporal analysis
        self.detection_history = deque(maxlen=30)  # Last 30 frames
        self.person_count_history = deque(maxlen=60)  # Last 60 frames for crowd analysis
        
        # Danger thresholds
        self.thresholds = {
            'CRITICAL': 40,
            'DANGEROUS': 20,
            'NORMAL': 0
        }
        
        # Colors for visualization
        self.colors = {
            'CRITICAL': (0, 0, 255),    # Red
            'DANGEROUS': (0, 165, 255), # Orange
            'NORMAL': (0, 255, 0)       # Green
        }

    def calculate_danger_score(self, detections, frame_shape):
        """Calculate danger score based on current detections"""
        score = 0
        person_count = 0
        detected_objects = []
        
        for detection in detections:
            class_name = self.model.names[int(detection[5])]
            confidence = detection[4]
            
            # Only consider high-confidence detections
            if confidence > 0.5:
                detected_objects.append(class_name)
                
                if class_name == 'person':
                    person_count += 1
                
                # Add base score for detected objects
                if class_name in self.danger_weights:
                    score += self.danger_weights[class_name] * confidence
        
        # Crowd density analysis
        frame_area = frame_shape[0] * frame_shape[1]
        if person_count > 0:
            density = person_count / (frame_area / 100000)  # Normalize
            if density > 3:  # High density
                score += 20
            elif density > 1.5:  # Medium density
                score += 10
        
        # Temporal analysis - sudden changes in person count
        self.person_count_history.append(person_count)
        if len(self.person_count_history) > 10:
            recent_avg = np.mean(list(self.person_count_history)[-10:])
            older_avg = np.mean(list(self.person_count_history)[-20:-10]) if len(self.person_count_history) > 20 else recent_avg
            
            # Sudden increase in people (possible emergency gathering)
            if recent_avg > older_avg * 1.5:
                score += 15
            
            # Sudden decrease (people fleeing)
            elif recent_avg < older_avg * 0.5 and older_avg > 3:
                score += 25
        
        # Store current detection for history
        self.detection_history.append({
            'score': score,
            'person_count': person_count,
            'objects': detected_objects,
            'timestamp': time.time()
        })
        
        return score, person_count, detected_objects

    def classify_danger_level(self, score):
        """Classify danger level based on score"""
        if score >= self.thresholds['CRITICAL']:
            return 'CRITICAL'
        elif score >= self.thresholds['DANGEROUS']:
            return 'DANGEROUS'
        else:
            return 'NORMAL'

    def draw_results(self, frame, detections, danger_level, score, person_count, objects):
        """Draw bounding boxes and danger information on frame"""
        height, width = frame.shape[:2]
        
        # Draw bounding boxes
        for detection in detections:
            x1, y1, x2, y2, conf, class_id = detection
            if conf > 0.5:
                class_name = self.model.names[int(class_id)]
                
                # Color based on object danger level
                if class_name in ['knife', 'scissors']:
                    box_color = (0, 0, 255)  # Red for weapons
                elif class_name == 'person':
                    box_color = (255, 255, 0)  # Cyan for people
                else:
                    box_color = (255, 0, 255)  # Magenta for other objects
                
                # Draw bounding box
                cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), box_color, 2)
                
                # Draw label
                label = f"{class_name}: {conf:.2f}"
                cv2.putText(frame, label, (int(x1), int(y1)-10), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)
        
        # Draw danger level indicator
        danger_color = self.colors[danger_level]
        cv2.rectangle(frame, (10, 10), (300, 120), danger_color, -1)
        cv2.rectangle(frame, (10, 10), (300, 120), (0, 0, 0), 2)
        
        # Add text information
        cv2.putText(frame, f"Status: {danger_level}", (20, 35), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(frame, f"Danger Score: {score:.1f}", (20, 60), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, f"People Count: {person_count}", (20, 85), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.putText(frame, f"Objects: {len(set(objects))}", (20, 105), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        return frame

    def process_video(self, source=0):
        """Process video from file or webcam"""
        # Open video source
        if isinstance(source, str):
            cap = cv2.VideoCapture(source)
            print(f"Processing video file: {source}")
        else:
            cap = cv2.VideoCapture(source)
            print(f"Using webcam: {source}")
        
        if not cap.isOpened():
            print("Error: Could not open video source")
            return
        
        frame_count = 0
        alert_count = {'CRITICAL': 0, 'DANGEROUS': 0, 'NORMAL': 0}
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    if isinstance(source, str):  # Video file ended
                        print("Video processing completed")
                        break
                    else:  # Webcam error
                        print("Error reading from webcam")
                        break
                
                frame_count += 1
                
                # Process every 3rd frame for speed (adjust as needed)
                if frame_count % 3 == 0:
                    # Run YOLO detection
                    results = self.model(frame, verbose=False)
                    
                    # Extract detections
                    detections = []
                    if len(results[0].boxes) > 0:
                        boxes = results[0].boxes.xyxy.cpu().numpy()
                        confidences = results[0].boxes.conf.cpu().numpy()
                        class_ids = results[0].boxes.cls.cpu().numpy()
                        
                        detections = np.column_stack([boxes, confidences, class_ids])
                    
                    # Calculate danger score
                    score, person_count, objects = self.calculate_danger_score(detections, frame.shape)
                    danger_level = self.classify_danger_level(score)
                    
                    # Count alerts
                    alert_count[danger_level] += 1
                    
                    # Print alerts for dangerous situations
                    if danger_level != 'NORMAL':
                        print(f"ALERT: {danger_level} situation detected! Score: {score:.1f}")
                        if objects:
                            print(f"  Detected: {', '.join(set(objects))}")
                
                else:
                    # Use last calculated values for frames we skip
                    if hasattr(self, '_last_score'):
                        score = self._last_score
                        danger_level = self._last_danger_level
                        person_count = self._last_person_count
                        objects = self._last_objects
                        detections = []
                    else:
                        score, danger_level, person_count, objects = 0, 'NORMAL', 0, []
                        detections = []
                
                # Store for skipped frames
                self._last_score = score
                self._last_danger_level = danger_level
                self._last_person_count = person_count
                self._last_objects = objects
                
                # Draw results on frame
                frame = self.draw_results(frame, detections, danger_level, score, person_count, objects)
                
                # Display frame
                cv2.imshow('Transit CCTV Incident Detector', frame)
                
                # Break on 'q' key press
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
        
        except KeyboardInterrupt:
            print("\nStopping detection...")
        
        finally:
            # Print summary
            total_frames = sum(alert_count.values())
            if total_frames > 0:
                print(f"\n--- Detection Summary ---")
                print(f"Total frames processed: {total_frames}")
                print(f"Normal: {alert_count['NORMAL']} ({alert_count['NORMAL']/total_frames*100:.1f}%)")
                print(f"Dangerous: {alert_count['DANGEROUS']} ({alert_count['DANGEROUS']/total_frames*100:.1f}%)")
                print(f"Critical: {alert_count['CRITICAL']} ({alert_count['CRITICAL']/total_frames*100:.1f}%)")
            
            cap.release()
            cv2.destroyAllWindows()

def main():
    parser = argparse.ArgumentParser(description='Transit CCTV Incident Detector')
    parser.add_argument('--source', type=str, default='0', 
                       help='Video source: webcam number (0,1,2...) or path to video file')
    parser.add_argument('--demo', action='store_true', 
                       help='Run with webcam for demo')
    
    args = parser.parse_args()
    
    # Initialize detector
    detector = IncidentDetector()
    
    # Determine video source
    if args.demo or args.source == '0':
        source = 0  # Default webcam
    elif args.source.isdigit():
        source = int(args.source)  # Webcam number
    else:
        source = args.source  # Video file path
    
    print("Transit CCTV Incident Detector")
    print("Press 'q' to quit")
    print("-" * 40)
    
    # Start processing
    detector.process_video(source)

if __name__ == "__main__":
    main()