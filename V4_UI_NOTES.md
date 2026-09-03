# V4 UI

این شاخه (`feature-v4-ui`) برای بازطراحی رابط کاربری V4 ایجاد شده است.

## Design system
- سبک پیش‌فرض: `classic` با سطوح کاملاً Solid و بدون gradient.
- حالت‌های قابل انتخاب: Classic، Minecraft-inspired، Cyberpunk-inspired، Arcade-inspired.
- پالت‌ها: Indigo، Emerald، Amber، Rose، Cyan.
- هر پالت برای حالت روز و شب تعریف شده است.
- انتخاب‌ها در `localStorage` حفظ می‌شوند.
- رابط RTL و آماده‌ی چندزبانه است؛ گزینه‌ی English در selector قرار گرفته تا لایه‌ی ترجمه‌ی کامل UI در مرحله‌ی بعد روی رشته‌های runtime اعمال شود.
- طراحی از الگوهای رایج داشبوردهای مدرن الهام می‌گیرد و کپی مستقیم از ثنایی پاسارگاد یا مرزبان نیست.

## Compatibility
هسته‌ی Worker و منطق اصلی پنل دست‌نخورده نگه داشته شده و بازطراحی در پوسته‌ی UI انجام شده است.
