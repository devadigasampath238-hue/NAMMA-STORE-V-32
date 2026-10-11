package com.nammastore;

import jakarta.persistence.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * ===========================================================
 * Auth.java
 * -----------------------------------------------------------
 * Our OWN login system: users, profiles, addresses, and
 * register/login APIs. Firebase has been removed completely -
 * nothing in this app calls out to Google anymore.
 *
 * HOW LOGIN WORKS NOW
 * --------------------
 *  1. POST /api/auth/register {name, email, phone, password}
 *     creates a CUSTOMER account. The password is hashed with
 *     PasswordService (PBKDF2) and the plaintext is never
 *     stored or logged. A session token is returned.
 *
 *  2. POST /api/auth/login {emailOrPhone, password} looks the
 *     account up by email OR mobile number, checks the password
 *     hash, and returns a session token - for CUSTOMER,
 *     COMPANY_ADMIN and SUPER_ADMIN accounts alike. One login
 *     endpoint, one token shape, for everyone.
 *
 *  3. The frontend sends that token back as
 *     "Authorization: Bearer <token>" on every request.
 *     TokenService (Security.java) verifies it and
 *     CurrentUserService resolves it to the AppUser row, exactly
 *     the same way AdminAuthFilter and every customer-scoped
 *     endpoint below already expected a verified identity to
 *     arrive - only WHERE that identity comes from has changed.
 *
 * accountUid (@Column "account_uid", historically "firebase_uid")
 * is now simply this app's own unique account identifier -
 * "cus_<uuid>" for a customer, "cmp_<uuid>" for a company admin,
 * "root" for the super admin - assigned at registration time
 * instead of being handed to us by Firebase.
 * ===========================================================
 */

@Entity
@Table(name = "app_users")
class AppUser {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * This app's own unique account identifier. Column name is unchanged
     * from the Firebase days ("firebase_uid" -> renamed to "account_uid" by
     * migration 009) so no data migration of the VALUES is required - only
     * how they are generated changed: locally, at registration time.
     */
    @Column(name = "account_uid", unique = true, nullable = false)
    private String accountUid;

    @Column(unique = true)
    private String email;

    private String displayName;

    @Column(unique = true)
    private String phone;

    /** Relative path such as /uploads/avatars/<uuid>.jpg, or null. */
    private String photoUrl;

    /**
     * PBKDF2 password hash from PasswordService. NEVER the plaintext
     * password, and NEVER included in AppUserDto - see DtoMapper.
     */
    @Column(length = 255)
    private String passwordHash;

    /**
     * KEPT for backward compatibility with every existing AdminAuthFilter
     * check and every admin session in the wild. New code should read
     * getRole() instead - isAdmin() now simply means
     * role == SUPER_ADMIN || role == COMPANY_ADMIN, computed from the role,
     * not stored separately, so the two can never disagree.
     */
    private boolean admin = false;

    /** Four roles: SUPER_ADMIN, COMPANY_ADMIN, INFLUENCER, CUSTOMER. */
    @Enumerated(EnumType.STRING)
    private UserRole role;

    /**
     * Set only for COMPANY_ADMIN and (once hired) COMPANY_STAFF accounts.
     * NULL for SUPER_ADMIN, INFLUENCER and CUSTOMER. This is the column
     * every company-scoped query filters on - see CurrentUserService.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id")
    private Company company;

    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getAccountUid() { return accountUid; }
    public void setAccountUid(String accountUid) { this.accountUid = accountUid; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getPhotoUrl() { return photoUrl; }
    public void setPhotoUrl(String photoUrl) { this.photoUrl = photoUrl; }
    /** Set for company accounts created/reset by the super admin; cleared on the first password change. */
    @Column(name = "must_change_password", columnDefinition = "boolean default false")
    private Boolean mustChangePassword = false;

