import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { getStreamById, createStream } from './db-queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// keep cors happy
if (process.env.NODE_ENV !== 'production') {
        app.use(cors({
            origin: process.env.FRONTEND_URL,
            credentials: true
    }));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Create a stream
app.post('/api/streams', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required.' });
    }
    
    const streamConfig = await createStream(url);
    
    // status 201 created
    res.status(201).json({
      id: streamConfig.id,
      url: streamConfig.url,
    });
  } catch (error) {
    console.error('Error creating stream:', error);
    res.status(500).json({ error: 'Error creating stream' });
  }
});

// get a stream by id
app.get('/api/streams/:streamId', async (req, res) => {
  try {
    const { streamId } = req.params;
    const stream = await getStreamById(streamId);

    if (!stream) {
      return res.status(404).json({ error: 'Stream ID Not found' });
    }

    res.json({
      id: stream.id,
      url: stream.url,
    });
  } catch (error) {
    console.error('Error getting stream:', error);
    res.status(500).json({ error: 'Error retrieving stream' });
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

    const stream = await getStreamById(streamId);

    if (!stream) {
      return res.status(404).json({ error: 'Stream ID Not found' });
    }

    externalUrl = stream.url;

    // get the external stream from the microservice
    const response = await axios.get(externalUrl, {
      responseType: 'stream',
      timeout: 10000,
      validateStatus: () => true, // Don't throw on any status
    });

    // Check if the external request failed
    if (response.status < 200 || response.status >= 300) {
      return res.status(502).json({ error: `Failed to fetch stream from external source: ${response.status}` });
    }

    // Set CORS headers first 
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Set content type from external response
    const contentType = response.headers['content-type'];
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    } else {
      res.setHeader('Content-Type', 'video/mp4');
    }

    // browser will try to cache and serve you the old stream
    // set headers to stop that
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Set status code before piping
    res.status(200);

    // pipe the stream 
    response.data.pipe(res);

    // Handle stream errors
    response.data.on('error', (error: Error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error occurred' });
      } else {
        res.end();
      }
    });

    // Handle response errors
    response.data.on('end', () => {
      if (!res.writableEnded) {
        res.end();
      }
    });

    // deal with client dropping connection
    req.on('close', () => {
      if (response.data && !response.data.destroyed) {
        response.data.destroy();
      }
    });

    // Handle request abort
    req.on('aborted', () => {
      if (response.data && !response.data.destroyed) {
        response.data.destroy();
      }
    });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// OPTIONS handler for CORS preflight
app.options('/api/stream', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

const frontendPath = path.join(__dirname, '..', '..', 'HTC-dashboard', 'dist');
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });



app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

