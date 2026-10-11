package com.nammastore;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/*
 * ===========================================================
 * Storage.java  (STAGE 1 - NEW FILE)
 * ===========================================================
 *
 * ONE place that knows how files are stored and how a stored
 * value becomes a URL the browser can load.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before Stage 1 the upload endpoint lived inside
 * Products.java and returned "/uploads/<file>". The frontend
 * then prefixed it with http://localhost:8080 and saved that
 * ABSOLUTE url into PostgreSQL. That is why images broke the
 * moment anything about the host changed, and why image URLs
 * had to be patched by hand in pgAdmin.
 *
 * NEW CONVENTION
 * --------------
 *  - The DATABASE always stores a RELATIVE path:
 *        /uploads/products/<uuid>.jpg
 *        /uploads/categories/<uuid>.png
 *        /uploads/avatars/<uuid>.png
 *  - The API always returns an ABSOLUTE url, built at
 *    response time by StorageService.toPublicUrl().
 *  - Legacy rows that already contain "http://..." are passed
 *    through untouched, so NO data migration is required and
 *    no existing image breaks.
 *
 * BACKENDS
 * --------
 *  - If storage.bucket + storage.access.key are configured,
 *    files go to the S3-compatible bucket (Cloudflare R2).
 *  - Otherwise files go to the local ./uploads folder, which
 *    NammaStoreApplication already serves at /uploads/**.
 *
 * No secrets are hard-coded: everything comes from
 * application.properties / environment variables.
 * ===========================================================
 */
@Service
class StorageService {

    /* ------------------------------------------------------------------
       CLOUDINARY  (preferred backend - checked before S3/R2 and local)
       ------------------------------------------------------------------
       Cloudinary is the primary, production-grade image host for this
       app: product/banner/category/influencer images are uploaded here
       and the resulting permanent "secure_url" is what gets stored in
       PostgreSQL. Nothing else in the codebase needs to change for this
       to work - toPublicUrl() already returns an absolute http(s) value
       unchanged, and toRelativePath() already returns null (meaning
       "external URL, keep as-is") for any URL that isn't one of our own
       /uploads/ or S3 paths, which a Cloudinary URL never is.

       No Cloudinary Java SDK is added as a Maven dependency (this
       environment cannot resolve new dependencies without network
       access to Maven Central) - instead this calls Cloudinary's plain
       HTTPS upload/destroy REST API directly with java.net.http, which
       ships in the JDK. The signature is the same HMAC-style scheme
       Cloudinary's own SDKs use: sort every non-file parameter
       alphabetically, join as "key=value&key=value", append the API
       secret, and SHA-1 hash the result. */

    @Value("${cloudinary.cloud-name:}")
    private String cloudinaryCloudName;

    @Value("${cloudinary.api-key:}")
    private String cloudinaryApiKey;

    @Value("${cloudinary.api-secret:}")
    private String cloudinaryApiSecret;

    /** Top-level Cloudinary folder every upload is nested under, e.g. "namma-store". */
    @Value("${cloudinary.folder:namma-store}")
    private String cloudinaryRootFolder;

    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .build();

    private static final Pattern CLOUDINARY_PUBLIC_ID_PATTERN = Pattern.compile(
            "/upload/(?:[a-z0-9_,.:-]+/)?(?:v\\d+/)?(.+?)\\.[a-zA-Z0-9]+$");

    /** Folders the app writes into. A leading one on a relative value means "this is one of our uploads". */
    private static final java.util.Set<String> KNOWN_UPLOAD_FOLDERS = java.util.Set.of(
            "products", "categories", "banners", "avatars", "designs", "influencers", "companies");

