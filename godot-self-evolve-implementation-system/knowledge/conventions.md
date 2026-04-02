# GDScript Conventions

## Typing

Static typing everywhere. No untyped variables, parameters, or return values.

```gdscript
var speed: float = 10.0          # explicit type
var name := "Shambler"           # inferred type
func get_damage() -> int:        # return type required
func _ready() -> void:           # void for no return
```

## Naming

- Functions and variables: `snake_case`
- Classes and nodes: `PascalCase`
- Constants and enums: `UPPER_SNAKE_CASE`
- Signals: `snake_case` (past tense for events: `zombie_harvested`, `plot_planted`)
- Files: `snake_case.gd`, `snake_case.tscn`

## Signals

Declare at the top of the file, below `class_name`. Always specify parameter types.

```gdscript
signal zombie_harvested(zombie: ZombieData, quality: int)
signal crop_ready(plot_id: int)
```

Use `.emit()`, never `.call()`. Connect via code with typed callables or use the editor.

## Autoloads

Registered in `project.godot`. Access globally by class name (e.g., `GameManager`, `AssetManager`). Never instantiate autoloads manually.

## Scene Organization

- Main scenes: `scenes/` (one per screen or major system)
- Reusable subscenes: `scenes/components/`
- UI elements: `scenes/ui/`

## Resource Loading

Always use `AssetManager.get_texture(asset_id)` or equivalent manager methods. Never use bare `load("res://assets/...")` — all asset paths must go through the manager for caching and error handling.

## Node References

```gdscript
@onready var health_bar: ProgressBar = %HealthBar   # unique node (preferred)
@onready var sprite: Sprite2D = $Visuals/Sprite2D    # relative path (when needed)
```

Avoid hardcoded absolute paths. Use `%UniqueNode` for same-scene references.

## Data Files

JSON in `data/{domain}/` — `farming/`, `zombie/`, `combat/`, `economy/`, `global/`. Loaded via data manager autoloads, never parsed inline.

## Comments

Only where logic is not self-evident. Reference PRD formulas:

```gdscript
# PRD 4.2.1: harvest_yield = base_yield * quality_mult * element_bonus
var yield_amount: int = base_yield * quality_mult * element_bonus
```

## Error Handling

- `push_error()` for recoverable errors (missing data, bad state)
- `assert()` for development-time invariant checks (stripped in release)
- Never silently swallow errors

## Tests

```gdscript
extends GutTest

func before_each() -> void:
    # setup

func test_zombie_harvest_yields_correct_amount() -> void:
    # arrange, act, assert
    assert_eq(result, expected)

func after_each() -> void:
    # teardown
```

Prefix all test functions with `test_`. Use `watch_signals()` for signal assertions.

## Git

- One branch per task: `task-{id}-{short-slug}`
- Never push directly to main
- Don't refactor outside task scope
- Don't add dependencies without justification
