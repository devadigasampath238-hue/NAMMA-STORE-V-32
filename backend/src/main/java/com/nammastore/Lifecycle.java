package com.nammastore;

import jakarta.persistence.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/* ===========================================================
   ORDER LIFECYCLE
   -----------------------------------------------------------
   1. Fulfillment   - each order LINE moves step by step:
        PLACED -> CONFIRMED -> PROCESSING (packed) -> SHIPPED
               -> OUT_FOR_DELIVERY -> DELIVERED
      Only the company that owns the line may advance it. Lines
      with no company (Super Admin's own products) are advanced by
      the Super Admin through the very same endpoint and rules.
      The Super Admin can WATCH company lines but never change them.
   2. Tracking      - every step writes an immutable event.
   3. Returns       - per item, reason + evidence, decided by the
      owning company, visible to the Super Admin. Nothing refunds
      automatically.
   4. Reviews       - verified buyers of a DELIVERED line only.
   5. Password gate - a company must replace its one-time password.
   =========================================================== */


/* ---------------------------------------------------------------
   ENTITIES
   --------------------------------------------------------------- */

@Entity
@Table(name = "order_tracking_events", indexes = @Index(name = "idx_track_order", columnList = "order_id"))
class OrderTrackingEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "order_id", nullable = false) private Long orderId;
    @Column(name = "company_id") private Long companyId;
    private String status;
    @Column(length = 500) private String note;
    private String actorRole;
    private String actorName;
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public Long getOrderId() { return orderId; }
    public void setOrderId(Long v) { this.orderId = v; }
    public Long getCompanyId() { return companyId; }
    public void setCompanyId(Long v) { this.companyId = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getNote() { return note; }
    public void setNote(String v) { this.note = v; }
    public String getActorRole() { return actorRole; }
    public void setActorRole(String v) { this.actorRole = v; }
    public String getActorName() { return actorName; }
    public void setActorName(String v) { this.actorName = v; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant v) { this.createdAt = v; }
}

@Entity
@Table(name = "item_returns", indexes = {
        @Index(name = "idx_return_item", columnList = "order_item_id"),
        @Index(name = "idx_return_company", columnList = "company_id")})
class ItemReturn {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "order_id", nullable = false) private Long orderId;
    @Column(name = "order_item_id", nullable = false) private Long orderItemId;
    @Column(name = "company_id") private Long companyId;
    @Column(name = "user_id", nullable = false) private Long userId;
    private String reasonCode;
    @Column(length = 2000) private String details;
    /** Stored image values, newline separated. */
    @Column(length = 3000) private String evidenceUrls;
    private String status;
    @Column(length = 1000) private String decisionNote;
    private BigDecimal refundAmount;
    private String decidedByRole;

    /* snapshots so the admin screens need no joins and history survives edits */
    private String orderNumber;
    private String productName;
    private String productImageUrl;
    private Integer quantity;
    private String customerName;
    private String customerPhone;

    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public Long getOrderId() { return orderId; }
    public void setOrderId(Long v) { this.orderId = v; }
    public Long getOrderItemId() { return orderItemId; }
    public void setOrderItemId(Long v) { this.orderItemId = v; }
    public Long getCompanyId() { return companyId; }
    public void setCompanyId(Long v) { this.companyId = v; }
    public Long getUserId() { return userId; }
    public void setUserId(Long v) { this.userId = v; }
    public String getReasonCode() { return reasonCode; }
    public void setReasonCode(String v) { this.reasonCode = v; }
    public String getDetails() { return details; }
    public void setDetails(String v) { this.details = v; }
    public String getEvidenceUrls() { return evidenceUrls; }
    public void setEvidenceUrls(String v) { this.evidenceUrls = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getDecisionNote() { return decisionNote; }
    public void setDecisionNote(String v) { this.decisionNote = v; }
    public BigDecimal getRefundAmount() { return refundAmount; }
    public void setRefundAmount(BigDecimal v) { this.refundAmount = v; }
    public String getDecidedByRole() { return decidedByRole; }
    public void setDecidedByRole(String v) { this.decidedByRole = v; }
    public String getOrderNumber() { return orderNumber; }
    public void setOrderNumber(String v) { this.orderNumber = v; }
    public String getProductName() { return productName; }
    public void setProductName(String v) { this.productName = v; }
    public String getProductImageUrl() { return productImageUrl; }
    public void setProductImageUrl(String v) { this.productImageUrl = v; }
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer v) { this.quantity = v; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String v) { this.customerName = v; }
    public String getCustomerPhone() { return customerPhone; }
    public void setCustomerPhone(String v) { this.customerPhone = v; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant v) { this.updatedAt = v; }
}

@Entity
@Table(name = "product_reviews", uniqueConstraints = @UniqueConstraint(name = "uk_review_item", columnNames = "order_item_id"),
        indexes = @Index(name = "idx_review_product", columnList = "product_id"))
