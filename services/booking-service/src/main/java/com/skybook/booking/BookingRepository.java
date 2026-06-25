package com.skybook.booking;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BookingRepository extends JpaRepository<Booking, Long> {

    List<Booking> findByUserId(Integer userId);

    Optional<Booking> findByBookingRef(String bookingRef);
}