package com.nammastore;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/* ===========================================================
   AFFILIATE / INFLUENCER COMMISSION SYSTEM
   -----------------------------------------------------------
   Influencers are EXTERNAL marketers. They never appear on the
   customer site. The flow is:

     Influencer --owns--> Coupon (Coupon.influencerId)
     Customer applies the coupon at checkout
       -> CouponService.evaluate() validates it and works out which
          cart lines are eligible (Influencer product assignments)
       -> the Order stores influencerId + couponCode permanently
       -> CommissionService.recordForOrder() writes ONE CouponUsage
          row (the commission ledger) with status PENDING
     Order DELIVERED            -> PENDING  => APPROVED
     Order CANCELLED / refunded -> not payable (CANCELLED, or
                                   REVERSED if it had been paid)
     Admin payout               -> APPROVED => PAID

   Every number is computed here on the server. The browser only
   ever sends a coupon code.
   =========================================================== */

@Service
class CommissionService {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    @Autowired private CouponUsageRepository usageRepository;
    @Autowired private CouponRepository couponRepository;
    @Autowired private InfluencerRepository influencerRepository;

    /**
     * Writes the commission row for a freshly saved order. Runs inside the
     * checkout transaction. Idempotent: one row per order, ever.
     *
     * Commission base ("eligible sale") = eligible line totals minus the
     * coupon discount, delivery excluded. It is what the store actually keeps
     * from the lines the influencer is responsible for.
     */
    void recordForOrder(Order order, PricingResult pricing) {
        if (order == null || order.getId() == null) return;
        if (!pricing.couponApplied || pricing.influencerId == null || pricing.couponId == null) return;
        if (!usageRepository.findByOrderId(order.getId()).isEmpty()) return;

        Coupon coupon = couponRepository.findById(pricing.couponId).orElse(null);
        Influencer influencer = influencerRepository.findById(pricing.influencerId).orElse(null);
        if (coupon == null || influencer == null) return;

        BigDecimal eligibleGross = pricing.eligibleSubtotal == null ? BigDecimal.ZERO : pricing.eligibleSubtotal;
        BigDecimal discount = pricing.discount == null ? BigDecimal.ZERO : pricing.discount;
        BigDecimal netSale = eligibleGross.subtract(discount);
        if (netSale.compareTo(BigDecimal.ZERO) < 0) netSale = BigDecimal.ZERO;
        netSale = netSale.setScale(2, RoundingMode.HALF_UP);

        // Rule: the coupon's own commission wins, otherwise the influencer's default %.
        String type = CouponType.PERCENT;
        BigDecimal value = BigDecimal.ZERO;
        if (coupon.getCommissionValue() != null) {
            if (CouponType.isValid(coupon.getCommissionType())) {
                type = coupon.getCommissionType().trim().toUpperCase(Locale.ROOT);
            }
            value = coupon.getCommissionValue();
        } else if (influencer.getDefaultCommissionPercent() != null) {
            value = influencer.getDefaultCommissionPercent();
        }

        BigDecimal commission = CouponType.FIXED.equals(type)
                ? value
                : netSale.multiply(value).divide(HUNDRED, 2, RoundingMode.HALF_UP);
        // Never pay out more than the sale itself brought in.
        if (commission.compareTo(netSale) > 0) commission = netSale;
        if (commission.compareTo(BigDecimal.ZERO) < 0) commission = BigDecimal.ZERO;
        commission = commission.setScale(2, RoundingMode.HALF_UP);

        PricedLine biggest = null;
        List<String> names = new ArrayList<>();
        for (PricedLine line : pricing.eligibleLines) {
            if (line.productName != null && !names.contains(line.productName)) names.add(line.productName);
            if (biggest == null || line.lineTotal.compareTo(biggest.lineTotal) > 0) biggest = line;
        }
        String summary = String.join(", ", names);
        if (summary.length() > 1000) summary = summary.substring(0, 997) + "...";

        CouponUsage row = new CouponUsage();
        row.setCouponId(coupon.getId());
        row.setCouponCode(coupon.getCode());
        row.setInfluencerId(influencer.getId());
        row.setOrderId(order.getId());
        row.setOrderNumber(order.getOrderNumber());
        row.setCustomerId(order.getUser() == null ? null : order.getUser().getId());
        row.setCompanyId(biggest == null ? null : biggest.companyId);
        row.setProductId(biggest == null ? null : biggest.productId);
        row.setProductSummary(summary.isBlank() ? null : summary);
        row.setOrderAmount(netSale);
        row.setDiscountAmount(discount.setScale(2, RoundingMode.HALF_UP));
        row.setCommissionType(type);
        row.setCommissionRate(value);
        row.setCommissionAmount(commission);
        row.setCommissionStatus(CommissionStatus.PENDING);
        usageRepository.save(row);
    }