class ProductReview {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "product_id", nullable = false) private Long productId;
    @Column(name = "user_id", nullable = false) private Long userId;
    /** The delivered order line that makes this a VERIFIED purchase. One review per line. */
    @Column(name = "order_item_id", nullable = false) private Long orderItemId;
    private Integer rating;
    @Column(length = 2000) private String text;
    private String imageUrl;
    private String reviewerName;
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public Long getProductId() { return productId; }
    public void setProductId(Long v) { this.productId = v; }
    public Long getUserId() { return userId; }
    public void setUserId(Long v) { this.userId = v; }
    public Long getOrderItemId() { return orderItemId; }
    public void setOrderItemId(Long v) { this.orderItemId = v; }
    public Integer getRating() { return rating; }
    public void setRating(Integer v) { this.rating = v; }
    public String getText() { return text; }
    public void setText(String v) { this.text = v; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String v) { this.imageUrl = v; }
    public String getReviewerName() { return reviewerName; }
    public void setReviewerName(String v) { this.reviewerName = v; }
    public Instant getCreatedAt() { return createdAt; }
}

@Entity
@Table(name = "review_reactions", uniqueConstraints = @UniqueConstraint(name = "uk_reaction", columnNames = {"review_id", "user_id", "type"}))
class ReviewReaction {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "review_id", nullable = false) private Long reviewId;
    @Column(name = "user_id", nullable = false) private Long userId;
    @Column(nullable = false) private String type;

    public Long getId() { return id; }
    public Long getReviewId() { return reviewId; }
    public void setReviewId(Long v) { this.reviewId = v; }
    public Long getUserId() { return userId; }
    public void setUserId(Long v) { this.userId = v; }
    public String getType() { return type; }
    public void setType(String v) { this.type = v; }
}

interface OrderTrackingEventRepository extends JpaRepository<OrderTrackingEvent, Long> {
    List<OrderTrackingEvent> findByOrderIdOrderByCreatedAtAsc(Long orderId);
}

interface ItemReturnRepository extends JpaRepository<ItemReturn, Long> {
    List<ItemReturn> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<ItemReturn> findByCompanyIdOrderByCreatedAtDesc(Long companyId);
    List<ItemReturn> findAllByOrderByCreatedAtDesc();
    List<ItemReturn> findByOrderItemIdIn(Collection<Long> ids);
    List<ItemReturn> findByOrderId(Long orderId);
    boolean existsByOrderItemId(Long orderItemId);
}

interface ProductReviewRepository extends JpaRepository<ProductReview, Long> {
    List<ProductReview> findByProductIdOrderByCreatedAtDesc(Long productId);
    List<ProductReview> findByOrderItemIdIn(Collection<Long> ids);
    boolean existsByOrderItemId(Long orderItemId);
}

interface ReviewReactionRepository extends JpaRepository<ReviewReaction, Long> {
    List<ReviewReaction> findByReviewIdIn(Collection<Long> ids);
    Optional<ReviewReaction> findByReviewIdAndUserIdAndType(Long reviewId, Long userId, String type);
}


/* ---------------------------------------------------------------
   DTOs
   --------------------------------------------------------------- */

class TrackingEventDto {
    public Long id;
    public String status;
    public String label;
    public String note;
    public String actorRole;
    public String actorName;
    public Long companyId;
    public String companyName;
    public Instant createdAt;
}

class FulfillmentRequest {
    /** Optional. If given it must be exactly the next step - steps can never be skipped. */
    public String status;
    public String note;
}

class ReturnReasonDto {
    public String code;
    public String label;
    public boolean requiresImage;
    public boolean requiresDetails;
    ReturnReasonDto(String c, String l, boolean img, boolean det) { code = c; label = l; requiresImage = img; requiresDetails = det; }
}

class ReturnCreateRequest {
    public Long orderItemId;
    public String reasonCode;
    public String details;
    public List<String> evidenceUrls;
}

class ReturnDecisionRequest {
    public String status;
    public String note;
    public BigDecimal refundAmount;
}

class ReturnDto {
    public Long id;
    public Long orderId;
    public String orderNumber;
    public Long orderItemId;
    public String productName;
    public String productImageUrl;
    public Integer quantity;
    public Long companyId;
    public String companyName;
    public String reasonCode;
    public String reasonLabel;
    public String details;
    public List<String> evidenceUrls = new ArrayList<>();
    public String status;
    public String statusLabel;
    public String decisionNote;
    public BigDecimal refundAmount;
    public String customerName;
    public String customerPhone;
    /** Who may act on it right now: the owning company, or the super admin for house products. */
    public String decidedBy;
    public Instant createdAt;
    public Instant updatedAt;
}

class ReviewCreateRequest {
    public Long orderItemId;
    public Integer rating;
    public String text;
    public String imageUrl;
}

class ReactRequest {
    public String type;
}

class ReviewDto {
    public Long id;
    public Integer rating;
    public String text;
    public String imageUrl;
    public String reviewerName;
    public boolean verifiedPurchase = true;
    public int helpfulCount;
    public int loveCount;
    public boolean iFoundHelpful;
    public boolean iLoved;
    public boolean mine;
    public Instant createdAt;
}

class ReviewSummaryDto {
    public double average;
    public int count;
    /** index 0 = 1 star ... index 4 = 5 stars */
    public int[] distribution = new int[5];
    public List<ReviewDto> reviews = new ArrayList<>();
}


/* ---------------------------------------------------------------
   FULFILLMENT SERVICE
   --------------------------------------------------------------- */

@Service
class FulfillmentService {

    static final List<String> FLOW = List.of(
            OrderStatus.PLACED, OrderStatus.CONFIRMED, OrderStatus.PROCESSING,
            OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED);

