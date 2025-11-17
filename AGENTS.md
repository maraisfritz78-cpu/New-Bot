# AGENTS.md

## Build Commands
- `npm run dev` - Start development server with Turbopack on port 9002
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking
- `npm run genkit:dev` - Start Genkit AI server for optimization features

## Testing
No test framework configured. Add testing setup if needed.

## Code Style Guidelines

### Imports
- Use absolute imports with `@/` prefix for src directory
- Group imports: React/Next.js → third-party → local components
- Example: `import { Button } from "@/components/ui/button"`

### Formatting & Types
- TypeScript strict mode enabled
- Use shadcn/ui components with `cn()` utility for styling
- Tailwind CSS with CSS variables for theming
- Zod schemas for type validation (see `strategySchema`)

### Naming Conventions
- Components: PascalCase (e.g., `MarketDataCard`)
- Files: kebab-case (e.g., `market-data-card.tsx`)
- Variables/Functions: camelCase
- Constants: UPPER_SNAKE_CASE

### Error Handling
- Use try-catch blocks for async operations
- Validate data with Zod schemas before processing
- Return proper HTTP status codes in API routes

### Project Structure
- `src/components/ui/` - shadcn/ui components
- `src/components/dashboard/` - dashboard-specific components
- `src/lib/` - utilities, types, and services
- `src/app/api/` - Next.js API routes
- `src/ai/` - Genkit AI flows and configuration