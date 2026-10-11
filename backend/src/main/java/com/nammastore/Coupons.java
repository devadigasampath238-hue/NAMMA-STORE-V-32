package com.nammastore;

import jakarta.persistence.*;

import com.fasterxml.jackson.annotation.JsonIgnore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.Locale;
import java.util.Optional;

/*
 * ===========================================================
 * Coupons.java  (STAGE 2 - NEW FILE)
 * ===========================================================
 *
 * The Coupon entity already existed but only supported a bare
 * percentage plus a cap. This completes it:
 *
 *   discountType   PERCENT | FIXED
 *   discountValue  the percent, or the flat rupee amount
 *   minOrderValue  minimum cart subtotal to qualify
 *   maxDiscount    cap (percent coupons only)
 *   expiryDate     inclusive last valid day
 *   usageLimit     total redemptions allowed (null = unlimited)
 *   usedCount      redemptions so far
 *   active         manual on/off switch
 *
 * BACKWARDS COMPATIBILITY
 * -----------------------
 * The legacy `discountPercent` / `maxDiscountAmount` columns are
 * kept and stay in sync, so rows created before Stage 2 keep
 * working and nothing has to be hand-edited in pgAdmin.
 *
 * SECURITY
 * --------
 * CouponService.evaluate() is the ONLY place a discount is ever
 * computed. The checkout pricing engine calls it server-side.
 * The frontend's /validate call is a PREVIEW ONLY - whatever it
 * displays is recomputed from scratch before the order is saved.
 * ===========================================================
 */

@Entity
@Table(name = "coupons")
class Coupon {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String code;

    private String description;

    /** PERCENT | FIXED */
    @Column(name = "discount_type")
    private String discountType = CouponType.PERCENT;

    /** Percent (0-100) when PERCENT, rupee amount when FIXED. */
    @Column(name = "discount_value")
    private BigDecimal discountValue = BigDecimal.ZERO;

    /** Legacy column, kept in sync with discountValue for PERCENT coupons. */
    private BigDecimal discountPercent;

    /** Legacy column, kept in sync with maxDiscount. */
    private BigDecimal maxDiscountAmount;

    @Column(name = "min_order_value")
    private BigDecimal minOrderValue = BigDecimal.ZERO;

    /** Cap on a percentage discount. Null = uncapped. */
    @Column(name = "max_discount")
    private BigDecimal maxDiscount;

    /** Inclusive last valid day. Null = never expires. */
    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    /** Null = unlimited. */
    @Column(name = "usage_limit")
    private Integer usageLimit;

    @Column(name = "used_count")
    private Integer usedCount = 0;

    private boolean active = true;

    /**
     * STAGE 1 - influencer/affiliate attribution. NULL for an ordinary
     * store-wide coupon; set for an influencer's personal code (RAHUL10).
     * Applying a coupon with this set is what triggers a CouponUsage row
     * at checkout (Stage 4 wires the checkout-time write; this stage only
     * adds the columns and the per-user usage limit the brief calls for).
     */
    private Long influencerId;

    /** PERCENT | FIXED. Independent of discountType - the customer's
     *  discount and the influencer's commission are not required to use
     *  the same basis. */
    private String commissionType;

    /** Overrides Influencer.defaultCommissionPercent for this coupon specifically. */
    private BigDecimal commissionValue;

    /** Null = no per-user cap beyond the global usageLimit. */
    @Column(name = "per_user_limit")
    private Integer perUserLimit;

    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getInfluencerId() { return influencerId; }
    public void setInfluencerId(Long influencerId) { this.influencerId = influencerId; }
    public String getCommissionType() { return commissionType; }
    public void setCommissionType(String commissionType) { this.commissionType = commissionType; }
    public BigDecimal getCommissionValue() { return commissionValue; }
    public void setCommissionValue(BigDecimal commissionValue) { this.commissionValue = commissionValue; }
    public Integer getPerUserLimit() { return perUserLimit; }
    public void setPerUserLimit(Integer perUserLimit) { this.perUserLimit = perUserLimit; }

    public String getCode() { return code; }
    public void setCode(String code) {
        this.code = code == null ? null : code.trim().toUpperCase(Locale.ROOT);
    }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getDiscountType() { return discountType; }
    public void setDiscountType(String discountType) { this.discountType = discountType; }