    /**
     * Keeps the commission aligned with what happened to its order. Called
     * after every order status / return status change.
     *
     *   cancelled, refunded or return completed -> never payable
     *       (PAID rows become REVERSED so the admin knows to recover them)
     *   delivered                               -> PENDING becomes APPROVED
     *   moved back out of delivered             -> APPROVED goes back to PENDING
     */
    void syncWithOrder(Order order) {
        if (order == null || order.getId() == null) return;
        List<CouponUsage> rows = usageRepository.findByOrderId(order.getId());
        if (rows.isEmpty()) return;

        boolean dead = OrderStatus.CANCELLED.equals(order.getStatus())
                || "REFUNDED".equalsIgnoreCase(order.getPaymentStatus())
                || ReturnStatus.COMPLETED.equalsIgnoreCase(order.getReturnStatus());
        boolean delivered = OrderStatus.DELIVERED.equals(order.getStatus());

        for (CouponUsage row : rows) {
            CommissionStatus before = row.getCommissionStatus();
            if (dead) {
                if (before == CommissionStatus.PAID) {
                    row.setCommissionStatus(CommissionStatus.REVERSED);
                    row.setNote(appendNote(row.getNote(),
                            "Order was cancelled/refunded after this commission was paid - recover it."));
                } else if (before != CommissionStatus.CANCELLED && before != CommissionStatus.REVERSED) {
                    row.setCommissionStatus(CommissionStatus.CANCELLED);
                    row.setApprovedAt(null);
                }
            } else if (delivered && before == CommissionStatus.PENDING) {
                row.setCommissionStatus(CommissionStatus.APPROVED);
                row.setApprovedAt(Instant.now());
            } else if (!delivered && before == CommissionStatus.APPROVED) {
                row.setCommissionStatus(CommissionStatus.PENDING);
                row.setApprovedAt(null);
            }
            if (row.getCommissionStatus() != before) usageRepository.save(row);
        }
    }

    private static String appendNote(String existing, String addition) {
        if (existing == null || existing.isBlank()) return addition;
        return existing.contains(addition) ? existing : existing + " | " + addition;
    }
}


/* ===========================================================
   DTOs (admin only)
   =========================================================== */

class CommissionRowDto {
    public Long id;
    public Long orderId;
    public String orderNumber;
    public Long influencerId;
    public String influencerName;
    public String couponCode;
    public Long productId;
    public String productSummary;
    public Long customerId;
    public String customerName;
    /** Eligible net sale - the commission base. */
    public BigDecimal saleAmount;
    public BigDecimal discountAmount;
    public String commissionType;
    public BigDecimal commissionRate;
    public BigDecimal commissionAmount;
    public String commissionStatus;
    public String orderStatus;
    public String paymentStatus;
    public String returnStatus;
    public Instant createdAt;
    public Instant approvedAt;
    public Instant paidAt;
    public String payoutReference;
    public String note;
}

class CommissionStatusRequest {
    public String status;
    public String reference;
    public String note;
}

class PayoutRequest {
    public Long influencerId;
    /** Optional: pay only these rows. Empty = every APPROVED row of the influencer. */
    public List<Long> commissionIds;
    public String reference;
    public String note;
}


/* ===========================================================
   ADMIN: AFFILIATE MANAGEMENT  (super admin only)
   =========================================================== */

@RestController
@RequestMapping("/api/admin/affiliate")
class AffiliateAdminController {

    private static final Set<CommissionStatus> LIVE =
            EnumSet.of(CommissionStatus.PENDING, CommissionStatus.APPROVED, CommissionStatus.PAID);

