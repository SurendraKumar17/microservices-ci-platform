package com.skybook.booking;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(BookingController.class)
class BookingControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void healthEndpointReturnsOk() throws Exception {
        mockMvc.perform(get("/api/bookings/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.service").value("booking-service"));
    }

    @Test
    void readyEndpointReturnsReady() throws Exception {
        mockMvc.perform(get("/api/bookings/ready"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ready"))
                .andExpect(jsonPath("$.service").value("booking-service"));
    }

    @Test
    void addToCartReturnsAddedStatus() throws Exception {
        String item = """
                {
                  "type": "flight",
                  "flightId": 1,
                  "price": 499
                }
                """;
        mockMvc.perform(post("/api/bookings/cart")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(item))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("added"))
                .andExpect(jsonPath("$.item.type").value("flight"));
    }

    @Test
    void checkoutReturnsConfirmedBookings() throws Exception {
        String payload = """
                {
                  "user_id": 1,
                  "travel_date": "2026-08-01",
                  "items": [
                    { "type": "flight", "flightId": 2, "price": 389 },
                    { "type": "hotel", "hotelName": "The Savoy", "price": 320 }
                  ]
                }
                """;
        mockMvc.perform(post("/api/bookings/checkout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("confirmed"))
                .andExpect(jsonPath("$.bookings").isArray())
                .andExpect(jsonPath("$.bookings[0].bookingRef").exists())
                .andExpect(jsonPath("$.bookings[0].status").value("CONFIRMED"));
    }

    @Test
    void listBookingsReturnsArray() throws Exception {
        mockMvc.perform(get("/api/bookings"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON));
    }
}