    @Autowired private OrderRepository orderRepository;
    @Autowired private OrderTrackingEventRepository trackingRepository;
    @Autowired private CommissionService commissionService;
    @Autowired private CompanyRepository companyRepository;

    static String label(String status) {
        if (status == null) return "";
        return switch (status) {
            case OrderStatus.PLACED -> "Order placed";
            case OrderStatus.CONFIRMED -> "Confirmed";
            case OrderStatus.PROCESSING -> "Packed";
            case OrderStatus.SHIPPED -> "Shipped";
            case OrderStatus.OUT_FOR_DELIVERY -> "Out for delivery";
            case OrderStatus.DELIVERED -> "Delivered";
            case OrderStatus.CANCELLED -> "Cancelled";
            case "PAYMENT_RECEIVED" -> "Payment received";
            default -> status;
        };
    }

    /** A line's effective status. Legacy rows (no itemStatus) fall back to the order's. */
    static String statusOf(OrderItem item, Order order) {
        if (item.getItemStatus() != null) return item.getItemStatus();
        return order.getStatus() != null ? order.getStatus() : OrderStatus.PLACED;
    }

    private static int idx(String status) {
        int i = FLOW.indexOf(status);
        return i < 0 ? 0 : i;
    }

    void record(Long orderId, Long companyId, String status, String note, String actorRole, String actorName) {
        OrderTrackingEvent e = new OrderTrackingEvent();
        e.setOrderId(orderId);
        e.setCompanyId(companyId);
        e.setStatus(status);
        e.setNote(note == null || note.isBlank() ? null : note.trim());
        e.setActorRole(actorRole);
        e.setActorName(actorName);
        trackingRepository.save(e);
    }

    /** One "Order placed" event per company represented in the order. */
    void recordPlaced(Order order) {
        Set<Long> seen = new LinkedHashSet<>();
        boolean any = false;
        for (OrderItem i : order.getItems()) {
            if (seen.add(i.getCompanyId() == null ? -1L : i.getCompanyId())) {
                record(order.getId(), i.getCompanyId(), OrderStatus.PLACED, "Your order was placed.", "CUSTOMER", null);
                any = true;
            }
        }
        if (!any) record(order.getId(), null, OrderStatus.PLACED, "Your order was placed.", "CUSTOMER", null);
    }

    /**
     * Moves the caller's own lines exactly one step forward.
     *   scope != null : the company's lines
     *   scope == null : the super admin's own (company-less) lines
     */
    @Transactional
    void advance(Order order, Long scope, String requested, String note, AppUser actor) {
        if (OrderStatus.CANCELLED.equals(order.getStatus())) {
            throw new BadRequestException("This order was cancelled.");
        }
        // An online order is not fulfilled until its payment is confirmed.
        if (!"COD".equals(order.getPaymentMethod()) && !"PAID".equals(order.getPaymentStatus())) {
            throw new BadRequestException(
                    "This order is waiting for the customer's online payment. Shipment steps start once it is paid.");
        }
        List<OrderItem> mine = new ArrayList<>();
        for (OrderItem i : order.getItems()) {
            boolean owned = scope != null ? scope.equals(i.getCompanyId()) : i.getCompanyId() == null;
            if (owned && !OrderStatus.CANCELLED.equals(i.getItemStatus())) mine.add(i);
        }
        if (mine.isEmpty()) {
            throw new ForbiddenException(scope == null
                    ? "These items are fulfilled by their partner company. You can monitor their progress here, but only the company can update it."
                    : "This order has no items of yours to update.");
        }

        String current = mine.stream().map(i -> statusOf(i, order))
                .min(Comparator.comparingInt(FulfillmentService::idx)).orElse(OrderStatus.PLACED);
        if (OrderStatus.DELIVERED.equals(current)) {
            throw new BadRequestException("These items are already delivered.");
        }
        String next = FLOW.get(idx(current) + 1);
        if (requested != null && !requested.isBlank() && !next.equalsIgnoreCase(requested.trim())) {
            throw new BadRequestException("The next step is \"" + label(next)
                    + "\". Shipment steps must be completed in order and cannot be skipped.");
        }

        Instant now = Instant.now();
        for (OrderItem i : mine) {
            if (idx(statusOf(i, order)) == idx(current)) {
                i.setItemStatus(next);
                i.setItemStatusUpdatedAt(now);
            }
        }
        record(order.getId(), scope, next, note,
                scope == null ? "SUPER_ADMIN" : "COMPANY_ADMIN",
                actor == null ? null : actor.getDisplayName());
        recompute(order);
    }

    /** The order-level status the customer sees = the slowest active line. */
    void recompute(Order order) {
        List<OrderItem> active = order.getItems().stream()
                .filter(i -> !OrderStatus.CANCELLED.equals(i.getItemStatus())).collect(Collectors.toList());
        if (active.isEmpty()) return;

        int lowest = active.stream().mapToInt(i -> idx(statusOf(i, order))).min().orElse(0);
        order.setStatus(FLOW.get(lowest));

        if (OrderStatus.DELIVERED.equals(order.getStatus())) {
            if (order.getDeliveredAt() == null) order.setDeliveredAt(Instant.now());
            if ("COD".equals(order.getPaymentMethod())) order.setPaymentStatus("PAID");
        }
        Order saved = orderRepository.save(order);
        commissionService.syncWithOrder(saved);
    }