    public BigDecimal getDiscountValue() { return discountValue; }
    public void setDiscountValue(BigDecimal discountValue) { this.discountValue = discountValue; }

    public BigDecimal getDiscountPercent() { return discountPercent; }
    public void setDiscountPercent(BigDecimal discountPercent) { this.discountPercent = discountPercent; }

    public BigDecimal getMaxDiscountAmount() { return maxDiscountAmount; }
    public void setMaxDiscountAmount(BigDecimal maxDiscountAmount) { this.maxDiscountAmount = maxDiscountAmount; }

    public BigDecimal getMinOrderValue() { return minOrderValue; }
    public void setMinOrderValue(BigDecimal minOrderValue) { this.minOrderValue = minOrderValue; }

    public BigDecimal getMaxDiscount() { return maxDiscount; }
    public void setMaxDiscount(BigDecimal maxDiscount) { this.maxDiscount = maxDiscount; }

    public LocalDate getExpiryDate() { return expiryDate; }
    public void setExpiryDate(LocalDate expiryDate) { this.expiryDate = expiryDate; }

    public Integer getUsageLimit() { return usageLimit; }
    public void setUsageLimit(Integer usageLimit) { this.usageLimit = usageLimit; }

    public Integer getUsedCount() { return usedCount; }
    public void setUsedCount(Integer usedCount) { this.usedCount = usedCount; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    /**
     * Reconciles the new fields with the legacy columns. Called before every
     * save so old and new readers always agree.
     */
    void normalize() {
        if (discountType == null || !CouponType.isValid(discountType)) {
            discountType = CouponType.PERCENT;
        }
        discountType = discountType.toUpperCase(Locale.ROOT);

        if (discountValue == null) {
            // Row created by the pre-Stage-2 admin page: adopt the legacy value.
            discountValue = discountPercent == null ? BigDecimal.ZERO : discountPercent;
        }
        if (discountValue.compareTo(BigDecimal.ZERO) < 0) {
            discountValue = BigDecimal.ZERO;
        }
        if (CouponType.PERCENT.equals(discountType)
                && discountValue.compareTo(BigDecimal.valueOf(100)) > 0) {
            discountValue = BigDecimal.valueOf(100);
        }

        if (maxDiscount == null && maxDiscountAmount != null) {
            maxDiscount = maxDiscountAmount;
        }
        if (minOrderValue == null) minOrderValue = BigDecimal.ZERO;
        if (usedCount == null) usedCount = 0;

        // keep legacy columns aligned
        discountPercent = CouponType.PERCENT.equals(discountType) ? discountValue : BigDecimal.ZERO;
        maxDiscountAmount = maxDiscount;
    }
}


final class CouponType {
    static final String PERCENT = "PERCENT";
    static final String FIXED = "FIXED";
    static final List<String> ALL = List.of(PERCENT, FIXED);

    static boolean isValid(String value) {
        return value != null && ALL.contains(value.trim().toUpperCase(Locale.ROOT));
    }

    private CouponType() { }
}


interface CouponRepository extends JpaRepository<Coupon, Long> {
    Optional<Coupon> findByCodeIgnoreCase(String code);
    Optional<Coupon> findByCodeAndActiveTrue(String code);
    List<Coupon> findAllByOrderByIdDesc();
}


/* ===========================================================
   DTO + REQUEST
   =========================================================== */

class CouponDto {
    public Long id;
    public String code;
    public String description;
    public String discountType;
    public BigDecimal discountValue;
    public BigDecimal minOrderValue;
    public BigDecimal maxDiscount;
    public String expiryDate;      // ISO yyyy-MM-dd, or null
    public Integer usageLimit;
    public Integer usedCount;
    public boolean active;
    /** Computed: false once expired or fully used, even if active is true. */
    public boolean usable;
    public String statusLabel;     // ACTIVE | INACTIVE | EXPIRED | EXHAUSTED
    /** e.g. "20% off up to ₹150" - ready to render. */
    public String summary;
}

class CouponRequest {
    public String code;
    public String description;
    public String discountType;
    public BigDecimal discountValue;
    public BigDecimal minOrderValue;
    public BigDecimal maxDiscount;
    public String expiryDate;      // ISO yyyy-MM-dd, or null/blank
    public Integer usageLimit;
    public Boolean active;

