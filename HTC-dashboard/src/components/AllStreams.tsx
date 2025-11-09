import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type SyntheticEvent,
} from "react";
import Hls, { type ErrorData } from "hls.js";
import "./PriorityAlerts.css"; // reuse the same visual theme
import { useAlerts } from "../contexts/AlertsContext";
import type { PriorityAlert } from "../types/sharedTypes";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
const ALERT_SEEK_PADDING_SECONDS = 5;

interface Stream {
    id: string;
    url: string;
    format?: "file" | "hls";
    live?: boolean;
    playlist?: string | null;
}

interface TimelineState {
    duration: number | null;
    currentTime: number;
    atLiveEdge?: boolean;
    originTimestamp?: number;
    staticOrigin?: boolean;
    seekableStart?: number;
    seekableEnd?: number;
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
});

function extractTimelineState(video: HTMLVideoElement): TimelineState {
    let duration = Number.isFinite(video.duration) ? video.duration : null;
    let currentTime = video.currentTime;
    let atLiveEdge = false;
    let seekableStart: number | undefined;
    let seekableEnd: number | undefined;

    if (video.seekable && video.seekable.length > 0) {
        const lastIndex = video.seekable.length - 1;
        const rangeStart = video.seekable.start(0);
        const rangeEnd = video.seekable.end(lastIndex);

        if (Number.isFinite(rangeStart) && Number.isFinite(rangeEnd)) {
            const normalizedDuration = rangeEnd - rangeStart;
            if (normalizedDuration > 0) {
                duration = normalizedDuration;
                currentTime = Math.min(
                    Math.max(video.currentTime - rangeStart, 0),
                    normalizedDuration
                );
                const distanceToLive = rangeEnd - video.currentTime;
                atLiveEdge = Number.isFinite(distanceToLive)
                    ? distanceToLive <= 1.5
                    : false;
                seekableStart = rangeStart;
                seekableEnd = rangeEnd;
            }
        }
    } else if (duration !== null) {
        atLiveEdge = duration - currentTime <= 1.5;
        seekableStart = 0;
        seekableEnd = duration;
    }

    return {
        duration,
        currentTime,
        atLiveEdge,
        seekableStart,
        seekableEnd,
    };
}