    List<TrackingEventDto> events(Long orderId, Long onlyCompanyId) {
        Map<Long, String> names = new HashMap<>();
        for (Company c : companyRepository.findAll()) names.put(c.getId(), c.getName());

        List<TrackingEventDto> out = new ArrayList<>();
        for (OrderTrackingEvent e : trackingRepository.findByOrderIdOrderByCreatedAtAsc(orderId)) {
            if (onlyCompanyId != null && !onlyCompanyId.equals(e.getCompanyId())) continue;
            TrackingEventDto d = new TrackingEventDto();
            d.id = e.getId();
            d.status = e.getStatus();
            d.label = label(e.getStatus());
            d.note = e.getNote();
            d.actorRole = e.getActorRole();
            d.actorName = e.getActorName();
            d.companyId = e.getCompanyId();
            d.companyName = e.getCompanyId() == null ? "Namma Store" : names.get(e.getCompanyId());
            d.createdAt = e.getCreatedAt();
            out.add(d);
        }
        return out;
    }
}


/* ---------------------------------------------------------------
   FULFILLMENT + TRACKING ENDPOINTS
   --------------------------------------------------------------- */

@RestController
@RequestMapping("/api")
class FulfillmentController {

    @Autowired private OrderRepository orderRepository;
    @Autowired private FulfillmentService fulfillment;
    @Autowired private AdminScope adminScope;
    @Autowired private CurrentUserService currentUser;
    @Autowired private DtoMapper mapper;

    /** Company (own lines) or super admin (company-less lines) moves ONE step forward. */
    @PutMapping("/admin/orders/{id}/fulfillment")
    @Transactional
    public OrderDto advance(
            @PathVariable Long id,
            @RequestBody(required = false) FulfillmentRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        Long scope = adminScope.companyScope();
        AppUser actor = currentUser.require(auth);
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Order not found"));
        // Another company's order looks exactly like a missing one.
        if (scope != null && !AdminScope.touches(order, scope)) {
            throw new NoSuchElementException("Order not found");
        }
        fulfillment.advance(order, scope, req == null ? null : req.status, req == null ? null : req.note, actor);
        return adminScope.forCompany(mapper.toDto(order), scope);
    }

    /** Company sees only its own events; the super admin sees everything. */
    @GetMapping("/admin/orders/{id}/tracking")
    @Transactional(readOnly = true)
    public List<TrackingEventDto> adminTracking(@PathVariable Long id) {
        Long scope = adminScope.companyScope();
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Order not found"));
        if (scope != null && !AdminScope.touches(order, scope)) {
            throw new NoSuchElementException("Order not found");
        }
        return fulfillment.events(id, scope);
    }

    /** The customer's own timeline (all sellers in their order). */
    @GetMapping("/orders/{orderId}/tracking")
    @Transactional(readOnly = true)
    public List<TrackingEventDto> customerTracking(
            @PathVariable Long orderId,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        AppUser caller = currentUser.require(auth);
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new NoSuchElementException("Order not found"));
        currentUser.requireOwns(caller, order.getUser());
        return fulfillment.events(orderId, null);
    }
}


/* ---------------------------------------------------------------
   RETURNS
   --------------------------------------------------------------- */

final class ReturnFlow {
    static final String REQUESTED = "REQUESTED";
    static final String UNDER_REVIEW = "UNDER_REVIEW";
    static final String APPROVED = "APPROVED";
    static final String REJECTED = "REJECTED";
    static final String REFUND_PROCESSING = "REFUND_PROCESSING";
    static final String REFUNDED = "REFUNDED";

    static String label(String s) {
        if (s == null) return "";
        return switch (s) {
            case REQUESTED -> "Return requested";
            case UNDER_REVIEW -> "Under review";
            case APPROVED -> "Approved";
            case REJECTED -> "Rejected";
            case REFUND_PROCESSING -> "Refund processing";
            case REFUNDED -> "Refunded";
            default -> s;
        };
    }

    /** Allowed next states. Nothing skips the review, and nothing refunds without approval. */
    static List<String> next(String s) {
        return switch (s) {
            case REQUESTED -> List.of(UNDER_REVIEW);
            case UNDER_REVIEW -> List.of(APPROVED, REJECTED);
            case APPROVED -> List.of(REFUND_PROCESSING);
            case REFUND_PROCESSING -> List.of(REFUNDED);
            default -> List.of();
        };
    }

    static final List<ReturnReasonDto> REASONS = List.of(
            new ReturnReasonDto("DAMAGED", "Item arrived damaged", true, true),
            new ReturnReasonDto("WRONG_PRODUCT", "I received a different product", true, true),
            new ReturnReasonDto("DEFECTIVE", "Item is defective / not working", true, true),
            new ReturnReasonDto("MISSING_ITEM", "Item or part missing from the package", false, true),
            new ReturnReasonDto("QUALITY_ISSUE", "Quality is not as expected", false, true),
            new ReturnReasonDto("NOT_AS_DESCRIBED", "Not as shown / described", false, true),
            new ReturnReasonDto("SIZE_FIT", "Size or fit problem", false, false),
            new ReturnReasonDto("OTHER", "Something else", false, true));

    static ReturnReasonDto reason(String code) {
        for (ReturnReasonDto r : REASONS) if (r.code.equalsIgnoreCase(code == null ? "" : code.trim())) return r;
        return null;
    }
}

