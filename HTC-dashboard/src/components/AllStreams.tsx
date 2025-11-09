import { useEffect, useState } from "react";
import "./PriorityAlerts.css"; // reuse the same visual theme

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

interface Stream {
    id: string;
    url: string;
}

export function AllStreams() {
    const [streams, setStreams] = useState<Stream[]>([]);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);

    const videosPerPage = 4;
    const totalPages = Math.ceil(streams.length / videosPerPage);

    useEffect(() => {
        const fetchStreams = async () => {
            try {
                const response = await fetch(`${BACKEND_URL}/api/streams`);
                const data = await response.json();
                setStreams(data.streams || []);
            } catch (err) {
                console.error("Error fetching streams:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStreams();
        
        // Refresh streams every 30 seconds
        const interval = setInterval(fetchStreams, 30000);
        return () => clearInterval(interval);
    }, []);

    const currentStreams = streams.slice(
        page * videosPerPage,
        (page + 1) * videosPerPage
    );

    if (loading) {
        return (
            <div className="priority-alerts-panel">
                <div style={{ padding: "20px", textAlign: "center" }}>
                    Loading streams...
                </div>
            </div>
        );
    }

    return (
        <div className="priority-alerts-panel">
            <div className="priority-alerts-header">
                <div className="priority-alerts-stats">
                    <div className="stat-card stat-info">
                        <div className="count">{streams.length}</div>
                        <div className="label">Total Streams</div>
                    </div>
                    <div className="stat-card stat-warning">
                        <div className="count">{page + 1}</div>
                        <div className="label">Page</div>
                    </div>
                </div>
            </div>

            <div className="priority-alerts-scroll streams-layout">
                {streams.length === 0 ? (
                    <div className="streams-empty">
                        No streams available. Add videos to the backend/videos folder.
                    </div>
                ) : (
                    <div className="streams-grid">
                        {currentStreams.map((stream) => (
                            <div key={stream.id} className="stream-card">
                                <video
                                    src={`${BACKEND_URL}/api/stream?streamId=${stream.id}`}
                                    autoPlay
                                    loop
                                    muted
                                    playsInline
                                    className="stream-video"
                                />
                            </div>
                        ))}
                    </div>
                )}

                <div className="streams-pagination">
                    <button
                        disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}
                        className="stat-card stat-info"
                    >
                        Prev
                    </button>
                    <button
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                        className="stat-card stat-info"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
