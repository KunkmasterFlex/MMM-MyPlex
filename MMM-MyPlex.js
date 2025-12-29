/* global Module, Log */

/* MagicMirror²
 * Module: MMM-MyPlex
 *
 * By Jeff + Steely-Eyed Missile Bot (ChatGPT)
 * MIT Licensed
 */

Module.register("MMM-MyPlex", {
    // Default module config.
    defaults: {
        // PMS connection
        server: "127.0.0.1", // Plex Media Server address or IP
        port: 32400, // Plex Media Server port
        https: false, // Use https instead of http
        token: "", // Plex token (required for real data)
        // Optional friendly name for this PMS (used in titles)
        serverName: "Plex",

        // What to show
        showRecentlyAddedMovies: true,
        showRecentlyAddedEpisodes: true,
        showNowStreaming: true,

        // Limits
        recentlyAddedMovieLimit: 5,
        recentlyAddedEpisodeLimit: 5,
        nowStreamingLimit: 5,
        // Lookback window for "recently added" (in days)
        lookbackDays: 30,

        // Polling intervals (ms)
        recentlyAddedUpdateInterval: 5 * 60 * 1000, // 5 minutes
        nowStreamingUpdateInterval: 15 * 1000, // 15 seconds

        // Hide behavior (optional)
        // If enabled, hides the entire module when nothing is currently streaming.
        hideWhenIdle: false,
        hideAnimationSpeed: 1000, // ms (0 = instant)

        // Slideshow behavior
        slideInterval: 15 * 1000, // 15 seconds per slide
        slideOrder: "sequential", // "sequential" or "random"

        // Layout / sizing behavior
        layoutMode: "compact", // "compact" or "big"
        orientation: "vertical", // "vertical" or "horizontal"
        // Card layout relative to the module position
        // "auto" uses the MagicMirror position (left/right/center) to decide.
        // "left"  => poster on the left, text on the right (left-justified)
        // "right" => poster on the right, text on the left (left-justified)
        cardLayout: "auto", // "auto" | "left" | "right"

        // Fade animation speed (ms) for slide transitions
        fadeSpeed: 1000,

        // Display toggles
        display: {
            showPosters: true,
            showYear: true,
            showRuntime: true,
            showContentRating: true,
            showRating: true,
            showGenres: true,
            showQuality: true,
            showCodec: true,
            showDateAdded: true,
            showSummary: true,

            // Now streaming specific
            showUser: true,
            showBitrate: true,
            showProgress: true,

            // Episode specific
            showSeriesTitle: true,
            showEpisodeLabel: true
        },

        // Placeholder text (for initial testing)
        text: "MMM-MyPlex is loaded and ready."
    },

    // State
    recentMovies: [],
    recentEpisodes: [],
    nowStreaming: [],
    currentSlideIndex: 0,
    _slideTimer: null,
    _nowTimer: null,
    _recentTimer: null,
    _randomQueue: null,
    _randomQueueIndex: 0,
    _isHiddenForIdle: false,

    start: function () {
        // Prevent duplicate timers if the module is reloaded/restarted
        if (this._slideTimer) clearInterval(this._slideTimer);
        if (this._nowTimer) clearInterval(this._nowTimer);
        if (this._recentTimer) clearInterval(this._recentTimer);

        Log.info("Starting module: " + this.name);
        this._isHiddenForIdle = false;
        // Dump effective config (defaults merged with config.js)
        try {
            Log.info(this.name + " config: " + JSON.stringify(this.config));
        } catch (e) {
            Log.error(this.name + " failed to stringify config: " + e);
        }

        const baseCfg = {
            server: this.config.server,
            port: this.config.port,
            https: this.config.https,
            token: this.config.token,
            recentlyAddedMovieLimit: this.config.recentlyAddedMovieLimit,
            recentlyAddedEpisodeLimit: this.config.recentlyAddedEpisodeLimit,
            nowStreamingLimit: this.config.nowStreamingLimit,
            lookbackDays: this.config.lookbackDays
        };

        // Kick the node_helper to verify socket wiring
        this.sendSocketNotification("MY_PLEX_TEST", {
            configuredServer: this.config.server,
            configuredPort: this.config.port
        });

        // Test node_helper → Plex connectivity
        this.sendSocketNotification("FETCH_PLEX_TEST", baseCfg);

        // Initial fetch of recently added items
        this.sendSocketNotification("FETCH_RECENTLY_ADDED", baseCfg);

        // Initial fetch of now streaming (if enabled)
        if (this.config.showNowStreaming) {
            this.sendSocketNotification("FETCH_NOW_STREAMING", baseCfg);
        }

        // Initialize slideshow timer across all slide types
        this.currentSlideIndex = 0;
        const slideInterval = this.config.slideInterval || 15 * 1000;
        const self = this;

        this._slideTimer = setInterval(function () {
            const total = self._getTotalSlides();

            if (total > 0) {
                if (self.config.slideOrder === "random") {
                    // Build or rebuild the random queue if needed
                    self._ensureRandomQueue(total);

                    const queue = self._randomQueue || [];
                    if (queue.length > 0) {
                        const pos =
                            typeof self._randomQueueIndex === "number"
                                ? self._randomQueueIndex
                                : 0;
                        self.currentSlideIndex = queue[pos];

                        // Advance the pointer
                        self._randomQueueIndex = pos + 1;

                        // If we've exhausted the queue, clear it so it will be reshuffled next tick
                        if (self._randomQueueIndex >= queue.length) {
                            self._randomQueueIndex = 0;
                            self._randomQueue = null;
                        }
                    } else {
                        // Fallback: simple sequential advance if something went wrong
                        self.currentSlideIndex =
                            (self.currentSlideIndex + 1) % total;
                    }
                } else {
                    // Sequential: just walk through in order
                    self.currentSlideIndex =
                        (self.currentSlideIndex + 1) % total;
                }

                self.updateDom(self.config.fadeSpeed || 1000);
            } else {
                // No slides: reset state so we start fresh when data arrives
                self.currentSlideIndex = 0;
                self._randomQueue = null;
                self._randomQueueIndex = 0;
            }
        }, slideInterval);

        // Poll now streaming regularly (if enabled)
        if (this.config.showNowStreaming) {
            const nsInterval =
                this.config.nowStreamingUpdateInterval || 15 * 1000;
            this._nowTimer = setInterval(function () {
                self.sendSocketNotification("FETCH_NOW_STREAMING", baseCfg);
            }, nsInterval);
        }

        // Poll recently added regularly (if enabled)
        if (
            this.config.showRecentlyAddedMovies ||
            this.config.showRecentlyAddedEpisodes
        ) {
            const raInterval =
                this.config.recentlyAddedUpdateInterval || 5 * 60 * 1000;
            this._recentTimer = setInterval(function () {
                // Visible proof the timer is firing (no token logged)
                if (self.config.consoleLog) {
                    Log.info(self.name + " polling recently added…");
                }
                self.sendSocketNotification("FETCH_RECENTLY_ADDED", baseCfg);
            }, raInterval);
        }
    },

    /**
     * Compute total number of slides available, combining
     * movies, episodes, and now streaming sessions.
     */
    _getTotalSlides: function () {
        let total = 0;

        if (
            this.config.showRecentlyAddedMovies &&
            this.recentMovies &&
            this.recentMovies.length > 0
        ) {
            total += this.recentMovies.length;
        }

        if (
            this.config.showRecentlyAddedEpisodes &&
            this.recentEpisodes &&
            this.recentEpisodes.length > 0
        ) {
            total += this.recentEpisodes.length;
        }

        if (
            this.config.showNowStreaming &&
            this.nowStreaming &&
            this.nowStreaming.length > 0
        ) {
            total += this.nowStreaming.length;
        }

        return total;
    },

    /**
     * Ensure we have a shuffled queue of slide indices for random mode.
     * If the total count changes, the queue is rebuilt and reshuffled.
     */
    _ensureRandomQueue: function (total) {
        if (!this._randomQueue || this._randomQueue.length !== total) {
            this._randomQueueIndex = 0;
            this._randomQueue = [];
            for (let i = 0; i < total; i++) {
                this._randomQueue.push(i);
            }
            // Fisher–Yates shuffle
            for (let i = this._randomQueue.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = this._randomQueue[i];
                this._randomQueue[i] = this._randomQueue[j];
                this._randomQueue[j] = tmp;
            }
        }
    },

    /**
     * Hide/show the module when nothing is currently streaming.
     * Controlled via config.hideWhenIdle + config.hideAnimationSpeed.
     */
    setIdleVisibility: function (hasNowPlaying) {
        if (!this.config.hideWhenIdle) return;

        const speed =
            typeof this.config.hideAnimationSpeed === "number"
                ? this.config.hideAnimationSpeed
                : 1000;

        if (!hasNowPlaying) {
            if (!this._isHiddenForIdle) {
                this.hide(speed);
                this._isHiddenForIdle = true;
            }
        } else {
            if (this._isHiddenForIdle) {
                this.show(speed);
                this._isHiddenForIdle = false;
            }
        }
    },

    getStyles: function () {
        return ["MMM-MyPlex.css"];
    },

    getDom: function () {
        const wrapper = document.createElement("div");
        wrapper.className = "mmm-myplex-wrapper";

        // Apply layout and orientation classes based on config
        const layoutMode = this.config.layoutMode || this.defaults.layoutMode || "compact";
        const orientation = this.config.orientation || this.defaults.orientation || "vertical";

        if (layoutMode === "big") {
            wrapper.classList.add("mmm-myplex-big");
        }

        if (orientation === "horizontal") {
            wrapper.classList.add("mmm-myplex-horizontal");
        } else {
            wrapper.classList.add("mmm-myplex-vertical");
        }

        const totalSlides = this._getTotalSlides();

        // Apply card layout (poster left/right) based on config or module position
        const cfgLayout = (this.config.cardLayout || "auto").toLowerCase();
        let resolvedLayout = cfgLayout;

        if (cfgLayout === "auto") {
            const pos = (this.data && this.data.position ? this.data.position : "").toLowerCase();
            if (pos.includes("right")) {
                resolvedLayout = "right";
            } else if (pos.includes("left")) {
                resolvedLayout = "left";
            } else {
                // center positions: default to left layout unless user explicitly chooses right
                resolvedLayout = "left";
            }
        }

        if (resolvedLayout === "right") {
            wrapper.classList.add("mmm-myplex-layout-right");
        } else {
            wrapper.classList.add("mmm-myplex-layout-left");
        }

        if (totalSlides > 0) {
            let idx = this.currentSlideIndex % totalSlides;
            let mode = null; // "movie", "episode", "now"
            let item = null;

            // Decide which pool this index maps into
            if (
                this.config.showRecentlyAddedMovies &&
                this.recentMovies &&
                this.recentMovies.length > 0
            ) {
                if (idx < this.recentMovies.length) {
                    mode = "movie";
                    item = this.recentMovies[idx];
                } else {
                    idx -= this.recentMovies.length;
                }
            }

            if (
                !mode &&
                this.config.showRecentlyAddedEpisodes &&
                this.recentEpisodes &&
                this.recentEpisodes.length > 0
            ) {
                if (idx < this.recentEpisodes.length) {
                    mode = "episode";
                    item = this.recentEpisodes[idx];
                } else {
                    idx -= this.recentEpisodes.length;
                }
            }

            if (
                !mode &&
                this.config.showNowStreaming &&
                this.nowStreaming &&
                this.nowStreaming.length > 0
            ) {
                if (idx < this.nowStreaming.length) {
                    mode = "now";
                    item = this.nowStreaming[idx];
                }
            }

            if (!mode || !item) {
                wrapper.innerHTML = "MMM-MyPlex: no slide data";
                return wrapper;
            }

            // Section title
            const title = document.createElement("div");
            title.className = "mmm-myplex-section-title";

            // Prefix with PMS name: use serverName if set, otherwise fall back to server address
            const displayServer =
                this.config.serverName || this.config.server || "Plex";

            if (mode === "movie") {
                title.innerHTML = `${displayServer} - Recently Added Movie`;
            } else if (mode === "episode") {
                title.innerHTML = `${displayServer} - Recently Added Episode`;
            } else {
                title.innerHTML = `${displayServer} - Now Streaming`;
            }

            wrapper.appendChild(title);

            const list = document.createElement("div");
            list.className = "mmm-myplex-list";

            const usePosters =
                this.config.display && this.config.display.showPosters;
            const scheme = this.config.https ? "https" : "http";
            const baseUrl = `${scheme}://${this.config.server}:${this.config.port}`;
            const plexToken = this.config.token;

            // Build a single card
            const itemDiv = document.createElement("div");
            itemDiv.className = "mmm-myplex-item";

            // Poster (if enabled) - prefer series posters for episodes
            if (usePosters) {
                // Determine which poster path to use
                let posterPath = item.thumb || null;
                if (
                    (mode === "episode" || mode === "now") &&
                    item.seriesThumb
                ) {
                    posterPath = item.seriesThumb;
                }

                if (posterPath) {
                    const posterDiv = document.createElement("div");
                    posterDiv.className = "mmm-myplex-poster";

                    const img = document.createElement("img");
                    let posterUrl = posterPath;
                    if (
                        !posterUrl.startsWith("http://") &&
                        !posterUrl.startsWith("https://")
                    ) {
                        posterUrl = baseUrl + posterUrl;
                    }
                    if (plexToken) {
                        posterUrl += posterUrl.includes("?")
                            ? `&X-Plex-Token=${plexToken}`
                            : `?X-Plex-Token=${plexToken}`;
                    }
                    img.src = posterUrl;
                    img.alt = item.title || item.episodeTitle || item.seriesTitle || "";
                    posterDiv.appendChild(img);
                    itemDiv.appendChild(posterDiv);
                }
            }

            // Text container
            const textDiv = document.createElement("div");
            textDiv.className = "mmm-myplex-text";
            itemDiv.appendChild(textDiv);

            // Utility: format runtime from ms
            const formatRuntime = (ms) => {
                if (!ms) return null;
                const totalSeconds = Math.floor(ms / 1000);
                const hours = Math.floor(totalSeconds / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                if (hours > 0) {
                    return `${hours}h ${minutes}m`;
                }
                return `${minutes}m`;
            };

            // Utility: format progress (viewOffset vs runtime)
            const formatProgress = (offsetMs, runtimeMs) => {
                if (!runtimeMs || offsetMs == null) return null;

                const fmt = (secs) => {
                    const h = Math.floor(secs / 3600);
                    const m = Math.floor((secs % 3600) / 60);
                    const s = secs % 60;
                    if (h > 0) {
                        return `${h}:${String(m).padStart(2, "0")}:${String(
                            s
                        ).padStart(2, "0")}`;
                    }
                    return `${m}:${String(s).padStart(2, "0")}`;
                };

                const totalSeconds = Math.floor(runtimeMs / 1000);
                const offsetSeconds = Math.floor(offsetMs / 1000);
                return `${fmt(offsetSeconds)} of ${fmt(totalSeconds)}`;
            };

            // === Line 1: title/series ===
            const line1 = document.createElement("div");
            line1.className = "mmm-myplex-line1";

            if (mode === "movie") {
                const yearPart =
                    this.config.display.showYear && item.year
                        ? ` (${item.year})`
                        : "";
                line1.innerHTML = `${item.title || ""}${yearPart}`;
            } else if (mode === "episode") {
                // Prefer series title from normalized field, fall back to title
                const series =
                    item.seriesTitle ||
                    item.grandparentTitle || // typical Plex field for show
                    item.title ||
                    "";
                line1.innerHTML = series;
            } else {
                // Now streaming: movie or episode
                const series =
                    item.seriesTitle || item.grandparentTitle || "";
                if (series) {
                    line1.innerHTML = series;
                } else {
                    const yearPart =
                        this.config.display.showYear && item.year
                            ? ` (${item.year})`
                            : "";
                    line1.innerHTML = `${item.title || ""}${yearPart}`;
                }
            }

            textDiv.appendChild(line1);

            // === Line 2: details ===
            const line2 = document.createElement("div");
            line2.className = "mmm-myplex-line2";

            if (mode === "movie") {
                const metaParts = [];

                if (
                    this.config.display.showRuntime &&
                    item.runtimeMs
                ) {
                    const runtimeLabel = formatRuntime(item.runtimeMs);
                    if (runtimeLabel) metaParts.push(runtimeLabel);
                }

                if (
                    this.config.display.showRating &&
                    item.rating != null
                ) {
                    metaParts.push(`Rating: ${item.rating}`);
                }

                if (
                    this.config.display.showContentRating &&
                    item.contentRating
                ) {
                    // Wrap MPAA rating in badge span
                    metaParts.push(`<span class="mmm-myplex-rating-badge">${item.contentRating}</span>`);
                }

                line2.innerHTML = metaParts.join(" | ");
            } else if (mode === "episode") {
                const labelParts = [];
                if (item.seasonNumber != null) {
                    labelParts.push(`Season ${item.seasonNumber}`);
                }
                if (item.episodeNumber != null) {
                    labelParts.push(`Episode ${item.episodeNumber}`);
                }
                const seLabel = labelParts.join(", ");
                const epTitle = item.episodeTitle
                    ? ` - "${item.episodeTitle}"`
                    : "";
                line2.innerHTML = seLabel + epTitle;
            } else {
                // Now streaming: show episode label if available, otherwise leave for line3
                const labelParts = [];
                if (item.seasonNumber != null) {
                    labelParts.push(`Season ${item.seasonNumber}`);
                }
                if (item.episodeNumber != null) {
                    labelParts.push(`Episode ${item.episodeNumber}`);
                }
                const seLabel = labelParts.join(", ");
                const epTitle = item.episodeTitle
                    ? ` - "${item.episodeTitle}"`
                    : "";

                line2.innerHTML = seLabel + epTitle;
            }

            textDiv.appendChild(line2);

            // === Line 3: quality/codec or streaming meta ===
            const line3 = document.createElement("div");
            line3.className = "mmm-myplex-line3";

            if (mode === "now") {
                const meta = [];

                if (
                    this.config.display.showUser &&
                    item.userName
                ) {
                    meta.push(item.userName);
                }

                if (
                    this.config.display.showBitrate &&
                    item.bitrateKbps
                ) {
                    const mbps = item.bitrateKbps / 1000;
                    meta.push(`${mbps.toFixed(1)} Mbps`);
                }

                if (this.config.display.showProgress) {
                    const progress = formatProgress(
                        item.viewOffsetMs,
                        item.runtimeMs
                    );
                    if (progress) {
                        meta.push(progress);
                    }
                }

                line3.innerHTML = meta.join(" | ");
            } else {
                // Movies and episodes: Quality • Codec
                const qc = [];
                if (this.config.display.showQuality && item.quality) {
                    qc.push(item.quality);
                }
                if (this.config.display.showCodec && item.videoCodec) {
                    qc.push(item.videoCodec);
                }
                line3.innerHTML = qc.join(" • ");
            }

            textDiv.appendChild(line3);

            // === Line 4: summary or extra quality line for now streaming ===
            if (mode === "now") {
                // Optional extra line for quality/codec on now streaming
                if (item.quality || item.videoCodec) {
                    const line4 = document.createElement("div");
                    line4.className = "mmm-myplex-line3";
                    const qc = [];
                    if (
                        this.config.display.showQuality &&
                        item.quality
                    ) {
                        qc.push(item.quality);
                    }
                    if (
                        this.config.display.showCodec &&
                        item.videoCodec
                    ) {
                        qc.push(item.videoCodec);
                    }
                    line4.innerHTML = qc.join(" • ");
                    textDiv.appendChild(line4);
                }
            } else if (
                this.config.display.showSummary &&
                item.summary
            ) {
                const line4 = document.createElement("div");
                line4.className = "mmm-myplex-summary";
                const maxLen = 160;
                const summaryText =
                    item.summary.length > maxLen
                        ? item.summary.slice(0, maxLen) + "…"
                        : item.summary;
                line4.innerHTML = summaryText;
                textDiv.appendChild(line4);
            }

            list.appendChild(itemDiv);
            wrapper.appendChild(list);
            return wrapper;
        }

        // Fallback: no media available card
        const displayServer =
            this.config.serverName || this.config.server || "Plex";

        // Section title for the empty state
        const title = document.createElement("div");
        title.className = "mmm-myplex-section-title";
        title.innerHTML = `${displayServer} - No Media Available`;
        wrapper.appendChild(title);

        const list = document.createElement("div");
        list.className = "mmm-myplex-list";

        const itemDiv = document.createElement("div");
        itemDiv.className = "mmm-myplex-item";

        // Generic Plex poster for the empty state
        const posterDiv = document.createElement("div");
        posterDiv.className = "mmm-myplex-poster";

        const img = document.createElement("img");
        img.src = this.file("assets/plex.png");
        img.alt = "Plex";
        posterDiv.appendChild(img);
        itemDiv.appendChild(posterDiv);

        // Text container
        const textDiv = document.createElement("div");
        textDiv.className = "mmm-myplex-text";
        itemDiv.appendChild(textDiv);

        const line1 = document.createElement("div");
        line1.className = "mmm-myplex-line1";
        line1.innerHTML = "📭 Nothing New to Show";
        textDiv.appendChild(line1);

        const line2 = document.createElement("div");
        line2.className = "mmm-myplex-line2";
        const lookback =
            this.config.lookbackDays || this.defaults.lookbackDays || 30;
        const daysLabel = lookback === 1 ? "day" : "days";
        line2.innerHTML = `No recently added media in the last ${lookback} ${daysLabel}.`;
        textDiv.appendChild(line2);

        const line3 = document.createElement("div");
        line3.className = "mmm-myplex-summary";
        line3.innerHTML =
            "No one is streaming right now. Check back later!";
        textDiv.appendChild(line3);

        list.appendChild(itemDiv);
        wrapper.appendChild(list);

        return wrapper;
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "MY_PLEX_TEST_RESULT") {
            Log.info(
                this.name +
                    " received test result from node_helper: " +
                    JSON.stringify(payload)
            );
        }

        if (notification === "FETCH_PLEX_TEST_RESULT") {
            Log.info(
                this.name +
                    " Plex identity response: " +
                    JSON.stringify(payload)
            );
        }

        if (notification === "FETCH_RECENTLY_ADDED_RESULT") {
            Log.info(
                this.name +
                    " Plex recentlyAdded response (normalized): " +
                    JSON.stringify(payload)
            );

            let movies = [];
            let episodes = [];

            if (payload) {
                // New shape: { movies: [...], episodes: [...] }
                if (Array.isArray(payload.movies)) {
                    movies = payload.movies;
                }
                if (Array.isArray(payload.episodes)) {
                    episodes = payload.episodes;
                }

                // Older shape: { items: [...] } - treat as movies
                if (!movies.length && Array.isArray(payload.items)) {
                    movies = payload.items;
                }
            }

            this.recentMovies = movies;
            this.recentEpisodes = episodes;

            // Reset slideshow deck so updated data is reflected immediately
            this.currentSlideIndex = 0;
            this._randomQueue = null;
            this._randomQueueIndex = 0;

            const total = this._getTotalSlides();
            if (total <= 0) {
                this.currentSlideIndex = 0;
            }

            this.updateDom(0);
        }

        if (notification === "FETCH_NOW_STREAMING_RESULT") {
            Log.info(
                this.name +
                    " Plex nowStreaming response (normalized): " +
                    JSON.stringify(payload)
            );

            let sessions = [];

            if (payload && Array.isArray(payload.sessions)) {
                sessions = payload.sessions;
            } else if (Array.isArray(payload)) {
                sessions = payload;
            }

            this.nowStreaming = sessions || [];

            // Optional: hide the entire module when nothing is streaming
            const hasNowPlaying =
                Array.isArray(this.nowStreaming) && this.nowStreaming.length > 0;
            this.setIdleVisibility(hasNowPlaying);

            // Reset slideshow deck so session changes show up immediately
            this.currentSlideIndex = 0;
            this._randomQueue = null;
            this._randomQueueIndex = 0;

            const total = this._getTotalSlides();
            if (total <= 0) {
                this.currentSlideIndex = 0;
            }

            this.updateDom(0);
        }
    }
});