    @Autowired private CouponUsageRepository usageRepository;
    @Autowired private CouponRepository couponRepository;
    @Autowired private CouponService couponService;
    @Autowired private InfluencerRepository influencerRepository;
    @Autowired private InfluencerProductRepository influencerProductRepository;
    @Autowired private OrderRepository orderRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private CurrentUserService currentUser;

    /** Commission money and influencer contact data are never visible to company admins. */
    @ModelAttribute
    void requireSuperAdmin(@RequestHeader(value = "Authorization", required = false) String auth) {
        AppUser user = currentUser.require(auth);
        if (user.getRole() != UserRole.SUPER_ADMIN) {
            throw new ForbiddenException("Only the super admin can view influencer commissions.");
        }
    }

    /* ---------------- dashboard numbers ---------------- */

    @GetMapping("/summary")
    public Map<String, Object> summary() {
        List<CouponUsage> rows = usageRepository.findAll();

        long totalInfluencers = influencerRepository.count();
        long activeInfluencers = influencerRepository.findByActiveTrueOrderByDisplayOrderAscIdDesc().size();

        BigDecimal sales = BigDecimal.ZERO;
        BigDecimal pending = BigDecimal.ZERO;
        BigDecimal approved = BigDecimal.ZERO;
        BigDecimal paid = BigDecimal.ZERO;
        BigDecimal toRecover = BigDecimal.ZERO;
        long liveOrders = 0;
        for (CouponUsage r : rows) {
            BigDecimal commission = nz(r.getCommissionAmount());
            CommissionStatus st = r.getCommissionStatus();
            if (LIVE.contains(st)) {
                sales = sales.add(nz(r.getOrderAmount()));
                liveOrders++;
            }
            if (st == CommissionStatus.PENDING) pending = pending.add(commission);
            else if (st == CommissionStatus.APPROVED) approved = approved.add(commission);
            else if (st == CommissionStatus.PAID) paid = paid.add(commission);
            else if (st == CommissionStatus.REVERSED) toRecover = toRecover.add(commission);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("totalInfluencers", totalInfluencers);
        out.put("activeInfluencers", activeInfluencers);
        out.put("totalOrders", rows.size());
        out.put("successfulOrders", liveOrders);
        out.put("totalSales", money(sales));
        out.put("pendingCommission", money(pending));
        out.put("approvedCommission", money(approved));
        out.put("paidCommission", money(paid));
        out.put("commissionToRecover", money(toRecover));
        return out;
    }

    /* ---------------- influencer table ---------------- */

    @GetMapping("/influencers")
    public List<Map<String, Object>> influencers() {
        List<CouponUsage> rows = usageRepository.findAll();
        List<Coupon> coupons = couponRepository.findAll();
        Map<Long, Order> orders = ordersFor(rows);

        List<Map<String, Object>> out = new ArrayList<>();
        for (Influencer inf : influencerRepository.findAllByOrderByDisplayOrderAscIdDesc()) {
            out.add(influencerRow(inf, rows, coupons, orders));
        }
        return out;
    }

    /** Everything on one screen: profile, coupons, assigned products, totals, recent sales. */
    @GetMapping("/influencers/{id}")
    public Map<String, Object> influencerDetail(@PathVariable Long id) {
        Influencer inf = influencerRepository.findById(id)
                .orElseThrow(() -> new BadRequestException("That influencer no longer exists."));

        List<CouponUsage> rows = usageRepository.findByInfluencerId(id);
        List<Coupon> coupons = couponRepository.findAll();
        Map<Long, Order> orders = ordersFor(rows);

        Map<String, Object> out = influencerRow(inf, rows, coupons, orders);

        List<CouponDto> ownCoupons = new ArrayList<>();
        for (Coupon c : coupons) {
            if (id.equals(c.getInfluencerId())) {
                c.normalize();
                ownCoupons.add(couponService.toAdminDto(c));
            }
        }
        out.put("coupons", ownCoupons);

        List<Map<String, Object>> products = new ArrayList<>();
        for (InfluencerProduct link : influencerProductRepository.findByInfluencerIdOrderByDisplayOrderAscIdAsc(id)) {
            productRepository.findById(link.getProductId()).ifPresent(p -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("id", p.getId());
                m.put("name", p.getName());
                products.add(m);
            });
        }
        out.put("assignedProducts", products);

        List<CommissionRowDto> recent = new ArrayList<>();
        rows.sort(Comparator.comparing(CouponUsage::getCreatedAt, Comparator.nullsLast(Comparator.<Instant>reverseOrder())));
        for (CouponUsage r : rows) {
            recent.add(toRow(r, inf, orders.get(r.getOrderId())));
            if (recent.size() >= 20) break;
        }
        out.put("recentCommissions", recent);
        return out;
    }