@RestController
@RequestMapping("/api")
class ReturnController {

    @Autowired private ItemReturnRepository returnRepository;
    @Autowired private OrderItemRepository orderItemRepository;
    @Autowired private OrderRepository orderRepository;
    @Autowired private CompanyRepository companyRepository;
    @Autowired private CurrentUserService currentUser;
    @Autowired private AdminScope adminScope;
    @Autowired private StorageService storage;
    @Autowired private CommissionService commissionService;

    @GetMapping("/returns/reasons")
    public List<ReturnReasonDto> reasons() {
        return ReturnFlow.REASONS;
    }

    @PostMapping("/returns")
    @Transactional
    public ReturnDto create(
            @RequestBody ReturnCreateRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        AppUser caller = currentUser.require(auth);
        if (req == null || req.orderItemId == null) throw new BadRequestException("Choose the item you want to return.");

        OrderItem item = orderItemRepository.findById(req.orderItemId)
                .orElseThrow(() -> new BadRequestException("That item was not found."));
        Order order = item.getOrder();
        currentUser.requireOwns(caller, order.getUser());

        if (!OrderStatus.DELIVERED.equals(FulfillmentService.statusOf(item, order))) {
            throw new BadRequestException("You can request a return only after the item has been delivered.");
        }
        Instant deliveredAt = item.getItemStatusUpdatedAt() != null ? item.getItemStatusUpdatedAt() : order.getDeliveredAt();
        if (deliveredAt == null || Instant.now().isAfter(deliveredAt.plus(ReturnStatus.WINDOW_DAYS, ChronoUnit.DAYS))) {
            throw new BadRequestException("The " + ReturnStatus.WINDOW_DAYS + "-day return window for this item has closed.");
        }
        if (returnRepository.existsByOrderItemId(item.getId())) {
            throw new BadRequestException("A return has already been requested for this item.");
        }

        ReturnReasonDto reason = ReturnFlow.reason(req.reasonCode);
        if (reason == null) throw new BadRequestException("Please choose a reason for the return.");

        String details = req.details == null ? "" : req.details.trim();
        if (details.length() > 2000) throw new BadRequestException("Please keep the description under 2000 characters.");
        if (reason.requiresDetails && details.length() < 10) {
            throw new BadRequestException("Please describe the problem in a few words (at least 10 characters).");
        }
        List<String> evidence = new ArrayList<>();
        if (req.evidenceUrls != null) {
            for (String u : req.evidenceUrls) {
                if (u == null || u.isBlank()) continue;
                String stored = storage.normalizeStoredPath(u);
                if (stored != null) evidence.add(stored);
            }
        }
        if (evidence.size() > 4) throw new BadRequestException("You can attach up to 4 photos.");
        if (reason.requiresImage && evidence.isEmpty()) {
            throw new BadRequestException("Please attach a clear photo of the problem - it helps the seller decide faster.");
        }

        ItemReturn r = new ItemReturn();
        r.setOrderId(order.getId());
        r.setOrderItemId(item.getId());
        r.setCompanyId(item.getCompanyId());
        r.setUserId(caller.getId());
        r.setReasonCode(reason.code);
        r.setDetails(details.isEmpty() ? null : details);
        r.setEvidenceUrls(evidence.isEmpty() ? null : String.join("\n", evidence));
        r.setStatus(ReturnFlow.REQUESTED);
        r.setRefundAmount(item.getFinalPrice());
        r.setOrderNumber(order.getOrderNumber());
        r.setProductName(item.getProductName());
        r.setProductImageUrl(item.getProductImageUrl());
        r.setQuantity(item.getQuantity());
        r.setCustomerName(order.getCustomerName());
        r.setCustomerPhone(order.getCustomerPhone());
        return toDto(returnRepository.save(r), false);
    }

    @GetMapping("/returns/mine")
    public List<ReturnDto> mine(@RequestHeader(value = "Authorization", required = false) String auth) {
        AppUser caller = currentUser.require(auth);
        List<ReturnDto> out = new ArrayList<>();
        for (ItemReturn r : returnRepository.findByUserIdOrderByCreatedAtDesc(caller.getId())) out.add(toDto(r, false));
        return out;
    }

    /** Company: its own returns. Super admin: every return (read-only for company items). */
    @GetMapping("/admin/returns")
    public List<ReturnDto> adminList() {
        Long scope = adminScope.companyScope();
        List<ItemReturn> rows = scope == null
                ? returnRepository.findAllByOrderByCreatedAtDesc()
                : returnRepository.findByCompanyIdOrderByCreatedAtDesc(scope);
        List<ReturnDto> out = new ArrayList<>();
        for (ItemReturn r : rows) out.add(toDto(r, true));
        return out;
    }