    /**
     * Canonical form of a stored image value.
     *   http(s)://...                  -> unchanged (Cloudinary, CDN, anything absolute)
     *   //categories/x  /categories/x
     *   categories/x                   -> /uploads/categories/x      (legacy repair)
     *   /uploads/products/x  uploads/x -> /uploads/products/x
     *   //res.cloudinary.com/..        -> https://res.cloudinary.com/..  (real host, scheme missing)
     *   anything else relative         -> /uploads/<value>
     * Returns null for blank/"null"/"undefined".
     */
    String normalizeStoredPath(String raw) {
        if (!notBlank(raw)) return null;
        String v = raw.trim().replace('\\', '/');
        String lower = v.toLowerCase(java.util.Locale.ROOT);
        if (lower.equals("null") || lower.equals("undefined")) return null;
        if (lower.startsWith("http://") || lower.startsWith("https://")) return v;

        String p = v;
        while (p.startsWith("/")) p = p.substring(1);
        if (p.isEmpty()) return null;

        if (p.regionMatches(true, 0, "uploads/", 0, 8)) return "/uploads/" + p.substring(8);

        int slash = p.indexOf('/');
        String first = slash > 0 ? p.substring(0, slash).toLowerCase(java.util.Locale.ROOT) : "";
        if (KNOWN_UPLOAD_FOLDERS.contains(first)) return "/uploads/" + p;

        // A real host with the scheme missing, e.g. //res.cloudinary.com/demo/image/upload/x.jpg
        if (slash > 0 && first.contains(".")) return "https://" + p;

        return "/uploads/" + p;
    }

    /** True when the value is one of OUR local files and that file really exists on disk. */
    boolean localFileExists(String storedValue) {
        String path = normalizeStoredPath(storedValue);
        if (path == null || !path.startsWith("/uploads/")) return false;
        try {
            java.nio.file.Path base = java.nio.file.Paths.get(localDir).toAbsolutePath().normalize();
            java.nio.file.Path file = base.resolve(path.substring("/uploads/".length())).normalize();
            return file.startsWith(base) && java.nio.file.Files.isRegularFile(file);
        } catch (Exception e) {
            return false;
        }
    }

    boolean isCloudinaryConfigured() {
        return notBlank(cloudinaryCloudName) && notBlank(cloudinaryApiKey) && notBlank(cloudinaryApiSecret);
    }

    @Value("${storage.endpoint:}")
    private String storageEndpoint;

    @Value("${storage.bucket:}")
    private String storageBucket;

    @Value("${storage.access.key:}")
    private String storageAccessKey;

    @Value("${storage.secret.key:}")
    private String storageSecretKey;

    /** Optional CDN / r2.dev domain used to build public URLs for remote files. */
    @Value("${storage.public.base-url:}")
    private String storagePublicBaseUrl;

    /** Local folder used when no bucket is configured. */
    @Value("${storage.local.dir:uploads}")
    private String localDir;

    /** Public origin of THIS backend, used to build absolute URLs for local files. */
    @Value("${app.public.base-url:http://localhost:8080}")
    private String appPublicBaseUrl;

    private static final List<String> ALLOWED_CONTENT_TYPES = List.of(
            "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"
    );

    private static final long MAX_BYTES = 10L * 1024 * 1024; // 10 MB

    @jakarta.annotation.PostConstruct
    void warnIfNotPersistent() {
        if (isCloudinaryConfigured()) {
            org.slf4j.LoggerFactory.getLogger(StorageService.class)
                    .info("Image storage: Cloudinary (cloud '{}', folder '{}'). Uploads are permanent.",
                            cloudinaryCloudName, cloudinaryRootFolder);
        } else if (!isRemoteConfigured()) {
            org.slf4j.LoggerFactory.getLogger(StorageService.class).warn(
                    "Image storage is using LOCAL DISK ({}). This is fine for local development only - "
                            + "on most hosting platforms this folder is wiped on every redeploy/restart, "
                            + "which is why images keep disappearing. Set CLOUDINARY_CLOUD_NAME, "
                            + "CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (recommended, free tier available) "
                            + "or STORAGE_ENDPOINT/STORAGE_BUCKET/STORAGE_ACCESS_KEY/STORAGE_SECRET_KEY "
                            + "(Cloudflare R2 / S3) to fix this permanently.", localDir);
        }
    }