    /* Affiliate link. Null influencerId = an ordinary store-wide coupon. */
    public Long influencerId;
    /** PERCENT | FIXED. Only used with influencerId. */
    public String commissionType;
    /** Percent or rupees. Null = fall back to the influencer's default commission %. */
    public BigDecimal commissionValue;
    /** Max redemptions per customer. Null = unlimited. */
    public Integer perUserLimit;
}

/**
 * Admin-only view of a coupon. The PUBLIC checkout preview returns the plain
 * CouponDto, so influencer identity and commission rules can never leak to
 * a customer through it.
 */
class AdminCouponDto extends CouponDto {
    public Long influencerId;
    public String influencerName;
    public String commissionType;
    public BigDecimal commissionValue;
    public Integer perUserLimit;
}

/** Result of evaluating a coupon against a cart subtotal. */
class CouponEvaluation {
    public boolean valid;
    public BigDecimal discount = BigDecimal.ZERO;
    public String code;
    public String message;
    public CouponDto coupon;

    /* Server-side attribution. @JsonIgnore: the public preview endpoint
       returns this object, and customers must never see these. */
    @JsonIgnore public Long couponId;
    @JsonIgnore public Long influencerId;
    @JsonIgnore public BigDecimal eligibleSubtotal;
    @JsonIgnore public List<PricedLine> eligibleLines = new ArrayList<>();
}


/* ===========================================================
   SERVICE - the single source of truth for discounts
   =========================================================== */

@Service
class CouponService {

