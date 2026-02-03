# CLAUDE.md

Instructions for working with Squash Payment Bot project.

## Project Structure

```
src/
├── index.ts                 # Entry point
├── bot/
│   ├── commands/            # Telegram commands (scaffold, event, test)
│   └── callbacks/           # Inline button handlers
├── api/                     # REST API for n8n (health, check-events, check-payments)
├── services/                # Business logic (scaffoldService, eventService, etc.)
├── storage/                 # Storage client (Notion) with mock support
├── config/                  # Configuration from env variables
├── types/                   # TypeScript types (domain models, Notion types)
└── utils/                   # Utilities (logger, dateParser, timeOffset)

tests/
├── integration/specs/       # Integration tests (by feature)
├── e2e/specs/               # E2E tests (by feature)
└── shared/                  # Shared test utilities

docs/
├── architecture.md          # Architecture and use cases
├── features.md              # Feature list (for tests)
├── testing.md               # Testing strategy
├── todo.md                  # Project roadmap
└── plans/                   # Design documents (YYYY-MM-DD-<topic>-design.md)
```

### Naming

- Services: `*Service.ts` — singleton export
- Commands: `src/bot/commands/<name>.ts` — exports `commandName`, `handleCommand()`
- Types: PascalCase for interfaces, camelCase for functions
- Entity IDs: prefixes (`sc_` for scaffold, etc.)

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
| [docs/todo.md](docs/todo.md) | Project roadmap and planned features |
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
   - `docs/todo.md` — mark feature as in progress / completed
   - `docs/features.md` — add new feature to the list
4. **Create worktree** — isolate work in a separate git worktree
5. **Implement** — write code following project patterns
6. **Write tests** — see Testing section for requirements
7. **Review** — verify implementation against design doc

### Adding New Command

1. Create `src/bot/commands/<name>.ts`
2. Export `commandName` and `handleCommand(ctx)`
3. Command is auto-loaded from the directory

### Adding New Service

1. Create `src/services/<name>Service.ts`
2. Export singleton instance: `export const nameService = new NameService()`
3. If service uses Notion storage — add entity mock (see below)

### Adding Entity Mock (for integration tests)

Mocks use Entity Registry Pattern. See `tests/integration/mocks/README.md` for details.

1. Create `tests/integration/mocks/entities/<name>Entity.ts`:
   - Implement `EntityStore<T>` — in-memory storage
   - Implement `EntityConverters<T>` — domain ↔ Notion conversion
   - Export `create<Name>EntityConfig()` factory
2. Register in `tests/integration/mocks/notionMock.ts`:
   - Add database ID constant
   - Add config to `entityRegistry` in constructor

## Testing

### Test Types and Location

| Type | Location | Named by | Description |
|------|----------|----------|-------------|
| Unit | `src/**/*.test.ts` | source file | Colocated with code |
| Integration | `tests/integration/specs/*.test.ts` | feature | Tests feature with mocked Notion |
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