    /**
     * Suggests a unique coupon code like RAHUL10 from the influencer's name
     * and the customer discount. The admin can still type their own.
     */
    @GetMapping("/generate-code")
    public Map<String, String> generateCode(
            @RequestParam String name,
            @RequestParam(required = false) BigDecimal discount) {

        String letters = name == null ? "" : name.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (letters.isEmpty()) letters = "NAMMA";
        if (letters.length() > 10) letters = letters.substring(0, 10);

        String suffix = discount == null ? "" : discount.stripTrailingZeros().toPlainString().replace(".", "");
        String base = letters + suffix;
        if (base.length() < 3) base = base + "10";

        String candidate = base;
        int n = 2;
        while (couponRepository.findByCodeIgnoreCase(candidate).isPresent()) {
            candidate = base + n++;
        }
        Map<String, String> out = new LinkedHashMap<>();
        out.put("code", candidate);
        return out;
    }

    /* ---------------- commission history ---------------- */

    @GetMapping("/commissions")
    public List<CommissionRowDto> commissions(
            @RequestParam(required = false) Long influencerId,
            @RequestParam(required = false) String couponCode,
            @RequestParam(required = false) Long productId,
            @RequestParam(required = false) Long orderId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String orderStatus,
            @RequestParam(required = false) String status) {

        List<CouponUsage> rows = new ArrayList<>(usageRepository.findAll());
        Map<Long, Order> orders = ordersFor(rows);
        Map<Long, Influencer> influencers = new HashMap<>();
        for (Influencer i : influencerRepository.findAll()) influencers.put(i.getId(), i);

        LocalDate fromDate = parseDate(from, "from");
        LocalDate toDate = parseDate(to, "to");
        CommissionStatus wantedStatus = parseStatus(status);
        String wantedOrderStatus = orderStatus == null || orderStatus.isBlank()
                ? null : orderStatus.trim().toUpperCase(Locale.ROOT);
        String wantedCoupon = couponCode == null || couponCode.isBlank()
                ? null : couponCode.trim().toUpperCase(Locale.ROOT);

        List<CommissionRowDto> out = new ArrayList<>();
        for (CouponUsage r : rows) {
            Order order = orders.get(r.getOrderId());
            if (influencerId != null && !influencerId.equals(r.getInfluencerId())) continue;
            if (wantedCoupon != null && (r.getCouponCode() == null
                    || !r.getCouponCode().toUpperCase(Locale.ROOT).contains(wantedCoupon))) continue;
            if (orderId != null && !orderId.equals(r.getOrderId())) continue;
            if (wantedStatus != null && r.getCommissionStatus() != wantedStatus) continue;
            if (wantedOrderStatus != null
                    && (order == null || order.getStatus() == null
                    || !wantedOrderStatus.equals(order.getStatus().toUpperCase(Locale.ROOT)))) continue;
            if (productId != null && !orderHasProduct(order, productId)) continue;
            if (r.getCreatedAt() != null) {
                LocalDate day = r.getCreatedAt().atZone(ZoneId.systemDefault()).toLocalDate();
                if (fromDate != null && day.isBefore(fromDate)) continue;
                if (toDate != null && day.isAfter(toDate)) continue;
            }
            out.add(toRow(r, influencers.get(r.getInfluencerId()), order));
        }
        out.sort(Comparator.comparing((CommissionRowDto d) -> d.createdAt,
                Comparator.nullsLast(Comparator.<Instant>reverseOrder())));
        return out;
    }

    /* ---------------- status changes ---------------- */

