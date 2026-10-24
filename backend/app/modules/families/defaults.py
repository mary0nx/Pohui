"""Initial data for a new family (Russian names; users can rename everything)."""

EXPENSE_CATEGORIES: list[tuple[str, str]] = [
    ("Продукты", "shopping-basket"),
    ("Кафе и рестораны", "utensils"),
    ("Жильё", "home"),
    ("Коммунальные услуги", "zap"),
    ("Связь и интернет", "wifi"),
    ("Транспорт", "car"),
    ("Здоровье", "heart-pulse"),
    ("Одежда", "shirt"),
    ("Дом и быт", "sofa"),
    ("Развлечения", "party-popper"),
    ("Подписки", "repeat"),
    ("Подарки", "gift"),
    ("Путешествия", "plane"),
    ("Образование", "graduation-cap"),
    ("Красота и уход", "sparkles"),
    ("Другое", "circle-ellipsis"),
]

INCOME_CATEGORIES: list[tuple[str, str]] = [
    ("Зарплата", "briefcase"),
    ("Подработка", "laptop"),
    ("Подарки", "gift"),
    ("Проценты и кешбэк", "percent"),
    ("Другое", "circle-ellipsis"),
]
