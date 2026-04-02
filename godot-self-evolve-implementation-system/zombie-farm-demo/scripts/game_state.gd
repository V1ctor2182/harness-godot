extends Node

signal coins_changed(new_amount: int)

var player_level: int = 1
var dark_coins: int = 100


func add_coins(amount: int) -> void:
	dark_coins += amount
	coins_changed.emit(dark_coins)


func spend_coins(amount: int) -> bool:
	if dark_coins < amount:
		return false
	dark_coins -= amount
	coins_changed.emit(dark_coins)
	return true
