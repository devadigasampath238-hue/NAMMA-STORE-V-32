package com.nammastore;

import jakarta.persistence.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * ===========================================================
 * Company.java
 * -----------------------------------------------------------
 * A supplier/manufacturer tied up with Namma Store. Every
 * COMPANY_ADMIN AppUser row points at exactly one Company via
 * AppUser.company - that is the single column every
 * company-scoped query filters on.
 *
 * LOGIN IS NOW IMPLEMENTED.
 * There is exactly ONE place a password hash is ever stored:
 * AppUser.passwordHash. This entity used to also have its own
 * loginEmail/passwordHash pair "for Stage 2" - that duplicate
 * has been removed. loginEmail is kept only as a read-only
 * COPY of the linked AppUser's email, purely so the admin
 * company list can display it without an extra query.
 *
 * HOW A COMPANY GETS ITS LOGIN
 * ------------------------------
 * The super admin calls POST /api/admin/companies (see
 * CompanyController below - SUPER_ADMIN only). The server:
 *   1. creates this Company row,
 *   2. generates a random password,
 *   3. creates the matching AppUser row (role=COMPANY_ADMIN,
 *      company=this row, passwordHash=hash(generated password)),
 *   4. returns the plaintext password to the super admin ONCE,
 *      in the API response, so it can be copied and shared with
 *      that company (WhatsApp/email/however you tell them).
 *
 * The password is never stored anywhere in plaintext and is
 * never shown again - use POST .../reset-password to issue a
 * new one if it's lost.
 * ===========================================================
 */
@Entity
@Table(name = "companies")
class Company {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    /** Relative path, resolved to an absolute URL the same way product images are. */
    private String logoUrl;

    /** Read-only mirror of the linked AppUser's email - see class comment. */
    @Column(unique = true)
    private String loginEmail;

    private String phone;

    @Column(length = 1000)
    private String address;

    private String gstNumber;
    private String contactPerson;

    private boolean active = true;

    /* ---- per-company commercial agreement (a later stage reads these) ---- */

    /** Percentage of gross sales Namma Store retains. Null = not configured yet. */
    private BigDecimal platformCommissionPercent;

    /** Flat fee per order, in addition to or instead of the percentage. */
    private BigDecimal platformFixedFee;

    /** Free text until a structured workflow is needed: e.g. "COMPANY", "PLATFORM", "SHARED". */
    private String shippingResponsibility;
    private String returnResponsibility;

