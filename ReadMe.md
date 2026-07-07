# ImgTemplate

A browser‑based tool to **crop images** and **overlay custom grid lines** using an interactive HSL colour picker.

**Live demo:** [notnatedavis.github.io/imgTemplate](https://notnatedavis.github.io/imgTemplate)

## Table of Contents

- [Features](#features)
- [Usage](#usage)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Additional Information](#additional-information)

## Features

- Drag‑and‑drop or click to upload an image
- Crop to **1:1**, **4:3**, or keep original proportions
- Customisable grid: set any number of horizontal & vertical divisions (equally spaced)
- HSL colour picker for grid lines – hue, saturation, and lightness sliders with live preview
- Real‑time preview on an HTML canvas
- Download the final image as PNG

## Usage

1. **Clone the repository**
   ```bash
   git clone https://github.com/notnatedavis/imgTemplate
   cd imgTemplate
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```
   **this opens `http://localhost:3000` in your browser**

4. **Build for production / deploy to GitHub Pages**
   ```bash
   npm run deploy
   ```
   (This runs `predeploy` (build) then publishes the `dist` folder to the `gh-pages` branch.)

## Deployment

The project is configured to be deployed on GitHub Pages using the `gh-pages` package.  
After running `npm run deploy`, your site will be available at `https://<username>.github.io/imgTemplate`.

## Project Structure

```bash
ImgTemplate/
├── assets/
│   └── icons/            # (optional icons)
├── css/
│   └── style.css
├── js/
│   ├── downloadHelper.js
│   ├── gridOverlay.js
│   ├── imageUtils.js
│   ├── main.js
│   └── uiController.js
├── .gitignore
├── index.html
├── package.json
├── ReadMe.md
└── vite.config.js
```

## Additional Information

- No external libraries are used beyond **Vite** (dev server/bundler) and **gh-pages** (deployment).
- All image processing happens client‑side – no image data is ever sent to a server.
- The grid lines are baked into the preview canvas; the downloaded image includes them.