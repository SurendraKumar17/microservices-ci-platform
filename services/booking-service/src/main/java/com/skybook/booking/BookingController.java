package com.skybook.booking;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@RestController
@RequestMapping("/api/bookings")
public class BookingController {

    private static final Logger log = LoggerFactory.getLogger(BookingController.class);

    @Autowired
    private BookingRepository bookingRepository;

    // cart stays in-memory for now - short-lived, session-scoped data
    private final Map<Integer, List<Map<String, Object>>> cartByUser = new ConcurrentHashMap<>();
    private final AtomicInteger bookingCounter = new AtomicInteger(1000);

    @PostMapping("/cart")
    public Map<String, Object> addToCart(@RequestBody Map<String, Object> item) {
        int userId = 1; // single mock user for now - auth-service will provide real user identity later
        cartByUser.computeIfAbsent(userId, k -> new ArrayList<>()).add(item);
        log.info("item added to cart, userId={}", userId);
        return Map.of("status", "added", "item", item);
    }

    @PostMapping("/checkout")
    public Map<String, Object> checkout(@RequestBody Map<String, Object> payload) {
        List<Map<String, Object>> items = (List<Map<String, Object>>) payload.getOrDefault("items", List.of());
        List<Booking> createdBookings = new ArrayList<>();
        Object userIdRaw = payload.get("user_id");
        Integer userId = userIdRaw != null ? Integer.valueOf(userIdRaw.toString()) : null;
        String travelDate = payload.get("travel_date") != null ? payload.get("travel_date").toString() : null;

        try {
            for (Map<String, Object> item : items) {
                String ref = "SKY" + bookingCounter.incrementAndGet();
                Booking booking = new Booking(ref, userId, travelDate, item.toString(), "CONFIRMED");
                bookingRepository.save(booking);
                createdBookings.add(booking);
                log.info("booking created, bookingRef={}, userId={}, travelDate={}", ref, userId, travelDate);
            }
        } catch (Exception e) {
            log.error("checkout failed, userId={}, itemCount={}", userId, items.size(), e);
            throw e;
        }

        return Map.of("status", "confirmed", "bookings", createdBookings);
    }

    @GetMapping
    public List<Booking> listBookings() {
        return bookingRepository.findAll();
    }

    @GetMapping("/{bookingRef}")
    public Booking getBooking(@PathVariable String bookingRef) {
        return bookingRepository.findByBookingRef(bookingRef)
                .orElseThrow(() -> {
                    log.warn("booking not found, bookingRef={}", bookingRef);
                    return new RuntimeException("Booking not found: " + bookingRef);
                });
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "booking-service");
    }

    @GetMapping("/ready")
    public Map<String, String> ready() {
        return Map.of("status", "ready", "service", "booking-service");
    }
}