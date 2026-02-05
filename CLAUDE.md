# CLAUDE.md

Instructions for working with Squash Payment Bot project.

## Project Structure

```
src/
├── index.ts                 # Entry point
├── container.ts             # IoC container (awilix)
├── bot/
│   ├── commands/            # Telegram commands (scaffold, event, test)
│   └── callbacks/           # Inline button handlers
├── business/                # Business logic and orchestration
│   └── event.ts             # EventBusiness class
├── services/
│   ├── formatters/          # UI formatting (messages, keyboards)
│   ├── transport/           # External communication
│   │   ├── api/             # REST API server (Fastify) for n8n
│   │   └── telegram/        # TelegramOutput (bot.api wrapper)
│   └── logger/              # Logger with provider pattern
├── storage/
│   ├── db/                  # Drizzle ORM schema, migrations
│   └── repo/                # Repository layer (database operations only)
├── helpers/                 # Pure utility functions (date/time)
├── utils/                   # Shared utilities (environment, timeOffset)
├── config/                  # Configuration from env variables
└── types/                   # TypeScript types (domain models)

tests/
├── integration/specs/       # Integration tests (by feature)
├── e2e/specs/               # E2E tests (by feature)
└── shared/                  # Shared test utilities

docs/
├── architecture.md          # Architecture and use cases
├── features.md              # Feature list (for tests)
├── testing.md               # Testing strategy
└── plans/                   # Design documents (YYYY-MM-DD-<topic>-design.md)
```

### Naming

- Repositories: `*Repo` classes in `storage/repo/` — database operations only
- Business classes: `*Business` classes in `business/` — orchestration and domain logic
- Commands: `src/bot/commands/<name>.ts` — exports `commandName`, `handleCommand()`
- Types: PascalCase for interfaces, camelCase for functions
- Entity IDs: prefixes (`sc_` for scaffold, `ev_` for event, etc.)

## Code Style

- **Language**: All code, comments, and documentation must be in English
- **No `any`**: Using `any` type is forbidden
- **Strict TypeScript**: `strict: true`, `noUnusedLocals`, `noUnusedParameters`

## Important Documents

Before starting work, check these documents for context:

| Document | Purpose |
|----------|---------|
| [docs/architecture.md](docs/architecture.md) | System architecture, entities, use cases |
| [docs/features.md](docs/features.md) | Feature list (integration/e2e tests reference this) |
| [docs/testing.md](docs/testing.md) | Testing strategy and requirements |
| [docs/plans/](docs/plans/) | Design documents for features |

### Design Documents

Design docs are stored in `docs/plans/` with naming: `YYYY-MM-DD-<topic>-design.md`

Example: `2025-01-17-participant-registration-design.md`

## Feature Development Workflow

### Steps

1. **Brainstorm** — clarify requirements, explore approaches
2. **Design document** — write design doc in `docs/plans/YYYY-MM-DD-<topic>-design.md`
3. **Update documentation** (mandatory):
   - `docs/architecture.md` — if architecture changes
   - `docs/features.md` — add new feature to the list
4. **Create worktree** — isolate work in a separate git worktree
5. **Implement** — write code following project patterns
6. **Write tests** — see Testing section for requirements
7. **Review** — verify implementation against design doc

### Working with Git Worktrees

After creating a worktree, run the setup script to copy required files:

```bash
cd .worktrees/my-feature
../../scripts/setup-worktree.sh
```

**What it does:**
- Copies `.env.test` from main worktree (test database credentials)
- Copies `.claude/settings.local.json` (Claude Code settings)
- Runs `npm install` to set up dependencies

### Adding New Command

1. Create `src/bot/commands/<name>.ts`
2. Export `commandName` and `handleCommand(ctx)`
3. Command is auto-loaded from the directory

### Adding New Repository

1. Create `src/storage/repo/<name>.ts`
2. Create class `<Name>Repo` with database operations only
3. Register in IoC container (`src/container.ts`)
4. Use Drizzle ORM to interact with database tables from `~/storage/db/schema`

### Adding New Business Class

1. Create `src/business/<name>.ts`
2. Create class `<Name>Business` with orchestration logic
3. Inject dependencies via constructor (repos, transport, formatters)
4. Register in IoC container (`src/container.ts`)

### Adding New Formatter

1. Add function to `src/services/formatters/<name>.ts`
2. Pure function: takes domain objects, returns formatted strings/keyboards
3. No dependencies on other layers

## Testing

### Test Types and Location

| Type | Location | Named by | Description |
|------|----------|----------|-------------|
| Unit | `src/**/*.test.ts` | source file | Colocated with code |
| Integration | `tests/integration/specs/*.test.ts` | feature | Tests feature with in-memory SQLite |
| E2E | `tests/e2e/specs/*.spec.ts` | feature | Full flow with real Telegram |

Features are defined in `docs/features.md`. Integration and E2E tests should reference features from this list.

### Commands

```bash
npm run typecheck    # Type checking
npm run lint         # Linting
npm test             # Run all tests
npm run test:e2e     # Run E2E tests
```

### Before Commit

Always run:
```bash
npm run typecheck && npm run lint && npm test
```
