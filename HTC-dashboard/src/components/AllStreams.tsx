import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type SyntheticEvent,
} from "react";
import "./PriorityAlerts.css"; // reuse the same visual theme

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

interface Stream {
    id: string;
    url: string;
}

interface TimelineState {
    duration: number | null;
    currentTime: number;
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
});

export function AllStreams() {
    const [streams, setStreams] = useState<Stream[]>([]);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [timelineData, setTimelineData] = useState<Record<string, TimelineState>>({});
    const [liveNow, setLiveNow] = useState(() => Date.now());

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

        const interval = setInterval(fetchStreams, 3000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (page >= totalPages && totalPages > 0) {
            setPage(totalPages - 1);
        }
    }, [page, totalPages]);

    useEffect(() => {
        setTimelineData((prev) => {
            const allowedIds = new Set(streams.map((stream) => stream.id));
            const next: Record<string, TimelineState> = {};
            for (const id of allowedIds) {
                if (prev[id]) {
                    next[id] = prev[id];
                }
            }
            return next;
        });
    }, [streams]);

    useEffect(() => {
        const interval = setInterval(() => setLiveNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const updateTimeline = useCallback(
        (
            id: string,
            builder: (existing: TimelineState | undefined) => TimelineState | undefined
        ) => {
            setTimelineData((prev) => {
                const nextEntry = builder(prev[id]);
                if (!nextEntry) {
                    if (prev[id]) {
                        const { [id]: _, ...rest } = prev;
                        return rest;
                    }
                    return prev;
                }
                const prevEntry = prev[id];
                if (
                    prevEntry &&
                    prevEntry.duration === nextEntry.duration &&
                    prevEntry.currentTime === nextEntry.currentTime
                ) {
                    return prev;
                }
                return { ...prev, [id]: nextEntry };
            });
        },
        []
    );

    const handleLoadedMetadata = useCallback(
        (streamId: string) => (event: SyntheticEvent<HTMLVideoElement>) => {
            const video = event.currentTarget;
            const duration = Number.isFinite(video.duration) ? video.duration : null;
            updateTimeline(streamId, () => ({
                duration,
                currentTime: video.currentTime,
            }));
        },
        [updateTimeline]
    );

    const handleTimeUpdate = useCallback(
        (streamId: string) => (event: SyntheticEvent<HTMLVideoElement>) => {
            const video = event.currentTarget;
            const duration = Number.isFinite(video.duration) ? video.duration : null;
            updateTimeline(streamId, () => ({
                duration,
                currentTime: video.currentTime,
            }));
        },
        [updateTimeline]
    );

    const currentStreams = useMemo(() => {
        const start = page * videosPerPage;
        return streams.slice(start, start + videosPerPage);
    }, [page, streams, videosPerPage]);

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
                        <div className="count">{streams.length === 0 ? 0 : page + 1}</div>
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
                        {currentStreams.map((stream) => {
                            const isLive = stream.id === "webcam";
                            const timeline = timelineData[stream.id];
                            return (
                                <div key={stream.id} className="stream-card">
                                    <div className="stream-media">
                                        {isLive ? (
                                            <img
                                                src={`${BACKEND_URL}/api/stream?streamId=${stream.id}&_=${Date.now()}`}
                                                className="stream-media-visual"
                                                alt="Live webcam stream"
                                            />
                                        ) : (
                                            <video
                                                src={`${BACKEND_URL}/api/stream?streamId=${stream.id}`}
                                                autoPlay
                                                loop
                                                muted
                                                playsInline
                                                className="stream-media-visual"
                                                controls={false}
                                                onLoadedMetadata={handleLoadedMetadata(stream.id)}
                                                onTimeUpdate={handleTimeUpdate(stream.id)}
                                            />
                                        )}
                                    </div>
                                    <StreamTimeline
                                        timeline={timeline}
                                        isLive={isLive}
                                        liveNow={liveNow}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="streams-pagination">
                    <button
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        className="stat-card stat-info"
                    >
                        Prev
                    </button>
                    <button
                        disabled={streams.length === 0 || page >= totalPages - 1}
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

interface StreamTimelineProps {
    timeline?: TimelineState;
    isLive: boolean;
    liveNow: number;
}

function StreamTimeline({ timeline, isLive, liveNow }: StreamTimelineProps) {
    const computedTimeline = useMemo(() => {
        if (!timeline || !timeline.duration || timeline.duration <= 0) {
            return null;
        }

        const durationMs = timeline.duration * 1000;
        const progress = Math.min(
            100,
            Math.max(0, (timeline.currentTime / timeline.duration) * 100)
        );
        const startTimestamp = liveNow - durationMs;
        const currentTimestamp = startTimestamp + timeline.currentTime * 1000;

        return {
            startTimestamp,
            currentTimestamp,
            endTimestamp: liveNow,
            progress,
        };
    }, [timeline?.currentTime, timeline?.duration, liveNow]);

    if (isLive) {
        return (
            <div className="stream-timeline stream-timeline-live">
                <div className="stream-timeline-labels">
                    <span className="stream-live-badge">Live</span>
                    <span>{formatLocalTime(liveNow)}</span>
                </div>
                <div className="stream-timeline-track">
                    <div className="stream-timeline-progress stream-timeline-progress-live" />
                </div>
            </div>
        );
    }

    if (!computedTimeline) {
        return (
            <div className="stream-timeline stream-timeline-loading">
                <span>Timeline unavailable</span>
            </div>
        );
    }

    const { startTimestamp, currentTimestamp, endTimestamp, progress } =
        computedTimeline;

    return (
        <div className="stream-timeline">
            <div className="stream-timeline-labels">
                <span>{formatLocalTime(startTimestamp)}</span>
                <span className="stream-timeline-current">
                    {formatLocalTime(currentTimestamp)}
                </span>
                <span>{formatLocalTime(endTimestamp)}</span>
            </div>
            <div className="stream-timeline-track">
                <div
                    className="stream-timeline-progress"
                    style={{ width: `${progress}%` }}
                />
                <div
                    className="stream-timeline-marker"
                    style={{ left: `${progress}%` }}
                />
            </div>
        </div>
    );
}

function formatLocalTime(timestamp: number | undefined | null) {
    if (!timestamp || Number.isNaN(timestamp)) {
        return "--:--:--";
    }
    return timeFormatter.format(new Date(timestamp));
}