    @PutMapping("/admin/returns/{id}/status")
    @Transactional
    public ReturnDto decide(@PathVariable Long id, @RequestBody ReturnDecisionRequest req) {
        Long scope = adminScope.companyScope();
        ItemReturn r = returnRepository.findById(id).orElseThrow(() -> new NoSuchElementException("Return not found"));

        if (r.getCompanyId() == null) {
            if (scope != null) throw new NoSuchElementException("Return not found");
        } else if (scope == null) {
            throw new ForbiddenException("This return belongs to a partner company. You can follow its status here, but the decision is the company's.");
        } else if (!scope.equals(r.getCompanyId())) {
            throw new NoSuchElementException("Return not found");
        }

        String target = req == null || req.status == null ? "" : req.status.trim().toUpperCase(Locale.ROOT);
        if (!ReturnFlow.next(r.getStatus()).contains(target)) {
            throw new BadRequestException("A return that is \"" + ReturnFlow.label(r.getStatus())
                    + "\" cannot move to \"" + ReturnFlow.label(target) + "\".");
        }
        String note = req.note == null ? null : req.note.trim();
        if (ReturnFlow.REJECTED.equals(target) && (note == null || note.length() < 5)) {
            throw new BadRequestException("Please give the customer a reason for rejecting the return.");
        }
        if (req.refundAmount != null) {
            BigDecimal max = r.getRefundAmount() == null ? BigDecimal.ZERO : r.getRefundAmount();
            if (req.refundAmount.compareTo(BigDecimal.ZERO) < 0 || req.refundAmount.compareTo(max) > 0) {
                throw new BadRequestException("The refund cannot be more than the item's price (" + max + ").");
            }
            if (ReturnFlow.APPROVED.equals(target)) r.setRefundAmount(req.refundAmount);
        }

        r.setStatus(target);
        if (note != null && !note.isEmpty()) r.setDecisionNote(note);
        r.setDecidedByRole(scope == null ? "SUPER_ADMIN" : "COMPANY_ADMIN");
        r.setUpdatedAt(Instant.now());
        returnRepository.save(r);

        // Once EVERY active line of the order has been refunded, the sale is gone:
        // mark the order returned so any influencer commission stops being payable.
        if (ReturnFlow.REFUNDED.equals(target)) {
            Order order = orderRepository.findById(r.getOrderId()).orElse(null);
            if (order != null) {
                Set<Long> refunded = returnRepository.findByOrderId(order.getId()).stream()
                        .filter(x -> ReturnFlow.REFUNDED.equals(x.getStatus()))
                        .map(ItemReturn::getOrderItemId).collect(Collectors.toSet());
                boolean all = order.getItems().stream()
                        .filter(i -> !OrderStatus.CANCELLED.equals(i.getItemStatus()))
                        .allMatch(i -> refunded.contains(i.getId()));
                if (all) {
                    order.setReturnStatus(ReturnStatus.COMPLETED);
                    commissionService.syncWithOrder(orderRepository.save(order));
                }
            }
        }
        return toDto(r, true);
    }

    private ReturnDto toDto(ItemReturn r, boolean forAdmin) {
        ReturnDto d = new ReturnDto();
        d.id = r.getId();
        d.orderId = r.getOrderId();
        d.orderNumber = r.getOrderNumber();
        d.orderItemId = r.getOrderItemId();
        d.productName = r.getProductName();
        d.productImageUrl = storage.toPublicUrl(r.getProductImageUrl());
        d.quantity = r.getQuantity();
        d.companyId = r.getCompanyId();
        d.companyName = r.getCompanyId() == null ? "Namma Store"
                : companyRepository.findById(r.getCompanyId()).map(Company::getName).orElse(null);
        ReturnReasonDto reason = ReturnFlow.reason(r.getReasonCode());
        d.reasonCode = r.getReasonCode();
        d.reasonLabel = reason == null ? r.getReasonCode() : reason.label;
        d.details = r.getDetails();
        if (r.getEvidenceUrls() != null) {
            for (String u : r.getEvidenceUrls().split("\n")) {
                String pub = storage.toPublicUrl(u);
                if (pub != null) d.evidenceUrls.add(pub);
            }
        }
        d.status = r.getStatus();
        d.statusLabel = ReturnFlow.label(r.getStatus());
        d.decisionNote = r.getDecisionNote();
        d.refundAmount = r.getRefundAmount();
        d.decidedBy = r.getCompanyId() == null ? "Namma Store" : d.companyName;
        if (forAdmin) {
            d.customerName = r.getCustomerName();
            d.customerPhone = r.getCustomerPhone();
        }
        d.createdAt = r.getCreatedAt();
        d.updatedAt = r.getUpdatedAt();
        return d;
    }
}


/* ---------------------------------------------------------------
   CUSTOMER ORDER ENRICHMENT (can return? can review?)
   --------------------------------------------------------------- */

@Service
class OrderEnricher {
    @Autowired private OrderItemRepository orderItemRepository;
    @Autowired private ItemReturnRepository returnRepository;
    @Autowired private ProductReviewRepository reviewRepository;