export function AllStreams() {
    const { priorityAlerts, selectedAlert } = useAlerts();
    const [streams, setStreams] = useState<Stream[]>([]);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [timelineData, setTimelineData] = useState<Record<string, TimelineState>>({});
    const [liveNow, setLiveNow] = useState(() => Date.now());
    const [highlightedStreamId, setHighlightedStreamId] = useState<string | null>(null);
    const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
    const lastHandledSelectionRef = useRef<number | null>(null);
    const liveNowRef = useRef(liveNow);

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
        const allowedIds = new Set(streams.map((stream) => stream.id));
        for (const id of Object.keys(videoRefs.current)) {
            if (!allowedIds.has(id)) {
                delete videoRefs.current[id];
            }
        }
    }, [streams]);

    useEffect(() => {
        const interval = setInterval(() => setLiveNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!selectedAlert) {
            setHighlightedStreamId(null);
            lastHandledSelectionRef.current = null;
        }
    }, [selectedAlert]);

    useEffect(() => {
        liveNowRef.current = liveNow;
    }, [liveNow]);

    const attemptSeek = useCallback(
        (alert: PriorityAlert) => {
            const streamId = resolveStreamIdFromAlert(alert, streams);
            if (!streamId) {
                return { success: false as const };
            }

            const streamIndex = streams.findIndex((stream) => stream.id === streamId);
            if (streamIndex === -1) {
                return { success: false as const };
            }

            const targetPage = Math.floor(streamIndex / videosPerPage);
            if (targetPage !== page) {
                setPage(targetPage);
                return { success: false as const, streamId };
            }

            const video = videoRefs.current[streamId];
            const timeline = timelineData[streamId];
            if (!video || !timeline) {
                return { success: false as const, streamId };
            }

            if (!alert.time) {
                return { success: false as const, streamId };
            }

            const duration =
                timeline.duration ??
                (typeof timeline.seekableStart === "number" &&
                typeof timeline.seekableEnd === "number"
                    ? timeline.seekableEnd - timeline.seekableStart
                    : Number.isFinite(video.duration)
                    ? video.duration
                    : null);

            if (!duration || !Number.isFinite(duration) || duration <= 0) {
                return { success: false as const, streamId };
            }

            let startTimestamp: number;
            if (timeline.staticOrigin && typeof timeline.originTimestamp === "number") {
                startTimestamp = timeline.originTimestamp;
            } else {
                const computedDurationMs = duration * 1000;
                const nowTimestamp = liveNowRef.current;
                startTimestamp = nowTimestamp - computedDurationMs;
            }

            if (!Number.isFinite(startTimestamp)) {
                return { success: false as const, streamId };
            }

            const eventTimestamp = alert.time.valueOf();
            if (!Number.isFinite(eventTimestamp)) {
                return { success: false as const, streamId };
            }

            const relativeSeconds = (eventTimestamp - startTimestamp) / 1000;
            if (!Number.isFinite(relativeSeconds)) {
                return { success: false as const, streamId };
            }

            const clampedSeconds = Math.min(Math.max(relativeSeconds, 0), duration);
            const paddedSeconds = Math.max(0, clampedSeconds - ALERT_SEEK_PADDING_SECONDS);

            const seekableStart =
                typeof timeline.seekableStart === "number" && Number.isFinite(timeline.seekableStart)
                    ? timeline.seekableStart
                    : 0;

            const playbackTime = seekableStart + paddedSeconds;

            if (!Number.isFinite(playbackTime)) {
                return { success: false as const, streamId };
            }

            try {
                video.currentTime = playbackTime;
                const playPromise = video.play();
                if (playPromise && typeof playPromise.catch === "function") {
                    playPromise.catch(() => undefined);
                }
            } catch (error) {
                console.warn("Unable to seek video for alert:", error);
                return { success: false as const, streamId };
            }

            return { success: true as const, streamId };
        },
        [page, setPage, streams, timelineData, videosPerPage]
    );

    const processAlertSelection = useCallback(() => {
        if (!selectedAlert) {
            return;
        }
        const alert = priorityAlerts.get(selectedAlert.id);
        if (!alert) {
            return;
        }
        if (lastHandledSelectionRef.current === selectedAlert.requestedAt) {
            return;
        }
        const result = attemptSeek(alert);
        if (result.streamId) {
            setHighlightedStreamId(result.streamId);
        }
        if (result.success && result.streamId) {
            lastHandledSelectionRef.current = selectedAlert.requestedAt;
        }
    }, [attemptSeek, priorityAlerts, selectedAlert]);

    const handleVideoRefChange = useCallback(
        (streamId: string, video: HTMLVideoElement | null) => {
            if (video) {
                videoRefs.current[streamId] = video;
            } else {
                delete videoRefs.current[streamId];
            }
            processAlertSelection();
        },
        [processAlertSelection]
    );

    useEffect(() => {
        processAlertSelection();
    }, [processAlertSelection]);

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
                    prevEntry.currentTime === nextEntry.currentTime &&
                    prevEntry.atLiveEdge === nextEntry.atLiveEdge &&
                    prevEntry.originTimestamp === nextEntry.originTimestamp &&
                    prevEntry.staticOrigin === nextEntry.staticOrigin &&
                    prevEntry.seekableStart === nextEntry.seekableStart &&
                    prevEntry.seekableEnd === nextEntry.seekableEnd
                ) {
                    return prev;
                }
                return { ...prev, [id]: nextEntry };
            });
        },
        []
    );

    const handleLoadedMetadata = useCallback(
        (stream: Stream) => (event: SyntheticEvent<HTMLVideoElement>) => {
            const video = event.currentTarget;
            const metrics = extractTimelineState(video);
            updateTimeline(stream.id, (existing) => {
                const staticOrigin = stream.id !== "webcam" && !stream.playlist;
                const originTimestamp = staticOrigin
                    ? existing?.originTimestamp ?? Date.now()
                    : undefined;
                return {
                    ...metrics,
                    originTimestamp,
                    staticOrigin,
                };
            });
        },
        [updateTimeline]
    );

    const handleTimeUpdate = useCallback(
        (stream: Stream) => (event: SyntheticEvent<HTMLVideoElement>) => {
            const video = event.currentTarget;
            const metrics = extractTimelineState(video);
            updateTimeline(stream.id, (existing) => {
                const staticOrigin = stream.id !== "webcam" && !stream.playlist;
                const originTimestamp = staticOrigin
                    ? existing?.originTimestamp ?? Date.now()
                    : undefined;
                return {
                    ...metrics,
                    originTimestamp,
                    staticOrigin,
                };
            });
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
                            const timeline = timelineData[stream.id];
                            return (
                                <StreamCard
                                    key={stream.id}
                                    stream={stream}
                                    timeline={timeline}
                                    liveNow={liveNow}
                                    backendUrl={BACKEND_URL}
                                    onLoadedMetadata={handleLoadedMetadata(stream)}
                                    onTimeUpdate={handleTimeUpdate(stream)}
                                    selected={highlightedStreamId === stream.id}
                                    onVideoRefChange={(video) =>
                                        handleVideoRefChange(stream.id, video)
                                    }
                                />
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

interface StreamCardProps {
    stream: Stream;
    timeline?: TimelineState;
    liveNow: number;
    backendUrl: string;
    onLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => void;
    onTimeUpdate: (event: SyntheticEvent<HTMLVideoElement>) => void;
    selected?: boolean;
    onVideoRefChange?: (video: HTMLVideoElement | null) => void;
}

function StreamCard({
    stream,
    timeline,
    liveNow,
    backendUrl,
    onLoadedMetadata,
    onTimeUpdate,
    selected,
    onVideoRefChange,
}: StreamCardProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hlsRef = useRef<Hls | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isBuffering, setIsBuffering] = useState(Boolean(stream.live));
    const [playlistVersion, setPlaylistVersion] = useState(0);
    const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isWebcamStream = stream.id === "webcam";
    const isStaticTimeline = !isWebcamStream && !stream.playlist;
    const hasAutoGoLiveRef = useRef(false);

    useEffect(() => {
        onVideoRefChange?.(videoRef.current);
        return () => {
            onVideoRefChange?.(null);
        };
    }, [onVideoRefChange]);

    useEffect(() => {
        hasAutoGoLiveRef.current = false;
    }, [stream.id]);

    useEffect(() => {
        if (timeline?.atLiveEdge) {
            hasAutoGoLiveRef.current = false;
        }
    }, [timeline?.atLiveEdge]);

    const playlistUrl = useMemo(() => {
        if (!stream.playlist) {
            return undefined;
        }
        let resolved =
            stream.playlist.startsWith("http://") ||
            stream.playlist.startsWith("https://")
                ? stream.playlist
                : `${backendUrl}${stream.playlist}`;
        if (playlistVersion > 0) {
            const separator = resolved.includes("?") ? "&" : "?";
            resolved = `${resolved}${separator}v=${playlistVersion}`;
        }
        return resolved;
    }, [backendUrl, playlistVersion, stream.playlist]);

    useEffect(() => {
        if (stream.format === "hls" && stream.live && stream.playlist) {
            if (playlistVersion === 0) {
                setPlaylistVersion(Date.now());
            }
        } else if (playlistVersion !== 0) {
            setPlaylistVersion(0);
        }
    }, [playlistVersion, stream.format, stream.id, stream.live, stream.playlist]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) {
            return;
        }

        const teardown = () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };

        if (retryTimeoutRef.current !== null) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
        }
        teardown();

        let cleanup: (() => void) | undefined;
        setIsReady(false);
        setIsBuffering(true);

        const assignNativeSource = (src: string) => {
            video.src = src;
            video.load();
            if (stream.live) {
                void video.play().catch(() => undefined);
            }
        };

        if (stream.format === "hls" && playlistUrl) {
            if (video.canPlayType("application/vnd.apple.mpegurl")) {
                assignNativeSource(playlistUrl);
                cleanup = teardown;
            } else if (Hls.isSupported()) {
                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                });
                hlsRef.current = hls;

                const scheduleRetry = () => {
                    if (retryTimeoutRef.current !== null) {
                        return;
                    }
                    setIsBuffering(true);
                    setIsReady(false);
                    retryTimeoutRef.current = window.setTimeout(() => {
                        retryTimeoutRef.current = null;
                        setPlaylistVersion(Date.now());
                    }, 1500);
                };

                const handleError = (_event: string, data: ErrorData) => {
                    if (!data?.fatal) {
                        return;
                    }
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        scheduleRetry();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else {
                        teardown();
                        scheduleRetry();
                    }
                };

                const handleManifestParsed = () => {
                    setIsBuffering(false);
                    if (stream.live) {
                        void video.play().catch(() => undefined);
                    }
                };
                const handleMediaAttached = () => {
                    hls.loadSource(playlistUrl);
                };

                hls.on(Hls.Events.ERROR, handleError);
                hls.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
                hls.on(Hls.Events.MEDIA_ATTACHED, handleMediaAttached);

                hls.attachMedia(video);

                cleanup = () => {
                    hls.off(Hls.Events.ERROR, handleError);
                    hls.off(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
                    hls.off(Hls.Events.MEDIA_ATTACHED, handleMediaAttached);
                    hls.destroy();
                    if (hlsRef.current === hls) {
                        hlsRef.current = null;
                    }
                };
            } else {
                assignNativeSource(`${backendUrl}/api/stream?streamId=${stream.id}`);
                cleanup = teardown;
            }
        } else {
            let resolvedSrc: string;
            if (
                stream.url?.startsWith("http://") ||
                stream.url?.startsWith("https://")
            ) {
                resolvedSrc = stream.url;
            } else if (stream.url?.startsWith("/")) {
                resolvedSrc = `${backendUrl}${stream.url}`;
            } else {
                resolvedSrc = `${backendUrl}/api/stream?streamId=${stream.id}`;
            }
            assignNativeSource(resolvedSrc);
            cleanup = teardown;
        }

        return () => {
            cleanup?.();
            if (retryTimeoutRef.current !== null) {
                clearTimeout(retryTimeoutRef.current);
                retryTimeoutRef.current = null;
            }
        };
    }, [
        backendUrl,
        playlistUrl,
        stream.format,
        stream.id,
        stream.live,
        stream.url,
    ]);

    const handleTimeUpdateInternal = useCallback(
        (event: SyntheticEvent<HTMLVideoElement>) => {
            onTimeUpdate(event);
        },
        [onTimeUpdate]
    );

    const handleWaiting = useCallback(() => {
        setIsBuffering(true);
    }, []);

    const handlePlaying = useCallback(() => {
        setIsBuffering(false);
        setIsReady(true);
    }, []);

    const handleLoadedData = useCallback(() => {
        setIsReady(true);
        setIsBuffering(false);
    }, []);

    const handleSeeked = useCallback(
        (event: SyntheticEvent<HTMLVideoElement>) => {
            onTimeUpdate(event);
        },
        [onTimeUpdate]
    );

    const handleEnded = useCallback(() => {
        if (isWebcamStream) {
            return;
        }
        const video = videoRef.current;
        if (!video) {
            return;
        }
        video.currentTime = 0;
        void video.play().catch(() => undefined);
    }, [isWebcamStream]);

    const showGoLive = stream.live && stream.format === "hls";
    const atLiveEdge = timeline?.atLiveEdge ?? false;

    const handleGoLive = useCallback(() => {
        const video = videoRef.current;
        if (!video) {
            return;
        }

        const hlsInstance = hlsRef.current;
        if (hlsInstance) {
            try {
                hlsInstance.startLoad(-1);
            } catch (error) {
                console.warn("Unable to restart HLS load:", error);
            }
        }

        if (video.seekable && video.seekable.length > 0) {
            const lastIndex = video.seekable.length - 1;
            const end = video.seekable.end(lastIndex);
            const start = video.seekable.start(0);
            if (Number.isFinite(end)) {
                const target = Number.isFinite(start) ? Math.max(end - 0.5, start) : end;
                try {
                    video.currentTime = target;
                } catch (error) {
                    console.warn("Unable to seek to live edge:", error);
                }
            }
        } else if (Number.isFinite(video.duration)) {
            video.currentTime = video.duration;
        }

        setIsReady(true);
        setIsBuffering(true);
        void video.play().catch(() => undefined);
    }, [stream.live]);

    const handleLoadedMetadataInternal = useCallback(
        (event: SyntheticEvent<HTMLVideoElement>) => {
            setIsReady(true);
            setIsBuffering(false);
            onLoadedMetadata(event);
            const video = event.currentTarget;
            if (stream.live) {
                if (isStaticTimeline) {
                    if (video.seekable && video.seekable.length > 0) {
                        const lastIndex = video.seekable.length - 1;
                        const end = video.seekable.end(lastIndex);
                        const start = video.seekable.start(0);
                        if (Number.isFinite(end)) {
                            const target = Number.isFinite(start)
                                ? Math.max(end - 0.5, start)
                                : end;
                            try {
                                video.currentTime = target;
                                hasAutoGoLiveRef.current = true;
                            } catch (error) {
                                console.warn("Unable to seek static stream to live edge:", error);
                            }
                        }
                    } else if (Number.isFinite(video.duration)) {
                        try {
                            video.currentTime = Math.max(video.duration - 0.5, 0);
                            hasAutoGoLiveRef.current = true;
                        } catch (error) {
                            console.warn("Unable to set static stream to live edge:", error);
                        }
                    }
                } else if (!hasAutoGoLiveRef.current) {
                    handleGoLive();
                    hasAutoGoLiveRef.current = true;
                }
            }
        },
        [handleGoLive, isStaticTimeline, onLoadedMetadata, stream.live]
    );

    const cardClassName = selected ? "stream-card selected" : "stream-card";

    return (
        <div className={cardClassName}>
            <div className="stream-media">
                <video
                    ref={videoRef}
                    className="stream-media-visual"
                    controls
                    muted={Boolean(stream.live)}
                    autoPlay
                    playsInline
                    preload="auto"
                    loop={!isWebcamStream}
                    onLoadedMetadata={handleLoadedMetadataInternal}
                    onLoadedData={handleLoadedData}
                    onTimeUpdate={handleTimeUpdateInternal}
                    onSeeked={handleSeeked}
                    onPlaying={handlePlaying}
                    onCanPlay={handlePlaying}
                    onWaiting={handleWaiting}
                    onEnded={handleEnded}
                />
                {showGoLive && !atLiveEdge ? (
                    <button
                        type="button"
                        className="stream-go-live"
                        onClick={handleGoLive}
                    >
                        Go Live
                    </button>
                ) : null}
                
                {(isBuffering || !isReady) && (
                    <div className="stream-media-overlay">
                        <span>{isReady ? "Buffering…" : "Loading…"}</span>
                    </div>
                )}
            </div>
            <StreamTimeline timeline={timeline} live={Boolean(stream.live)} liveNow={liveNow} />
        </div>
    );
}

