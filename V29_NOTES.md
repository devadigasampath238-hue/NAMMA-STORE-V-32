# V29 - customer storefront: no-crop images, animation, Kannada welcome, Flipkart-style shopping

## Images no longer crop
SafeImage has a new fit="blur": the WHOLE image is shown (object-contain) on top of a blurred, enlarged
copy of itself, so any aspect ratio fills the frame with no cropping and no empty bars.
Applied to: hero/campaign banners, category cards, category chips, category page header, product cards,
mini tiles, search suggestions, and the admin category/banner previews (admin sees what customers see).

## Animation (CSS + a small client toolkit, no library) - motion.tsx + globals.css
Scroll-reveal (up/left/right/zoom, staggered) · hero text entrance + floating image · Ken-Burns on banners ·
Kannada greeting marquee under the header · "ನಮಸ್ಕಾರ! ನಮ್ಮ ಸ್ಟೋರ್‌ಗೆ ಸ್ವಾಗತ" flag-curtain welcome (once per session) ·
card tilt/zoom/shine · self-drawing section underlines · spinning-ring category chips.
All switched off by prefers-reduced-motion.

## Flipkart/Amazon-style behaviour
Round category chips row · live search suggestions (real products) · recently viewed (home + product page) ·
sticky Add-to-cart / Buy-now bar on phones · listing page already has filters/sort/price/discount/in-stock.
Kannada layer: nav sub-labels, section titles (ವರ್ಗಗಳ ಪ್ರಕಾರ ಖರೀದಿಸಿ…), welcome, marquee, footer.

## Run
    cd frontend && npm install && npx tsc --noEmit && npm run build && npm run dev
