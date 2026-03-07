# Bz SVG Editor

A React + TypeScript SVG path editor focused on Illustrator-style path editing: anchor points, bezier handles, transform tools, and a live editable SVG code pane.

## Tech Stack

- React 19
- TypeScript
- Vite
- Tauri v2 (desktop shell)
- Lucide React (icons)
- MUI Slider
- react-colorful

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
npm install
```

### Run Dev Server

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Run Desktop App (Tauri)

```bash
npm run tauri:dev
```

### Build Desktop App Bundle

```bash
npm run tauri:build
```

### Tauri (Desktop) Prerequisites

- Rust toolchain (`rustup`, `cargo`, `rustc`)
- Platform build tools:
1. macOS: Xcode Command Line Tools
1. Windows: Visual Studio C++ Build Tools + WebView2
1. Linux: GTK/WebKitGTK dev packages (distribution-specific)

Without Rust + platform toolchains, web scripts still work (`npm run dev`, `npm run build`), but `tauri:*` scripts will fail.

### Preview Production Build

```bash
npm run preview
```

## Web + Desktop Workflow

- The existing Vite app remains the source of truth for the UI.
- `npm run dev` and `npm run build` still serve and build the web app exactly as before.
- `npm run tauri:dev` starts the same frontend inside a native Tauri shell for local desktop development.
- `npm run tauri:build` packages the app as a native desktop bundle.
- Tauri app config lives in `src-tauri/tauri.conf.json`; Rust entrypoints are under `src-tauri/src/`.

## Project Structure

- `src/App.tsx`:
  Main editor logic and UI (tools, canvas interactions, parsing/serialization, selection, transforms, history, modal).
- `src/styles.css`:
  Global styles for layout, controls, editor overlays, and modal.
- `src/main.tsx`:
  React app bootstrap.
- `public/favicon.svg`:
  App favicon.

## Core Features

- Multi-path SVG editing
- Anchor/handle editing for cubic bezier paths
- Pen/select/transform workflows
- Move, scale, rotate with visual transform box
- Zoom + pan viewport controls
- Simplify, smooth, and merge-point utilities
- Live SVG code sync (paste/edit/copy)
- Undo/redo for editing operations

## Notes for Devs

- The app keeps parsed `viewBox` data and serializes paths back to SVG code.
- UI state and geometry state are managed together in `App.tsx`; most behavior changes should start there.
- Keep stroke/anchor overlays using non-scaling stroke behavior where visual consistency across zoom matters.

## License

This project currently shows MIT-style license wording in the in-app About dialog. If you want repository-level licensing, add a `LICENSE` file explicitly.
