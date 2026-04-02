extends GutTest
## Smoke test to verify GUT framework is working correctly.

func test_gut_works():
	assert_true(true, "GUT framework is functional")

func test_basic_math():
	assert_eq(2 + 2, 4, "Basic arithmetic works")

func test_string_operations():
	var name := "Zombie Farm"
	assert_string_contains(name, "Zombie")
	assert_eq(name.length(), 10)
