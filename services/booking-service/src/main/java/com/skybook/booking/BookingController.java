package com.skybook.booking;

import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@RestController
@RequestMapping("/api/bookings")
public class BookingController {

    // in-memory storage - replace with a real DB (RDS) later
    private final Map<Integer, List<Map<String, Object>>> cartByUser = new ConcurrentHashMap<>();
    private final List<Map<String, Object>> bookings = new ArrayList<>();
    private final AtomicInteger bookingCounter = new AtomicInteger(1000);

    @PostMapping("/cart")
    public Map<String, Object> addToCart(@RequestBody Map<String, Object> item) {
        int userId = 1; // single mock user for now - auth-service will provide real user identity later
        cartByUser.computeIfAbsent(userId, k -> new ArrayList<>()).add(item);
        return Map.of("status", "added", "item", item);
    }

    @PostMapping("/checkout")
    public Map<String, Object> checkout(@RequestBody Map<String, Object> payload) {
        List<Map<String, Object>> items = (List<Map<String, Object>>) payload.getOrDefault("items", List.of());
        List<Map<String, Object>> createdBookings = new ArrayList<>();

        for (Map<String, Object> item : items) {
            String ref = "SKY" + bookingCounter.incrementAndGet();
            Map<String, Object> booking = new HashMap<>();
            booking.put("bookingRef", ref);
            booking.put("item", item);
            booking.put("travelDate", payload.get("travel_date"));
            booking.put("userId", payload.get("user_id"));
            booking.put("status", "CONFIRMED");
            bookings.add(booking);
            createdBookings.add(booking);
        }

        return Map.of("status", "confirmed", "bookings", createdBookings);
    }

    @GetMapping
    public List<Map<String, Object>> listBookings() {
        return bookings;
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