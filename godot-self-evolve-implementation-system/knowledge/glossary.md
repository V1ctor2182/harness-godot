# Glossary

## Game Terms

**Zombie Types** — Shambler (slow, high yield), Runner (fast, low yield), Brute (tanky, AoE), Spitter (ranged, debuff).

**Quality Tiers** — Bronze, Silver, Gold, Iridium. Higher tiers multiply yields and unlock mutations.

**Five Elements** — Metal, Wood, Water, Fire, Earth. Govern cultivation affinity, combat interactions, and farming bonuses. Follows the generation/destruction cycle (Wood feeds Fire, Fire creates Earth, etc.).

**Cultivation Realms** — Qi Refining, Foundation Building, Golden Core. Each realm unlocks new abilities and increases stat caps.

**Dark Coins** — Primary currency. Earned from harvesting zombies, completing quests, selling crops.

**Spirit Stones** — Premium currency. Used for rare seeds, high-tier catalysts, cultivation breakthroughs.

**Mutation Catalyst** — Consumable item applied to a zombie plot to trigger quality upgrades or element shifts.

**Plot** — A farming tile where zombies are planted, grown, and harvested.

**Harvest Yield** — Resources produced when a zombie reaches maturity. Scales with quality tier and element bonuses.

## Engine Terms

**Node** — Base building block in Godot. Everything in the scene tree is a Node or Node subclass.

**Scene** — A reusable tree of nodes saved as `.tscn`. Can be instantiated and composed.

**Autoload** — A scene or script automatically loaded at startup and accessible globally. Configured in `project.godot`.

**Signal** — Godot's observer pattern. Nodes emit signals; other nodes connect and respond.

**GDScript** — Godot's Python-like scripting language. Statically typed when annotations are used.

**GUT** — Godot Unit Testing framework. Runs tests via command line or in-editor.

**Headless Mode** — Running Godot without rendering (`--headless`). Used for L2 integration tests in CI.

**`.tscn`** — Text-based scene file format. Human-readable, version-control friendly.

**`.tres`** — Text-based resource file. Stores data like materials, themes, custom resources.

**ExtResource** — A reference to an external file within a `.tscn` or `.tres` file.
