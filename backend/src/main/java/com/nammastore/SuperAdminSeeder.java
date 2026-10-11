package com.nammastore;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Optional;

/**
 * ===========================================================
 * SuperAdminSeeder.java  (NEW)
 * -----------------------------------------------------------
 * There is exactly ONE super admin account, and its name,
 * email and password are FIXED - set once via environment
 * variables, not created through any signup form:
 *
 *   SUPER_ADMIN_NAME     (default "Namma Store Admin")
 *   SUPER_ADMIN_EMAIL    (default "admin@nammastore.in")
 *   SUPER_ADMIN_PASSWORD (default "ChangeMe123!" - CHANGE THIS)
 *
 * On every startup this runner makes sure that account exists
 * and its password/name match the environment variables. That
 * means:
 *   - the FIRST time the app starts, the account is created.
 *   - if you ever forget the password, changing
 *     SUPER_ADMIN_PASSWORD and restarting the backend resets it -
 *     no database surgery required.
 *   - nobody can register their own super admin account through
 *     /api/auth/register - that endpoint only ever creates
 *     CUSTOMER accounts (see AuthController).
 *
 * Log in at /admin/login with SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD.
 * ===========================================================
 */
@Component
class SuperAdminSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SuperAdminSeeder.class);

    @Autowired private AppUserRepository appUserRepository;
    @Autowired private PasswordService passwordService;

    @Value("${app.super-admin.name:Namma Store Admin}")
    private String superAdminName;

    @Value("${app.super-admin.email:admin@nammastore.in}")
    private String superAdminEmail;

    @Value("${app.super-admin.password:ChangeMe123!}")
    private String superAdminPassword;

    @Override
    public void run(ApplicationArguments args) {
        String email = superAdminEmail.trim().toLowerCase(Locale.ROOT);
        Optional<AppUser> existing = appUserRepository.findByEmailIgnoreCase(email);

        AppUser user = existing.orElseGet(AppUser::new);
        boolean isNew = existing.isEmpty();

        if (isNew) {
            user.setAccountUid("root_" + java.util.UUID.randomUUID());
            user.setEmail(email);
        }
        user.setDisplayName(superAdminName);
        user.setRole(UserRole.SUPER_ADMIN);
        // Password is re-hashed from the env var on every startup, so editing
        // SUPER_ADMIN_PASSWORD and restarting is a real, working "forgot
        // password" flow for the one account that can't reset itself via UI.
        user.setPasswordHash(passwordService.hash(superAdminPassword));
        appUserRepository.save(user);

        if (isNew) {
            log.info("Created the super admin account ({}). Log in at /admin/login.", email);
        } else {
            log.info("Super admin account ({}) is ready.", email);
        }

        if ("ChangeMe123!".equals(superAdminPassword)) {
            log.warn("SUPER_ADMIN_PASSWORD is still the default value. Set a real, secret "
                    + "password via the SUPER_ADMIN_PASSWORD environment variable before going live.");
        }
    }
}
