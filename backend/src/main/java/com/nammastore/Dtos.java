package com.nammastore;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/*
 * ===========================================================
 * Dtos.java  (STAGE 1 - NEW FILE)
 * ===========================================================
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Controllers used to return JPA entities directly. Two real
 * bugs came out of that:
 *
 *  1. INFINITE RECURSION.
 *     Order -> items -> OrderItem.order -> Order -> items ...
 *     Jackson followed that cycle forever. GET /api/orders/{userId}
 *     and GET /api/admin/orders blew up with a StackOverflowError
 *     rendered as a generic 500.
 *
 *  2. RAW IMAGE PATHS.
 *     The frontend received whatever string happened to be in the
 *     database, which is exactly why image URLs had to be fixed by
 *     hand in pgAdmin.
 *
 * Every read endpoint now returns one of these DTOs. Images are
 * resolved to absolute URLs by StorageService on the way out, and
 * derived values (effectivePrice, discountPercent, stockStatus,
 * itemCount) are computed here so the frontend never has to.
 * ===========================================================
 */

/* ===========================================================
   CATEGORY
   =========================================================== */

class CategoryDto {
    public Long id;
    public String name;
    public String slug;
    public String description;
    /** Absolute, browser-ready URL. Null when the category has no image. */
    public String imageUrl;
    public boolean active;
    /** Number of active products in this category. Null when not requested. */
    public Long productCount;
}


/* ===========================================================
   PRODUCT
   =========================================================== */

class ProductDto {
    public Long id;
    /** Who sells it ("Sold by"). Name + logo only - never contact/commercial details. */
    public Long companyId;
    public String companyName;
    public String companyLogoUrl;
    public String name;
    public String description;

    public BigDecimal price;
    public BigDecimal salePrice;
    /** salePrice when present, otherwise price. What the customer actually pays. */
    public BigDecimal effectivePrice;
    /** 0 when there is no sale. Rounded to a whole percent. */
    public Integer discountPercent;
    public boolean onSale;

    public String sku;
    public String brand;
    public String productType;

    /** Absolute URL of the primary image (== images[0] when images is non-empty). */
    public String thumbnailUrl;
    public String backgroundImageUrl;
    /** Full ordered gallery, absolute URLs, primary first. Never null. */
    public List<String> images = new ArrayList<>();

    public Integer stockQuantity;
    /** IN_STOCK | LOW_STOCK | OUT_OF_STOCK */
    public String stockStatus;
    public boolean inStock;

    public boolean featured;
    public boolean active;
    public boolean customizable;

    public Long categoryId;
    public String categoryName;
    public CategoryDto category;

    public List<String> variants = new ArrayList<>();
    public Instant createdAt;
}


/* ===========================================================
   ORDER
   =========================================================== */

class OrderItemDto {
    public Long id;
    /** Per-line shipment status (null on legacy rows - fall back to the order's). */
    public String itemStatus;
    public Instant itemStatusUpdatedAt;
    /* customer view only (OrderEnricher) */
    public Long returnId;
    public String returnStatus;
    public boolean canReturn;
    public boolean canReview;
    public boolean reviewed;
    public Long companyId;
    public Long productId;
    public Long customizableProductId;
    public String productName;
    /** Absolute URL, resolved at response time from the live product row. */
    public String productImageUrl;
    public Integer quantity;
    public BigDecimal unitPrice;
    public BigDecimal finalPrice;

    public String customText;
    public String customImageUrl;
    public String selectedColor;
    public String selectedSize;
    public String printPosition;
}

class OrderDto {
    public Long id;
    /** Company view only: sum of THAT company's lines. Null for super admin. */
    public BigDecimal companyTotal;
    /** Company view only: true when the order also contains other companies' products. */
    public boolean multiCompany;
    /** Human friendly reference shown on the success page, e.g. NS10024. */
    public String orderNumber;

    public Long userId;
    public String customerName;
    public String customerEmail;
    public String customerPhone;

    public BigDecimal subtotal;
    public BigDecimal discountAmount;
    public BigDecimal deliveryCharge;
    public BigDecimal totalAmount;

    /** Why the customer cancelled, shown on both order detail screens. */
    public String cancellationReason;
    public String cancellationComments;
    public Instant cancelledAt;

    public String couponCode;
    public String paymentMethod;
    public String paymentStatus;
    public String status;

    public Instant deliveredAt;
    public String returnStatus;
    public Instant returnRequestedAt;
    public String returnReason;
    /** True only while status is DELIVERED, no return exists yet, and the window hasn't closed. */
    public boolean returnEligible;
    /** deliveredAt + the return window, so the frontend can show a countdown without hard-coding the number of days. */
    public Instant returnWindowEndsAt;

