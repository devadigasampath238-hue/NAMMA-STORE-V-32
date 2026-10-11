# V26 notes

## Company login 500 - root cause and fix
open-in-view=false + AppUser.company LAZY: login called user.getCompany().isActive() after the
repository returned, so Hibernate threw "could not initialize proxy [Company#n] - no Session".
Fix (relationship stays LAZY): @EntityGraph(attributePaths="company") on AppUserRepository
findByAccountUid / findByEmailIgnoreCase / findByPhone / findByCompanyId / findById.
Same class of bug removed for "Sold by": ProductRepository finders also fetch company, and
DtoMapper only reads company name/logo if it is initialised.

## Affiliate "No static resource api/admin/affiliate/influencers"
Spring says this only when NO controller is mapped to the URL. AffiliateAdminController
(@RequestMapping /api/admin/affiliate, @GetMapping /influencers) exists in this code, so the
backend you were running was an OLDER build. Run:  mvn clean package -DskipTests  then restart.
The frontend now explains this in the error message instead of showing the raw text.

## Run
    psql -d namma_store_dev -f database/011_affiliate_attribution.sql
    psql -d namma_store_dev -f database/012_repair_legacy_image_paths.sql
    cd backend  && mvn clean compile && mvn spring-boot:run
    cd frontend && npm install && npx tsc --noEmit && npm run build && npm run dev

## Test: company login
1. Super admin > Companies > Add company; copy the shown email + password.
2. Log out; /admin/login with those; you land on the company dashboard ("You are managing <name>").
3. Products/Orders show only that company; /admin/companies etc. return 403; log out and in again.
