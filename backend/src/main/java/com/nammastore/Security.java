package com.nammastore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * ===========================================================
 * Security.java  (NEW - replaces the whole Firebase concept)
 * -----------------------------------------------------------
 * Everything needed for our OWN login system, with zero new
 * third-party dependencies (Maven can't reach the internet in
 * every deployment environment, so this deliberately uses only
 * the JDK's own crypto classes plus Jackson, which is already
 * on the classpath via spring-boot-starter-web).
 *
 * TWO PIECES:
 *
 *  1. PasswordService - turns a plaintext password into a
 *     salted PBKDF2-HMAC-SHA256 hash (100,000 iterations), and
 *     verifies a later attempt against it. Nobody's real
 *     password is ever stored - only this hash.
 *
 *  2. TokenService - issues and verifies a signed session
 *     token when someone logs in successfully. It plays the
 *     exact role the Firebase ID token used to play: the
 *     frontend sends it back as "Authorization: Bearer <token>"
 *     on every request, and TokenService.verifyTokenAndGetUid()
 *     tells the backend who that is - WITHOUT calling out to
 *     Google or anywhere else. Everything happens inside this
 *     one server.
 *
 * The token is a compact two-part string: a base64url JSON
 * payload, a dot, and an HMAC-SHA256 signature of that payload
 * using a secret only this server knows (app.auth.jwt-secret).
 * Nobody can forge or edit one without that secret, and nobody
 * can read someone else's password from it because it never
 * contains a password - only the account id, role and an
 * expiry time.
 * ===========================================================
 */
@Component
class PasswordService {

    private static final int ITERATIONS = 100_000;
    private static final int KEY_LENGTH_BITS = 256;
    private static final int SALT_BYTES = 16;
    private static final SecureRandom RANDOM = new SecureRandom();

    /** @return a string safe to store in passwordHash, e.g. "100000:base64salt:base64hash". */
    String hash(String plainPassword) {
        byte[] salt = new byte[SALT_BYTES];
        RANDOM.nextBytes(salt);
        byte[] hash = pbkdf2(plainPassword.toCharArray(), salt, ITERATIONS);
        return ITERATIONS + ":" + b64(salt) + ":" + b64(hash);
    }

    /** @return true when plainPassword hashes to the same value stored earlier. */
    boolean matches(String plainPassword, String storedHash) {
        if (plainPassword == null || storedHash == null) return false;
        try {
            String[] parts = storedHash.split(":");
            if (parts.length != 3) return false;
            int iterations = Integer.parseInt(parts[0]);
            byte[] salt = Base64.getDecoder().decode(parts[1]);
            byte[] expected = Base64.getDecoder().decode(parts[2]);
            byte[] attempt = pbkdf2(plainPassword.toCharArray(), salt, iterations);
            return MessageDigest.isEqual(expected, attempt);
        } catch (Exception e) {
            return false;
        }
    }

    private byte[] pbkdf2(char[] password, byte[] salt, int iterations) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password, salt, iterations, KEY_LENGTH_BITS);
            SecretKeyFactory factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
            return factory.generateSecret(spec).getEncoded();
        } catch (Exception e) {
            throw new IllegalStateException("Could not hash password", e);
        }
    }

    private static String b64(byte[] bytes) {
        return Base64.getEncoder().encodeToString(bytes);
    }

    /** A random, easy-to-read password for auto-generated company accounts. */
    static String randomPassword() {
        // Deliberately avoids visually ambiguous characters (0/O, 1/l/I) since
        // this is meant to be read off a screen and typed in by a company owner.
        String alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        StringBuilder sb = new StringBuilder(12);
        for (int i = 0; i < 12; i++) {
            sb.append(alphabet.charAt(RANDOM.nextInt(alphabet.length())));
        }
        return sb.toString();
    }
}

@Component
class TokenService {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final long DEFAULT_TTL_SECONDS = 60L * 60 * 24 * 30; // 30 days

    /**
     * MUST be set to a long, random, secret value in production via the
     * APP_AUTH_JWT_SECRET environment variable. Anyone who has this value can
     * mint a token for any account, including the super admin's, so it must
     * never be committed to source control or shared.
     */
    @Value("${app.auth.jwt-secret:CHANGE-THIS-DEV-ONLY-SECRET-please-set-APP_AUTH_JWT_SECRET}")
    private String secret;

    private Mac mac() {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac;
        } catch (Exception e) {
            throw new IllegalStateException("Could not initialise token signing", e);
        }
    }

    /** Issues a signed session token for a successfully authenticated account. */
    String issueToken(String accountUid, UserRole role, Long companyId) {
        try {
            Map<String, Object> claims = new LinkedHashMap<>();
            claims.put("uid", accountUid);
            claims.put("role", role == null ? UserRole.CUSTOMER.name() : role.name());
            claims.put("companyId", companyId);
            claims.put("exp", Instant.now().plusSeconds(DEFAULT_TTL_SECONDS).getEpochSecond());

            String payload = urlEncode(MAPPER.writeValueAsBytes(claims));
            String signature = urlEncode(mac().doFinal(payload.getBytes(StandardCharsets.UTF_8)));
            return payload + "." + signature;
        } catch (Exception e) {
            throw new IllegalStateException("Could not issue session token", e);
        }
    }

    /**
     * Verifies the signature and expiry of a token.
     * @return the account uid ("sub"), or null when the token is missing,
     *         tampered with, malformed, or expired.
     */
    String verifyTokenAndGetUid(String token) {
        Map<String, Object> claims = decodeAndVerify(token);
        return claims == null ? null : (String) claims.get("uid");
    }

    private Map<String, Object> decodeAndVerify(String token) {
        if (token == null || token.isBlank()) return null;
        int dot = token.lastIndexOf('.');
        if (dot < 0) return null;

        String payload = token.substring(0, dot);
        String signature = token.substring(dot + 1);

        try {
            String expected = urlEncode(mac().doFinal(payload.getBytes(StandardCharsets.UTF_8)));
            // Constant-time comparison so response timing can't leak the secret.
            if (!MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    signature.getBytes(StandardCharsets.UTF_8))) {
                return null;
            }

            byte[] json = Base64.getUrlDecoder().decode(payload);
            @SuppressWarnings("unchecked")
            Map<String, Object> claims = MAPPER.readValue(json, Map.class);

            Object exp = claims.get("exp");
            if (exp instanceof Number && Instant.now().getEpochSecond() > ((Number) exp).longValue()) {
                return null; // expired - the account must sign in again
            }
            return claims;
        } catch (Exception e) {
            return null; // any parse/decoding problem = an invalid token, not a crash
        }
    }

    private static String urlEncode(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
