import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

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

const frontendPath = path.join(__dirname, '..', '..', 'HTC-dashboard', 'dist');
app.use(express.static(frontendPath));


app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });



app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

