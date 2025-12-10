/* MagicMirror²
 * Node Helper: MMM-MyPlex
 *
 * By Jeff + Steely-Eyed Missile Bot
 * MIT Licensed
 */

const NodeHelper = require("node_helper");
const http = require("http");
const https = require("https");
const { XMLParser } = require("fast-xml-parser");

const xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: ""
});

module.exports = NodeHelper.create({
	start: function () {
		console.log("Starting node helper for module: " + this.name);
	},

	getPlex: function (path, config, callback) {
		const protocol = config.https ? https : http;
		const scheme = config.https ? "https" : "http";

		let url = `${scheme}://${config.server}:${config.port}${path}`;
		const tokenParam = `X-Plex-Token=${config.token}`;
		url += url.includes("?") ? `&${tokenParam}` : `?${tokenParam}`;

		// Log a sanitized URL (no token) to avoid leaking secrets
		const safeUrlForLog = `${scheme}://${config.server}:${config.port}${path}`;
		if (config.debug) {
			console.log(this.name + " requesting Plex URL: " + safeUrlForLog);
		}

		protocol
			.get(url, res => {
				let data = "";
				res.on("data", chunk => {
					data += chunk;
				});
				res.on("end", () => {
					callback(null, data);
				});
			})
			.on("error", err => {
				callback(err, null);
			});
	},

	normalizeRecentlyAdded: function (xmlString, cfg) {
		let json;
		try {
			json = xmlParser.parse(xmlString);
		} catch (e) {
			console.log(this.name + " failed to parse XML: " + e);
			return { movies: [], episodes: [] };
		}

		const container = json && json.MediaContainer ? json.MediaContainer : {};
		let videos = container.Video || [];

		if (!Array.isArray(videos)) {
			videos = videos ? [videos] : [];
		}

		const limitMovies = cfg.recentlyAddedMovieLimit || 5;
		const limitEpisodes = cfg.recentlyAddedEpisodeLimit || 5;

		const movieVideos = videos.filter(v => v.type === "movie").slice(0, limitMovies);
		const episodeVideos = videos.filter(v => v.type === "episode").slice(0, limitEpisodes);

		const mapMovie = v => {
			const media = Array.isArray(v.Media) ? v.Media[0] : v.Media || {};
			const bitrate = media.bitrate ? Number(media.bitrate) : null;
			const height = media.height ? Number(media.height) : null;
			const videoResolution = media.videoResolution || null;
			const videoCodec = media.videoCodec || null;

			let quality = null;
			if (videoResolution) {
				quality = videoResolution.toString() + "p";
			} else if (height) {
				quality = height + "p";
			}

			const normalizedCodec = videoCodec
				? videoCodec.toString().toUpperCase()
				: null;

			return {
				id: v.ratingKey || null,
				cardType: "recentMovie",
				mediaType: v.type || "movie",
				title: v.title || "",
				year: v.year ? Number(v.year) : null,
				rating: v.rating ? Number(v.rating) : null,
				contentRating: v.contentRating || null,
				summary: v.summary || "",
				runtimeMs: v.duration ? Number(v.duration) : null,
				addedAt: v.addedAt ? Number(v.addedAt) : null,
				dateAdded: v.addedAt || null,
				thumb: v.thumb || null,
				art: v.art || null,
				genres: [],
				quality: quality,
				videoCodec: normalizedCodec,
				bitrateKbps: bitrate
			};
		};

		const mapEpisode = v => {
			const media = Array.isArray(v.Media) ? v.Media[0] : v.Media || {};
			const bitrate = media.bitrate ? Number(media.bitrate) : null;
			const height = media.height ? Number(media.height) : null;
			const videoResolution = media.videoResolution || null;
			const videoCodec = media.videoCodec || null;

			let quality = null;
			if (videoResolution) {
				quality = videoResolution.toString() + "p";
			} else if (height) {
				quality = height + "p";
			}

			const normalizedCodec = videoCodec
				? videoCodec.toString().toUpperCase()
				: null;

			return {
				id: v.ratingKey || null,
				cardType: "recentEpisode",
				mediaType: v.type || "episode",
				seriesTitle: v.grandparentTitle || "",
				seasonNumber: v.parentIndex ? Number(v.parentIndex) : null,
				episodeNumber: v.index ? Number(v.index) : null,
				episodeTitle: v.title || "",
				contentRating: v.contentRating || null,
				summary: v.summary || "",
				runtimeMs: v.duration ? Number(v.duration) : null,
				addedAt: v.addedAt ? Number(v.addedAt) : null,
				dateAdded: v.addedAt || null,
				thumb: v.thumb || null,
				art: v.art || null,
				// series poster preferred
				seriesThumb: v.grandparentThumb || v.parentThumb || v.thumb || null,
				quality: quality,
				videoCodec: normalizedCodec,
				bitrateKbps: bitrate
			};
		};

		const movies = movieVideos.map(mapMovie);
		const episodes = episodeVideos.map(mapEpisode);

		return { movies, episodes };
	},

	normalizeSessions: function (xmlString, cfg) {
		let json;
		try {
			json = xmlParser.parse(xmlString);
		} catch (e) {
			console.log(this.name + " failed to parse sessions XML: " + e);
			return [];
		}

		const container = json && json.MediaContainer ? json.MediaContainer : {};
		let videos = container.Video || [];

		if (!Array.isArray(videos)) {
			videos = videos ? [videos] : [];
		}

		const limit = cfg.nowStreamingLimit || 5;
		const sliced = videos.slice(0, limit);

		const sessions = sliced.map(v => {
			const media = Array.isArray(v.Media) ? v.Media[0] : v.Media || {};
			const bitrateMedia = media.bitrate ? Number(media.bitrate) : null;
			const height = media.height ? Number(media.height) : null;
			const videoResolution = media.videoResolution || null;
			const videoCodec = media.videoCodec || null;

			// Try to get bitrate from Session or TranscodeSession first (more accurate for current stream)
			const sessionObj = v.Session || {};
			const transcode = v.TranscodeSession || {};

			let bitrateKbps = null;
			if (sessionObj.bandwidth) {
				bitrateKbps = Number(sessionObj.bandwidth);
			} else if (transcode.bitrate) {
				bitrateKbps = Number(transcode.bitrate);
			} else if (bitrateMedia) {
				bitrateKbps = bitrateMedia;
			}

			let quality = null;
			if (videoResolution) {
				quality = videoResolution.toString() + "p";
			} else if (height) {
				quality = height + "p";
			}

			const normalizedCodec = videoCodec
				? videoCodec.toString().toUpperCase()
				: null;

			// Episode vs movie specifics
			const isEpisode = v.type === "episode";
			const mediaType = v.type || "movie";

			const seriesTitle = isEpisode ? v.grandparentTitle || "" : null;
			const episodeTitle = isEpisode ? v.title || "" : null;
			const seasonNumber = isEpisode && v.parentIndex ? Number(v.parentIndex) : null;
			const episodeNumber = isEpisode && v.index ? Number(v.index) : null;

			// User and player info
			const user = v.User || {};
			const player = v.Player || {};

			const userName = user.title || null;
			const playerProduct = player.product || null;
			const playerState = player.state || null;

			const runtimeMs = v.duration ? Number(v.duration) : null;
			const viewOffsetMs = v.viewOffset ? Number(v.viewOffset) : null;

			return {
				id: v.ratingKey || null,
				cardType: "nowStreaming",
				mediaType: mediaType,
				isEpisode: isEpisode,
				// Movie fields
				title: isEpisode ? null : v.title || "",
				year: v.year ? Number(v.year) : null,
				// Episode fields
				seriesTitle: seriesTitle,
				episodeTitle: episodeTitle,
				seasonNumber: seasonNumber,
				episodeNumber: episodeNumber,
				// Common fields
				contentRating: v.contentRating || null,
				summary: v.summary || "",
				runtimeMs: runtimeMs,
				viewOffsetMs: viewOffsetMs,
				thumb: v.thumb || null,
				art: v.art || null,
				seriesThumb: v.grandparentThumb || v.parentThumb || v.thumb || null,
				quality: quality,
				videoCodec: normalizedCodec,
				bitrateKbps: bitrateKbps,
				// User / player
				userName: userName,
				playerProduct: playerProduct,
				playerState: playerState
			};
		});

		return sessions;
	},

	fetchEpisodesFromTVSections: function (cfg, callback) {
		const limit = cfg.recentlyAddedEpisodeLimit || 5;
		const sectionsPath = "/library/sections";

		this.getPlex(sectionsPath, cfg, (err, xml) => {
			if (err) {
				console.log(this.name + " error fetching sections: " + err);
				callback(err, []);
				return;
			}

			let json;
			try {
				json = xmlParser.parse(xml);
			} catch (e) {
				console.log(this.name + " failed to parse sections XML: " + e);
				callback(e, []);
				return;
			}

			const container = json && json.MediaContainer ? json.MediaContainer : {};
			let dirs = container.Directory || [];
			if (!Array.isArray(dirs)) {
				dirs = dirs ? [dirs] : [];
			}

			// TV sections: type === "show"
			const tvSections = dirs.filter(d => d.type === "show");
			const sectionIds = tvSections.map(d => d.key);

			if (sectionIds.length === 0) {
				callback(null, []);
				return;
			}

			const episodes = [];
			const self = this;

			const fetchFromSection = function (index) {
				if (index >= sectionIds.length || episodes.length >= limit) {
					callback(null, episodes.slice(0, limit));
					return;
				}

				const sectionId = sectionIds[index];
				const path =
					"/library/sections/" +
					sectionId +
					"/all?type=4&sort=addedAt:desc" +
					"&X-Plex-Container-Start=0" +
					"&X-Plex-Container-Size=" +
					limit;

				self.getPlex(path, cfg, (errSec, xmlSec) => {
					if (errSec) {
						console.log(
							self.name +
								" error fetching episodes from section " +
								sectionId +
								": " +
								errSec
						);
						fetchFromSection(index + 1);
						return;
					}

					const norm = self.normalizeRecentlyAdded(xmlSec, cfg);
					const eps = norm.episodes || [];

					for (let i = 0; i < eps.length && episodes.length < limit; i++) {
						episodes.push(eps[i]);
					}

					fetchFromSection(index + 1);
				});
			};

			fetchFromSection(0);
		});
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "MY_PLEX_TEST") {
			this.sendSocketNotification("MY_PLEX_TEST_RESULT", {
				message: "Node helper is alive.",
				timestamp: Date.now()
			});
		}

		if (notification === "FETCH_PLEX_TEST") {
			const cfg = payload;
			this.getPlex("/identity", cfg, (err, result) => {
				if (err) {
					this.sendSocketNotification("FETCH_PLEX_TEST_RESULT", {
						error: err.toString()
					});
				} else {
					this.sendSocketNotification("FETCH_PLEX_TEST_RESULT", {
						raw: result
					});
				}
			});
		}

		if (notification === "FETCH_RECENTLY_ADDED") {
			const cfg = payload;

			// Movies from global recentlyAdded (works fine today)
			this.getPlex("/library/recentlyAdded", cfg, (errMovies, moviesXml) => {
				if (errMovies) {
					console.log(
						this.name +
							" error fetching recently added movies: " +
							errMovies
					);
					this.sendSocketNotification(
						"FETCH_RECENTLY_ADDED_RESULT",
						{
							error: errMovies.toString(),
							movies: [],
							episodes: []
						}
					);
					return;
				}

				const moviesResult = this.normalizeRecentlyAdded(
					moviesXml,
					cfg
				);
				let movies = moviesResult.movies || [];

				// Episodes from TV sections (Newzlettr-style)
				this.fetchEpisodesFromTVSections(
					cfg,
					(errEpisodes, episodes) => {
						if (errEpisodes) {
							console.log(
								this.name +
									" error fetching recently added episodes (sections): " +
									errEpisodes
							);
						}

						let eps = episodes || [];

						// --- Lookback filtering (Newzlettr style) ---
						const lookbackDays = cfg.lookbackDays ? Number(cfg.lookbackDays) : 0;
						if (lookbackDays > 0) {
							const cutoff =
								Math.floor(Date.now() / 1000) -
								lookbackDays * 86400;

							// Filter movies and episodes by addedAt >= cutoff
							movies = movies.filter(
								m => m.addedAt && m.addedAt >= cutoff
							);
							eps = eps.filter(
								e => e.addedAt && e.addedAt >= cutoff
							);
						}

						this.sendSocketNotification(
							"FETCH_RECENTLY_ADDED_RESULT",
							{
								movies,
								episodes: eps
							}
						);
					}
				);
			});
		}

		if (notification === "FETCH_NOW_STREAMING") {
			const cfg = payload;
			this.getPlex("/status/sessions", cfg, (err, result) => {
				if (err) {
					this.sendSocketNotification("FETCH_NOW_STREAMING_RESULT", {
						error: err.toString()
					});
				} else {
					const sessions = this.normalizeSessions(result, cfg);
					this.sendSocketNotification("FETCH_NOW_STREAMING_RESULT", {
						sessions
					});
				}
			});
		}
	}
});
