package com.nammastore;

import jakarta.persistence.*;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * ===========================================================
 * Admin.java
 * -----------------------------------------------------------
 * Admin authorization, dashboard stats, and the customized-
 * product catalog (name/base price/options/min-max qty).
 *
 * Product/Category CRUD lives in Products.java's
 * AdminCatalogController.
 *
 * SECURITY:
 * AdminAuthFilter intercepts /api/admin/** requests, verifies
 * our own signed session token (TokenService - Security.java,
 * no Firebase involved), and re-checks the role in PostgreSQL
 * on every request.
 *
 * CORS:
 * Allows the Next.js frontend running on localhost:3000
 * to communicate with Spring Boot running on localhost:8080.
 * ===========================================================
 */


/* ===========================================================
   ADMIN AUTHENTICATION FILTER
   =========================================================== */

@Component
class AdminAuthFilter extends OncePerRequestFilter {

    @Autowired
    private AppUserRepository appUserRepository;

    @Autowired
    private TokenService tokenService;

    @Autowired
    private ProductRepository productRepository;

    @Value("${app.cors.allowed-origin:http://localhost:3000}")
    private String allowedOrigin;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain)
            throws ServletException, IOException {

        /*
         * ---------------------------------------------------
         * CORS PREFLIGHT REQUEST
         * ---------------------------------------------------
         *
         * Browser sends OPTIONS request before requests
         * such as GET/POST/PUT/DELETE with Authorization.
         */
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {

            response.setHeader(
                    "Access-Control-Allow-Origin",
                    allowedOrigin
            );

            response.setHeader(
                    "Access-Control-Allow-Methods",
                    "GET, POST, PUT, DELETE, OPTIONS"
            );

            response.setHeader(
                    "Access-Control-Allow-Headers",
                    "Authorization, Content-Type"
            );

            response.setHeader(
                    "Access-Control-Allow-Credentials",
                    "true"
            );

            response.setStatus(HttpServletResponse.SC_OK);
            return;
        }


        /*
         * ---------------------------------------------------
         * CORS HEADERS FOR NORMAL REQUESTS
         * ---------------------------------------------------
         */
        response.setHeader(
                "Access-Control-Allow-Origin",
                allowedOrigin
        );

        response.setHeader(
                "Access-Control-Allow-Credentials",
                "true"
        );


        /*
         * ---------------------------------------------------
         * ADMIN AUTHORIZATION
         * ---------------------------------------------------
         */
        if (request.getRequestURI().startsWith("/api/admin")) {

            String header = request.getHeader("Authorization");

            String uid = tokenService.verifyTokenAndGetUid(
                    header == null
                            ? null
                            : header.replace("Bearer ", "").trim()
            );

            // 401 = we do not know who you are; 403 = we know, you are not staff.
            if (uid == null) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType("application/json");
                response.getWriter().write(
                        "{\"error\":\"Sign in as an administrator to continue.\"}");
                return;
            }

            boolean isAdmin =
                    uid != null &&
                    appUserRepository.findByAccountUid(uid)
                            .map(AppUser::isAdmin)
                            .orElse(false);

            if (!isAdmin) {

                response.setStatus(
                        HttpServletResponse.SC_FORBIDDEN
                );

                response.setContentType(
                        "application/json"
                );

                response.getWriter().write(
                        "{\"error\":\"Admin access required\"}"
                );

                return;
            }

            /*
             * COMPANY_ADMIN sandbox. One place, deny by default: a company
             * may only reach its own products and its own orders (read-only)
             * plus the dashboard. Everything else under /api/admin
             * (categories writes, banners, coupons, influencers, users,
             * companies, serviceability, diagnostics...) is super-admin only.
             * The controllers then filter the DATA to the caller's company.
             */
            AppUser caller = appUserRepository.findByAccountUid(uid).orElse(null);
            if (caller != null && caller.getRole() == UserRole.COMPANY_ADMIN) {
                Long companyId = caller.getCompany() == null ? null : caller.getCompany().getId();
                String path = request.getRequestURI();
                String method = request.getMethod();
                boolean get = "GET".equalsIgnoreCase(method);

                // First sign-in: nothing but identity until the one-time password is replaced.
                if (caller.isMustChangePassword() && !path.equals("/api/admin/verify")) {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/json");
                    response.getWriter().write(
                            "{\"error\":\"Please change your temporary password first.\",\"code\":\"PASSWORD_CHANGE_REQUIRED\"}");
                    return;
                }

                boolean allowed = false;
                if (companyId != null) {
                    if (path.equals("/api/admin/verify") || path.startsWith("/api/admin/dashboard")) {
                        allowed = get;
                    } else if (path.equals("/api/admin/categories")) {
                        allowed = get; // read-only, needed for the product form
                    } else if (path.equals("/api/admin/order-statuses")) {
                        allowed = get;
                    } else if (path.matches("/api/admin/orders/\\d+/fulfillment")) {
                        allowed = "PUT".equalsIgnoreCase(method); // own lines only, enforced in the service
                    } else if (path.equals("/api/admin/returns")) {
                        allowed = get;
                    } else if (path.matches("/api/admin/returns/\\d+/status")) {
                        allowed = "PUT".equalsIgnoreCase(method); // own returns only, enforced in the controller
                    } else if (path.startsWith("/api/admin/orders")) {
                        allowed = get; // per-order ownership is checked in the controller
                    } else if (path.equals("/api/admin/products")) {
                        allowed = true; // list/create: controller scopes + forces the owner
                    } else if (path.startsWith("/api/admin/products/")) {
                        String rest = path.substring("/api/admin/products/".length());
                        int slash = rest.indexOf('/');
                        String idPart = slash < 0 ? rest : rest.substring(0, slash);
                        try {
                            Long productId = Long.valueOf(idPart);
                            if (!productRepository.existsById(productId)) {
                                allowed = true; // let the controller answer 404
                            } else {
                                allowed = productRepository.findCompanyIdByProductId(productId)
                                        .map(companyId::equals).orElse(false);
                            }
                        } catch (NumberFormatException e) {
                            allowed = false;
                        }
                    }
                }

                if (!allowed) {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/json");
                    response.getWriter().write(
                            "{\"error\":\"Your company account cannot access this.\"}");
                    return;
                }
            }
        }


        /*
         * ---------------------------------------------------
         * CONTINUE REQUEST
         * ---------------------------------------------------
         */
        chain.doFilter(request, response);
    }
}


