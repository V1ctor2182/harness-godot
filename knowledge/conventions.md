# GDScript Coding Conventions — Zombie Farm

## Static Typing
Use typed declarations everywhere:
```gdscript
var speed: float = 200.0
var name := "Zombie"          # := infers type
func move(dir: Vector2) -> void:
func is_alive() -> bool:
```

## Naming
- Functions/variables: `snake_case` — `get_input_direction`, `zombie_count`
- Classes/Nodes: `PascalCase` — `ZombieEntity`, `FarmScene`
- Constants: `UPPER_SNAKE` — `MAX_SPEED`, `DEFAULT_QUALITY`
- Signals: `snake_case` with typed params — `signal coins_changed(new_amount: int)`

## Signals
Declare at top of file. Use `.emit()`, never `.call()`:
```gdscript
signal zombie_mutated(zombie_id: int, mutation_name: String)
# Emit:
zombie_mutated.emit(id, name)
```

## Resource Loading
Use AssetManager (when available), never bare `load()`:
```gdscript
# ✅ Correct
var tex = AssetManager.get_texture("sprite.characters.player")
# ❌ Forbidden
var tex = load("res://assets/sprites/player.png")
```

## Node References
Use `@onready` and `%UniqueNode`:
```gdscript
@onready var sprite: Sprite2D = $Sprite2D
@onready var label: Label = %StatusLabel  # unique name
```

## Tests
- Extend `GutTest`, prefix with `test_`
- Use `before_each()` / `after_each()` for setup/teardown
- Use `watch_signals()` + `assert_signal_emitted()`
- Run: `godot --headless -s addons/gut/gut_cmdln.gd`

## PRD References
Comment formulas with source: `# PRD 03b: mutation_rate = base_rate * gene_modifier`

## Data Files
JSON in `data/{domain}/`: farming/, zombie/, combat/, economy/, global/

## Commits
Format: `{type}({scope}): {description}` — feat/fix/test/refactor/docs/data/asset/chore
