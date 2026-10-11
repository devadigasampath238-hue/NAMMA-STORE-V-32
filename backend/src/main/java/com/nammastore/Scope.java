package com.nammastore;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/* ===========================================================
   AdminScope - WHO is asking, and WHICH company's data they may see.

   The company is ALWAYS derived from the authenticated user's own
   account. No controller reads a companyId from the URL, query string
   or body to decide what a company admin can see, so changing
   ?companyId=3 to someone else's id gets an attacker nothing (IDOR).

     SUPER_ADMIN    -> companyScope() == null  (everything)
     COMPANY_ADMIN  -> companyScope() == their own company id
     anyone else    -> 403
   =========================================================== */

@Component
class AdminScope {

    @Autowired private CurrentUserService currentUser;

    /** null = super admin (unrestricted). Otherwise the caller's own company id. */
    Long companyScope() {
        ServletRequestAttributes attrs =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        String auth = attrs == null ? null : attrs.getRequest().getHeader("Authorization");
        AppUser user = currentUser.require(auth);
        if (user.getRole() == UserRole.SUPER_ADMIN) return null;
        if (user.getRole() == UserRole.COMPANY_ADMIN && user.getCompany() != null) {
            return user.getCompany().getId();
        }
        throw new ForbiddenException("Your account is not linked to a company.");
    }

    /** Does any line of this order belong to the company? */
    static boolean touches(Order order, Long companyId) {
        if (order == null || order.getItems() == null) return false;
        for (OrderItem item : order.getItems()) {
            if (companyId.equals(item.getCompanyId())) return true;
        }
        return false;
    }

    /** Sum of the company's own lines in an order (finalPrice is the line total). */
    static BigDecimal companyAmount(Order order, Long companyId) {
        BigDecimal sum = BigDecimal.ZERO;
        if (order == null || order.getItems() == null) return sum;
        for (OrderItem item : order.getItems()) {
            if (companyId.equals(item.getCompanyId()) && item.getFinalPrice() != null) {
                sum = sum.add(item.getFinalPrice());
            }
        }
        return sum;
    }

    List<Order> visibleOrders(List<Order> all) {
        Long scope = companyScope();
        if (scope == null) return all;
        List<Order> out = new ArrayList<>();
        for (Order o : all) if (touches(o, scope)) out.add(o);
        return out;
    }

    /**
     * What a company is allowed to see of an order: only ITS OWN lines and
     * the money for them. Other companies' products, the order-wide total,
     * discount, coupon (influencer attribution) and delivery charge are
     * removed. Delivery details stay - the company has to ship the goods.
     */
    OrderDto forCompany(OrderDto dto, Long companyId) {
        if (companyId == null || dto == null) return dto;
        List<OrderItemDto> own = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (OrderItemDto i : dto.items) {
            if (companyId.equals(i.companyId)) {
                own.add(i);
                if (i.finalPrice != null) total = total.add(i.finalPrice);
            }
        }
        dto.multiCompany = own.size() < dto.items.size();
        dto.items = own;
        dto.companyTotal = total;
        dto.subtotal = total;
        dto.totalAmount = total;
        dto.discountAmount = BigDecimal.ZERO;
        dto.deliveryCharge = BigDecimal.ZERO;
        dto.couponCode = null;
        dto.userId = null;
        return dto;
    }
}