    @Transactional(readOnly = true)
    public List<OrderDto> enrich(List<OrderDto> dtos) {
        List<Long> ids = new ArrayList<>();
        for (OrderDto o : dtos) for (OrderItemDto i : o.items) ids.add(i.id);
        if (ids.isEmpty()) return dtos;

        Map<Long, ItemReturn> returns = new HashMap<>();
        for (ItemReturn r : returnRepository.findByOrderItemIdIn(ids)) returns.put(r.getOrderItemId(), r);
        Set<Long> reviewed = reviewRepository.findByOrderItemIdIn(ids).stream()
                .map(ProductReview::getOrderItemId).collect(Collectors.toSet());
        Map<Long, OrderItem> entities = new HashMap<>();
        for (OrderItem i : orderItemRepository.findAllById(ids)) entities.put(i.getId(), i);

        for (OrderDto o : dtos) {
            for (OrderItemDto i : o.items) {
                OrderItem e = entities.get(i.id);
                if (e == null) continue;
                Order order = e.getOrder();
                boolean delivered = OrderStatus.DELIVERED.equals(FulfillmentService.statusOf(e, order));
                ItemReturn ret = returns.get(i.id);
                if (ret != null) {
                    i.returnId = ret.getId();
                    i.returnStatus = ret.getStatus();
                }
                i.reviewed = reviewed.contains(i.id);
                Instant at = e.getItemStatusUpdatedAt() != null ? e.getItemStatusUpdatedAt() : order.getDeliveredAt();
                boolean inWindow = at != null && Instant.now().isBefore(at.plus(ReturnStatus.WINDOW_DAYS, ChronoUnit.DAYS));
                i.canReturn = delivered && inWindow && ret == null && !OrderStatus.CANCELLED.equals(order.getStatus());
                i.canReview = delivered && !i.reviewed && e.getProductId() != null;
            }
        }
        return dtos;
    }
}


/* ---------------------------------------------------------------
   REVIEWS (verified purchasers only)
   --------------------------------------------------------------- */

@RestController
@RequestMapping("/api")
class ReviewController {

    @Autowired private ProductReviewRepository reviewRepository;
    @Autowired private ReviewReactionRepository reactionRepository;
    @Autowired private OrderItemRepository orderItemRepository;
    @Autowired private OrderRepository orderRepository;
    @Autowired private CurrentUserService currentUser;
    @Autowired private StorageService storage;

    private AppUser optionalUser(String auth) {
        if (auth == null || auth.isBlank()) return null;
        try { return currentUser.require(auth); } catch (RuntimeException e) { return null; }
    }

    @GetMapping("/products/{productId}/reviews")
    @Transactional(readOnly = true)
    public ReviewSummaryDto list(
            @PathVariable Long productId,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        AppUser viewer = optionalUser(auth);
        List<ProductReview> rows = reviewRepository.findByProductIdOrderByCreatedAtDesc(productId);

        ReviewSummaryDto out = new ReviewSummaryDto();
        out.count = rows.size();
        int sum = 0;
        for (ProductReview r : rows) {
            int star = Math.max(1, Math.min(5, r.getRating() == null ? 1 : r.getRating()));
            out.distribution[star - 1]++;
            sum += star;
        }
        out.average = rows.isEmpty() ? 0 : Math.round(sum * 10.0 / rows.size()) / 10.0;

        List<Long> ids = rows.stream().map(ProductReview::getId).collect(Collectors.toList());
        List<ReviewReaction> reactions = ids.isEmpty() ? List.of() : reactionRepository.findByReviewIdIn(ids);

        for (ProductReview r : rows.stream().limit(40).collect(Collectors.toList())) {
            ReviewDto d = new ReviewDto();
            d.id = r.getId();
            d.rating = r.getRating();
            d.text = r.getText();
            d.imageUrl = storage.toPublicUrl(r.getImageUrl());
            d.reviewerName = r.getReviewerName();
            d.createdAt = r.getCreatedAt();
            d.mine = viewer != null && viewer.getId().equals(r.getUserId());
            for (ReviewReaction x : reactions) {
                if (!x.getReviewId().equals(r.getId())) continue;
                boolean mineReaction = viewer != null && viewer.getId().equals(x.getUserId());
                if ("HELPFUL".equals(x.getType())) { d.helpfulCount++; if (mineReaction) d.iFoundHelpful = true; }
                if ("LOVE".equals(x.getType())) { d.loveCount++; if (mineReaction) d.iLoved = true; }
            }
            out.reviews.add(d);
        }
        return out;
    }

    /** Which delivered, not-yet-reviewed line (if any) lets this customer review the product. */
    @GetMapping("/products/{productId}/review-eligibility")
    @Transactional(readOnly = true)
    public Map<String, Object> eligibility(
            @PathVariable Long productId,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("eligible", false);
        out.put("orderItemId", null);
        out.put("alreadyReviewed", false);

        AppUser viewer = optionalUser(auth);
        if (viewer == null) return out;

        for (Order o : orderRepository.findByUserIdOrderByCreatedAtDesc(viewer.getId())) {
            for (OrderItem i : o.getItems()) {
                if (!productId.equals(i.getProductId())) continue;
                if (!OrderStatus.DELIVERED.equals(FulfillmentService.statusOf(i, o))) continue;
                if (reviewRepository.existsByOrderItemId(i.getId())) {
                    out.put("alreadyReviewed", true);
                    continue;
                }
                out.put("eligible", true);
                out.put("orderItemId", i.getId());
                return out;
            }
        }
        return out;
    }

