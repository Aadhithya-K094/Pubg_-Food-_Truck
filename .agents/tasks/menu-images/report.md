# Menu images report

All 43 `menu_items` rows now have a photo from Wikimedia Commons (free licenses only). Full credits (author, file page, license URL) are in `database/menu_image_credits.md`.

| Dish | Image file | Commons source | License |
|---|---|---|---|
| 2X Veg Rice | veg-fried-rice.jpg | File:Kerala vegetable fried rice 2.jpg | CC BY-SA 4.0 |
| 3X Egg Rice | egg-fried-rice.jpg | File:Egg Fried Rice.jpg | CC BY-SA 4.0 |
| 4X Gobi Rice | gobi-fried-rice.jpg | File:Fried Rice & Chilli Gobi.JPG | CC BY-SA 4.0 |
| 6X Paneer Rice | paneer-fried-rice.jpg | File:Paneer fried rice...jpg | CC BY-SA 4.0 |
| 8X Chicken Rice | chicken-fried-rice.jpg | File:Chicken Fried rice.jpg | CC BY-SA 4.0 |
| Schezwan Extra | schezwan.jpg | File:Schezwan noodles.jpg | CC BY-SA 4.0 |
| Pan / Buggy Bread Omelette | bread-omelette.jpg | File:Bread Omelette 6.jpg | CC BY-SA 4.0 |
| UAZ Chilly Parotta | chilli-parotta.jpg | File:Chilli parotta.jpg | CC BY-SA 4.0 |
| Chicken Lollipop | chicken-lollipop.jpg | File:Chicken lollipop.jpg | CC BY-SA 4.0 |
| Flare Wings | chicken-wings.jpg | File:Chicken Wings with Montreal Seasoning.jpg | CC BY 2.0 |
| Vikendi White BBQ (3 sizes) | bbq-vikendi.jpg | File:Barbecue chicken-03.jpg | CC BY 2.0 |
| Miramar Spicy BBQ (3 sizes) | bbq-miramar.jpg | File:Tandoori chicken Indian.jpg | CC BY-SA 2.0 |
| Sanhok Pepper BBQ (3 sizes) | bbq-sanhok.jpg | File:Chicken BBQ.jpg | CC BY 2.0 |
| Erangel SPL BBQ (3 sizes) | bbq-erangel.jpg | File:Barbecue chicken-04.jpg | CC BY 2.0 |
| All Shawarma (Roll) x10 | shawarma-roll.jpg | File:Shawarma-sandwich-01.jpg | CC BY 2.0 |
| All Shawarma (Plate) x10 | shawarma-plate.jpg | File:Chicken Shawarma Platter - Lavash 2025-02-10.jpg | CC BY-SA 3.0 |

## Files changed
- New: `backend/api/management/commands/load_menu_images.py`
- Edited: `backend/pubg_food_truck/settings.py` (MEDIA_URL, MEDIA_ROOT)
- Edited: `backend/pubg_food_truck/urls.py` (serve media when DEBUG)
- Generated: `database/menu_image_credits.md`, `database/backups/pubg_food_truck_backup.sql` (regenerated)
- No frontend change: `MenuItem.js` already renders `item.image_url` with the placeholder fallback. The serializer already returned absolute URLs.

## Verification
- `manage.py check`: no issues.
- 43 of 43 rows have an image.
- `GET /api/menu/` returns 43 items, 0 without `image_url`. All 16 distinct URLs return 200 with `image/jpeg`.
- Frontend `npm run build` compiled. `frontend/build` was deleted afterwards.
- Not done: the headless-browser screenshot (`home.png`). I skipped it because no frontend code changed, so no throwaway customer was created.
- Photos were checked visually in a contact sheet. Two were swapped for clearer matches (shawarma plate, veg rice).

## Notes
- Image files live in `backend/media/menu/`, which is gitignored. On a new laptop, run `python manage.py load_menu_images` (add `--force` to replace existing images). The Commons file titles are stored in the command.
- Nothing was committed or pushed.
