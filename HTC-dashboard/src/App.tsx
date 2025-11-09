import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { WebcamConnection } from './pages/WebcamConnection'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route
                    path="/"
                    element={<LandingPage />}
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