    @Autowired private CouponRepository couponRepository;
    @Autowired private InfluencerRepository influencerRepository;
    @Autowired private InfluencerProductRepository influencerProductRepository;
    @Autowired private CouponUsageRepository couponUsageRepository;

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    /**
     * Evaluates a coupon code against a cart subtotal.
     *
     * Never throws for a bad code - it returns a result carrying a
     * customer-readable reason, because "this coupon is expired" is a
     * normal outcome, not an exception.
     */
    CouponEvaluation evaluate(String rawCode, BigDecimal subtotal, List<PricedLine> lines) {
        CouponEvaluation result = new CouponEvaluation();
        result.discount = money(BigDecimal.ZERO);

        if (rawCode == null || rawCode.isBlank()) {
            return result; // nothing applied, no message
        }

        String code = rawCode.trim().toUpperCase(Locale.ROOT);
        result.code = code;

        Optional<Coupon> found = couponRepository.findByCodeIgnoreCase(code);
        if (found.isEmpty()) {
            result.message = "That coupon code is not valid.";
            return result;
        }

        Coupon coupon = found.get();
        coupon.normalize();
        result.coupon = toDto(coupon);
        result.couponId = coupon.getId();

        if (!coupon.isActive()) {
            result.message = "This coupon is no longer active.";
            return result;
        }
        if (isExpired(coupon)) {
            result.message = "This coupon expired on " + coupon.getExpiryDate() + ".";
            return result;
        }
        if (isExhausted(coupon)) {
            result.message = "This coupon has reached its usage limit.";
            return result;
        }

        BigDecimal base = subtotal == null ? BigDecimal.ZERO : subtotal;

        // The part of the cart the discount may apply to. For an ordinary
        // coupon that is the whole cart. For an influencer coupon it is
        // restricted to the products assigned to that influencer (when the
        // admin assigned any), so a code cannot be used on the wrong product.
        BigDecimal eligible = base;
        List<PricedLine> eligibleLines = lines == null ? new ArrayList<>() : new ArrayList<>(lines);

        if (coupon.getInfluencerId() != null) {
            Influencer influencer = influencerRepository.findById(coupon.getInfluencerId()).orElse(null);
            if (influencer == null || !influencer.isActive()) {
                // Deliberately the same wording as a switched-off coupon:
                // customers learn nothing about who the influencer is.
                result.message = "This coupon is no longer active.";
                return result;
            }
            result.influencerId = influencer.getId();

            List<InfluencerProduct> assigned =
                    influencerProductRepository.findByInfluencerIdOrderByDisplayOrderAscIdAsc(influencer.getId());
            if (!assigned.isEmpty()) {
                Set<Long> allowed = new HashSet<>();
                for (InfluencerProduct link : assigned) allowed.add(link.getProductId());

                eligible = BigDecimal.ZERO;
                eligibleLines = new ArrayList<>();
                if (lines != null) {
                    for (PricedLine line : lines) {
                        if (line.productId != null && allowed.contains(line.productId)) {
                            eligible = eligible.add(line.lineTotal);
                            eligibleLines.add(line);
                        }
                    }
                }
                if (eligible.compareTo(BigDecimal.ZERO) <= 0) {
                    result.message = "This coupon is not valid for the items in your cart.";
                    return result;
                }
            }
        }
        result.eligibleSubtotal = money(eligible);
        result.eligibleLines = eligibleLines;

        BigDecimal minimum = coupon.getMinOrderValue() == null ? BigDecimal.ZERO : coupon.getMinOrderValue();

        if (base.compareTo(minimum) < 0) {
            BigDecimal shortfall = minimum.subtract(base);
            result.message = "Add items worth " + rupees(shortfall)
                    + " more to use this coupon (minimum order " + rupees(minimum) + ").";
            return result;
        }

        BigDecimal discount;
        if (CouponType.FIXED.equals(coupon.getDiscountType())) {
            discount = coupon.getDiscountValue();
        } else {
            // Scale explicitly: an unscaled divide() throws for non-terminating
            // decimals (a 33% coupon used to crash checkout outright).
            discount = eligible.multiply(coupon.getDiscountValue())
                    .divide(HUNDRED, 2, RoundingMode.HALF_UP);

            if (coupon.getMaxDiscount() != null
                    && discount.compareTo(coupon.getMaxDiscount()) > 0) {
                discount = coupon.getMaxDiscount();
            }
        }

        // A discount can never exceed the part of the cart it applies to.
        if (discount.compareTo(eligible) > 0) discount = eligible;
        if (discount.compareTo(BigDecimal.ZERO) < 0) discount = BigDecimal.ZERO;

        discount = money(discount);

        if (discount.compareTo(BigDecimal.ZERO) <= 0) {
            result.message = "This coupon does not reduce your current total.";
            return result;
        }

        result.valid = true;
        result.discount = discount;
        result.message = "Coupon applied. You saved " + rupees(discount) + ".";
        return result;
    }

    /** Called once, inside the checkout transaction, after the order is accepted. */
    void recordRedemption(String code) {
        if (code == null || code.isBlank()) return;
        couponRepository.findByCodeIgnoreCase(code.trim()).ifPresent(coupon -> {
            coupon.normalize();
            coupon.setUsedCount((coupon.getUsedCount() == null ? 0 : coupon.getUsedCount()) + 1);
            couponRepository.save(coupon);
        });
    }

    /**
     * Per-customer cap for influencer coupons. Returns a customer-readable
     * reason when the customer has used the code up, otherwise null.
     * Cancelled/reversed redemptions do not count against the cap.
     */
    String perUserLimitMessage(Long couponId, Long customerId) {
        if (couponId == null || customerId == null) return null;
        Coupon coupon = couponRepository.findById(couponId).orElse(null);
        if (coupon == null || coupon.getPerUserLimit() == null || coupon.getPerUserLimit() <= 0) return null;
        long used = couponUsageRepository.countByCouponIdAndCustomerIdAndCommissionStatusNotIn(
                couponId, customerId, List.of(CommissionStatus.CANCELLED, CommissionStatus.REVERSED));
        return used >= coupon.getPerUserLimit()
                ? "You have already used this coupon the maximum number of times."
                : null;
    }

    /**
     * Validates a "?ref=CODE" value carried through the shopping flow.
     * Returns the normalised code only if it is a real influencer coupon,
     * otherwise null - an arbitrary string is never written to an order.
     */
    String referralOrNull(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String code = raw.trim().toUpperCase(Locale.ROOT);
        return couponRepository.findByCodeIgnoreCase(code)
                .filter(c -> c.getInfluencerId() != null)
                .map(Coupon::getCode)
                .orElse(null);
    }

