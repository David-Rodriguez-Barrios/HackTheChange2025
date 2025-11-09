import { useEffect, useState } from "react";
import "./PriorityAlerts.css"; // reuse the same visual theme

export function AllStreams() {
    const [videos, _] = useState([
        "/videos/stream1.mp4",
        "/videos/stream2.mp4",
        "/videos/stream3.mp4",
        "/videos/stream4.mp4",
        "/videos/stream5.mp4",
        "/videos/stream6.mp4",
        "/videos/stream7.mp4",
        "/videos/stream8.mp4",
    ]);
    const [page, setPage] = useState(0);

    const videosPerPage = 4;
    const totalPages = Math.ceil(videos.length / videosPerPage);

    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                await Promise.allSettled(
                    videos.map(async (_: string) => {
                        // TO DO: Add endpoint with the jpeg snapshot of the current one
                        // Example: await fetch(`/api/video/update?path=${encodeURIComponent(v)}`)
                    })
                );
            } catch (err) {
                console.error("Error fetching stream updates:", err);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [videos]);

    const currentVideos = videos.slice(
        page * videosPerPage,
        (page + 1) * videosPerPage
    );

    return (
        <div className="priority-alerts-panel">
            <div className="priority-alerts-header">
                <h2>Live Streams</h2>
                <div className="priority-alerts-stats">
                    <div className="stat-card stat-info">
                        <div className="count">{videos.length}</div>
                        <div className="label">Total Streams</div>
                    </div>
                    <div className="stat-card stat-warning">
                        <div className="count">{page + 1}</div>
                        <div className="label">Page</div>
                    </div>
                </div>
            </div>

            <div className="priority-alerts-scroll">
                <div
                    className="grid"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        padding: "8px",
                    }}
                >
                    {currentVideos.map((src, idx) => (
                        <div
                            key={idx}
                            style={{
                                background: "rgba(40,40,55,0.5)",
                                border: "1px solid #2a2a3f",
                                borderRadius: "10px",
                                overflow: "hidden",
                                position: "relative",
                            }}
                        >
                            <video
                                src={src}
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="w-full h-64 object-cover"
                            />
                        </div>
                    ))}
                </div>

                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: "8px",
                    }}
                >
                    <button
                        disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}
                        className="stat-card stat-info"
                        style={{ flex: "0 0 48%" }}
                    >
                        Prev
                    </button>
                    <button
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                        className="stat-card stat-info"
                        style={{ flex: "0 0 48%" }}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