/* ===========================================================
   CUSTOMIZABLE PRODUCT ENTITY
   =========================================================== */

@Entity
@Table(name = "customizable_products")
class CustomizableProduct {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    private String slug;

    private BigDecimal basePrice;

    private String imageUrl;

    private Long categoryId;

    private Integer minQuantity = 1;

    private Integer maxQuantity = 100;

    private Integer stock = 0;

    private boolean active = true;

    /*
     * Example:
     * TEXT,IMAGE,COLOR,SIZE,PRINT_POSITION
     */
    private String enabledOptions;

    /*
     * Example:
     * Red,Blue,Black
     */
    private String availableColors;

    /*
     * Example:
     * S,M,L,XL
     */
    private String availableSizes;


    /* -------------------------------------------------------
       GETTERS / SETTERS
       ------------------------------------------------------- */

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getSlug() {
        return slug;
    }

    public void setSlug(String slug) {
        this.slug = slug;
    }

    public BigDecimal getBasePrice() {
        return basePrice;
    }

    public void setBasePrice(BigDecimal basePrice) {
        this.basePrice = basePrice;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public Long getCategoryId() {
        return categoryId;
    }

    public void setCategoryId(Long categoryId) {
        this.categoryId = categoryId;
    }

    public Integer getMinQuantity() {
        return minQuantity;
    }

    public void setMinQuantity(Integer minQuantity) {
        this.minQuantity = minQuantity;
    }

    public Integer getMaxQuantity() {
        return maxQuantity;
    }

    public void setMaxQuantity(Integer maxQuantity) {
        this.maxQuantity = maxQuantity;
    }

    public Integer getStock() {
        return stock;
    }

    public void setStock(Integer stock) {
        this.stock = stock;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public String getEnabledOptions() {
        return enabledOptions;
    }

    public void setEnabledOptions(String enabledOptions) {
        this.enabledOptions = enabledOptions;
    }

    public String getAvailableColors() {
        return availableColors;
    }

    public void setAvailableColors(String availableColors) {
        this.availableColors = availableColors;
    }

    public String getAvailableSizes() {
        return availableSizes;
    }

    public void setAvailableSizes(String availableSizes) {
        this.availableSizes = availableSizes;
    }
}


/* ===========================================================
   REPOSITORY
   =========================================================== */

interface CustomizableProductRepository
        extends JpaRepository<CustomizableProduct, Long> {

    CustomizableProduct findBySlug(String slug);
}


/* ===========================================================
   REQUEST DTO
   =========================================================== */

class CustomizableProductRequest {

    public String name;

    public String slug;

    public BigDecimal basePrice;

    public String imageUrl;

    public Long categoryId;

    public Integer minQuantity;

    public Integer maxQuantity;

    public Integer stock;

    public boolean active = true;

    public String enabledOptions;

    public String availableColors;

    public String availableSizes;
}


/* ===========================================================
   PUBLIC CUSTOMIZATION APIS
   =========================================================== */

@RestController
@RequestMapping("/api/customize")
class CustomizeController {

    @Autowired
    private CustomizableProductRepository repo;


    @GetMapping
    public List<CustomizableProduct> list() {

        return repo.findAll()
                .stream()
                .filter(CustomizableProduct::isActive)
                .toList();
    }


    @GetMapping("/{slug}")
    public CustomizableProduct bySlug(
            @PathVariable String slug) {

        return repo.findBySlug(slug);
    }
}


/* ===========================================================
   ADMIN APIS
   =========================================================== */

@RestController
@RequestMapping("/api/admin")
@Transactional(readOnly = true)
class AdminController {

    @Autowired private CommissionService commissionService;
    @Autowired private AdminScope adminScope;
    @Autowired private StorageService adminStorage;
    @Autowired private CompanyRepository companyRepository;
    @Autowired private BannerRepository bannerRepository;
    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private AppUserRepository appUserRepository;

    @Autowired
    private CustomizableProductRepository customizableProductRepository;

    @Autowired
    private DtoMapper mapper;

    @Autowired
    private CurrentUserService currentUser;


    /* -------------------------------------------------------
       ADMIN VERIFY
       -------------------------------------------------------
       Reaching this method at all means AdminAuthFilter already
       accepted the request. It also returns WHICH kind of admin
       this is, so the frontend can show the Companies screen to
       a SUPER_ADMIN only, and (in a later stage) scope a
       COMPANY_ADMIN's dashboard to their own company.
       ------------------------------------------------------- */

    @GetMapping("/verify")
    public Map<String, Object> verify(@RequestHeader(value = "Authorization", required = false) String auth) {
        Map<String, Object> body = new HashMap<>();
        body.put("admin", true);
        AppUser user = currentUser.resolve(auth);
        if (user != null) {
            body.put("role", user.getRole().name());
            body.put("displayName", user.getDisplayName());
            body.put("companyId", user.getCompany() != null ? user.getCompany().getId() : null);
            body.put("mustChangePassword", user.isMustChangePassword());
            if (user.getCompany() != null) {
                body.put("companyName", user.getCompany().getName());
                body.put("companyLogoUrl", adminStorage.toPublicUrl(user.getCompany().getLogoUrl()));
            }
        }
        return body;
    }


    /* -------------------------------------------------------
       DASHBOARD
       ------------------------------------------------------- */

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {

        // null = super admin (whole marketplace). Otherwise the caller's OWN
        // company, derived from their login - never from a request parameter.
        Long scope = adminScope.companyScope();

        List<Product> allProducts = scope == null
                ? productRepository.findAll()
                : productRepository.findByCompanyId(scope);
        List<Order> allOrders = adminScope.visibleOrders(orderRepository.findAllByOrderByCreatedAtDesc());

        long outOfStock = 0;
        long lowStock = 0;
        Map<Long, String> categoryOfProduct = new HashMap<>();
        Map<Long, Product> productsById = new HashMap<>();
        Map<String, Long> productIdByName = new HashMap<>();
        for (Product p : allProducts) {
            productsById.put(p.getId(), p);
            String status = p.stockStatus();
            if ("OUT_OF_STOCK".equals(status)) outOfStock++;
            else if ("LOW_STOCK".equals(status)) lowStock++;
            if (p.getCategory() != null) categoryOfProduct.put(p.getId(), p.getCategory().getName());
        }

        long pendingOrders = 0;
        long completedOrders = 0;
        long cancelledOrders = 0;
        long todaysOrders = 0;
        BigDecimal revenue = BigDecimal.ZERO;
        java.time.LocalDate today = java.time.LocalDate.now();

        // Aggregations. For a company, ONLY its own lines count.
        Map<String, BigDecimal[]> topProducts = new HashMap<>();   // name -> [qty, revenue]
        Map<String, BigDecimal> categoryRevenue = new HashMap<>();
        Map<Long, BigDecimal[]> companyRevenue = new HashMap<>();  // companyId -> [orders, revenue]
        java.util.Set<Long> customers = new java.util.HashSet<>();

        for (Order o : allOrders) {
            String status = o.getStatus() == null
                    ? OrderStatus.PLACED
                    : o.getStatus().toUpperCase(Locale.ROOT);

            if (o.getCreatedAt() != null
                    && o.getCreatedAt().atZone(java.time.ZoneId.systemDefault()).toLocalDate().equals(today)) {
                todaysOrders++;
            }

            if (OrderStatus.CANCELLED.equals(status)) {
                cancelledOrders++;
                continue;
            }

            BigDecimal orderRevenue = scope == null
                    ? (o.getTotalAmount() == null ? BigDecimal.ZERO : o.getTotalAmount())
                    : AdminScope.companyAmount(o, scope);
            revenue = revenue.add(orderRevenue);
            if (o.getUser() != null) customers.add(o.getUser().getId());

            if (OrderStatus.DELIVERED.equals(status)) completedOrders++;
            else pendingOrders++;

            for (OrderItem item : o.getItems()) {
                if (scope != null && !scope.equals(item.getCompanyId())) continue;
                BigDecimal line = item.getFinalPrice() == null ? BigDecimal.ZERO : item.getFinalPrice();
                int qty = item.getQuantity() == null ? 0 : item.getQuantity();

                BigDecimal[] tp = topProducts.computeIfAbsent(
                        item.getProductName() == null ? "Item" : item.getProductName(),
                        k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
                if (item.getProductId() != null) {
                    productIdByName.putIfAbsent(
                            item.getProductName() == null ? "Item" : item.getProductName(), item.getProductId());
                }
                tp[0] = tp[0].add(BigDecimal.valueOf(qty));
                tp[1] = tp[1].add(line);

                String cat = item.getProductId() == null ? null : categoryOfProduct.get(item.getProductId());
                categoryRevenue.merge(cat == null ? "Other" : cat, line, BigDecimal::add);

                if (item.getCompanyId() != null) {
                    BigDecimal[] cr = companyRevenue.computeIfAbsent(
                            item.getCompanyId(), k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
                    cr[1] = cr[1].add(line);
                }
            }
            if (scope == null) {
                java.util.Set<Long> seen = new java.util.HashSet<>();
                for (OrderItem item : o.getItems()) {
                    if (item.getCompanyId() != null && seen.add(item.getCompanyId())) {
                        companyRevenue.computeIfAbsent(item.getCompanyId(),
                                k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO})[0] =
                                companyRevenue.get(item.getCompanyId())[0].add(BigDecimal.ONE);
                    }
                }
            }
        }

        List<Order> recent = allOrders.size() > 10
                ? new ArrayList<>(allOrders.subList(0, 10))
                : allOrders;
        List<OrderDto> recentDtos = new ArrayList<>();
        for (OrderDto d : mapper.toOrderDtos(recent)) recentDtos.add(adminScope.forCompany(d, scope));

        Map<String, Object> stats = new HashMap<>();
        stats.put("scope", scope == null ? "ALL_COMPANIES" : "COMPANY");
        stats.put("totalProducts", allProducts.size());
        stats.put("activeProducts", allProducts.stream().filter(Product::isActive).count());
        stats.put("totalOrders", allOrders.size());
        stats.put("todaysOrders", todaysOrders);
        stats.put("outOfStockProducts", outOfStock);
        stats.put("lowStockProducts", lowStock);
        stats.put("pendingOrders", pendingOrders);
        stats.put("completedOrders", completedOrders);
        stats.put("cancelledOrders", cancelledOrders);
        stats.put("revenue", revenue.setScale(2, RoundingMode.HALF_UP));
        stats.put("totalCustomers", customers.size());
        stats.put("recentOrders", recentDtos);

        // top selling products (by units, then revenue)
        List<Map<String, Object>> top = new ArrayList<>();
        topProducts.entrySet().stream()
                .sorted((x, y) -> {
                    int c = y.getValue()[0].compareTo(x.getValue()[0]);
                    return c != 0 ? c : y.getValue()[1].compareTo(x.getValue()[1]);
                })
                .limit(5)
                .forEach(e -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("name", e.getKey());
                    Long pid = productIdByName.get(e.getKey());
                    m.put("productId", pid);
                    Product tpProduct = pid == null ? null : productsById.get(pid);
                    String img = null;
                    if (tpProduct != null) {
                        img = tpProduct.getThumbnailUrl();
                        if ((img == null || img.isBlank()) && !tpProduct.getImages().isEmpty()) {
                            img = tpProduct.getImages().get(0);
                        }
                    }
                    m.put("imageUrl", adminStorage.toPublicUrl(img));
                    m.put("units", e.getValue()[0].longValue());
                    m.put("revenue", e.getValue()[1].setScale(2, RoundingMode.HALF_UP));
                    top.add(m);
                });
        stats.put("topProducts", top);

        List<Map<String, Object>> cats = new ArrayList<>();
        categoryRevenue.entrySet().stream()
                .sorted((x, y) -> y.getValue().compareTo(x.getValue()))
                .limit(8)
                .forEach(e -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("name", e.getKey());
                    m.put("revenue", e.getValue().setScale(2, RoundingMode.HALF_UP));
                    cats.add(m);
                });
        stats.put("categoryPerformance", cats);

        if (scope == null) {
            // Marketplace-only numbers. A company never receives these keys.
            List<Company> companies = companyRepository.findAll();
            stats.put("totalCategories", categoryRepository.count());
            stats.put("totalUsers", appUserRepository.count());
            stats.put("totalCompanies", companies.size());
            stats.put("activeCompanies", companies.stream().filter(Company::isActive).count());
            stats.put("activeBanners", bannerRepository.findAll().stream().filter(Banner::isActive).count());

            List<Map<String, Object>> byCompany = new ArrayList<>();
            for (Company c : companies) {
                BigDecimal[] cr = companyRevenue.getOrDefault(c.getId(),
                        new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
                Map<String, Object> m = new HashMap<>();
                m.put("companyId", c.getId());
                m.put("name", c.getName());
                m.put("orders", cr[0].longValue());
                m.put("revenue", cr[1].setScale(2, RoundingMode.HALF_UP));
                byCompany.add(m);
            }
            byCompany.sort((x, y) -> ((BigDecimal) y.get("revenue")).compareTo((BigDecimal) x.get("revenue")));
            stats.put("companySales", byCompany);
        }
        return stats;
    }


    /* -------------------------------------------------------
       ORDERS
       Super admin: all orders. Company admin: only orders that contain
       one of ITS products, and only ITS lines inside them.
       ------------------------------------------------------- */

    @GetMapping("/orders")
    public List<OrderDto> allOrders(@RequestParam(required = false) String status) {
        Long scope = adminScope.companyScope();
        List<Order> orders = adminScope.visibleOrders(orderRepository.findAllByOrderByCreatedAtDesc());
        if (status != null && !status.isBlank()) {
            String wanted = status.trim().toUpperCase(Locale.ROOT);
            orders = new ArrayList<>(orders);
            orders.removeIf(o -> o.getStatus() == null
                    || !wanted.equals(o.getStatus().toUpperCase(Locale.ROOT)));
        }
        List<OrderDto> out = new ArrayList<>();
        for (OrderDto d : mapper.toOrderDtos(orders)) out.add(adminScope.forCompany(d, scope));
        return out;
    }

    @GetMapping("/orders/{id}")
    public ResponseEntity<OrderDto> orderDetail(@PathVariable Long id) {
        Long scope = adminScope.companyScope();
        Optional<Order> found = orderRepository.findById(id);
        if (found.isEmpty()) return ResponseEntity.notFound().build();
        // Someone else's order looks exactly like a missing one: no probing by id.
        if (scope != null && !AdminScope.touches(found.get(), scope)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(adminScope.forCompany(mapper.toDto(found.get()), scope));
    }

    /** The list of statuses the admin UI is allowed to set. */
    @GetMapping("/order-statuses")
    public List<String> orderStatuses() {
        return OrderStatus.ALL;
    }

    @Transactional
    @PutMapping("/orders/{id}/status")
    public ResponseEntity<OrderDto> updateOrderStatus(
            @PathVariable Long id,
            @RequestParam String status) {

        if (!OrderStatus.isValid(status)) {
            throw new BadRequestException(
                    "Unknown order status \"" + status + "\". Allowed: " + String.join(", ", OrderStatus.ALL));
        }

        Optional<Order> existing = orderRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Order order = existing.get();

        // The super admin MONITORS partner fulfilment; it can never be overridden from here.
        for (OrderItem line : order.getItems()) {
            if (line.getCompanyId() != null) {
                throw new ForbiddenException(
                        "This order contains products fulfilled by partner companies. Their shipment progress is updated by the company - you can follow it live but not change it.");
            }
        }
        // Own-catalogue orders use the same step-by-step workflow (PUT .../fulfillment).
        if (!OrderStatus.CANCELLED.equalsIgnoreCase(status)) {
            throw new BadRequestException(
                    "Order progress moves one step at a time. Use the \"Next step\" action instead of setting a status directly.");
        }
        if (!List.of(OrderStatus.PLACED, OrderStatus.CONFIRMED).contains(order.getStatus())) {
            throw new BadRequestException("This order is already being fulfilled and can't be cancelled from here.");
        }
        order.setStatus(status.toUpperCase(Locale.ROOT));

        // Delivering a COD order is the moment the money is actually collected.
        if (OrderStatus.DELIVERED.equals(order.getStatus())
                && "COD".equals(order.getPaymentMethod())) {
            order.setPaymentStatus("PAID");
        }

        // Anchor the 10-day return window the moment the order first becomes
        // DELIVERED. Only set once - re-saving the same status (or any later
        // status) must not push the window back.
        if (OrderStatus.DELIVERED.equals(order.getStatus()) && order.getDeliveredAt() == null) {
            order.setDeliveredAt(Instant.now());
        }

        Order saved = orderRepository.save(order);
        // DELIVERED approves the influencer commission; CANCELLED makes it unpayable.
        commissionService.syncWithOrder(saved);
        return ResponseEntity.ok(mapper.toDto(saved));
    }

    /** Admin approves/rejects/completes a customer's return request. */
    @Transactional
    @PutMapping("/orders/{id}/return-status")
    public ResponseEntity<OrderDto> updateReturnStatus(
            @PathVariable Long id,
            @RequestParam String status) {

        if (!ReturnStatus.isValid(status)) {
            throw new BadRequestException(
                    "Unknown return status \"" + status + "\". Allowed: " + String.join(", ", ReturnStatus.ALL));
        }

        Optional<Order> existing = orderRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Order order = existing.get();
        for (OrderItem line : order.getItems()) {
            if (line.getCompanyId() != null) {
                throw new ForbiddenException(
                        "Return decisions for partner products are made by the company. Follow them under Returns.");
            }
        }
        if (order.getReturnStatus() == null) {
            throw new BadRequestException("No return has been requested for this order.");
        }

        order.setReturnStatus(status.toUpperCase(Locale.ROOT));
        Order saved = orderRepository.save(order);
        // A completed return is a refund: the commission must stop being payable.
        commissionService.syncWithOrder(saved);
        return ResponseEntity.ok(mapper.toDto(saved));
    }


    /* -------------------------------------------------------
       USERS
       ------------------------------------------------------- */

    @GetMapping("/users")
    public List<AppUserDto> allUsers() {
        return mapper.toUserDtos(appUserRepository.findAll());
    }

    @Transactional
    @PutMapping("/users/{id}/role")
    public ResponseEntity<AppUserDto> setAdminRole(
            @PathVariable Long id,
            @RequestParam boolean admin) {

        Optional<AppUser> existing = appUserRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        AppUser user = existing.get();
        user.setAdmin(admin);
        return ResponseEntity.ok(mapper.toDto(appUserRepository.save(user)));
    }


    /* -------------------------------------------------------
       CUSTOMIZABLE PRODUCTS
       ------------------------------------------------------- */

    @GetMapping("/customize")
    public List<CustomizableProduct>
            listCustomizable() {

        return customizableProductRepository
                .findAll();
    }


    @Transactional
    @PostMapping("/customize")
    public CustomizableProduct createCustomizable(
            @RequestBody
            CustomizableProductRequest req) {

        CustomizableProduct c =
                new CustomizableProduct();

        applyCustomizable(c, req);

        return customizableProductRepository
                .save(c);
    }


    @Transactional
    @PutMapping("/customize/{id}")
    public CustomizableProduct updateCustomizable(
            @PathVariable Long id,
            @RequestBody
            CustomizableProductRequest req) {

        CustomizableProduct c =
                customizableProductRepository
                        .findById(id)
                        .orElseThrow();

        applyCustomizable(c, req);

        return customizableProductRepository
                .save(c);
    }


    @Transactional
    @DeleteMapping("/customize/{id}")
    public void deleteCustomizable(
            @PathVariable Long id) {

        customizableProductRepository
                .deleteById(id);
    }


    private void applyCustomizable(
            CustomizableProduct c,
            CustomizableProductRequest req) {

        c.setName(req.name);

        c.setSlug(req.slug);

        c.setBasePrice(req.basePrice);

        c.setImageUrl(req.imageUrl);

        c.setCategoryId(req.categoryId);

        c.setMinQuantity(
                req.minQuantity != null
                        ? req.minQuantity
                        : 1
        );

        c.setMaxQuantity(
                req.maxQuantity != null
                        ? req.maxQuantity
                        : 100
        );

        c.setStock(
                req.stock != null
                        ? req.stock
                        : 0
        );

        c.setActive(req.active);

        c.setEnabledOptions(
                req.enabledOptions
        );

        c.setAvailableColors(
                req.availableColors
        );

        c.setAvailableSizes(
                req.availableSizes
        );
    }
}
