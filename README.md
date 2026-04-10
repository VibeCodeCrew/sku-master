# SKU Master

Расширение для Chrome (Manifest V3) для работы с артикулами товаров М.Видео и Эльдорадо.

## Возможности

- **Сбор артикулов** — автоматический сбор SKU со всех открытых вкладок М.Видео и Эльдорадо в один клик
- **Копирование со ссылками** — SKU копируются с кликабельными ссылками на товары (для вставки в Google Docs, Excel и т.д.)
- **Пакетное открытие** — вставьте список артикулов или ссылку на Google Docs, и расширение откроет все товары во вкладках
- **Проверка наличия** — пакетная проверка статуса товаров: в наличии, мало, нет в продаже, мягкий бан
- **Мониторинг цен и наличия** — отслеживание изменений цен и статуса товаров с уведомлениями
- **Обнаружение бана** — автоматическое определение мягкого бана М.Видео (403/429) с уведомлениями о снятии
- **Защита от перегрузок** — встроенный троттлинг запросов к API М.Видео для снижения риска блокировки
- **История обработки** — отслеживание ранее обработанных артикулов с возможностью очистки
- **Определение региона** — предупреждение, если город не Москва (цены и наличие могут отличаться)

## Установка

1. Скачайте или клонируйте репозиторий
2. Откройте `chrome://extensions/` в браузере
3. Включите **Режим разработчика** (переключатель в правом верхнем углу)
4. Нажмите **Загрузить распакованное расширение**
5. Выберите папку с файлами расширения

## Использование

1. Откройте вкладки с товарами на сайтах М.Видео или Эльдорадо
2. Нажмите на иконку расширения — откроется виджет
3. Нажмите **Собрать** для сбора артикулов со всех вкладок
4. Результаты автоматически копируются в буфер обмена со ссылками

## Поддерживаемые сайты

- [mvideo.ru](https://www.mvideo.ru)
- [eldorado.ru](https://www.eldorado.ru)
- [docs.google.com](https://docs.google.com) (для пакетного открытия)

## Технические детали

- **Manifest V3** — современный формат расширений Chrome
- **Service Worker** — фоновая логика работает в service worker
- **Shadow DOM** — виджет изолирован от стилей сайта
- **Web Locks API** — синхронизация запросов для предотвращения перегрузки

## Лицензия

Частный проект. Все права защищены.

---

# SKU Master (English)

Chrome extension (Manifest V3) for working with product SKUs from M.Video and Eldorado online stores.

## Features

- **SKU Collection** — automatically collect SKUs from all open M.Video and Eldorado tabs in one click
- **Copy with Links** — SKUs are copied with clickable product links (for pasting into Google Docs, Excel, etc.)
- **Batch Opening** — paste a list of SKUs or a Google Docs link, and the extension opens all products in tabs
- **Availability Check** — batch check product status: in stock, low stock, out of stock, soft ban
- **Price & Availability Monitoring** — track price changes and product status with notifications
- **Ban Detection** — automatic detection of M.Video soft bans (403/429) with notifications when lifted
- **Rate Limiting Protection** — built-in request throttling for M.Video API to reduce blocking risk
- **Processing History** — track previously processed SKUs with the ability to clear history
- **Region Detection** — warning if the city is not Moscow (prices and availability may differ)

## Installation

1. Download or clone this repository
2. Open `chrome://extensions/` in your browser
3. Enable **Developer mode** (toggle in the top right corner)
4. Click **Load unpacked**
5. Select the folder with the extension files

## Usage

1. Open tabs with products on M.Video or Eldorado websites
2. Click the extension icon — a widget will appear
3. Click **Collect** to gather SKUs from all tabs
4. Results are automatically copied to the clipboard with links

## Supported Websites

- [mvideo.ru](https://www.mvideo.ru)
- [eldorado.ru](https://www.eldorado.ru)
- [docs.google.com](https://docs.google.com) (for batch opening)

## Technical Details

- **Manifest V3** — modern Chrome extension format
- **Service Worker** — background logic runs in a service worker
- **Shadow DOM** — widget is isolated from website styles
- **Web Locks API** — request synchronization to prevent overloading

## License

Private project. All rights reserved.
