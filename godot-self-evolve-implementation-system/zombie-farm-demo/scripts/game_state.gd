extends Node
class_name GameState
## Global game state autoload.
## Tracks dark_coins and current_day, emits signals on state changes.

signal coins_changed(new_amount: int)
signal day_advanced(new_day: int)

var dark_coins: int = 0
var current_day: int = 1


## Add coins to the player's balance and emit coins_changed.
func add_coins(amount: int) -> void:
	dark_coins += amount
	coins_changed.emit(dark_coins)


## Spend coins if balance is sufficient.
## Returns true on success, false (without modifying dark_coins) when amount exceeds balance.
func spend_coins(amount: int) -> bool:
	if amount > dark_coins:
		return false
	dark_coins -= amount
	coins_changed.emit(dark_coins)
	return true


## Advance the current day by 1 and emit day_advanced.
func advance_day() -> void:
	current_day += 1
	day_advanced.emit(current_day)