    /* ---------------- admin CRUD helpers ---------------- */

    List<CouponDto> listAll() {
        List<CouponDto> out = new ArrayList<>();
        for (Coupon c : couponRepository.findAllByOrderByIdDesc()) {
            c.normalize();
            out.add(toAdminDto(c));
        }
        return out;
    }

    CouponDto create(CouponRequest req) {
        String code = requireCode(req.code);
        couponRepository.findByCodeIgnoreCase(code).ifPresent(existing -> {
            throw new BadRequestException("A coupon with the code " + code + " already exists.");
        });

        Coupon coupon = new Coupon();
        apply(coupon, req);
        coupon.setUsedCount(0);
        coupon.normalize();
        return toAdminDto(couponRepository.save(coupon));
    }

    CouponDto update(Long id, CouponRequest req) {
        Coupon coupon = couponRepository.findById(id)
                .orElseThrow(() -> new BadRequestException("That coupon no longer exists."));

        String code = requireCode(req.code);
        couponRepository.findByCodeIgnoreCase(code).ifPresent(clash -> {
            if (!clash.getId().equals(id)) {
                throw new BadRequestException("Another coupon already uses the code " + code + ".");
            }
        });

        apply(coupon, req);
        coupon.normalize();
        return toAdminDto(couponRepository.save(coupon));
    }

    void delete(Long id) {
        if (!couponRepository.existsById(id)) {
            throw new BadRequestException("That coupon no longer exists.");
        }
        Coupon existing = couponRepository.findById(id).orElseThrow();
        if (existing.getInfluencerId() != null) {
            for (CouponUsage usage : couponUsageRepository.findAll()) {
                if (id.equals(usage.getCouponId())) {
                    throw new BadRequestException(
                            "This influencer coupon has recorded sales and cannot be deleted. Deactivate it instead.");
                }
            }
        }
        couponRepository.deleteById(id);
    }

    CouponDto setActive(Long id, boolean active) {
        Coupon coupon = couponRepository.findById(id)
                .orElseThrow(() -> new BadRequestException("That coupon no longer exists."));
        coupon.setActive(active);
        coupon.normalize();
        return toAdminDto(couponRepository.save(coupon));
    }

    /* ---------------- internals ---------------- */

    private void apply(Coupon coupon, CouponRequest req) {
        coupon.setCode(requireCode(req.code));
        coupon.setDescription(req.description);

        String type = CouponType.isValid(req.discountType)
                ? req.discountType.trim().toUpperCase(Locale.ROOT)
                : CouponType.PERCENT;
        coupon.setDiscountType(type);

        if (req.discountValue == null || req.discountValue.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BadRequestException("Discount value must be greater than zero.");
        }
        if (CouponType.PERCENT.equals(type) && req.discountValue.compareTo(HUNDRED) > 0) {
            throw new BadRequestException("A percentage discount cannot be more than 100%.");
        }
        coupon.setDiscountValue(req.discountValue);

        coupon.setMinOrderValue(req.minOrderValue == null ? BigDecimal.ZERO : req.minOrderValue);
        coupon.setMaxDiscount(CouponType.PERCENT.equals(type) ? req.maxDiscount : null);
        coupon.setUsageLimit(req.usageLimit != null && req.usageLimit > 0 ? req.usageLimit : null);
        coupon.setActive(req.active == null || req.active);

        // ---- affiliate link ----
        if (req.influencerId != null) {
            Influencer influencer = influencerRepository.findById(req.influencerId)
                    .orElseThrow(() -> new BadRequestException("That influencer no longer exists."));

            String commissionType = CouponType.isValid(req.commissionType)
                    ? req.commissionType.trim().toUpperCase(Locale.ROOT)
                    : CouponType.PERCENT;
            BigDecimal commissionValue = req.commissionValue != null
                    ? req.commissionValue
                    : influencer.getDefaultCommissionPercent();
            if (commissionValue == null || commissionValue.compareTo(BigDecimal.ZERO) < 0) {
                throw new BadRequestException(
                        "Set a commission for this coupon (or a default commission % on the influencer).");
            }
            if (CouponType.PERCENT.equals(commissionType) && commissionValue.compareTo(HUNDRED) > 0) {
                throw new BadRequestException("A percentage commission cannot be more than 100%.");
            }
            coupon.setInfluencerId(influencer.getId());
            coupon.setCommissionType(commissionType);
            coupon.setCommissionValue(commissionValue);
            coupon.setPerUserLimit(req.perUserLimit != null && req.perUserLimit > 0 ? req.perUserLimit : null);
        }
        // else: leave any existing influencer link untouched. The generic
        // Coupons screen does not send these fields, and saving it must
        // never silently detach an influencer's code from the influencer.

        if (req.expiryDate != null && !req.expiryDate.isBlank()) {
            try {
                coupon.setExpiryDate(LocalDate.parse(req.expiryDate.trim()));
            } catch (Exception e) {
                throw new BadRequestException("Expiry date must be in YYYY-MM-DD format.");
            }
        } else {
            coupon.setExpiryDate(null);
        }
    }

