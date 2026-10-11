# LazyDM

**LazyDM** - Your lazy dungeon master assistant for managing D&D campaigns, characters, and encounters.

## Overview

LazyDM is a desktop application built with Electron and Angular that helps dungeon masters organize and manage their tabletop RPG sessions. The application follows a local-first architecture with all data stored locally on your machine.

## Features

- **Campaigns Management**: Organize your D&D campaigns
- **Character Tracking**: Manage player characters and NPCs
- **Encounter Planning**: Plan and run combat encounters
- **Dark Mode**: Built-in theme support
- **Responsive Design**: Works on various screen sizes

## Tech Stack

- **Framework**: Angular 21+ (Standalone Components)
- **Desktop**: Electron 40+
- **Styling**: Tailwind CSS 4+
- **Database**: Better-SQLite3 (local-first)
- **State Management**: RxJS + Angular Signals
- **i18n**: ngx-translate
- **UI Components**: Custom "ArcTechUI" component library (Techno-Brutalism / Retro-Futurism style)

## Architecture

This application follows the **IPC-Driven Layered Architecture** pattern:

- **Renderer Process**: Angular UI (sandboxed)
- **Main Process**: Electron backend with IPC communication
- **Local Database**: SQLite for data persistence
- **Type-Safe Boundaries**: DTOs for IPC communication

For detailed architecture information, see `architecture-blueprint.md` in the parent directory.

## Project Structure

```
lazy_dm/
├── src/
│   ├── app/
│   │   ├── components/       # Reusable components
│   │   ├── config/           # App configuration
│   │   ├── layout/           # Layout components
│   │   ├── pages/            # Page components
│   │   ├── services/         # IPC services
│   │   └── shared/           # Shared component library
│   ├── assets/               # Fonts, icons
│   └── styles.css            # Global styles
├── electron/                 # Electron main process
├── scripts/                  # Build scripts
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 11+

### Installation

```bash
# Install dependencies
npm install

# Build preload script
npm run build:preload
```

### Development

```bash
# Start development server (Angular + Electron)
npm run dev

# Or run separately:
npm start              # Angular dev server only
npm run electron:dev   # Electron with hot reload
```

### Building

```bash
# Build for production
npm run build:prod

# Build desktop app (without packaging)
npm run build:desktop

# Create distributable
npm run dist

# Platform-specific builds
npm run dist:mac
npm run dist:win
npm run dist:linux
```

## Available Scripts

- `npm start` - Start Angular dev server
- `npm run dev` - Start full development environment
- `npm run build` - Build Angular app
- `npm run build:prod` - Production build
- `npm run electron:dev` - Start Electron in dev mode
- `npm run electron:start` - Start Electron
- `npm run dist` - Create distributable package

## Development Guidelines

### Code Style

- Use **standalone components** (no NgModules)
- Use **Angular signals** for reactive state
- Use **inject()** function for dependency injection
- Follow **PascalCase** for classes, **kebab-case** for files
- Use `@/` path alias for app imports

### Component Pattern

```typescript
import { Component, inject } from '@angular/core';

@Component({
  selector: 'app-example',
  imports: [/* standalone imports */],
  template: `...`,
})
export class ExampleComponent {
  private readonly service = inject(SomeService);
}
```

### Service Pattern

```typescript
@Injectable({ providedIn: 'root' })
export class ExampleService extends BaseIpcService<APIChannel.EXAMPLE> {
  constructor() {
    super(APIChannel.EXAMPLE);
  }
}
```

## Current Status

🚧 **In Development** - This is a scaffolding project with:

- ✅ Project structure
- ✅ Layout system (sidebar, header, toolbar)
- ✅ Routing (home + 3 sections)
- ✅ Theme support (dark/light mode)
- ✅ Reusable component library
- ⏳ Database integration (pending)
- ⏳ IPC implementation (pending)
- ⏳ Feature implementation (pending)

## Contributing

This project follows the architecture patterns defined in `architecture-blueprint.md`. Please review the blueprint before contributing.

## License

Private project - All rights reserved

## Author

Your Name

---

Built with ❤️ using Angular and Electron