    public String shippingAddressSnapshot;
    public String addressLine;
    public String city;
    public String state;
    public String pincode;

    public List<OrderItemDto> items = new ArrayList<>();
    public Integer itemCount;
    public Instant createdAt;
}


/* ===========================================================
   USER
   =========================================================== */

class AppUserDto {
    public Long id;
    public String accountUid;
    public String email;
    public String displayName;
    public String phone;
    /** Absolute URL or null. */
    public String photoUrl;
    public boolean admin;
    /** SUPER_ADMIN | COMPANY_ADMIN | INFLUENCER | CUSTOMER. */
    public String role;
    /** Set only for COMPANY_ADMIN accounts. */
    public Long companyId;
    /** True until a company signs in and replaces its one-time password. */
    public boolean mustChangePassword;
    public Instant createdAt;
}


/* ===========================================================
   MAPPER
   =========================================================== */

@Component
@Transactional(readOnly = true)
class DtoMapper {

    @Autowired
    private StorageService storage;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private EntityManager entityManager;

    /*
     * Repository calls may return entities whose Hibernate session has already
     * closed by the time a controller maps them. Re-load by ID inside this
     * mapper's read-only transaction before touching lazy relationships.
     */
    private Category managedCategory(Category value) {
        if (value == null || value.getId() == null) return value;
        return entityManager.find(Category.class, value.getId());
    }

    private Product managedProduct(Product value) {
        if (value == null || value.getId() == null) return value;
        return entityManager.find(Product.class, value.getId());
    }

    private Order managedOrder(Order value) {
        if (value == null || value.getId() == null) return value;
        return entityManager.find(Order.class, value.getId());
    }

    private OrderItem managedOrderItem(OrderItem value) {
        if (value == null || value.getId() == null) return value;
        return entityManager.find(OrderItem.class, value.getId());
    }

    private AppUser managedUser(AppUser value) {
        if (value == null || value.getId() == null) return value;
        return entityManager.find(AppUser.class, value.getId());
    }

    /** Temporary image tracing. Set app.debug.images=false (or APP_DEBUG_IMAGES=false) to silence. */
    @org.springframework.beans.factory.annotation.Value("${app.debug.images:false}")
    private boolean debugImages;

    /* ---------------- category ---------------- */

    CategoryDto toDto(Category c) {
        if (c == null) return null;
        c = managedCategory(c);
        CategoryDto dto = new CategoryDto();
        dto.id = c.getId();
        dto.name = c.getName();
        dto.slug = c.getSlug();
        dto.description = c.getDescription();
        dto.imageUrl = storage.toPublicUrl(c.getImageUrl());
        dto.active = c.isActive();
        return dto;
    }

    CategoryDto toDto(Category c, long productCount) {
        CategoryDto dto = toDto(c);
        if (dto != null) dto.productCount = productCount;
        return dto;
    }

    List<CategoryDto> toCategoryDtos(List<Category> list) {
        List<CategoryDto> out = new ArrayList<>();
        if (list == null) return out;
        for (Category c : list) out.add(toDto(c));
        return out;
    }

    /* ---------------- product ---------------- */

    ProductDto toDto(Product p) {
        if (p == null) return null;
        p = managedProduct(p);
        if (p == null) return null;
        ProductDto dto = new ProductDto();
        dto.id = p.getId();
        dto.name = p.getName();
        dto.description = p.getDescription();

        dto.price = p.getPrice();
        dto.salePrice = p.getSalePrice();
        dto.effectivePrice = effectivePrice(p);
        dto.onSale = isOnSale(p);
        dto.discountPercent = discountPercent(p);

        dto.sku = p.getSku();
        dto.brand = p.getBrand();
        dto.productType = p.getProductType();

        dto.images = storage.toPublicUrls(p.getImages());
        String thumb = storage.toPublicUrl(p.getThumbnailUrl());
        if (thumb == null && !dto.images.isEmpty()) {
            thumb = dto.images.get(0);
        }
        // Guarantee the primary image is also present in the gallery so the
        // frontend can render one list without special-casing the thumbnail.
        if (thumb != null && !dto.images.contains(thumb)) {
            dto.images.add(0, thumb);
        }
        dto.thumbnailUrl = thumb;
        dto.backgroundImageUrl = storage.toPublicUrl(p.getBackgroundImageUrl());
        if (debugImages) {
            // IMAGE-DEBUG: stored value vs. what the API actually returns.
            org.slf4j.LoggerFactory.getLogger(DtoMapper.class)
                    .info("Returning product {} image URL = {} (stored = {})",
                            p.getId(), dto.thumbnailUrl, p.getThumbnailUrl());
        }

        dto.stockQuantity = p.getStockQuantity() == null ? 0 : p.getStockQuantity();
        dto.stockStatus = p.stockStatus();
        // The repositories fetch the company with the product. If a product ever
        // arrives through a path that did not, expose only the id (readable on
        // an uninitialised proxy) instead of crashing the whole request.
        if (p.getCompany() != null) {
            dto.companyId = p.getCompany().getId();
            if (org.hibernate.Hibernate.isInitialized(p.getCompany())) {
                dto.companyName = p.getCompany().getName();
                dto.companyLogoUrl = storage.toPublicUrl(p.getCompany().getLogoUrl());
            }
        }
        dto.inStock = dto.stockQuantity > 0;

        dto.featured = p.isFeatured();
        dto.active = p.isActive();
        dto.customizable = p.isCustomizable();

        if (p.getCategory() != null) {
            Category category = managedCategory(p.getCategory());
            if (category != null) {
                dto.categoryId = category.getId();
                dto.categoryName = category.getName();
                dto.category = toDto(category);
            }
        }

        dto.variants = p.getVariants() == null ? new ArrayList<>() : new ArrayList<>(p.getVariants());
        dto.createdAt = p.getCreatedAt();
        return dto;
    }