interface StreamTimelineProps {
    timeline?: TimelineState;
    live: boolean;
    liveNow: number;
}

function StreamTimeline({ timeline, live, liveNow }: StreamTimelineProps) {
    const computedTimeline = useMemo(() => {
        if (!timeline || !timeline.duration || timeline.duration <= 0) {
            return null;
        }

        const durationMs = timeline.duration * 1000;
        let progress = Math.min(
            100,
            Math.max(0, (timeline.currentTime / timeline.duration) * 100)
        );
        const hasStaticOrigin = Boolean(timeline.staticOrigin && timeline.originTimestamp);

        let startTimestamp: number;
        let currentTimestamp: number;
        let endTimestamp: number;

        if (hasStaticOrigin) {
            const originTimestamp = timeline.originTimestamp ?? liveNow - durationMs;
            startTimestamp = originTimestamp;
            currentTimestamp = originTimestamp + timeline.currentTime * 1000;
            endTimestamp = originTimestamp + durationMs;
        } else {
            startTimestamp = liveNow - durationMs;
            currentTimestamp = startTimestamp + timeline.currentTime * 1000;
            endTimestamp = liveNow;
        }

        if (live && timeline.atLiveEdge) {
            progress = 100;
        }

        return {
            startTimestamp,
            currentTimestamp,
            endTimestamp,
            progress,
        };
    }, [
        liveNow,
        timeline?.currentTime,
        timeline?.duration,
        timeline?.originTimestamp,
        timeline?.staticOrigin,
    ]);

    if (!computedTimeline) {
        if (live) {
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
                    {live && timeline?.atLiveEdge ? (
                        <span className="stream-live-inline">Live</span>
                    ) : null}
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

function resolveStreamIdFromAlert(alert: PriorityAlert, streams: Stream[]): string | null {
    const candidateValues: string[] = [];
    if (typeof alert.source === "string") {
        candidateValues.push(alert.source);
    }
    if (typeof alert.url === "string") {
        candidateValues.push(alert.url);
    }
    if (typeof alert.location === "string") {
        candidateValues.push(alert.location);
    }

    if (candidateValues.length === 0) {
        return null;
    }

    const candidateTokens = new Set<string>();
    for (const value of candidateValues) {
        for (const token of expandCandidateTokens(value)) {
            candidateTokens.add(token);
        }
    }

    for (const stream of streams) {
        const streamTokens = buildStreamTokenSet(stream);
        for (const token of candidateTokens) {
            if (streamTokens.has(token)) {
                return stream.id;
            }
        }
    }

    return null;
}

function expandCandidateTokens(value: string): string[] {
    const tokens = new Set<string>();
    const normalized = normalizeToken(value);
    if (!normalized) {
        return [];
    }
    tokens.add(normalized);

    const withoutProtocol = normalized.replace(/^https?:\/\//, "");
    tokens.add(withoutProtocol);

    const withoutQuery = withoutProtocol.split("?")[0];
    tokens.add(withoutQuery);

    const segments = withoutQuery.split(/[\s\/#?]+/).filter(Boolean);
    for (const segment of segments) {
        tokens.add(segment);
        for (const part of segment.split(/[-_]/).filter(Boolean)) {
            tokens.add(part);
        }
    }

    return Array.from(tokens);
}

function buildStreamTokenSet(stream: Stream): Set<string> {
    const tokens = new Set<string>();
    const addTokens = (value?: string | null) => {
        if (!value) {
            return;
        }
        for (const token of expandCandidateTokens(value)) {
            tokens.add(token);
        }
    };

    addTokens(stream.id);
    addTokens(stream.url);
    addTokens(stream.playlist ?? undefined);

    return tokens;
}

function normalizeToken(value: string): string | null {
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
}
