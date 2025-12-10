# MMM-MyPlex

A MagicMirror² module that displays **recently added** and **now streaming** content straight from your Plex Media Server, beautifully formatted as rotating cards. Designed for clarity, configurability, and people who like documentation that doesn’t suck.

---

## Features

- 🎬 **Recently Added Movies** – Poster, title, year, runtime, rating, quality, codec, date added, summary.
- 📺 **Recently Added TV Episodes** – Correct series posters, season/episode labels, summary.
- 📡 **Now Streaming** – Live playback status, user name, device, progress, bitrate, resolution, codec.
- 🖼️ **Slideshow Cards** – Each media item becomes its own card. Random or sequential.
- ⏱️ **Lookback Filter** – Show only content added within the last *N* days.
- 🎛️ **Massive Configurability** – Toggle almost every piece of displayed metadata.

## Layout Modes & Orientation Support

MMM-MyPlex now includes optional **layout scaling modes** and **orientation-aware sizing** to optimize the module for different MagicMirror displays.

### 🔠 Layout Modes
| Mode        | Description |
|-------------|-------------|
| `compact`   | Default size. Best for small regions or multi-module dashboards. |
| `big`       | Enlarged posters, wider text columns, bigger fonts, and expanded summaries. Ideal for mirrors with more space or when MMM-MyPlex is the star of the show. |

### 🖥️ Orientation
| Orientation   | Description |
|---------------|-------------|
| `vertical`    | Optimized for portrait MagicMirrors. Narrower layout, controlled height. |
| `horizontal`  | Designed for landscape displays. Wider layout, taller posters, more text before truncation. |

Layout mode and orientation can be combined:

- **`layoutMode: "big", orientation: "horizontal"`** → cinematic, wide-format card display  
- **`layoutMode: "big", orientation: "vertical"`** → large portrait cards  
- **`compact`** + either orientation → minimal footprint  

Add these options to your module config:

```js
layoutMode: "compact",   // "compact" or "big"
orientation: "vertical", // "vertical" or "horizontal"
```

---

## Requirements

- MagicMirror² installed and running.
- A Plex Media Server reachable from your MagicMirror.
- A Plex authentication token.

> ⚠️ Never share your Plex token publicly.

---

## Installation

From the MagicMirror `modules` directory:

```bash
git clone https://github.com/KunkmasterFlex/MMM-MyPlex.git
cd MMM-MyPlex
npm install
```

---

## Configuration

Add to your `config.js`:

```js
{
  module: "MMM-MyPlex",
  position: "bottom_right",
  config: {
    server: "Your.Server.IP.Address",
    serverName: "Friendly Plex Media Server Name",
    port: 32400,
    https: false,
    token: "MY_PLEX_TOKEN_HERE",

    showRecentlyAddedMovies: true,
    showRecentlyAddedEpisodes: true,
    showNowStreaming: true,

    recentlyAddedMovieLimit: 5,
    recentlyAddedEpisodeLimit: 5,
    nowStreamingLimit: 5,
    lookbackDays: 30,
    layoutMode: "compact",
    orientation: "vertical",

    recentlyAddedUpdateInterval: 5 * 60 * 1000,
    nowStreamingUpdateInterval: 15 * 1000,

    slideInterval: 15000,
    slideOrder: "random",
    fadeSpeed: 1000,

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
      showUser: true,
      showBitrate: true,
      showProgress: true,
      showSeriesTitle: true,
      showEpisodeLabel: true
    },

    debug: false
  }
}
```

---

## Configuration Reference

### PMS Connection

| Field       | Type    | Required | Default       | Description |
|-------------|---------|----------|---------------|-------------|
| `server`    | string  | yes      | `127.0.0.1`   | Plex server address |
| `serverName`| string  | no       | `Plex`        | Friendly name shown in card headers |
| `port`      | number  | yes      | `32400`       | Plex port |
| `https`     | boolean | yes      | `false`       | Enable HTTPS |
| `token`     | string  | yes      | `""`          | Plex API Token |
| `debug`     | boolean | no       | `false`       | Enables verbose logging |

---

### What to Show

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `showRecentlyAddedMovies` | boolean | true | Display recently added movies |
| `showRecentlyAddedEpisodes` | boolean | true | Display recently added episodes |
| `showNowStreaming` | boolean | true | Display now streaming items |

---

### Limits & Lookback

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `recentlyAddedMovieLimit` | number | 5 | Max movies |
| `recentlyAddedEpisodeLimit` | number | 5 | Max episodes |
| `nowStreamingLimit` | number | 5 | Max streams |
| `lookbackDays` | number | 30 | How many days back to show |

---

### Polling & Slideshow

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `recentlyAddedUpdateInterval` | number | 300000 | Refresh recent items |
| `nowStreamingUpdateInterval` | number | 15000 | Refresh streaming |
| `slideInterval` | number | 15000 | Time each card stays visible |
| `slideOrder` | string | "sequential" | "random" or "sequential" |
| `fadeSpeed` | number | 1000 | Fade transition speed |
| `layoutMode`   | string | "compact" | "compact" or "big" display mode |
| `orientation`  | string | "vertical" | "vertical" or "horizontal" layout |

---

### Display Toggles

All are booleans. All default **true**.

- `showPosters`
- `showYear`
- `showRuntime`
- `showContentRating`
- `showRating`
- `showGenres`
- `showQuality`
- `showCodec`
- `showDateAdded`
- `showSummary`
- `showUser`
- `showBitrate`
- `showProgress`
- `showSeriesTitle`
- `showEpisodeLabel`

---

## Example Config (Copy & Paste)

```js
{
  module: "MMM-MyPlex",
  position: "bottom_right",
  config: {
    server: "192.168.1.10",
    serverName: "My Plex",
    port: 32400,
    https: false,
    token: "MY_PLEX_TOKEN_HERE",

    showRecentlyAddedMovies: true,
    showRecentlyAddedEpisodes: true,
    showNowStreaming: true,

    recentlyAddedMovieLimit: 5,
    recentlyAddedEpisodeLimit: 5,
    nowStreamingLimit: 5,
    lookbackDays: 30,
    layoutMode: "compact",
    orientation: "vertical",

    slideInterval: 15000,
    slideOrder: "random",
    fadeSpeed: 1000,

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
      showUser: true,
      showBitrate: true,
      showProgress: true,
      showSeriesTitle: true,
      showEpisodeLabel: true
    },

    debug: false
  }
}
```

---

## Getting Your Plex Token

1. Open Plex Web.
2. Click any any of your media in Plex.
3. Click on the "..." and click on "Get Info".
4. Click on "View XML" on the bottom of the info pane.
4. Click on the URL in your browser. The tail end of the URL should say "X-Plex-Token=". Everything after = is your token.

Do **NOT** share this token.

---

## Debugging

Set:

```js
debug: true
```

This will log sanitized Plex request URLs, helpful for troubleshooting.

Errors are always logged regardless of debug mode.

---

## License

MIT

---

## Credits

**MMM-MyPlex**  
By **Jeff + Steely-Eyed Missile Bot (ChatGPT)**
