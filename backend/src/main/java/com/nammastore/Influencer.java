package com.nammastore;

import jakarta.persistence.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * ===========================================================
 * Influencer.java  (NEW - Stage 1)
 * -----------------------------------------------------------
 * One row per influencer. defaultCommissionPercent is the
 * fallback used when a Coupon (see CouponUsage.java, Stage 4)
 * does not set its own commissionValue - a coupon-level override
 * always wins, matching the brief's "Change coupon percentage"
 * requirement without forcing every coupon for one influencer to
 * share a single rate.
 *
 * appUserId is nullable in this stage: an influencer can exist,
 * and coupons can be attributed to them, before they have a
 * login of their own. Stage 2 wires that up.
 * ===========================================================
 */
@Entity
@Table(name = "influencers")
class Influencer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(unique = true)
    private String email;

    private String phone;

    /** e.g. "Instagram", "YouTube", "Facebook". Free text on purpose - platforms change. */
    private String socialPlatform;
    private String socialHandle;

    private String profileImageUrl;

    /** Wide banner/cover image shown at the top of the influencer's page. */
    @Column(length = 512)
    private String coverImageUrl;

    /** Short bio / tagline shown on the influencer's card and page. */
    @Column(length = 2000)
    private String bio;

    /** Extra photos (looks, campaign shoots, etc.) shown as a gallery. */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "influencer_gallery", joinColumns = @JoinColumn(name = "influencer_id"))
    @OrderColumn(name = "image_order")
    @Column(name = "image_url", length = 512)
    private List<String> gallery = new ArrayList<>();

    /**
     * Each entry is "Platform|https://url", e.g. "Instagram|https://instagram.com/x".
     * A free-text list (not fixed columns) so a new platform never needs a
     * schema change - matches how Banner already avoids hard-coding festivals.
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "influencer_social_links", joinColumns = @JoinColumn(name = "influencer_id"))
    @Column(name = "link", length = 512)
    private List<String> socialLinks = new ArrayList<>();

    /** Shown in a "Featured Creators" rail on the homepage / influencer listing. */
    private boolean featured = false;

    private Integer displayOrder = 0;

    private boolean active = true;

    /** Used when a coupon does not carry its own commissionValue. */
    private BigDecimal defaultCommissionPercent;

    /** Set once the influencer has their own login (Stage 2). Null until then. */
    private Long appUserId;

    private Instant createdAt = Instant.now();

    public String getCoverImageUrl() { return coverImageUrl; }
    public void setCoverImageUrl(String coverImageUrl) { this.coverImageUrl = coverImageUrl; }
    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }
    public List<String> getGallery() { return gallery; }
    public void setGallery(List<String> gallery) { this.gallery = gallery; }
    public List<String> getSocialLinks() { return socialLinks; }
    public void setSocialLinks(List<String> socialLinks) { this.socialLinks = socialLinks; }
    public boolean isFeatured() { return featured; }
    public void setFeatured(boolean featured) { this.featured = featured; }
    public Integer getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(Integer displayOrder) { this.displayOrder = displayOrder; }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getSocialPlatform() { return socialPlatform; }
    public void setSocialPlatform(String socialPlatform) { this.socialPlatform = socialPlatform; }
    public String getSocialHandle() { return socialHandle; }
    public void setSocialHandle(String socialHandle) { this.socialHandle = socialHandle; }
    public String getProfileImageUrl() { return profileImageUrl; }
    public void setProfileImageUrl(String profileImageUrl) { this.profileImageUrl = profileImageUrl; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public BigDecimal getDefaultCommissionPercent() { return defaultCommissionPercent; }
    public void setDefaultCommissionPercent(BigDecimal v) { this.defaultCommissionPercent = v; }
    public Long getAppUserId() { return appUserId; }
    public void setAppUserId(Long appUserId) { this.appUserId = appUserId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}

interface InfluencerRepository extends JpaRepository<Influencer, Long> {
    Optional<Influencer> findByEmailIgnoreCase(String email);
    List<Influencer> findByActiveTrueOrderByDisplayOrderAscIdDesc();
    List<Influencer> findByActiveTrueAndFeaturedTrueOrderByDisplayOrderAscIdDesc();
    List<Influencer> findAllByOrderByDisplayOrderAscIdDesc();
}

/**
 * Join table linking an influencer to the products they promote/curate.
 * Deliberately its own table (not a field on Product) so a product can be
 * featured by several influencers and an influencer's storefront can be
 * reordered/edited without ever touching the Product row.
 */
@Entity
@Table(name = "influencer_products")
class InfluencerProduct {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long influencerId;

    @Column(nullable = false)
    private Long productId;

    /** Optional short note, e.g. "My everyday pick" - shown under the product on the influencer page. */
    @Column(length = 500)
    private String note;

    private Integer displayOrder = 0;

    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getInfluencerId() { return influencerId; }
    public void setInfluencerId(Long influencerId) { this.influencerId = influencerId; }
    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public Integer getDisplayOrder() { return displayOrder; }
    public void setDisplayOrder(Integer displayOrder) { this.displayOrder = displayOrder; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}

interface InfluencerProductRepository extends JpaRepository<InfluencerProduct, Long> {
    List<InfluencerProduct> findByInfluencerIdOrderByDisplayOrderAscIdAsc(Long influencerId);
    Optional<InfluencerProduct> findByInfluencerIdAndProductId(Long influencerId, Long productId);
    void deleteByInfluencerIdAndProductId(Long influencerId, Long productId);
    void deleteByProductId(Long productId);
    long countByProductId(Long productId);
}

/** What both the public site and admin screens receive - never the raw entity. */
class InfluencerDto {
    public Long id;
    public String name;
    public String bio;
    public String socialPlatform;
    public String socialHandle;
    public String email;
    public String phone;
    public java.math.BigDecimal defaultCommissionPercent;
    public String profileImageUrl;
    public String coverImageUrl;
    public List<String> gallery = new ArrayList<>();
    /** Parsed from "Platform|url" storage into {platform, url} pairs for easy frontend rendering. */
    public List<Map<String, String>> socialLinks = new ArrayList<>();
    public boolean featured;
    public boolean active;
    public Integer displayOrder;
    public Instant createdAt;
    /** Only populated on the detail endpoint - kept off the list endpoint to stay light. */
    public List<ProductDto> products;
}

@org.springframework.stereotype.Component
class InfluencerMapper {

    @Autowired private DtoMapper dtoMapper;
    @Autowired private StorageService storage;

    InfluencerDto toDto(Influencer inf) {
        InfluencerDto dto = new InfluencerDto();
        dto.id = inf.getId();
        dto.name = inf.getName();
        dto.bio = inf.getBio();
        dto.socialPlatform = inf.getSocialPlatform();
        dto.socialHandle = inf.getSocialHandle();
        dto.email = inf.getEmail();
        dto.phone = inf.getPhone();
        dto.defaultCommissionPercent = inf.getDefaultCommissionPercent();
        // Same rule as products/banners/categories: Cloudinary URLs pass through
        // untouched, legacy "/uploads/.." paths become absolute exactly once.
        dto.profileImageUrl = storage.toPublicUrl(inf.getProfileImageUrl());
        dto.coverImageUrl = storage.toPublicUrl(inf.getCoverImageUrl());
        dto.gallery = storage.toPublicUrls(inf.getGallery());
        dto.featured = inf.isFeatured();
        dto.active = inf.isActive();
        dto.displayOrder = inf.getDisplayOrder();
        dto.createdAt = inf.getCreatedAt();
        for (String raw : inf.getSocialLinks()) {
            if (raw == null || raw.isBlank()) continue;
            int idx = raw.indexOf('|');
            Map<String, String> link = new LinkedHashMap<>();
            if (idx > 0) {
                link.put("platform", raw.substring(0, idx));
                link.put("url", raw.substring(idx + 1));
            } else {
                link.put("platform", "Link");
                link.put("url", raw);
            }
            dto.socialLinks.add(link);
        }
        return dto;
    }

    List<ProductDto> toProductDtos(List<Product> products) {
        List<ProductDto> out = new ArrayList<>();
        for (Product p : products) out.add(dtoMapper.toDto(p));
        return out;
    }
}

/* The former public /api/influencers controller was removed on purpose:
   influencers are external affiliates, never a customer-facing feature.
   Everything about them lives under /api/admin/** (super admin only). */

/**
 * Request body for creating/updating an influencer. Kept separate from the
 * entity so a client can never smuggle in fields like id/appUserId/createdAt.
 */
class InfluencerRequest {
    public String name;
    public String email;
    public String phone;
    public String bio;
    public String socialPlatform;
    public String socialHandle;
    /** [{platform, url}, ...] - same shape InfluencerDto renders, so the admin UI can round-trip it. */
    public List<Map<String, String>> socialLinks;
    public Boolean featured;
    public Boolean active;
    public Integer displayOrder;
    public java.math.BigDecimal defaultCommissionPercent;
}

/* ===========================================================
   ADMIN endpoints - full CRUD + image management + product
   linking. Everything under /api/admin/** is already gated by
   AdminAuthFilter (see Admin.java), so no auth code is repeated
   here - matching the existing Banners/Products admin controllers.
   =========================================================== */
@RestController
@RequestMapping("/api/admin/influencers")
class AdminInfluencerController {

    @Autowired private InfluencerRepository influencerRepo;
    @Autowired private InfluencerProductRepository linkRepo;
    @Autowired private ProductRepository productRepo;
    @Autowired private InfluencerMapper mapper;
    @Autowired private StorageService storageService;
    @Autowired private CouponRepository couponRepo;
    @Autowired private CouponUsageRepository usageRepo;
    @Autowired private CurrentUserService currentUser;

    /**
     * Influencer contact details and commission money are not for company
     * (vendor) admins, so every route here re-checks for the super admin
     * role on top of the generic /api/admin/** gate.
     */
    @ModelAttribute
    void requireSuperAdmin(@RequestHeader(value = "Authorization", required = false) String auth) {
        AppUser user = currentUser.require(auth);
        if (user.getRole() != UserRole.SUPER_ADMIN) {
            throw new ForbiddenException("Only the super admin can manage influencers.");
        }
    }

    @GetMapping
    ResponseEntity<?> list() {
        List<Influencer> all = influencerRepo.findAllByOrderByDisplayOrderAscIdDesc();
        List<InfluencerProduct> allLinks = linkRepo.findAll();
        List<InfluencerDto> out = new ArrayList<>();
        for (Influencer inf : all) {
            InfluencerDto dto = mapper.toDto(inf);
            List<Product> products = new ArrayList<>();
            for (InfluencerProduct link : allLinks) {
                if (!link.getInfluencerId().equals(inf.getId())) continue;
                productRepo.findById(link.getProductId()).ifPresent(products::add);
            }
            dto.products = mapper.toProductDtos(products);
            out.add(dto);
        }
        return ResponseEntity.ok(out);
    }

    @GetMapping("/{id}")
    ResponseEntity<?> get(@PathVariable Long id) {
        Influencer inf = influencerRepo.findById(id).orElseThrow(() -> new java.util.NoSuchElementException("Influencer not found"));
        InfluencerDto dto = mapper.toDto(inf);
        List<InfluencerProduct> links = linkRepo.findByInfluencerIdOrderByDisplayOrderAscIdAsc(id);
        List<Product> products = new ArrayList<>();
        for (InfluencerProduct link : links) {
            if (!link.getInfluencerId().equals(id)) continue;
            productRepo.findById(link.getProductId()).ifPresent(products::add);
        }
        dto.products = mapper.toProductDtos(products);
        return ResponseEntity.ok(dto);
    }

    @PostMapping
    ResponseEntity<?> create(@RequestBody InfluencerRequest req) {
        if (req.name == null || req.name.isBlank()) {
            throw new BadRequestException("Name is required");
        }
        Influencer inf = new Influencer();
        applyRequest(inf, req);
        influencerRepo.save(inf);
        return ResponseEntity.status(HttpStatus.CREATED).body(mapper.toDto(inf));
    }

    @PutMapping("/{id}")
    ResponseEntity<?> update(@PathVariable Long id, @RequestBody InfluencerRequest req) {
        Influencer inf = influencerRepo.findById(id).orElseThrow(() -> new java.util.NoSuchElementException("Influencer not found"));
        applyRequest(inf, req);
        influencerRepo.save(inf);
        return ResponseEntity.ok(mapper.toDto(inf));
    }

    @DeleteMapping("/{id}")
    ResponseEntity<?> delete(@PathVariable Long id) {
        Influencer inf = influencerRepo.findById(id).orElseThrow(() -> new java.util.NoSuchElementException("Influencer not found"));
        // Attribution and commission history is an audit trail - never delete
        // an influencer who has coupons or sales on record. Deactivate instead.
        if (!usageRepo.findByInfluencerId(id).isEmpty()) {
            throw new BadRequestException(
                    "This influencer has recorded sales/commissions and cannot be deleted. Deactivate them instead.");
        }
        for (Coupon c : couponRepo.findAll()) {
            if (id.equals(c.getInfluencerId())) {
                throw new BadRequestException(
                        "Delete or reassign this influencer's coupon (" + c.getCode() + ") first, or deactivate the influencer.");
            }
        }
        storageService.deleteQuietly(inf.getProfileImageUrl());
        storageService.deleteQuietly(inf.getCoverImageUrl());
        for (String img : inf.getGallery()) storageService.deleteQuietly(img);
        for (InfluencerProduct link : linkRepo.findByInfluencerIdOrderByDisplayOrderAscIdAsc(id)) {
            if (link.getInfluencerId().equals(id)) linkRepo.deleteById(link.getId());
        }
        influencerRepo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private void applyRequest(Influencer inf, InfluencerRequest req) {
        if (req.name != null) inf.setName(req.name);
        inf.setEmail(blankToNull(req.email));
        inf.setPhone(blankToNull(req.phone));
        inf.setBio(blankToNull(req.bio));
        inf.setSocialPlatform(blankToNull(req.socialPlatform));
        inf.setSocialHandle(blankToNull(req.socialHandle));
        if (req.featured != null) inf.setFeatured(req.featured);
        if (req.active != null) inf.setActive(req.active);
        if (req.displayOrder != null) inf.setDisplayOrder(req.displayOrder);
        if (req.defaultCommissionPercent != null) inf.setDefaultCommissionPercent(req.defaultCommissionPercent);
        if (req.socialLinks != null) {
            List<String> encoded = new ArrayList<>();
            for (Map<String, String> link : req.socialLinks) {
                String platform = link.getOrDefault("platform", "Link");
                String url = link.get("url");
                if (url == null || url.isBlank()) continue;
                encoded.add(platform + "|" + url);
            }
            inf.setSocialLinks(encoded);
        }
    }

    private String blankToNull(String s) { return (s == null || s.isBlank()) ? null : s; }

    /* ---- Image management: upload/replace/delete, Cloudinary-backed ---- */

    @PostMapping("/{id}/image")
    ResponseEntity<?> uploadProfileImage(@PathVariable Long id, @RequestParam("file") MultipartFile file) {
        Influencer inf = influencerRepo.findById(id).orElseThrow(() -> new java.util.NoSuchElementException("Influencer not found"));
        String old = inf.getProfileImageUrl();
        String stored = storageService.storeImage(file, "influencers-profile");
        inf.setProfileImageUrl(stored);
        influencerRepo.save(inf);
        if (old != null) storageService.deleteQuietly(old);
        return ResponseEntity.ok(mapper.toDto(inf));
    }

    @DeleteMapping("/{id}/image")
    ResponseEntity<?> deleteProfileImage(@PathVariable Long id) {
        Influencer inf = influencerRepo.findById(id).orElseThrow(() -> new java.util.NoSuchElementException("Influencer not found"));
        storageService.deleteQuietly(inf.getProfileImageUrl());
        inf.setProfileImageUrl(null);
        influencerRepo.save(inf);
        return ResponseEntity.ok(mapper.toDto(inf));
    }

    @PostMapping("/{id}/cover")
    ResponseEntity<?> uploadCoverImage(@PathVariable Long id, @RequestParam("file") MultipartFile file) {
        Influencer inf = influencerRepo.findById(id).orElseThrow(() -> new java.util.NoSuchElementException("Influencer not found"));
        String old = inf.getCoverImageUrl();
        String stored = storageService.storeImage(file, "influencers-cover");
        inf.setCoverImageUrl(stored);
        influencerRepo.save(inf);
        if (old != null) storageService.deleteQuietly(old);
        return ResponseEntity.ok(mapper.toDto(inf));
    }

    @DeleteMapping("/{id}/cover")
    ResponseEntity<?> deleteCoverImage(@PathVariable Long id) {
        Influencer inf = influencerRepo.findById(id).orElseThrow(() -> new java.util.NoSuchElementException("Influencer not found"));
        storageService.deleteQuietly(inf.getCoverImageUrl());
        inf.setCoverImageUrl(null);
        influencerRepo.save(inf);
        return ResponseEntity.ok(mapper.toDto(inf));
    }

    @PostMapping("/{id}/gallery")
    ResponseEntity<?> addGalleryImage(@PathVariable Long id, @RequestParam("file") MultipartFile file) {
        Influencer inf = influencerRepo.findById(id).orElseThrow(() -> new java.util.NoSuchElementException("Influencer not found"));
        String stored = storageService.storeImage(file, "influencers-gallery");
        inf.getGallery().add(stored);
        influencerRepo.save(inf);
        return ResponseEntity.ok(mapper.toDto(inf));
    }

    @DeleteMapping("/{id}/gallery")
    ResponseEntity<?> removeGalleryImage(@PathVariable Long id, @RequestParam("url") String url) {
        Influencer inf = influencerRepo.findById(id).orElseThrow(() -> new java.util.NoSuchElementException("Influencer not found"));
        boolean removed = inf.getGallery().removeIf(img -> storageService.sameImage(img, url));
        if (removed) {
            storageService.deleteQuietly(url);
            influencerRepo.save(inf);
        }
        return ResponseEntity.ok(mapper.toDto(inf));
    }

    /* ---- Product curation ---- */

    @PostMapping("/{id}/products/{productId}")
    ResponseEntity<?> linkProduct(@PathVariable Long id, @PathVariable Long productId,
                                   @RequestBody(required = false) Map<String, Object> body) {
        influencerRepo.findById(id).orElseThrow(() -> new java.util.NoSuchElementException("Influencer not found"));
        productRepo.findById(productId).orElseThrow(() -> new java.util.NoSuchElementException("Product not found"));

        InfluencerProduct link = linkRepo.findByInfluencerIdAndProductId(id, productId).orElseGet(InfluencerProduct::new);
        link.setInfluencerId(id);
        link.setProductId(productId);
        if (body != null && body.get("note") != null) link.setNote(String.valueOf(body.get("note")));
        if (body != null && body.get("displayOrder") != null) {
            link.setDisplayOrder(Integer.valueOf(String.valueOf(body.get("displayOrder"))));
        }
        linkRepo.save(link);
        return ResponseEntity.ok(get(id).getBody());
    }

    @DeleteMapping("/{id}/products/{productId}")
    ResponseEntity<?> unlinkProduct(@PathVariable Long id, @PathVariable Long productId) {
        linkRepo.deleteByInfluencerIdAndProductId(id, productId);
        return ResponseEntity.ok(get(id).getBody());
    }
}

/**
 * One row per successful use of an influencer's coupon. This is the
 * append-only ledger the brief calls "coupon usage / affiliate conversion
 * record" - never edited after creation, only its commissionStatus advances.
 *
 * Deliberately separate from Coupon.usedCount: usedCount is a fast counter
 * for enforcing maxUses, this table is the audited detail behind it, with
 * one row per order so Super Admin can approve/pay commissions individually.
 */
@Entity
@Table(name = "coupon_usages", uniqueConstraints = @UniqueConstraint(name = "uk_coupon_usage_order", columnNames = "order_id"))
class CouponUsage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long couponId;
    private Long influencerId;
    private Long orderId;
    private Long customerId;

    /** The company whose product this line item belongs to, for company-scoped analytics. */
    private Long companyId;
    private Long productId;

    /** Eligible NET sale: eligible line totals minus the coupon discount, delivery excluded. The commission base. */
    private BigDecimal orderAmount;
    private BigDecimal discountAmount;
    private BigDecimal commissionAmount;

    /* ---- snapshots, so later coupon/influencer edits never rewrite history ---- */
    @Column(name = "coupon_code")
    private String couponCode;
    @Column(name = "order_number")
    private String orderNumber;
    @Column(name = "product_summary", length = 1000)
    private String productSummary;
    /** PERCENT | FIXED, copied from the rule that produced commissionAmount. */
    @Column(name = "commission_type")
    private String commissionType;
    /** The percent or rupee value that was applied. */
    @Column(name = "commission_rate")
    private BigDecimal commissionRate;

    private Instant approvedAt;
    private Instant paidAt;
    @Column(name = "payout_reference")
    private String payoutReference;
    @Column(length = 1000)
    private String note;

    @Enumerated(EnumType.STRING)
    private CommissionStatus commissionStatus = CommissionStatus.PENDING;

    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getCouponId() { return couponId; }
    public void setCouponId(Long couponId) { this.couponId = couponId; }
    public Long getInfluencerId() { return influencerId; }
    public void setInfluencerId(Long influencerId) { this.influencerId = influencerId; }
    public Long getOrderId() { return orderId; }
    public void setOrderId(Long orderId) { this.orderId = orderId; }
    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }
    public Long getCompanyId() { return companyId; }
    public void setCompanyId(Long companyId) { this.companyId = companyId; }
    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public BigDecimal getOrderAmount() { return orderAmount; }
    public void setOrderAmount(BigDecimal orderAmount) { this.orderAmount = orderAmount; }
    public BigDecimal getDiscountAmount() { return discountAmount; }
    public void setDiscountAmount(BigDecimal discountAmount) { this.discountAmount = discountAmount; }
    public BigDecimal getCommissionAmount() { return commissionAmount; }
    public void setCommissionAmount(BigDecimal commissionAmount) { this.commissionAmount = commissionAmount; }
    public CommissionStatus getCommissionStatus() { return commissionStatus; }
    public void setCommissionStatus(CommissionStatus commissionStatus) { this.commissionStatus = commissionStatus; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public String getCouponCode() { return couponCode; }
    public void setCouponCode(String couponCode) { this.couponCode = couponCode; }
    public String getOrderNumber() { return orderNumber; }
    public void setOrderNumber(String orderNumber) { this.orderNumber = orderNumber; }
    public String getProductSummary() { return productSummary; }
    public void setProductSummary(String productSummary) { this.productSummary = productSummary; }
    public String getCommissionType() { return commissionType; }
    public void setCommissionType(String commissionType) { this.commissionType = commissionType; }
    public BigDecimal getCommissionRate() { return commissionRate; }
    public void setCommissionRate(BigDecimal commissionRate) { this.commissionRate = commissionRate; }
    public Instant getApprovedAt() { return approvedAt; }
    public void setApprovedAt(Instant approvedAt) { this.approvedAt = approvedAt; }
    public Instant getPaidAt() { return paidAt; }
    public void setPaidAt(Instant paidAt) { this.paidAt = paidAt; }
    public String getPayoutReference() { return payoutReference; }
    public void setPayoutReference(String payoutReference) { this.payoutReference = payoutReference; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}

interface CouponUsageRepository extends JpaRepository<CouponUsage, Long> {
    java.util.List<CouponUsage> findByInfluencerId(Long influencerId);
    java.util.List<CouponUsage> findByCompanyId(Long companyId);
    java.util.List<CouponUsage> findByOrderId(Long orderId);
    long countByCouponIdAndCustomerIdAndCommissionStatusNotIn(Long couponId, Long customerId, java.util.Collection<CommissionStatus> statuses);
}

/**
 * Commission never becomes PAID automatically - the brief is explicit that
 * Super Admin controls approval and payment. PENDING is the only status a
 * CouponUsage row is ever created with.
 */
enum CommissionStatus {
    PENDING,
    APPROVED,
    PAID,
    CANCELLED,
    /** Was already PAID when the order was later cancelled/refunded: money to recover from the influencer. */
    REVERSED
}
