import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { StreamConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// keep cors happy
if (process.env.NODE_ENV !== 'production') {
        app.use(cors({
            origin: 'http://localhost:5173',
      credentials: true
    }));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const streams: Map<string, StreamConfig> = new Map();
let streamIdCounter = 1;


// Create a stream
app.post('/api/streams', (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required.' });
    }

    // We just increment the stream counter to get a "unique" id. 
    const streamId = `stream-${streamIdCounter++}`;
    const streamConfig: StreamConfig = {
      id: streamId,
      url,
    };

    streams.set(streamId, streamConfig);
    // status 201 created
    res.status(201).json({
      id: streamId,
      url,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
});

// get a stream by id
app.get('/api/streams/:streamId', (req, res) => {
  try {
    const { streamId } = req.params;
    const stream = streams.get(streamId);

    if (!stream) {
      return res.status(404).json({ error: 'Stream ID Not found' });
    }

    res.json({
      id: stream.id,
      url: stream.url,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
});

// We get the stream from the microservice and then send it to the client
app.get('/api/stream', async (req, res) => {
  try {
    const streamId = req.query.streamId as string;

    let externalUrl: string;

    if (!streamId) {
      return res.status(400).json({ error: 'Stream ID is required' });
    }

    const stream = streams.get(streamId);

    if (!stream) {
      return res.status(404).json({ error: 'Stream ID Not found' });
    }

    externalUrl = stream.url;

    // get the external stream from the microservice
    const response = await axios.get(externalUrl, {
      responseType: 'stream',
      timeout: 10000,
    });

    // set headers
    const contentType = response.headers['content-type'];
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // browser will try to cache and serve you the old stream
    // set headers to stop that
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // pipe the stream 
    response.data.pipe(res);

    // if stream hasn't started send error 
    // else end the stream
    response.data.on('error', (error: Error) => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error' });
      } else {
        res.end();
      }
    });

    // deal with client dropping
    req.on('close', () => {
      if (response.data.destroy) {
        response.data.destroy();
      }
    });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


const frontendPath = path.join(__dirname, '..', '..', 'HTC-dashboard', 'dist');
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });



app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

