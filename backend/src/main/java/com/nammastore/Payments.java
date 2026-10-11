package com.nammastore;

import jakarta.persistence.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.razorpay.RazorpayClient;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * ===========================================================
 * Payments.java
 * -----------------------------------------------------------
 * Razorpay order creation, signature verification, payment
 * records, and webhook handling.
 *
 * Credentials come ONLY from the environment / backend/.env:
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET (optional)
 * Nothing is hard-coded. If the key pair is missing, create-order answers
 * with a clear 500 instead of faking a payment (a local stub exists only
 * when PAYMENTS_STUB_ENABLED=true, for offline development).
 *
 * Security rules enforced here:
 *   - every call needs a signed-in customer and the order must be THEIRS;
 *   - the amount is always read from the saved order, never from the browser;
 *   - an order is marked PAID only after the HMAC-SHA256 signature matches
 *     (or Razorpay's own signed webhook says so);
 *   - a bad signature answers 400 and never changes the order.
 *
 * Flow:
 *  1. Frontend calls POST /api/payments/create-order with the
 *     orderId (our Order.id) -> we call Razorpay Orders API and
 *     return a razorpayOrderId + amount + key to the frontend.
 *  2. Frontend opens the real Razorpay checkout modal with that
 *     razorpayOrderId (see checkout/page.tsx).
 *  3. On success, frontend calls POST /api/payments/verify with
 *     razorpay_order_id, razorpay_payment_id, razorpay_signature.
 *  4. We verify the signature with HMAC-SHA256 using the key
 *     secret. If valid, we mark the Order as PAID.
 *  5. Razorpay also calls POST /api/payments/webhook directly
 *     (configure this URL in the Razorpay dashboard) as a more
 *     reliable source of truth than step 3 alone - verified the
 *     same way, using RAZORPAY_WEBHOOK_SECRET.
 * ===========================================================
 */

@Entity
@Table(name = "payments")
class Payment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long orderId;
    private String razorpayOrderId;
    private String razorpayPaymentId;
    private String razorpaySignature;
    private BigDecimal amount;
    private String status = "CREATED"; // CREATED, VERIFIED, FAILED
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrderId() { return orderId; }
    public void setOrderId(Long orderId) { this.orderId = orderId; }
    public String getRazorpayOrderId() { return razorpayOrderId; }
    public void setRazorpayOrderId(String razorpayOrderId) { this.razorpayOrderId = razorpayOrderId; }
    public String getRazorpayPaymentId() { return razorpayPaymentId; }
    public void setRazorpayPaymentId(String razorpayPaymentId) { this.razorpayPaymentId = razorpayPaymentId; }
    public String getRazorpaySignature() { return razorpaySignature; }
    public void setRazorpaySignature(String razorpaySignature) { this.razorpaySignature = razorpaySignature; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
}

interface PaymentRepository extends JpaRepository<Payment, Long> {
    Optional<Payment> findByRazorpayOrderId(String razorpayOrderId);
}

class CreatePaymentOrderRequest {
    public Long orderId;
}

class VerifyPaymentRequest {
    public String razorpayOrderId;
    public String razorpayPaymentId;
    public String razorpaySignature;
}

@RestController
@RequestMapping("/api/payments")
class PaymentsController {

    private static final Logger log = LoggerFactory.getLogger(PaymentsController.class);
    /** Razorpay will not create an order below 1 rupee. */
    private static final long MIN_PAISE = 100;

    @Value("${razorpay.key.id:}")
    private String keyId;

    @Value("${razorpay.key.secret:}")
    private String keySecret;

    @Value("${razorpay.webhook.secret:}")
    private String webhookSecret;

    /** Offline-development fake gateway. OFF unless PAYMENTS_STUB_ENABLED=true. */
    @Value("${app.payments.stub-enabled:false}")
    private boolean stubEnabled;

    @Autowired private PaymentRepository paymentRepository;
    @Autowired private OrderRepository orderRepository;
    @Autowired private CurrentUserService currentUser;
    @Autowired private FulfillmentService fulfillmentService;

    private boolean configured() {
        return keyId != null && !keyId.isBlank() && keySecret != null && !keySecret.isBlank();
    }

    private static ResponseEntity<Map<String, Object>> error(int status, String message) {
        Map<String, Object> body = new HashMap<>();
        body.put("error", message);
        return ResponseEntity.status(status).body(body);
    }

    private static boolean owns(AppUser caller, Order order) {
        return order.getUser() != null && caller.getId().equals(order.getUser().getId());
    }

    /* ---------------- 1. create the Razorpay order ---------------- */

    @PostMapping("/create-order")
    public ResponseEntity<Map<String, Object>> createOrder(
            @RequestBody(required = false) CreatePaymentOrderRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        AppUser caller = currentUser.require(auth); // 401 when missing / invalid
        if (req == null || req.orderId == null) return error(400, "orderId is required.");

        Order order = orderRepository.findById(req.orderId).orElse(null);
        // Someone else's order looks exactly like a missing one.
        if (order == null || !owns(caller, order)) return error(404, "Order not found.");
        if (OrderStatus.CANCELLED.equals(order.getStatus())) return error(400, "This order was cancelled.");
        if ("COD".equals(order.getPaymentMethod())) return error(400, "This order is paid on delivery.");
        if ("PAID".equals(order.getPaymentStatus())) return error(400, "This order is already paid.");

        // Amount comes from the saved order, converted to paise (never from the browser).
        long paise;
        try {
            paise = order.getTotalAmount().movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
        } catch (ArithmeticException | NullPointerException e) {
            return error(400, "This order has no valid amount.");
        }
        if (paise < MIN_PAISE) return error(400, "The amount must be at least \u20b91.00.");

        String razorpayOrderId;
        boolean live = configured();
        if (live) {
            try {
                RazorpayClient client = new RazorpayClient(keyId, keySecret);
                JSONObject orderRequest = new JSONObject();
                orderRequest.put("amount", paise);
                orderRequest.put("currency", "INR");
                orderRequest.put("receipt", "order_rcpt_" + order.getId());
                com.razorpay.Order rzOrder = client.orders.create(orderRequest);
                razorpayOrderId = rzOrder.get("id");
            } catch (Exception e) {
                // Never echo gateway internals (or anything resembling a credential) to the browser.
                log.error("Razorpay order creation failed for order {}: {}", order.getId(), e.getMessage());
                String m = String.valueOf(e.getMessage()).toLowerCase();
                return error(500, m.contains("authentication")
                        ? "The payment gateway rejected the store's credentials. Please contact support."
                        : "We could not start the payment. Please try again in a moment.");
            }
        } else if (stubEnabled) {
            razorpayOrderId = "order_stub_" + order.getId() + "_" + System.currentTimeMillis();
        } else {
            log.error("Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing).");
            return error(500, "Online payments are not available right now.");
        }

        Payment payment = new Payment();
        payment.setOrderId(order.getId());
        payment.setRazorpayOrderId(razorpayOrderId);
        payment.setAmount(order.getTotalAmount());
        paymentRepository.save(payment);

        Map<String, Object> response = new HashMap<>();
        response.put("order_id", razorpayOrderId);
        response.put("razorpayOrderId", razorpayOrderId);   // same value, camelCase alias
        response.put("amount", paise);                      // paise, as Razorpay expects
        response.put("currency", "INR");
        response.put("receipt", "order_rcpt_" + order.getId());
        response.put("key_id", live ? keyId : "");          // the PUBLIC key id only
        response.put("keyId", live ? keyId : "");
        response.put("live", live);
        response.put("orderId", order.getId());
        return ResponseEntity.ok(response);
    }

    /* ---------------- 2. verify the signature ---------------- */

    @PostMapping("/verify")
    @Transactional
    public ResponseEntity<Map<String, Object>> verify(
            @RequestBody(required = false) VerifyPaymentRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        AppUser caller = currentUser.require(auth);
        if (req == null || isBlank(req.razorpayOrderId) || isBlank(req.razorpayPaymentId) || isBlank(req.razorpaySignature)) {
            return error(400, "razorpay_order_id, razorpay_payment_id and razorpay_signature are all required.");
        }

        Payment payment = paymentRepository.findByRazorpayOrderId(req.razorpayOrderId).orElse(null);
        Order order = payment == null ? null : orderRepository.findById(payment.getOrderId()).orElse(null);
        if (payment == null || order == null || !owns(caller, order)) return error(400, "Unknown payment.");

        // Already verified: answer idempotently and never downgrade it.
        if ("VERIFIED".equals(payment.getStatus())) {
            if (req.razorpayPaymentId.equals(payment.getRazorpayPaymentId())) {
                Map<String, Object> ok = new HashMap<>();
                ok.put("verified", true);
                ok.put("orderId", order.getId());
                return ResponseEntity.ok(ok);
            }
            return error(400, "This order has already been paid.");
        }

        boolean stub = stubEnabled && payment.getRazorpayOrderId().startsWith("order_stub_");
        boolean valid = stub || (configured() && verifySignature(req.razorpayOrderId, req.razorpayPaymentId, req.razorpaySignature));

        if (!valid) {
            // Do NOT mark paid. Keep the evidence, answer 400.
            payment.setRazorpayPaymentId(req.razorpayPaymentId);
            payment.setRazorpaySignature(req.razorpaySignature);
            payment.setStatus("FAILED");
            paymentRepository.save(payment);
            Map<String, Object> bad = new HashMap<>();
            bad.put("verified", false);
            bad.put("error", "Payment verification failed. If money was deducted it will be refunded automatically.");
            return ResponseEntity.status(400).body(bad);
        }

        payment.setRazorpayPaymentId(req.razorpayPaymentId);
        payment.setRazorpaySignature(req.razorpaySignature);
        markPaid(payment, order);

        Map<String, Object> ok = new HashMap<>();
        ok.put("verified", true);
        ok.put("orderId", order.getId());
        return ResponseEntity.ok(ok);
    }

    /**
     * The one place an online order becomes PAID. It deliberately does NOT touch the
     * shipment status: the seller still confirms/packs/ships step by step.
     */
    private void markPaid(Payment payment, Order order) {
        payment.setStatus("VERIFIED");
        paymentRepository.save(payment);
        if (!"PAID".equals(order.getPaymentStatus())) {
            order.setPaymentStatus("PAID");
            orderRepository.save(order);
            fulfillmentService.record(order.getId(), null, "PAYMENT_RECEIVED",
                    "Online payment received.", "SYSTEM", null);
        }
    }

    /* ---------------- 3. Razorpay's own signed webhook ---------------- */

    @PostMapping("/webhook")
    @Transactional
    public ResponseEntity<String> webhook(@RequestBody String rawBody,
                                           @RequestHeader(value = "X-Razorpay-Signature", required = false) String signature) {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            return ResponseEntity.ok("received (webhook secret not configured)");
        }
        if (!hmacMatches(webhookSecret, rawBody, signature)) {
            return ResponseEntity.status(400).body("invalid signature");
        }

        try {
            JSONObject event = new JSONObject(rawBody);
            String eventType = event.optString("event", "");
            JSONObject payload = event.optJSONObject("payload");
            JSONObject paymentWrap = payload == null ? null : payload.optJSONObject("payment");
            JSONObject entity = paymentWrap == null ? null : paymentWrap.optJSONObject("entity");
            String razorpayOrderId = entity == null ? null : entity.optString("order_id", null);
            String razorpayPaymentId = entity == null ? null : entity.optString("id", null);

            if (razorpayOrderId != null) {
                paymentRepository.findByRazorpayOrderId(razorpayOrderId).ifPresent(payment -> {
                    if ("payment.captured".equals(eventType)) {
                        if (razorpayPaymentId != null) payment.setRazorpayPaymentId(razorpayPaymentId);
                        orderRepository.findById(payment.getOrderId()).ifPresent(order -> markPaid(payment, order));
                    } else if ("payment.failed".equals(eventType) && !"VERIFIED".equals(payment.getStatus())) {
                        payment.setStatus("FAILED");
                        paymentRepository.save(payment);
                    }
                });
            }
        } catch (Exception e) {
            // Malformed payload: 200 so Razorpay does not retry forever.
            return ResponseEntity.ok("received (could not parse)");
        }
        return ResponseEntity.ok("received");
    }

    /* ---------------- helpers ---------------- */

    private static boolean isBlank(String v) {
        return v == null || v.isBlank();
    }

    /** HMAC_SHA256(order_id + "|" + payment_id, key_secret) == razorpay_signature (constant-time). */
    private boolean verifySignature(String razorpayOrderId, String razorpayPaymentId, String signature) {
        return hmacMatches(keySecret, razorpayOrderId + "|" + razorpayPaymentId, signature);
    }

    private static boolean hmacMatches(String secret, String payload, String signature) {
        if (signature == null || secret == null || secret.isBlank()) return false;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) hex.append(String.format("%02x", b));
            return MessageDigest.isEqual(hex.toString().getBytes(StandardCharsets.UTF_8),
                    signature.trim().toLowerCase().getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return false;
        }
    }
}