    /** How many days after delivery Namma Store settles payouts to this company. */
    private Integer settlementPeriodDays;

    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getLogoUrl() { return logoUrl; }
    public void setLogoUrl(String logoUrl) { this.logoUrl = logoUrl; }
    public String getLoginEmail() { return loginEmail; }
    public void setLoginEmail(String loginEmail) { this.loginEmail = loginEmail; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getGstNumber() { return gstNumber; }
    public void setGstNumber(String gstNumber) { this.gstNumber = gstNumber; }
    public String getContactPerson() { return contactPerson; }
    public void setContactPerson(String contactPerson) { this.contactPerson = contactPerson; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public BigDecimal getPlatformCommissionPercent() { return platformCommissionPercent; }
    public void setPlatformCommissionPercent(BigDecimal v) { this.platformCommissionPercent = v; }
    public BigDecimal getPlatformFixedFee() { return platformFixedFee; }
    public void setPlatformFixedFee(BigDecimal v) { this.platformFixedFee = v; }
    public String getShippingResponsibility() { return shippingResponsibility; }
    public void setShippingResponsibility(String v) { this.shippingResponsibility = v; }
    public String getReturnResponsibility() { return returnResponsibility; }
    public void setReturnResponsibility(String v) { this.returnResponsibility = v; }
    public Integer getSettlementPeriodDays() { return settlementPeriodDays; }
    public void setSettlementPeriodDays(Integer v) { this.settlementPeriodDays = v; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}

interface CompanyRepository extends JpaRepository<Company, Long> {
    Optional<Company> findByLoginEmailIgnoreCase(String loginEmail);
}

/* ===========================================================
   DTOs
   =========================================================== */

class CompanyDto {
    public Long id;
    public String name;
    public String logoUrl;
    /** The email the company signs in with. Never a password. */
    public String loginEmail;
    public String phone;
    public String address;
    public String gstNumber;
    public String contactPerson;
    public boolean active;
    public Instant createdAt;
    /** Real counts from the database (products owned / orders containing one of its products). */
    public long productCount;
    public long orderCount;
}

class CreateCompanyRequest {
    public String name;
    public String phone;
    public String address;
    public String gstNumber;
    public String contactPerson;
    /** Optional. Auto-generated from the company name when left blank. */
    public String loginEmail;
}

/**
 * Returned ONLY from create/reset-password. This is the one and only time
 * the plaintext password is ever visible - copy it to the company right
 * away, because the server does not keep it anywhere after this response.
 */
class CompanyCredentialsResponse {
    public Long companyId;
    public String companyName;
    public String loginEmail;
    public String password;
    public String note = "Share this password with the company now - it will not be shown again. "
            + "Use reset-password to issue a new one if it is lost.";
}

/* ===========================================================
   SUPER-ADMIN-ONLY COMPANY MANAGEMENT
   -----------------------------------------------------------
   AdminAuthFilter already guarantees the caller is SOME kind of
   admin (SUPER_ADMIN or COMPANY_ADMIN). Creating/managing OTHER
   companies must be SUPER_ADMIN only, so every method here does
   its own extra role check on top of that.
   =========================================================== */
@RestController
@RequestMapping("/api/admin/companies")
class CompanyController {

    @Autowired private CompanyRepository companyRepository;
    @Autowired private AppUserRepository appUserRepository;
    @Autowired private PasswordService passwordService;
    @Autowired private CurrentUserService currentUser;
    @Autowired private ProductRepository productRepository;
    @Autowired private OrderRepository orderRepository;
    @Autowired private StorageService storageService;

    /** companyId -> number of orders that contain at least one of its products. */
    private java.util.Map<Long, Long> orderCounts() {
        java.util.Map<Long, Long> counts = new java.util.HashMap<>();
        for (Order o : orderRepository.findAll()) {
            java.util.Set<Long> seen = new java.util.HashSet<>();
            for (OrderItem item : o.getItems()) {
                if (item.getCompanyId() != null && seen.add(item.getCompanyId())) {
                    counts.merge(item.getCompanyId(), 1L, Long::sum);
                }
            }
        }
        return counts;
    }

    private void requireSuperAdmin(String auth) {
        AppUser user = currentUser.require(auth);
        if (user.getRole() != UserRole.SUPER_ADMIN) {
            throw new ForbiddenException("Only the super admin can manage companies.");
        }
    }

    @GetMapping
    public List<CompanyDto> list(@RequestHeader(value = "Authorization", required = false) String auth) {
        requireSuperAdmin(auth);
        return companyRepository.findAll().stream().map(this::toDto).toList();
    }

    @PostMapping
    public ResponseEntity<CompanyCredentialsResponse> create(
            @RequestBody CreateCompanyRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        requireSuperAdmin(auth);

        if (req.name == null || req.name.isBlank()) {
            throw new BadRequestException("Company name is required.");
        }

        String loginEmail = (req.loginEmail != null && !req.loginEmail.isBlank())
                ? req.loginEmail.trim().toLowerCase(Locale.ROOT)
                : generateLoginEmail(req.name);

        if (appUserRepository.findByEmailIgnoreCase(loginEmail).isPresent()) {
            throw new BadRequestException(
                    "\"" + loginEmail + "\" is already in use. Choose a different login email.");
        }

        Company company = new Company();
        company.setName(req.name.trim());
        company.setPhone(req.phone);
        company.setAddress(req.address);
        company.setGstNumber(req.gstNumber);
        company.setContactPerson(req.contactPerson);
        company.setLoginEmail(loginEmail);
        company.setActive(true);
        company = companyRepository.save(company);

        String plainPassword = PasswordService.randomPassword();

        AppUser companyAdmin = new AppUser();
        companyAdmin.setAccountUid("cmp_" + UUID.randomUUID());
        companyAdmin.setEmail(loginEmail);
        companyAdmin.setDisplayName(
                req.contactPerson != null && !req.contactPerson.isBlank() ? req.contactPerson : req.name.trim());
        companyAdmin.setRole(UserRole.COMPANY_ADMIN);
        companyAdmin.setCompany(company);
        companyAdmin.setPasswordHash(passwordService.hash(plainPassword));
        companyAdmin.setMustChangePassword(true);
        appUserRepository.save(companyAdmin);

        CompanyCredentialsResponse response = new CompanyCredentialsResponse();
        response.companyId = company.getId();
        response.companyName = company.getName();
        response.loginEmail = loginEmail;
        response.password = plainPassword;
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{id}")
    public ResponseEntity<CompanyDto> update(
            @PathVariable Long id,
            @RequestBody CreateCompanyRequest req,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        requireSuperAdmin(auth);
        Optional<Company> existing = companyRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();

        Company company = existing.get();
        if (req.name != null && !req.name.isBlank()) company.setName(req.name.trim());
        if (req.phone != null) company.setPhone(req.phone);
        if (req.address != null) company.setAddress(req.address);
        if (req.gstNumber != null) company.setGstNumber(req.gstNumber);
        if (req.contactPerson != null) company.setContactPerson(req.contactPerson);
        return ResponseEntity.ok(toDto(companyRepository.save(company)));
    }

    @PutMapping("/{id}/active")
    public ResponseEntity<CompanyDto> setActive(
            @PathVariable Long id,
            @RequestParam boolean active,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        requireSuperAdmin(auth);
        Optional<Company> existing = companyRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();
        Company company = existing.get();
        company.setActive(active);
        // Deactivating a company must lock its login out immediately - the
        // login check in AuthController also re-checks company.isActive()
        // on every attempt, but this stops a token issued moments earlier
        // from resolving to a company that still looks active on read.
        return ResponseEntity.ok(toDto(companyRepository.save(company)));
    }

    /** Issues a brand new random password for a company that lost theirs. */
    @PostMapping("/{id}/reset-password")
    public ResponseEntity<CompanyCredentialsResponse> resetPassword(
            @PathVariable Long id,
            @RequestHeader(value = "Authorization", required = false) String auth) {
        requireSuperAdmin(auth);
        Optional<Company> existing = companyRepository.findById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();
        Company company = existing.get();

        AppUser companyAdmin = appUserRepository.findByCompanyId(company.getId()).stream()
                .filter(u -> u.getRole() == UserRole.COMPANY_ADMIN)
                .findFirst()
                .orElseThrow(() -> new BadRequestException(
                        "This company has no login account yet - delete and recreate it."));

        String plainPassword = PasswordService.randomPassword();
        companyAdmin.setPasswordHash(passwordService.hash(plainPassword));
        companyAdmin.setMustChangePassword(true);
        appUserRepository.save(companyAdmin);

        CompanyCredentialsResponse response = new CompanyCredentialsResponse();
        response.companyId = company.getId();
        response.companyName = company.getName();
        response.loginEmail = companyAdmin.getEmail();
        response.password = plainPassword;
        return ResponseEntity.ok(response);
    }

    private String generateLoginEmail(String companyName) {
        String slug = companyName.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        if (slug.isBlank()) slug = "company";
        String candidate = slug + "@partners.nammastore.in";
        int suffix = 2;
        while (appUserRepository.findByEmailIgnoreCase(candidate).isPresent()) {
            candidate = slug + suffix + "@partners.nammastore.in";
            suffix++;
        }
        return candidate;
    }

    private CompanyDto toDto(Company c) {
        CompanyDto dto = new CompanyDto();
        dto.id = c.getId();
        dto.name = c.getName();
        dto.logoUrl = storageService.toPublicUrl(c.getLogoUrl());
        dto.productCount = productRepository.countByCompanyId(c.getId());
        dto.orderCount = orderCounts().getOrDefault(c.getId(), 0L);
        dto.loginEmail = c.getLoginEmail();
        dto.phone = c.getPhone();
        dto.address = c.getAddress();
        dto.gstNumber = c.getGstNumber();
        dto.contactPerson = c.getContactPerson();
        dto.active = c.isActive();
        dto.createdAt = c.getCreatedAt();
        return dto;
    }
}