    /* ------------------------------------------------------------------
       CAPABILITIES
       ------------------------------------------------------------------ */

    /** S3 / Cloudflare R2. Deliberately separate from isCloudinaryConfigured(). */
    boolean isObjectStorageConfigured() {
        return isRemoteConfigured();
    }

    boolean isRemoteConfigured() {
        return isCloudinaryConfigured()
                || (notBlank(storageBucket)
                && notBlank(storageAccessKey)
                && notBlank(storageSecretKey)
                && notBlank(storageEndpoint));
    }

    String describeBackend() {
        if (isCloudinaryConfigured()) return "cloudinary";
        if (notBlank(storageBucket) && notBlank(storageAccessKey) && notBlank(storageSecretKey)
                && notBlank(storageEndpoint)) return "s3";
        return "local";
    }

    /* ------------------------------------------------------------------
       STORE
       ------------------------------------------------------------------ */

    /**
     * Validates and stores an uploaded image.
     *
     * @param folder logical folder, e.g. "products", "categories", "avatars", "designs"
     * @return the RELATIVE path to persist in the database, e.g. /uploads/products/ab12.jpg
     */
    String storeImage(MultipartFile file, String folder) {
        validateImage(file);

        String safeFolder = sanitizeFolder(folder);

        // Cloudinary first: it is the primary image host for this app, and
        // its own secure_url IS the value we persist - no relative-path
        // translation needed, and nothing to reverse-engineer at read time.
        if (isCloudinaryConfigured()) {
            return uploadToCloudinary(file, safeFolder);
        }

        String filename = UUID.randomUUID() + extensionOf(file);
        String relativePath = "/uploads/" + safeFolder + "/" + filename;

        try {
            if (isRemoteConfigured()) {
                String key = safeFolder + "/" + filename;
                s3Client().putObject(
                        PutObjectRequest.builder()
                                .bucket(storageBucket)
                                .key(key)
                                .contentType(file.getContentType())
                                .build(),
                        RequestBody.fromBytes(file.getBytes())
                );
            } else {
                Path dir = Path.of(localDir, safeFolder);
                Files.createDirectories(dir);
                Files.write(dir.resolve(filename), file.getBytes());
            }
        } catch (IOException e) {
            throw new BadRequestException("Could not save the image: " + e.getMessage());
        } catch (RuntimeException e) {
            throw new BadRequestException("Upload failed: " + e.getMessage());
        }

        return relativePath;
    }

