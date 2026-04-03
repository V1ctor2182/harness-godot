class_name SeedData
extends Resource
## Resource representing a seed item in the player's inventory.
## PRD: farming/seeds — each seed has an id, display name, elemental affinity, and quantity held.

@export var seed_id: String = ""
@export var seed_name: String = ""
@export var element: String = ""
@export var quantity: int = 0