    @PutMapping("/commissions/{id}/status")
    @Transactional
    public CommissionRowDto updateStatus(@PathVariable Long id, @RequestBody CommissionStatusRequest req) {
        CouponUsage row = usageRepository.findById(id)
                .orElseThrow(() -> new BadRequestException("That commission no longer exists."));
        CommissionStatus target = parseStatus(req == null ? null : req.status);
        if (target == null) throw new BadRequestException("Choose a commission status.");

        Order order = orderRepository.findById(row.getOrderId()).orElse(null);
        CommissionStatus current = row.getCommissionStatus();
        if (current == target) return toRow(row, influencerRepository.findById(row.getInfluencerId()).orElse(null), order);

        switch (target) {
            case APPROVED -> {
                if (current != CommissionStatus.PENDING) {
                    throw new BadRequestException("Only a PENDING commission can be approved.");
                }
                if (order == null || !OrderStatus.DELIVERED.equals(order.getStatus())) {
                    throw new BadRequestException("A commission can only be approved once its order is DELIVERED.");
                }
                row.setApprovedAt(Instant.now());
            }
            case PAID -> {
                if (current != CommissionStatus.APPROVED) {
                    throw new BadRequestException("Only an APPROVED commission can be marked as paid.");
                }
                markPaid(row, req == null ? null : req.reference, req == null ? null : req.note);
            }
            case CANCELLED -> {
                if (current == CommissionStatus.PAID) {
                    throw new BadRequestException("This commission was already paid. Cancel the order to flag it for recovery.");
                }
                row.setApprovedAt(null);
            }
            default -> throw new BadRequestException("That status cannot be set manually.");
        }
        row.setCommissionStatus(target);
        if (req != null && req.note != null && !req.note.isBlank() && target != CommissionStatus.PAID) {
            row.setNote(req.note.trim());
        }
        usageRepository.save(row);
        return toRow(row, influencerRepository.findById(row.getInfluencerId()).orElse(null), order);
    }

