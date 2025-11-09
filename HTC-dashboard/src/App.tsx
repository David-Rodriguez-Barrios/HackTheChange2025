import './App.css'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import StreamPlayer from './components/StreamPlayer'
import { LandingPage } from './pages/LandingPage'
import { WebcamConnection } from './pages/WebcamConnection'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route 
                    path="/" 
                    element={
                        <div>
                            <h1>Hello World</h1>
                            <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
                                <h2>Webcam Stream</h2>
                                <StreamPlayer streamId="webcam" />
                            </div>
                            <StreamPlayer streamId="stream-1" />
                            <LandingPage />
                        </div>
                    } 
                />
                <Route 
                    path="/webcam" 
                    element={<WebcamConnection />} 
                />
            </Routes>
        </BrowserRouter>
    )
}

export default App
