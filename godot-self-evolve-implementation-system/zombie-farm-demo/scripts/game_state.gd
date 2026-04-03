extends Node
class_name GameState
## Autoload singleton tracking global game state: currency and day progression.

signal coins_changed(new_balance: int)
signal day_advanced(new_day: int)

var dark_coins: int = 0
var current_day: int = 1


## Add dark_coins to the balance and emit coins_changed.
func add_coins(amount: int) -> void:
	dark_coins += amount
	coins_changed.emit(dark_coins)


## Spend dark_coins if balance is sufficient. Returns true on success, false otherwise.
## Only emits coins_changed when the spend succeeds.
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