    /** Pays out an influencer: every APPROVED row (or the chosen ones) becomes PAID with one reference. */
    @PostMapping("/payouts")
    @Transactional
    public Map<String, Object> payout(@RequestBody PayoutRequest req) {
        if (req == null || req.influencerId == null) {
            throw new BadRequestException("Choose an influencer to pay.");
        }
        Influencer influencer = influencerRepository.findById(req.influencerId)
                .orElseThrow(() -> new BadRequestException("That influencer no longer exists."));

        List<CouponUsage> candidates = usageRepository.findByInfluencerId(req.influencerId).stream()
                .filter(r -> r.getCommissionStatus() == CommissionStatus.APPROVED)
                .filter(r -> req.commissionIds == null || req.commissionIds.isEmpty()
                        || req.commissionIds.contains(r.getId()))
                .collect(Collectors.toList());
        if (candidates.isEmpty()) {
            throw new BadRequestException("There is no approved commission to pay for this influencer.");
        }

        BigDecimal total = BigDecimal.ZERO;
        for (CouponUsage r : candidates) {
            markPaid(r, req.reference, req.note);
            r.setCommissionStatus(CommissionStatus.PAID);
            usageRepository.save(r);
            total = total.add(nz(r.getCommissionAmount()));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("influencerId", influencer.getId());
        out.put("influencerName", influencer.getName());
        out.put("commissionsPaid", candidates.size());
        out.put("amountPaid", money(total));
        out.put("reference", req.reference);
        return out;
    }

    /* ---------------- helpers ---------------- */

    private void markPaid(CouponUsage row, String reference, String note) {
        row.setPaidAt(Instant.now());
        if (reference != null && !reference.isBlank()) row.setPayoutReference(reference.trim());
        if (note != null && !note.isBlank()) row.setNote(note.trim());
    }

    private Map<String, Object> influencerRow(Influencer inf, List<CouponUsage> allRows,
                                              List<Coupon> allCoupons, Map<Long, Order> orders) {
        long totalOrders = 0, successful = 0, cancelledOrRefunded = 0;
        BigDecimal sales = BigDecimal.ZERO, pending = BigDecimal.ZERO, approved = BigDecimal.ZERO,
                paid = BigDecimal.ZERO, total = BigDecimal.ZERO;

        for (CouponUsage r : allRows) {
            if (!inf.getId().equals(r.getInfluencerId())) continue;
            totalOrders++;
            CommissionStatus st = r.getCommissionStatus();
            BigDecimal commission = nz(r.getCommissionAmount());
            if (st == CommissionStatus.CANCELLED || st == CommissionStatus.REVERSED) {
                cancelledOrRefunded++;
                continue;
            }
            sales = sales.add(nz(r.getOrderAmount()));
            total = total.add(commission);
            Order order = orders.get(r.getOrderId());
            if (order != null && OrderStatus.DELIVERED.equals(order.getStatus())) successful++;
            if (st == CommissionStatus.PENDING) pending = pending.add(commission);
            else if (st == CommissionStatus.APPROVED) approved = approved.add(commission);
            else if (st == CommissionStatus.PAID) paid = paid.add(commission);
        }

        List<String> codes = new ArrayList<>();
        for (Coupon c : allCoupons) {
            if (inf.getId().equals(c.getInfluencerId())) codes.add(c.getCode());
        }

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", inf.getId());
        m.put("name", inf.getName());
        m.put("email", inf.getEmail());
        m.put("phone", inf.getPhone());
        m.put("socialPlatform", inf.getSocialPlatform());
        m.put("socialHandle", inf.getSocialHandle());
        m.put("active", inf.isActive());
        m.put("defaultCommissionPercent", inf.getDefaultCommissionPercent());
        m.put("createdAt", inf.getCreatedAt());
        m.put("couponCodes", codes);
        m.put("totalOrders", totalOrders);
        m.put("successfulOrders", successful);
        m.put("cancelledOrRefundedOrders", cancelledOrRefunded);
        m.put("totalSales", money(sales));
        m.put("totalCommission", money(total));
        m.put("pendingCommission", money(pending));
        m.put("approvedCommission", money(approved));
        m.put("paidCommission", money(paid));
        return m;
    }

    private CommissionRowDto toRow(CouponUsage r, Influencer inf, Order order) {
        CommissionRowDto d = new CommissionRowDto();
        d.id = r.getId();
        d.orderId = r.getOrderId();
        d.orderNumber = r.getOrderNumber();
        d.influencerId = r.getInfluencerId();
        d.influencerName = inf == null ? null : inf.getName();
        d.couponCode = r.getCouponCode();
        d.productId = r.getProductId();
        d.productSummary = r.getProductSummary();
        d.customerId = r.getCustomerId();
        d.customerName = order == null ? null : order.getCustomerName();
        d.saleAmount = r.getOrderAmount();
        d.discountAmount = r.getDiscountAmount();
        d.commissionType = r.getCommissionType();
        d.commissionRate = r.getCommissionRate();
        d.commissionAmount = r.getCommissionAmount();
        d.commissionStatus = r.getCommissionStatus() == null ? null : r.getCommissionStatus().name();
        d.orderStatus = order == null ? null : order.getStatus();
        d.paymentStatus = order == null ? null : order.getPaymentStatus();
        d.returnStatus = order == null ? null : order.getReturnStatus();
        d.createdAt = r.getCreatedAt();
        d.approvedAt = r.getApprovedAt();
        d.paidAt = r.getPaidAt();
        d.payoutReference = r.getPayoutReference();
        d.note = r.getNote();
        return d;
    }

    private Map<Long, Order> ordersFor(List<CouponUsage> rows) {
        List<Long> ids = rows.stream().map(CouponUsage::getOrderId).filter(i -> i != null)
                .distinct().collect(Collectors.toList());
        Map<Long, Order> map = new HashMap<>();
        for (Order o : orderRepository.findAllById(ids)) map.put(o.getId(), o);
        return map;
    }

    private static boolean orderHasProduct(Order order, Long productId) {
        if (order == null || order.getItems() == null) return false;
        for (OrderItem item : order.getItems()) {
            if (productId.equals(item.getProductId())) return true;
        }
        return false;
    }

    private static CommissionStatus parseStatus(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return CommissionStatus.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Unknown commission status \"" + raw + "\".");
        }
    }

    private static LocalDate parseDate(String raw, String field) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return LocalDate.parse(raw.trim());
        } catch (Exception e) {
            throw new BadRequestException("\"" + field + "\" must be a date in YYYY-MM-DD format.");
        }
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static BigDecimal money(BigDecimal v) {
        return nz(v).setScale(2, RoundingMode.HALF_UP);
    }
}


/* ===========================================================
   ADMIN: IMAGE PIPELINE DIAGNOSTICS
   -----------------------------------------------------------
   "Uploaded to Cloudinary but not on the storefront" is almost
   always a bad value in the database. This reports, for every
   stored image string, what KIND of value it is - so the cause
   is visible in one request instead of guessed at.

     GET /api/admin/diagnostics/images
   =========================================================== */

