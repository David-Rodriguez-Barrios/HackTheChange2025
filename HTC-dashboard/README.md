# 🚀 How to Run

Set up both the backend and dashboard to get the app running locally.

## 🧠 Backend Setup

Navigate to the backend directory:

```
cd backend
```


Create and activate a virtual environment:

```
python3 -m venv venv
source venv/bin/activate
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

## 🎥 Add Your First Stream

Once both servers are running, add a video stream with:
```
curl -X POST http://localhost:3000/api/streams \
  -H "Content-Type: application/json" \
  -d '{"url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"}'
```

Open [localhost:5173](http://localhost:5173)
 — your video stream should now appear on the dashboard!