    List<ProductDto> toProductDtos(List<Product> list) {
        List<ProductDto> out = new ArrayList<>();
        if (list == null) return out;
        for (Product p : list) out.add(toDto(p));
        return out;
    }

    static BigDecimal effectivePrice(Product p) {
        if (p == null) return BigDecimal.ZERO;
        if (isOnSale(p)) return p.getSalePrice();
        return p.getPrice() == null ? BigDecimal.ZERO : p.getPrice();
    }

    static boolean isOnSale(Product p) {
        return p != null
                && p.getSalePrice() != null
                && p.getPrice() != null
                && p.getSalePrice().compareTo(BigDecimal.ZERO) > 0
                && p.getSalePrice().compareTo(p.getPrice()) < 0;
    }

    /**
     * Sum of the order's own line items, used only to repair NULL money
     * columns on legacy rows. finalPrice is the per-unit price actually
     * charged; unitPrice is the fallback for rows written before it existed.
     */
    private static BigDecimal sumLineItems(Order o) {
        BigDecimal total = BigDecimal.ZERO;
        if (o.getItems() == null) return total;
        for (OrderItem item : o.getItems()) {
            BigDecimal unit = item.getFinalPrice() != null
                    ? item.getFinalPrice()
                    : item.getUnitPrice();
            if (unit == null) continue;
            int qty = item.getQuantity() == null ? 0 : item.getQuantity();
            total = total.add(unit.multiply(BigDecimal.valueOf(qty)));
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    private static Integer discountPercent(Product p) {
        if (!isOnSale(p)) return 0;
        BigDecimal diff = p.getPrice().subtract(p.getSalePrice());
        return diff.multiply(BigDecimal.valueOf(100))
                .divide(p.getPrice(), 0, RoundingMode.HALF_UP)
                .intValue();
    }

    /* ---------------- order ---------------- */

    OrderDto toDto(Order o) {
        if (o == null) return null;
        o = managedOrder(o);
        if (o == null) return null;
        OrderDto dto = new OrderDto();
        dto.id = o.getId();
        dto.orderNumber = o.getOrderNumber();

        if (o.getUser() != null) {
            dto.userId = o.getUser().getId();
        }
        dto.customerName = o.getCustomerName();
        dto.customerEmail = o.getCustomerEmail();
        dto.customerPhone = o.getCustomerPhone();

        /*
         * FEATURE #37 - "item shows Rs.777 but subtotal shows Rs.0".
         *
         * Orders created before the money columns existed have NULL
         * subtotal/delivery/total. Jackson serialises those as null and the
         * frontend Price component renders null as Rs.0, so a real order
         * looked free.
         *
         * The stored value is still the source of truth. These fallbacks only
         * fire when the column is NULL, and they are derived from the order's
         * OWN line items - nothing is invented and nothing is recalculated
         * from client input.
         */
        dto.subtotal = o.getSubtotal();
        dto.discountAmount = o.getDiscountAmount();
        dto.deliveryCharge = o.getDeliveryCharge();
        dto.totalAmount = o.getTotalAmount();

        if (dto.subtotal == null) {
            dto.subtotal = sumLineItems(o);
        }
        if (dto.discountAmount == null) {
            dto.discountAmount = BigDecimal.ZERO;
        }
        if (dto.deliveryCharge == null) {
            dto.deliveryCharge = BigDecimal.ZERO;
        }
        if (dto.totalAmount == null) {
            dto.totalAmount = dto.subtotal
                    .subtract(dto.discountAmount)
                    .add(dto.deliveryCharge);
        }

        dto.couponCode = o.getCouponCode();
        dto.paymentMethod = o.getPaymentMethod();
        dto.paymentStatus = o.getPaymentStatus();
        dto.status = o.getStatus();

        dto.cancellationReason = o.getCancellationReason();
        dto.cancellationComments = o.getCancellationComments();
        dto.cancelledAt = o.getCancelledAt();
        dto.deliveredAt = o.getDeliveredAt();
        dto.returnStatus = o.getReturnStatus();
        dto.returnRequestedAt = o.getReturnRequestedAt();
        dto.returnReason = o.getReturnReason();
        if (o.getDeliveredAt() != null) {
            dto.returnWindowEndsAt = o.getDeliveredAt().plus(ReturnStatus.WINDOW_DAYS, java.time.temporal.ChronoUnit.DAYS);
            dto.returnEligible = OrderStatus.DELIVERED.equals(o.getStatus())
                    && o.getReturnStatus() == null
                    && Instant.now().isBefore(dto.returnWindowEndsAt);
        }

        dto.shippingAddressSnapshot = o.getShippingAddressSnapshot();
        dto.addressLine = o.getAddressLine();
        dto.city = o.getCity();
        dto.state = o.getState();
        dto.pincode = o.getPincode();

        int count = 0;
        if (o.getItems() != null) {
            for (OrderItem item : o.getItems()) {
                dto.items.add(toDto(item));
                count += item.getQuantity() == null ? 0 : item.getQuantity();
            }
        }
        dto.itemCount = count;
        dto.createdAt = o.getCreatedAt();
        return dto;
    }

    List<OrderDto> toOrderDtos(List<Order> list) {
        List<OrderDto> out = new ArrayList<>();
        if (list == null) return out;
        for (Order o : list) out.add(toDto(o));
        return out;
    }

    OrderItemDto toDto(OrderItem i) {
        if (i == null) return null;
        i = managedOrderItem(i);
        if (i == null) return null;
        OrderItemDto dto = new OrderItemDto();
        dto.id = i.getId();
        dto.productId = i.getProductId();
        dto.customizableProductId = i.getCustomizableProductId();
        dto.companyId = i.getCompanyId();
        dto.itemStatus = i.getItemStatus();
        dto.itemStatusUpdatedAt = i.getItemStatusUpdatedAt();
        dto.productName = i.getProductName();
        dto.quantity = i.getQuantity();
        dto.unitPrice = i.getUnitPrice();
        dto.finalPrice = i.getFinalPrice();

        dto.customText = i.getCustomText();
        dto.customImageUrl = storage.toPublicUrl(i.getCustomImageUrl());
        dto.selectedColor = i.getSelectedColor();
        dto.selectedSize = i.getSelectedSize();
        dto.printPosition = i.getPrintPosition();

        // Prefer the snapshot taken at order time; fall back to the live product.
        String image = i.getProductImageUrl();
        if ((image == null || image.isBlank()) && i.getProductId() != null) {
            image = productRepository.findById(i.getProductId())
                    .map(Product::getThumbnailUrl)
                    .orElse(null);
        }
        dto.productImageUrl = storage.toPublicUrl(image);
        return dto;
    }

    /* ---------------- user ---------------- */

    AppUserDto toDto(AppUser u) {
        if (u == null) return null;
        u = managedUser(u);
        if (u == null) return null;
        AppUserDto dto = new AppUserDto();
        dto.id = u.getId();
        dto.accountUid = u.getAccountUid();
        dto.email = u.getEmail();
        dto.displayName = u.getDisplayName();
        dto.phone = u.getPhone();
        dto.photoUrl = storage.toPublicUrl(u.getPhotoUrl());
        dto.admin = u.isAdmin();
        dto.role = u.getRole().name();
        dto.mustChangePassword = u.isMustChangePassword();
        if (u.getCompany() != null) {
            Company company = entityManager.find(Company.class, u.getCompany().getId());
            dto.companyId = company != null ? company.getId() : u.getCompany().getId();
        }
        dto.createdAt = u.getCreatedAt();
        return dto;
    }

    List<AppUserDto> toUserDtos(List<AppUser> list) {
        List<AppUserDto> out = new ArrayList<>();
        if (list == null) return out;
        for (AppUser u : list) out.add(toDto(u));
        return out;
    }
}
