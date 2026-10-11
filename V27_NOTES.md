# V27 - reference-style redesign (Karnataka theme)

Storefront (modelled on the marketplace reference):
  header strip + silk rule | category rail | hero / campaign carousel | promo tiles
  deals strip | per-category showcases (tinted panel + 2x4 product grid) | featured / new arrivals
  phone bottom tab bar (Home, Shop, Saved, Cart with live count, Account)
  new file: frontend/storefront.tsx

Admin dashboard (modelled on the Pixel Commerce reference):
  KPI cards with icons + real 7-day trend chips | Sales analytic area chart (Revenue/Orders toggle)
  Order status donut | Top selling products carousel (with product images) | Inventory health
  new file: frontend/dashboardCharts.tsx (dependency-free SVG, no chart library needed)
  backend: dashboard topProducts now also returns productId + imageUrl

Nothing is invented: a block with no data shows an empty message or hides itself. There is no
"sales target" or "expenses" panel because the database has no such data.

## Run
    cd backend  && mvn clean compile && mvn spring-boot:run
    cd frontend && npm install && npx tsc --noEmit && npm run build && npm run dev