    /**
     * Uploads one file to Cloudinary via its plain HTTPS API (no SDK
     * dependency) and returns the permanent "secure_url", which is what
     * gets stored directly in PostgreSQL for this image from now on.
     */
    private String uploadToCloudinary(MultipartFile file, String safeFolder) {
        try {
            long timestamp = System.currentTimeMillis() / 1000L;
            String fullFolder = trimTrailingSlash(cloudinaryRootFolder) + "/" + safeFolder;

            // Only signed, non-file parameters go into the signature, sorted
            // alphabetically by key - this is Cloudinary's required scheme.
            Map<String, String> signedParams = new TreeMap<>();
            signedParams.put("folder", fullFolder);
            signedParams.put("timestamp", String.valueOf(timestamp));

            String signature = signCloudinaryParams(signedParams);

            String boundary = "NammaStoreBoundary" + UUID.randomUUID();
            byte[] body = buildMultipartBody(boundary, file, Map.of(
                    "api_key", cloudinaryApiKey,
                    "timestamp", String.valueOf(timestamp),
                    "folder", fullFolder,
                    "signature", signature
            ));

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.cloudinary.com/v1_1/" + cloudinaryCloudName + "/image/upload"))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                    .build();

            HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                org.slf4j.LoggerFactory.getLogger(StorageService.class)
                        .error("Cloudinary upload failed ({}): {}", response.statusCode(), response.body());
                throw new BadRequestException("Cloudinary rejected the upload. Check CLOUDINARY_* credentials.");
            }

            String secureUrl = extractJsonString(response.body(), "secure_url");
            if (secureUrl == null) {
                org.slf4j.LoggerFactory.getLogger(StorageService.class)
                        .error("Cloudinary responded {} but the body had no secure_url", response.statusCode());
                throw new BadRequestException("Cloudinary did not return an image URL.");
            }
            // IMAGE-DEBUG: no credentials are ever logged, only the resulting public URL.
            org.slf4j.LoggerFactory.getLogger(StorageService.class)
                    .info("Cloudinary uploaded URL = {} (public_id = {})",
                            secureUrl, extractJsonString(response.body(), "public_id"));
            return secureUrl;
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(StorageService.class).error("Cloudinary upload error", e);
            throw new BadRequestException("Could not upload the image to Cloudinary: " + e.getMessage());
        }
    }

    /** Best-effort delete of a Cloudinary-hosted image. Never throws. */
    private void deleteFromCloudinary(String publicId) {
        try {
            long timestamp = System.currentTimeMillis() / 1000L;
            Map<String, String> signedParams = new TreeMap<>();
            signedParams.put("public_id", publicId);
            signedParams.put("timestamp", String.valueOf(timestamp));
            String signature = signCloudinaryParams(signedParams);

            String form = "public_id=" + urlEncode(publicId)
                    + "&timestamp=" + timestamp
                    + "&api_key=" + urlEncode(cloudinaryApiKey)
                    + "&signature=" + signature;

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.cloudinary.com/v1_1/" + cloudinaryCloudName + "/image/destroy"))
                    .timeout(Duration.ofSeconds(20))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(form))
                    .build();

            HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(StorageService.class)
                    .warn("Could not delete Cloudinary asset {}: {}", publicId, e.getMessage());
        }
    }

    /** "key=value&key=value..." + api secret, SHA-1 hex - Cloudinary's default signing scheme. */
    private String signCloudinaryParams(Map<String, String> sortedParams) {
        StringBuilder toSign = new StringBuilder();
        for (Map.Entry<String, String> e : sortedParams.entrySet()) {
            if (toSign.length() > 0) toSign.append('&');
            toSign.append(e.getKey()).append('=').append(e.getValue());
        }
        toSign.append(cloudinaryApiSecret);
        return sha1Hex(toSign.toString());
    }

    private static String sha1Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Could not compute Cloudinary signature", e);
        }
    }

    /** Minimal multipart/form-data builder so no HTTP client library dependency is needed. */
    private static byte[] buildMultipartBody(String boundary, MultipartFile file, Map<String, String> fields)
            throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        String lineBreak = "\r\n";

        for (Map.Entry<String, String> field : fields.entrySet()) {
            out.write(("--" + boundary + lineBreak).getBytes(StandardCharsets.UTF_8));
            out.write(("Content-Disposition: form-data; name=\"" + field.getKey() + "\"" + lineBreak + lineBreak)
                    .getBytes(StandardCharsets.UTF_8));
            out.write((field.getValue() + lineBreak).getBytes(StandardCharsets.UTF_8));
        }

        String originalName = file.getOriginalFilename() == null ? "upload" : file.getOriginalFilename();
        out.write(("--" + boundary + lineBreak).getBytes(StandardCharsets.UTF_8));
        out.write(("Content-Disposition: form-data; name=\"file\"; filename=\"" + originalName + "\"" + lineBreak)
                .getBytes(StandardCharsets.UTF_8));
        out.write(("Content-Type: " + (file.getContentType() == null ? "application/octet-stream" : file.getContentType())
                + lineBreak + lineBreak).getBytes(StandardCharsets.UTF_8));
        out.write(file.getBytes());
        out.write(lineBreak.getBytes(StandardCharsets.UTF_8));

        out.write(("--" + boundary + "--" + lineBreak).getBytes(StandardCharsets.UTF_8));
        return out.toByteArray();
    }

    /** Just enough JSON parsing to pull one string field out of Cloudinary's response, no Jackson model needed. */
    private static String extractJsonString(String json, String field) {
        if (json == null) return null;
        Pattern p = Pattern.compile("\"" + Pattern.quote(field) + "\"\\s*:\\s*\"([^\"]*)\"");
        Matcher m = p.matcher(json);
        return m.find() ? m.group(1).replace("\\/", "/") : null;
    }

    private static String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    /**
     * Pulls the Cloudinary public_id (folder/name, no version, no extension)
     * back out of a secure_url so deleteQuietly() can ask Cloudinary to
     * remove the underlying asset instead of only forgetting the database row.
     */
    private static String extractCloudinaryPublicId(String secureUrl) {
        Matcher m = CLOUDINARY_PUBLIC_ID_PATTERN.matcher(secureUrl);
        return m.find() ? m.group(1) : null;
    }

    /* ------------------------------------------------------------------
       DELETE
       ------------------------------------------------------------------ */

    /**
     * Best-effort delete of a previously stored file. Never throws: an
     * orphaned file must not block a product/category update.
     *
     * @param storedValue whatever is in the database (relative path or legacy absolute url)
     */
    void deleteQuietly(String storedValue) {
        if (!notBlank(storedValue)) return;

        if (storedValue.contains("res.cloudinary.com")) {
            String publicId = extractCloudinaryPublicId(storedValue);
            if (publicId != null && isCloudinaryConfigured()) {
                deleteFromCloudinary(publicId);
            }
            return;
        }

        String relative = toRelativePath(storedValue);
        if (relative == null) return; // external URL we do not own

        String key = relative.substring("/uploads/".length());

        try {
            if (isRemoteConfigured()) {
                s3Client().deleteObject(
                        DeleteObjectRequest.builder()
                                .bucket(storageBucket)
                                .key(key)
                                .build()
                );
            } else {
                Files.deleteIfExists(Path.of(localDir).resolve(key));
            }
        } catch (Exception ignored) {
            // Intentionally swallowed - see javadoc.
        }
    }

    /* ------------------------------------------------------------------
       URL BUILDING  (the piece that removes the pgAdmin workflow)
       ------------------------------------------------------------------ */

    /**
     * Turns a stored value into something the browser can load.
     *
     *  "/uploads/products/x.jpg"  -> "http://localhost:8080/uploads/products/x.jpg"
     *  "http://old/uploads/x.jpg" -> unchanged  (legacy rows keep working)
     *  null / blank               -> null       (frontend shows its fallback)
     */
    String toPublicUrl(String storedValue) {
        // ONE normaliser. Absolute http(s) URLs (Cloudinary included) come
        // back untouched; every relative/legacy shape becomes /uploads/...
        // and is NEVER given a host of its own. This is what stops
        // "//categories/x.jpg" from being read by the browser as
        // https://categories/x.jpg (ERR_NAME_NOT_RESOLVED).
        String path = normalizeStoredPath(storedValue);
        if (path == null) return null;
        if (path.startsWith("http://") || path.startsWith("https://")) return path;

        // S3/R2 URLs are built ONLY when object storage is really configured.
        // Cloudinary being configured must never lead here.
        if (isObjectStorageConfigured() && path.startsWith("/uploads/")) {
            String key = path.substring("/uploads/".length());
            String base = notBlank(storagePublicBaseUrl)
                    ? trimTrailingSlash(storagePublicBaseUrl)
                    : trimTrailingSlash(storageEndpoint) + "/" + storageBucket;
            return base + "/" + key;
        }

        return trimTrailingSlash(appPublicBaseUrl) + path;
    }

    List<String> toPublicUrls(List<String> storedValues) {
        List<String> out = new ArrayList<>();
        if (storedValues == null) return out;
        for (String v : storedValues) {
            String url = toPublicUrl(v);
            if (url != null) out.add(url);
        }
        return out;
    }

    /**
     * Inverse of toPublicUrl: accepts either a relative path or an absolute
     * URL that points at our own storage, and returns the canonical relative
     * path. Returns null for URLs we do not own.
     *
     * This is what lets the admin UI send back the same absolute URL it was
     * given ("delete THIS image") without the backend getting confused.
     */
    String toRelativePath(String value) {
        if (!notBlank(value)) return null;
        String v = value.trim();

        int idx = v.indexOf("/uploads/");
        if (idx >= 0) {
            return v.substring(idx);
        }

        // Legacy "//categories/x" / "/categories/x" / "categories/x" shapes.
        if (!v.toLowerCase(java.util.Locale.ROOT).startsWith("http")) {
            String n = normalizeStoredPath(v);
            if (n != null && n.startsWith("/uploads/")) return n;
        }

        // Remote layout: <public-base>/<folder>/<file>
        if (isRemoteConfigured()) {
            String base = notBlank(storagePublicBaseUrl)
                    ? trimTrailingSlash(storagePublicBaseUrl)
                    : trimTrailingSlash(storageEndpoint) + "/" + storageBucket;
            if (v.startsWith(base)) {
                String key = v.substring(base.length());
                if (!key.startsWith("/")) key = "/" + key;
                return "/uploads" + key;
            }
        }

        return null;
    }

    /**
     * True when two values refer to the same stored image, regardless of
     * whether they are relative paths or absolute URLs.
     */
    boolean sameImage(String a, String b) {
        if (a == null || b == null) return false;
        if (a.equals(b)) return true;
        String ra = toRelativePath(a);
        String rb = toRelativePath(b);
        return ra != null && ra.equals(rb);
    }

    /* ------------------------------------------------------------------
       INTERNALS
       ------------------------------------------------------------------ */

    private S3Client s3Client() {
        return S3Client.builder()
                .endpointOverride(URI.create(storageEndpoint))
                .region(Region.US_EAST_1)
                .serviceConfiguration(S3Configuration.builder()
                        .pathStyleAccessEnabled(true)
                        .build())
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(storageAccessKey, storageSecretKey)))
                .build();
    }

    private void validateImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("No file was provided.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BadRequestException("Image is larger than 10MB.");
        }
        String contentType = file.getContentType() == null
                ? ""
                : file.getContentType().toLowerCase(Locale.ROOT);
        if (!ALLOWED_CONTENT_TYPES.contains(contentType)) {
            throw new BadRequestException(
                    "Unsupported image type. Please upload PNG, JPG, JPEG, WEBP or GIF.");
        }
    }

    private String extensionOf(MultipartFile file) {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        int dot = original.lastIndexOf('.');
        if (dot < 0) return ".jpg";
        String ext = original.substring(dot).toLowerCase(Locale.ROOT);
        return ext.matches("\\.[a-z0-9]{2,5}") ? ext : ".jpg";
    }

    private String sanitizeFolder(String folder) {
        if (!notBlank(folder)) return "misc";
        String cleaned = folder.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9-]", "");
        return cleaned.isBlank() ? "misc" : cleaned;
    }

    private static String trimTrailingSlash(String value) {
        if (value == null) return "";
        return value.replaceAll("/+$", "");
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}


/* ===========================================================
   UPLOAD CONTROLLER
   -----------------------------------------------------------
   Generic uploads used by the customer-facing customization
   flow and by any admin screen that wants a raw URL.

   NOTE: product and category images have their own dedicated
   endpoints in Products.java which ALSO attach the image to
   the row - that is the flow that replaces pgAdmin.
   =========================================================== */

@RestController
@RequestMapping("/api")
class UploadController {

    @Autowired
    private StorageService storageService;

    /**
     * Kept at its original path so the existing frontend uploadFile()
     * helper keeps working unchanged.
     *
     * Response:
     *   { "url": "<absolute url>", "path": "<relative path>", "storage": "local|s3" }
     */
    @PostMapping("/upload")
    public ResponseEntity<Map<String, String>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "folder", required = false, defaultValue = "misc") String folder) {

        String relative = storageService.storeImage(file, folder);

        Map<String, String> body = new LinkedHashMap<>();
        body.put("url", storageService.toPublicUrl(relative));
        body.put("path", relative);
        body.put("storage", storageService.describeBackend());
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }
}