    @PostMapping("/reviews")
    @Transactional
    public ReviewDto create(
            @RequestBody ReviewCreateRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        AppUser caller = currentUser.require(auth);
        if (req == null || req.orderItemId == null) throw new BadRequestException("Choose the purchased item to review.");

        OrderItem item = orderItemRepository.findById(req.orderItemId)
                .orElseThrow(() -> new BadRequestException("That purchase was not found."));
        Order order = item.getOrder();
        currentUser.requireOwns(caller, order.getUser());

        if (item.getProductId() == null) throw new BadRequestException("This item cannot be reviewed.");
        if (!OrderStatus.DELIVERED.equals(FulfillmentService.statusOf(item, order))) {
            throw new BadRequestException("You can review a product only after it has been delivered to you.");
        }
        if (reviewRepository.existsByOrderItemId(item.getId())) {
            throw new BadRequestException("You have already reviewed this purchase.");
        }
        int rating = req.rating == null ? 0 : req.rating;
        if (rating < 1 || rating > 5) throw new BadRequestException("Please choose a rating from 1 to 5 stars.");
        String text = req.text == null ? "" : req.text.trim();
        if (text.length() < 5) throw new BadRequestException("Please write a few words about the product.");
        if (text.length() > 2000) throw new BadRequestException("Please keep the review under 2000 characters.");

        String name = caller.getDisplayName() == null || caller.getDisplayName().isBlank() ? "Customer" : caller.getDisplayName().trim();
        String[] parts = name.split("\\s+");
        String shown = parts.length > 1 ? parts[0] + " " + parts[parts.length - 1].charAt(0) + "." : parts[0];

        ProductReview r = new ProductReview();
        r.setProductId(item.getProductId());
        r.setUserId(caller.getId());
        r.setOrderItemId(item.getId());
        r.setRating(rating);
        r.setText(text);
        r.setImageUrl(storage.normalizeStoredPath(req.imageUrl));
        r.setReviewerName(shown);
        ProductReview saved = reviewRepository.save(r);

        ReviewDto d = new ReviewDto();
        d.id = saved.getId();
        d.rating = saved.getRating();
        d.text = saved.getText();
        d.imageUrl = storage.toPublicUrl(saved.getImageUrl());
        d.reviewerName = saved.getReviewerName();
        d.createdAt = saved.getCreatedAt();
        d.mine = true;
        return d;
    }

    /** Toggle HELPFUL / LOVE. A shopper cannot react to their own review. */
    @PostMapping("/reviews/{id}/react")
    @Transactional
    public Map<String, Object> react(
            @PathVariable Long id,
            @RequestBody ReactRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        AppUser caller = currentUser.require(auth);
        String type = req == null || req.type == null ? "" : req.type.trim().toUpperCase(Locale.ROOT);
        if (!type.equals("HELPFUL") && !type.equals("LOVE")) throw new BadRequestException("Unknown reaction.");
        ProductReview review = reviewRepository.findById(id).orElseThrow(() -> new NoSuchElementException("Review not found"));
        if (caller.getId().equals(review.getUserId())) throw new BadRequestException("You can't react to your own review.");

        Optional<ReviewReaction> existing = reactionRepository.findByReviewIdAndUserIdAndType(id, caller.getId(), type);
        boolean active;
        if (existing.isPresent()) {
            reactionRepository.delete(existing.get());
            active = false;
        } else {
            ReviewReaction x = new ReviewReaction();
            x.setReviewId(id);
            x.setUserId(caller.getId());
            x.setType(type);
            reactionRepository.save(x);
            active = true;
        }
        long count = reactionRepository.findByReviewIdIn(List.of(id)).stream().filter(x -> type.equals(x.getType())).count();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("type", type);
        out.put("active", active);
        out.put("count", count);
        return out;
    }
}


/* ---------------------------------------------------------------
   ACCOUNT SECURITY + EVIDENCE UPLOAD
   --------------------------------------------------------------- */

class ChangePasswordRequest {
    public String currentPassword;
    public String newPassword;
}

@RestController
@RequestMapping("/api")
class AccountSecurityController {

    @Autowired private CurrentUserService currentUser;
    @Autowired private AppUserRepository appUserRepository;
    @Autowired private PasswordService passwordService;
    @Autowired private StorageService storage;

    /** A company's first sign-in: replace the one-time password before anything else. */
    @PostMapping("/auth/change-password")
    @Transactional
    public Map<String, Object> changePassword(
            @RequestBody ChangePasswordRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        AppUser user = currentUser.require(auth);
        if (req == null || req.currentPassword == null || req.newPassword == null) {
            throw new BadRequestException("Enter your current and new password.");
        }
        if (user.getPasswordHash() == null || !passwordService.matches(req.currentPassword, user.getPasswordHash())) {
            throw new BadRequestException("Your current password is incorrect.");
        }
        String pw = req.newPassword;
        if (pw.length() < 8 || !pw.matches(".*[A-Za-z].*") || !pw.matches(".*\\d.*")) {
            throw new BadRequestException("Choose a password of at least 8 characters with a letter and a number.");
        }
        if (pw.equals(req.currentPassword)) {
            throw new BadRequestException("The new password must be different from the temporary one.");
        }
        user.setPasswordHash(passwordService.hash(pw));
        user.setMustChangePassword(false);
        appUserRepository.save(user);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("changed", true);
        return out;
    }

    /**
     * Customer photo upload for return evidence and review pictures.
     * Signed-in users only; image type/size checks are StorageService's own.
     */
    @PostMapping("/uploads/evidence")
    public Map<String, Object> uploadEvidence(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "purpose", defaultValue = "review") String purpose,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        currentUser.require(auth);
        String folder = "return".equalsIgnoreCase(purpose) ? "returns" : "reviews";
        String stored = storage.storeImage(file, folder);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("url", storage.toPublicUrl(stored));
        out.put("stored", stored);
        return out;
    }
}
