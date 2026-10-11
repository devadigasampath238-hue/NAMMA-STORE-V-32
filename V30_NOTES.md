# V30 - customer homepage now follows namma-store-preview.html, wired to the real backend

Order (same as the reference): Kannada marquee -> sticky header (top bar, silk stripe, logo, live search,
Kannada nav labels, wishlist/cart/login) -> round category chips -> [category rail | hero carousel | promo tiles]
-> benefits -> Deals & discounts -> per-category showcases -> temple divider -> Trending / Featured /
New arrivals -> corporate-gifting band -> recently viewed -> footer; phone bottom tab bar.

Data (no sample/mock arrays anywhere):
  categories  GET categories (getCategories)        -> chips, rail, showcases; click -> /categories/{id}
  products    GET products (getProducts)            -> deals (real discountPercent), trending, featured, new, showcases
  banners     GET active banners (getActiveBanners) -> hero carousel; static hero only when no live campaign
  tile click  -> /products/{id} (existing detail page), heart = existing wishlist, cart/login untouched
A block with no data hides itself.

Layout fixes: bordered tile grids without doubled lines, hero fills the row height (no empty gap),
html/body overflow-x: clip, min-w-0 on all grid children.
Files: app/page.tsx, storefront.tsx, hero.tsx, app/layout.tsx, app/globals.css (+ motion.tsx, ui.tsx from V29)
