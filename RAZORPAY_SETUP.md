# Razorpay Standard Checkout - setup & test

Already in the project and kept: razorpay-java SDK, Payment table, /api/payments/create-order, /verify, /webhook.
Fixed/completed in this version: see "What changed" below.

## Setup
1. backend/.env  -> RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET   (git-ignored; Spring loads it automatically)
2. frontend/.env -> NEXT_PUBLIC_RAZORPAY_KEY_ID             (public key id only)
3. cd backend && mvn clean package -DskipTests && mvn spring-boot:run
   cd frontend && npm install && npm run dev
The key SECRET exists only in backend/.env (or real env vars). It is never sent to the browser.

## Flow
Checkout -> choose "Pay online" -> Place order
 1. order is saved (payment PENDING)           POST /api/checkout
 2. POST /api/payments/create-order {orderId}  (login required; amount read from the saved order, in paise, min 100)
 3. Razorpay modal opens (checkout.js, loaded on demand)
 4. success -> POST /api/payments/verify {razorpayOrderId, razorpayPaymentId, razorpaySignature}
    server: HMAC-SHA256(order_id|payment_id, key_secret) must equal the signature -> only then PAID
 5. closed / failed -> order stays saved; "Complete payment" on the confirmation page and "Pay now" in My Orders

## Errors
create-order: no login 401 | not your order 404 | amount < 100 paise 400 | Razorpay/gateway error or bad keys 500 (details only in server log)
verify:       missing fields 400 | signature mismatch 400 (order NOT marked paid) | unknown payment 400

## Test (test mode)
UPI: success@razorpay  (failure: failure@razorpay) | Card: 4111 1111 1111 1111, any future expiry, any CVV, OTP 1234
Then: seller dashboard -> order shows payment PAID and the shipment steps unlock.