    private String requireCode(String code) {
        if (code == null || code.isBlank()) {
            throw new BadRequestException("Coupon code is required.");
        }
        String cleaned = code.trim().toUpperCase(Locale.ROOT);
        if (!cleaned.matches("[A-Z0-9_-]{3,32}")) {
            throw new BadRequestException(
                    "Coupon code must be 3-32 characters, using letters, numbers, - or _ only.");
        }
        return cleaned;
    }

    private static boolean isExpired(Coupon coupon) {
        if (coupon.getExpiryDate() == null) return false;
        return LocalDate.now(ZoneId.systemDefault()).isAfter(coupon.getExpiryDate());
    }

    private static boolean isExhausted(Coupon coupon) {
        if (coupon.getUsageLimit() == null) return false;
        int used = coupon.getUsedCount() == null ? 0 : coupon.getUsedCount();
        return used >= coupon.getUsageLimit();
    }

    CouponDto toDto(Coupon c) {
        CouponDto dto = new CouponDto();
        dto.id = c.getId();
        dto.code = c.getCode();
        dto.description = c.getDescription();
        dto.discountType = c.getDiscountType();
        dto.discountValue = c.getDiscountValue();
        dto.minOrderValue = c.getMinOrderValue();
        dto.maxDiscount = c.getMaxDiscount();
        dto.expiryDate = c.getExpiryDate() == null ? null : c.getExpiryDate().toString();
        dto.usageLimit = c.getUsageLimit();
        dto.usedCount = c.getUsedCount();
        dto.active = c.isActive();

        if (!c.isActive()) {
            dto.statusLabel = "INACTIVE";
        } else if (isExpired(c)) {
            dto.statusLabel = "EXPIRED";
        } else if (isExhausted(c)) {
            dto.statusLabel = "EXHAUSTED";
        } else {
            dto.statusLabel = "ACTIVE";
        }
        dto.usable = "ACTIVE".equals(dto.statusLabel);
        dto.summary = summarize(c);
        return dto;
    }

    AdminCouponDto toAdminDto(Coupon c) {
        CouponDto base = toDto(c);
        AdminCouponDto dto = new AdminCouponDto();
        dto.id = base.id;
        dto.code = base.code;
        dto.description = base.description;
        dto.discountType = base.discountType;
        dto.discountValue = base.discountValue;
        dto.minOrderValue = base.minOrderValue;
        dto.maxDiscount = base.maxDiscount;
        dto.expiryDate = base.expiryDate;
        dto.usageLimit = base.usageLimit;
        dto.usedCount = base.usedCount;
        dto.active = base.active;
        dto.usable = base.usable;
        dto.statusLabel = base.statusLabel;
        dto.summary = base.summary;

        dto.influencerId = c.getInfluencerId();
        if (c.getInfluencerId() != null) {
            influencerRepository.findById(c.getInfluencerId())
                    .ifPresent(i -> dto.influencerName = i.getName());
        }
        dto.commissionType = c.getCommissionType();
        dto.commissionValue = c.getCommissionValue();
        dto.perUserLimit = c.getPerUserLimit();
        return dto;
    }

