cd backend
python3 -m venv venv
source venv/bin/activate 
pip install -r requirements.txt
uvicorn src.server:app --reload --port 3000


new terminal
cd HTC-dashboard
npm i
npm run dev

boom, you see the website at localhost:5173

api is at localhost:3000



do this to add the first stream: 

curl -X POST http://localhost:3000/api/streams \
  -H "Content-Type: application/json" \
  -d '{"url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"}'