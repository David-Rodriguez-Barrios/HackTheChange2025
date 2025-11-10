# 🛡️ Aegis — AI-Powered Transit Monitoring

Aegis is an **AI-powered transit monitoring app** that enhances public safety by giving operators **real-time situational awareness**. It analyzes multiple live camera feeds, evaluates potential threats, and prioritizes the most critical streams so operators can respond faster and more confidently.

**Key Features:**

- **Real-time threat detection:** AI evaluates multiple camera feeds simultaneously.  
- **Prioritized alerts:** Highlights high-risk streams to optimize operator response.  
- **Explainable AI:** Provides clear reasoning behind flagged feeds.  
- **Responsive dashboard:** Shows live feeds with actionable insights for operators.  

**Why We Built It:**

Public transit safety is often reactive, with many incidents going unreported or addressed too slowly. Existing systems suffer from operator fatigue and inconsistent monitoring. Aegis closes this gap by providing an intelligent, operator-friendly system that **enhances awareness without replacing human decision-making**.

**Technology Stack:**

- **Frontend:** Vite + React  
- **Backend:** FastAPI  
- **Streaming:** WebSockets  
- **AI Processing:** AWS Bedrock  

**Impact:**

Aegis demonstrates how AI can **improve transit safety**, detect anomalies in real time, and help operators respond faster to critical incidents.

# 🎬 Demo

[![Watch the Demo](https://img.youtube.com/vi/hOqCZ52hX-s/0.jpg)](https://youtu.be/hOqCZ52hX-s)

[🌐 DevPost Project Page](https://devpost.com/software/aegis-g9wjkd?ref_content=user-portfolio&ref_feature=in_progress)

---
# 🚀 How to Run

Set up both the backend and dashboard to get the app running locally.

## 🧠 Backend Setup


Prereq install ffmpeg:

Unix based OS (homebrew/linuxbrew):
```
brew install ffmpeg
```
Windows (Chocolatey):
```
choco install ffmpeg
```
Navigate to the backend directory:

```
cd backend
```


Create and activate a virtual environment:

```
python3 -m venv venv
# Unix based OS
source venv/bin/activate
# Windows
venv\Scripts\activate
```


Install dependencies:

```
pip install -r requirements.txt
```


Start the backend server:

```
uvicorn src.server:app --reload --port 3000
```


➡️ The API will be available at [localhost:3000](http://localhost:3000)

## 💻 Dashboard Setup

Open a new terminal window.

Navigate to the dashboard directory:
```
cd HTC-dashboard
```

Install dependencies and start the development server:
```
npm install
npm run dev
```

➡️ The dashboard will be available at [localhost:5173](http://localhost:5173)

## 🎥 Live Stream

To stream from another web client please go to:
`http://localhost:5173/webcam` and start broadcasting the footage. Other clients will be able to view this footage live along with object and action detection from the footage. 


## 🎥 Past Videos 

To view old footage videos and analyze them in real-time please download the videos to the following directory: `/backend/videos`.

Example
```
/backend/videos/UnionStation.mp4
```