@RestController
@RequestMapping("/api/admin/diagnostics")
class ImageDiagnosticsController {

    @Autowired private ProductRepository productRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private StorageService storageService;

    @Value("${app.public.base-url:http://localhost:8080}")
    private String appPublicBaseUrl;

    @GetMapping("/images")
    public Map<String, Object> images() {
        Map<String, Integer> counts = new LinkedHashMap<>();
        List<Map<String, Object>> problems = new ArrayList<>();
        int productsWithoutImage = 0;

        for (Product p : productRepository.findAll()) {
            List<String> values = new ArrayList<>();
            values.add(p.getThumbnailUrl());
            values.addAll(p.getImages());
            boolean any = false;
            for (String v : values) {
                String kind = classify(v);
                if ("LOCAL_UPLOADS".equals(kind) && !storageService.localFileExists(v)) kind = "LOCAL_FILE_MISSING";
                counts.merge(kind, 1, Integer::sum);
                if (!"EMPTY".equals(kind)) any = true;
                if (!"CLOUDINARY".equals(kind) && !"EMPTY".equals(kind) && problems.size() < 40) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("entity", "product");
                    m.put("id", p.getId());
                    m.put("name", p.getName());
                    m.put("kind", kind);
                    m.put("storedValue", v);
                    m.put("resolvesTo", storageService.toPublicUrl(v));
                    problems.add(m);
                }
            }
            if (!any) {
                productsWithoutImage++;
                if (problems.size() < 40) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("entity", "product");
                    m.put("id", p.getId());
                    m.put("name", p.getName());
                    m.put("kind", "NO_IMAGE_IN_DATABASE");
                    problems.add(m);
                }
            }
        }
        for (Category c : categoryRepository.findAll()) {
            String kind = classify(c.getImageUrl());
            counts.merge("category:" + kind, 1, Integer::sum);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cloudinaryConfigured", storageService.isCloudinaryConfigured());
        out.put("activeStorageBackend", storageService.describeBackend());
        out.put("appPublicBaseUrl", appPublicBaseUrl);
        out.put("productImageValueCounts", counts);
        out.put("productsWithNoImageInDatabase", productsWithoutImage);
        out.put("problemSamples", problems);
        out.put("howToRead",
                "CLOUDINARY = healthy. LEGACY_PATH = old //categories/x style value (the API repairs it on the fly; run "
                        + "database/012_repair_legacy_image_paths.sql to fix the rows). LOCAL_FILE_MISSING = the row points at "
                        + "/uploads/.. but the file is not on this server: re-upload it in admin. LOCAL_UPLOADS = stored as /uploads/.. (served by THIS backend, lost if the "
                        + "disk is wiped). LOCALHOST = a localhost URL baked into the row. MALFORMED = glued or "
                        + "broken URL. NO_IMAGE_IN_DATABASE = the file is in Cloudinary but was never saved onto "
                        + "the product (upload happened, Save did not).");
        return out;
    }

    private static String classify(String value) {
        if (value == null || value.isBlank()) return "EMPTY";
        String v = value.trim();
        String lower = v.toLowerCase(Locale.ROOT);
        if (lower.equals("null") || lower.equals("undefined")) return "EMPTY";
        int first = lower.indexOf("http");
        int last = Math.max(lower.lastIndexOf("https://"), lower.lastIndexOf("http://"));
        if (v.contains("\\") || v.contains(" ") || (first >= 0 && last > first)) return "MALFORMED";
        if (lower.startsWith("//") || lower.matches("^/?(products|categories|banners|avatars|designs|influencers|companies)/.*")) return "LEGACY_PATH";
        if (lower.contains("localhost") || lower.contains("127.0.0.1")) return "LOCALHOST";
        if (lower.startsWith("https://res.cloudinary.com/")) return "CLOUDINARY";
        if (lower.startsWith("/uploads/") || lower.startsWith("uploads/")) return "LOCAL_UPLOADS";
        if (lower.startsWith("http://") || lower.startsWith("https://")) return "OTHER_ABSOLUTE";
        return "MALFORMED";
    }
}