    private static String summarize(Coupon c) {
        StringBuilder sb = new StringBuilder();
        if (CouponType.FIXED.equals(c.getDiscountType())) {
            sb.append(rupees(c.getDiscountValue())).append(" off");
        } else {
            sb.append(stripZeros(c.getDiscountValue())).append("% off");
            if (c.getMaxDiscount() != null) {
                sb.append(" up to ").append(rupees(c.getMaxDiscount()));
            }
        }
        if (c.getMinOrderValue() != null && c.getMinOrderValue().compareTo(BigDecimal.ZERO) > 0) {
            sb.append(" on orders above ").append(rupees(c.getMinOrderValue()));
        }
        return sb.toString();
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static String rupees(BigDecimal value) {
        return "Rs." + stripZeros(value);
    }

    private static String stripZeros(BigDecimal value) {
        if (value == null) return "0";
        return value.stripTrailingZeros().toPlainString();
    }
}


/* ===========================================================
   PUBLIC PREVIEW ENDPOINT
   -----------------------------------------------------------
   Lets the checkout page show "Coupon applied, you saved Rs.X"
   before the order exists. PREVIEW ONLY - the real discount is
   recomputed inside POST /api/checkout.
   =========================================================== */

@RestController
@RequestMapping("/api/coupons")
class PublicCouponController {

    @Autowired private CouponService couponService;
    @Autowired private CartItemRepository cartItemRepository;
    @Autowired private OrdersController ordersController;

    /**
     * Validates a code against the signed-in user's live cart subtotal,
     * so the preview cannot be gamed by a client-supplied total.
     */
    @GetMapping("/validate")
    public CouponEvaluation validate(
            @RequestParam String code,
            @RequestParam Long userId) {

        PricingResult pricing = ordersController.priceCart(
                cartItemRepository.findByUserId(userId), null);

        CouponEvaluation evaluation = couponService.evaluate(code, pricing.subtotal, pricing.lines);
        if (evaluation.valid) {
            String blocked = couponService.perUserLimitMessage(evaluation.couponId, userId);
            if (blocked != null) {
                evaluation.valid = false;
                evaluation.discount = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
                evaluation.message = blocked;
            }
        }
        return evaluation;
    }
}


/* ===========================================================
   ADMIN COUPON CRUD
   -----------------------------------------------------------
   Everything the admin dashboard needs - no SQL required.
   =========================================================== */

@RestController
@RequestMapping("/api/admin/coupons")
class AdminCouponController {

    @Autowired private CouponService couponService;
    @Autowired private CouponRepository couponRepository;
    @Autowired private CurrentUserService currentUser;

    private void requireSuperAdmin(String auth) {
        AppUser user = currentUser.require(auth);
        if (user.getRole() != UserRole.SUPER_ADMIN) {
            throw new ForbiddenException("Only the super admin can manage influencer coupons.");
        }
    }

    /** Touching an influencer coupon (creating one, or editing/deleting an existing one) is super-admin only. */
    private void guardAffiliate(String auth, CouponRequest req, Long existingId) {
        boolean affiliate = req != null && req.influencerId != null;
        if (!affiliate && existingId != null) {
            affiliate = couponRepository.findById(existingId)
                    .map(c -> c.getInfluencerId() != null).orElse(false);
        }
        if (affiliate) requireSuperAdmin(auth);
    }

    @GetMapping
    public List<CouponDto> list() {
        return couponService.listAll();
    }

    @GetMapping("/types")
    public List<String> types() {
        return CouponType.ALL;
    }

    @PostMapping
    public ResponseEntity<CouponDto> create(
            @RequestBody CouponRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        guardAffiliate(auth, req, null);
        return ResponseEntity.status(HttpStatus.CREATED).body(couponService.create(req));
    }

    @PutMapping("/{id}")
    public CouponDto update(
            @PathVariable Long id,
            @RequestBody CouponRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        guardAffiliate(auth, req, id);
        return couponService.update(id, req);
    }

    @PutMapping("/{id}/active")
    public CouponDto setActive(
            @PathVariable Long id,
            @RequestParam boolean active,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        guardAffiliate(auth, null, id);
        return couponService.setActive(id, active);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable Long id,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        guardAffiliate(auth, null, id);
        couponService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
