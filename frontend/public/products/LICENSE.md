# Изображения товаров

Иллюстрации в этой папке — собственная графика Family OS, по одной на каждый товар каталога
(файл назван по id товара из `backend/app/modules/catalog/data.py`).

* `*.svg` — векторные рисунки, их генерирует `frontend/scripts/product-art.mjs`
  (`node scripts/product-art.mjs`); правьте рисунок в `frontend/scripts/product-art/`, а не SVG-файл.
* `asparagus.png`, `green-beans.png` — иллюстрации, присланные владельцем проекта.
* `category-*.svg` — запасные картинки категорий для товаров, которых нет в каталоге.

Распространяются вместе с кодом по лицензии MIT (см. `LICENSE` в корне репозитория).
