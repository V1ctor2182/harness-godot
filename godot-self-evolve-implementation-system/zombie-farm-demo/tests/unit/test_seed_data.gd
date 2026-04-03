extends GutTest
## Unit tests for SeedData resource.

func test_seed_data_default_values() -> void:
    var sd: SeedData = SeedData.new()
    assert_eq(sd.seed_id, "", "seed_id default should be empty string")
    assert_eq(sd.seed_name, "", "seed_name default should be empty string")
    assert_eq(sd.element, "", "element default should be empty string")
    assert_eq(sd.quantity, 0, "quantity default should be 0")

func test_seed_data_can_set_seed_id() -> void:
    var sd: SeedData = SeedData.new()
    sd.seed_id = "SEED_001"
    assert_eq(sd.seed_id, "SEED_001", "seed_id should be settable")

func test_seed_data_can_set_seed_name() -> void:
    var sd: SeedData = SeedData.new()
    sd.seed_name = "Zombie Wheat"
    assert_eq(sd.seed_name, "Zombie Wheat", "seed_name should be settable")

func test_seed_data_can_set_element() -> void:
    var sd: SeedData = SeedData.new()
    sd.element = "Fire"
    assert_eq(sd.element, "Fire", "element should be settable")

func test_seed_data_can_set_quantity() -> void:
    var sd: SeedData = SeedData.new()
    sd.quantity = 10
    assert_eq(sd.quantity, 10, "quantity should be settable")

func test_seed_data_is_resource() -> void:
    var sd: SeedData = SeedData.new()
    assert_true(sd is Resource, "SeedData should extend Resource")

func test_seed_data_quantity_zero_edge_case() -> void:
    var sd: SeedData = SeedData.new()
    sd.quantity = 0
    assert_eq(sd.quantity, 0, "quantity of 0 should be valid")

func test_seed_data_quantity_large_value() -> void:
    var sd: SeedData = SeedData.new()
    sd.quantity = 9999
    assert_eq(sd.quantity, 9999, "large quantity should be storable")