    public boolean isMustChangePassword() { return Boolean.TRUE.equals(mustChangePassword); }
    public void setMustChangePassword(boolean v) { this.mustChangePassword = v; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    /** True for SUPER_ADMIN or COMPANY_ADMIN. Derived, not stored. */
    public boolean isAdmin() { return getRole() == UserRole.SUPER_ADMIN || getRole() == UserRole.COMPANY_ADMIN; }

    /**
     * Legacy setter. Only meaningful before a role has ever been assigned -
     * once role is set explicitly, that is the source of truth and this is
     * a no-op, so old code paths cannot silently downgrade a real role.
     */
    public void setAdmin(boolean admin) {
        this.admin = admin;
        if (this.role == null && admin) this.role = UserRole.SUPER_ADMIN;
    }

    public UserRole getRole() {
        if (role != null) return role;
        return admin ? UserRole.SUPER_ADMIN : UserRole.CUSTOMER;
    }
    public void setRole(UserRole role) { this.role = role; }

    public Company getCompany() { return company; }
    public void setCompany(Company company) { this.company = company; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}

/**
 * Four roles, matching the brief exactly. INFLUENCER accounts do not yet
 * have a login flow - that is a later stage - but the role exists now so
 * Influencer rows can reference a user from day one.
 */
enum UserRole {
    SUPER_ADMIN,
    COMPANY_ADMIN,
    INFLUENCER,
    CUSTOMER
}

@Entity
@Table(name = "addresses")
class Address {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_id")
    private AppUser user;

    private String fullName;
    private String phone;
    private String houseBuilding;
    private String street;
    private String area;
    private String city;
    private String state;
    private String pincode;
    private String landmark;
    private boolean isDefault = false;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public AppUser getUser() { return user; }
    public void setUser(AppUser user) { this.user = user; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getHouseBuilding() { return houseBuilding; }
    public void setHouseBuilding(String houseBuilding) { this.houseBuilding = houseBuilding; }
    public String getStreet() { return street; }
    public void setStreet(String street) { this.street = street; }
    public String getArea() { return area; }
    public void setArea(String area) { this.area = area; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getPincode() { return pincode; }
    public void setPincode(String pincode) { this.pincode = pincode; }
    public String getLandmark() { return landmark; }
    public void setLandmark(String landmark) { this.landmark = landmark; }
    public boolean isDefault() { return isDefault; }
    public void setDefault(boolean aDefault) { isDefault = aDefault; }
}

/**
 * spring.jpa.open-in-view=false, so a LAZY AppUser.company proxy is dead as
 * soon as the repository call returns: touching company.isActive() or
 * company.getName() in the login path threw "could not initialize proxy
 * [Company#n] - no Session" (HTTP 500). The relationship stays LAZY (a
 * customer never needs it); every finder that feeds login, token checks
 * and the admin filter fetches it in the SAME query via an entity graph.
 */
interface AppUserRepository extends JpaRepository<AppUser, Long> {
    @EntityGraph(attributePaths = "company")
    Optional<AppUser> findByAccountUid(String accountUid);

    @EntityGraph(attributePaths = "company")
    Optional<AppUser> findByEmailIgnoreCase(String email);

    @EntityGraph(attributePaths = "company")
    Optional<AppUser> findByPhone(String phone);

    @EntityGraph(attributePaths = "company")
    List<AppUser> findByCompanyId(Long companyId);

    @Override
    @EntityGraph(attributePaths = "company")
    Optional<AppUser> findById(Long id);

    long countByRole(UserRole role);
}

interface AddressRepository extends JpaRepository<Address, Long> {
    List<Address> findByUserId(Long userId);
}

/**
 * ===========================================================
 * WHO IS THIS REQUEST FROM, AND MAY THEY TOUCH THIS ROW?
 * -----------------------------------------------------------
 * Every customer-scoped endpoint resolves the caller from a
 * VERIFIED session token (TokenService) and compares that to
 * the row being touched. The path parameter is still accepted
 * so existing frontend routes keep working, but it is never
 * trusted as identity by itself.
 * ===========================================================
 */
@Component
class CurrentUserService {

    @Autowired private TokenService tokenService;
    @Autowired private AppUserRepository appUserRepository;

    /** @return the signed-in user, or null when there is no valid token. */
    AppUser resolve(String authHeader) {
        if (authHeader == null || authHeader.isBlank()) return null;
        String uid = tokenService.verifyTokenAndGetUid(
                authHeader.replace("Bearer ", "").trim());
        if (uid == null) return null;
        return appUserRepository.findByAccountUid(uid).orElse(null);
    }

    /** The caller must be signed in. */
    AppUser require(String authHeader) {
        AppUser user = resolve(authHeader);
        if (user == null) {
            throw new UnauthorizedException("Please sign in to continue.");
        }
        return user;
    }

    /**
     * The caller must be signed in AND be the user whose data is being
     * accessed. Admins are allowed through so the admin panel keeps working.
     */
    AppUser requireSelf(String authHeader, Long userId) {
        AppUser user = require(authHeader);
        if (user.isAdmin()) return user;
        if (userId == null || !userId.equals(user.getId())) {
            // Deliberately the same wording as a missing row: telling a
            // prober "this exists but is not yours" is itself a leak.
            throw new ForbiddenException("You do not have access to this resource.");
        }
        return user;
    }

    /** Ownership check for a row that hangs off a user. */
    void requireOwns(AppUser caller, AppUser owner) {
        if (caller.isAdmin()) return;
        if (owner == null || !owner.getId().equals(caller.getId())) {
            throw new ForbiddenException("You do not have access to this resource.");
        }
    }
}

class RegisterRequest {
    public String name;
    public String email;
    public String phone;
    public String password;
}

class LoginRequest {
    /** Either an email address or a 10-digit mobile number. */
    public String emailOrPhone;
    public String password;
}

class AuthResponse {
    public String token;
    public AppUserDto user;
    AuthResponse(String token, AppUserDto user) {
        this.token = token;
        this.user = user;
    }
}

class ProfileUpdateRequest {
    public String displayName;
    public String phone;
    public String email;
}

class AddressRequest {
    public String fullName;
    public String phone;
    public String houseBuilding;
    public String street;
    public String area;
    public String city;
    public String state;
    public String pincode;
    public String landmark;
    public boolean isDefault;
}

@RestController
@RequestMapping("/api")
class AuthController {

    @Autowired private AppUserRepository appUserRepository;
    @Autowired private AddressRepository addressRepository;
    @Autowired private StorageService storageService;
    @Autowired private DtoMapper mapper;
    @Autowired private TokenService tokenService;
    @Autowired private PasswordService passwordService;
    @Autowired private CurrentUserService currentUser;

    /* ---------------- register / login ---------------- */

    @PostMapping("/auth/register")
    public AuthResponse register(@RequestBody RegisterRequest req) {
        if (req.name == null || req.name.isBlank()) {
            throw new BadRequestException("Please enter your name.");
        }
        if (req.email == null || req.email.isBlank()) {
            throw new BadRequestException("Please enter an email address.");
        }
        if (req.phone == null || req.phone.isBlank()) {
            throw new BadRequestException("Please enter a mobile number.");
        }
        if (req.password == null || req.password.length() < 6) {
            throw new BadRequestException("Password must be at least 6 characters.");
        }

        String email = req.email.trim().toLowerCase(Locale.ROOT);
        String phone = req.phone.trim();

        if (appUserRepository.findByEmailIgnoreCase(email).isPresent()) {
            throw new BadRequestException("An account with this email already exists.");
        }
        if (appUserRepository.findByPhone(phone).isPresent()) {
            throw new BadRequestException("An account with this mobile number already exists.");
        }

        AppUser user = new AppUser();
        user.setAccountUid("cus_" + UUID.randomUUID());
        user.setEmail(email);
        user.setDisplayName(req.name.trim());
        user.setPhone(phone);
        user.setRole(UserRole.CUSTOMER);
        user.setPasswordHash(passwordService.hash(req.password));
        user = appUserRepository.save(user);

        String token = tokenService.issueToken(user.getAccountUid(), user.getRole(), null);
        return new AuthResponse(token, mapper.toDto(user));
    }

    @PostMapping("/auth/login")
    public AuthResponse login(@RequestBody LoginRequest req) {
        if (req.emailOrPhone == null || req.emailOrPhone.isBlank() || req.password == null) {
            throw new BadRequestException("Please enter your email/mobile number and password.");
        }

        String identifier = req.emailOrPhone.trim();
        Optional<AppUser> found = identifier.contains("@")
                ? appUserRepository.findByEmailIgnoreCase(identifier.toLowerCase(Locale.ROOT))
                : appUserRepository.findByPhone(identifier);

        AppUser user = found.orElseThrow(
                () -> new UnauthorizedException("Incorrect email/mobile number or password."));

        if (user.getPasswordHash() == null
                || !passwordService.matches(req.password, user.getPasswordHash())) {
            throw new UnauthorizedException("Incorrect email/mobile number or password.");
        }

        // A COMPANY_ADMIN whose company has been deactivated by the super
        // admin must not be able to keep using an already-issued password.
        if (user.getRole() == UserRole.COMPANY_ADMIN
                && (user.getCompany() == null || !user.getCompany().isActive())) {
            throw new ForbiddenException("This company account has been deactivated. Contact Namma Store support.");
        }

        Long companyId = user.getCompany() != null ? user.getCompany().getId() : null;
        String token = tokenService.issueToken(user.getAccountUid(), user.getRole(), companyId);
        return new AuthResponse(token, mapper.toDto(user));
    }

    @GetMapping("/auth/me")
    public ResponseEntity<AppUserDto> me(@RequestHeader("Authorization") String authHeader) {
        String uid = tokenService.verifyTokenAndGetUid(strip(authHeader));
        if (uid == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return appUserRepository.findByAccountUid(uid)
                .map(u -> ResponseEntity.ok(mapper.toDto(u)))
                .orElse(ResponseEntity.notFound().build());
    }

    /* ---------------- profile ---------------- */

    @GetMapping("/users/{userId}")
    public ResponseEntity<AppUserDto> getUser(
            @PathVariable Long userId,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        return appUserRepository.findById(userId)
                .map(u -> ResponseEntity.ok(mapper.toDto(u)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/users/{userId}")
    public ResponseEntity<AppUserDto> updateProfile(
            @PathVariable Long userId,
            @RequestBody ProfileUpdateRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        currentUser.requireSelf(auth, userId);
        Optional<AppUser> existing = appUserRepository.findById(userId);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        AppUser user = existing.get();
        if (req.displayName != null) user.setDisplayName(req.displayName.trim());
        if (req.phone != null) user.setPhone(req.phone.trim());
        // Email doubles as the login identifier - changing it here is fine
        // now that we own the account record ourselves (no Firebase to desync).
        if (req.email != null && !req.email.isBlank()) {
            user.setEmail(req.email.trim().toLowerCase(Locale.ROOT));
        }
        return ResponseEntity.ok(mapper.toDto(appUserRepository.save(user)));
    }

    @PostMapping("/users/{userId}/photo")
    public ResponseEntity<AppUserDto> uploadProfilePhoto(
            @PathVariable Long userId,
            @RequestParam("file") MultipartFile file,
            @RequestHeader(value = "Authorization", required = false) String auth) {

        currentUser.requireSelf(auth, userId);
        Optional<AppUser> existing = appUserRepository.findById(userId);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        AppUser user = existing.get();
        String stored = storageService.storeImage(file, "avatars");
        storageService.deleteQuietly(user.getPhotoUrl());
        user.setPhotoUrl(stored);

        return ResponseEntity.ok(mapper.toDto(appUserRepository.save(user)));
    }

    @DeleteMapping("/users/{userId}/photo")
    public ResponseEntity<AppUserDto> deleteProfilePhoto(
            @PathVariable Long userId,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        Optional<AppUser> existing = appUserRepository.findById(userId);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        AppUser user = existing.get();
        storageService.deleteQuietly(user.getPhotoUrl());
        user.setPhotoUrl(null);
        return ResponseEntity.ok(mapper.toDto(appUserRepository.save(user)));
    }

    @GetMapping("/users/{userId}/addresses")
    public List<Address> addresses(
            @PathVariable Long userId,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        return addressRepository.findByUserId(userId);
    }

    @PostMapping("/users/{userId}/addresses")
    public ResponseEntity<Address> addAddress(
            @PathVariable Long userId,
            @RequestBody AddressRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        Optional<AppUser> user = appUserRepository.findById(userId);
        if (user.isEmpty()) return ResponseEntity.notFound().build();
        boolean makeDefault = req.isDefault || addressRepository.findByUserId(userId).isEmpty();
        if (makeDefault) unsetExistingDefaults(userId);
        Address a = new Address();
        a.setUser(user.get());
        applyAddress(a, req);
        a.setDefault(makeDefault);
        return ResponseEntity.status(HttpStatus.CREATED).body(addressRepository.save(a));
    }

    @PutMapping("/users/{userId}/addresses/{addressId}")
    public ResponseEntity<Address> updateAddress(@PathVariable Long userId, @PathVariable Long addressId,
                                                  @RequestBody AddressRequest req,
                                                  @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        Optional<Address> existing = addressRepository.findById(addressId);
        if (existing.isEmpty() || !existing.get().getUser().getId().equals(userId)) {
            return ResponseEntity.notFound().build();
        }
        Address a = existing.get();
        applyAddress(a, req);
        if (req.isDefault && !a.isDefault()) {
            unsetExistingDefaults(userId);
            a.setDefault(true);
        }
        return ResponseEntity.ok(addressRepository.save(a));
    }

    @DeleteMapping("/users/{userId}/addresses/{addressId}")
    public ResponseEntity<Void> deleteAddress(@PathVariable Long userId, @PathVariable Long addressId,
                                              @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        Optional<Address> existing = addressRepository.findById(addressId);
        if (existing.isEmpty() || !existing.get().getUser().getId().equals(userId)) {
            return ResponseEntity.notFound().build();
        }
        boolean wasDefault = existing.get().isDefault();
        addressRepository.deleteById(addressId);
        if (wasDefault) {
            addressRepository.findByUserId(userId).stream().findFirst()
                    .ifPresent(next -> { next.setDefault(true); addressRepository.save(next); });
        }
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/users/{userId}/addresses/{addressId}/default")
    public ResponseEntity<Address> setDefaultAddress(@PathVariable Long userId, @PathVariable Long addressId,
                                                     @RequestHeader(value = "Authorization", required = false) String auth) {
        currentUser.requireSelf(auth, userId);
        Optional<Address> existing = addressRepository.findById(addressId);
        if (existing.isEmpty() || !existing.get().getUser().getId().equals(userId)) {
            return ResponseEntity.notFound().build();
        }
        unsetExistingDefaults(userId);
        Address a = existing.get();
        a.setDefault(true);
        return ResponseEntity.ok(addressRepository.save(a));
    }

    private void unsetExistingDefaults(Long userId) {
        List<Address> existing = addressRepository.findByUserId(userId);
        for (Address addr : existing) {
            if (addr.isDefault()) {
                addr.setDefault(false);
                addressRepository.save(addr);
            }
        }
    }

    private void applyAddress(Address a, AddressRequest req) {
        a.setFullName(req.fullName);
        a.setPhone(req.phone);
        a.setHouseBuilding(req.houseBuilding);
        a.setStreet(req.street);
        a.setArea(req.area);
        a.setCity(req.city);
        a.setState(req.state);
        a.setPincode(req.pincode);
        a.setLandmark(req.landmark);
    }

    private String strip(String header) {
        if (header == null) return null;
        return header.replace("Bearer ", "").trim();
    }
}
