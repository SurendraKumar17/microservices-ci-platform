package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

type Flight struct {
	ID        int    `json:"id"`
	Airline   string `json:"airline"`
	Icon      string `json:"icon"`
	Departure string `json:"departure"`
	Arrival   string `json:"arrival"`
	Duration  string `json:"duration"`
	Stops     string `json:"stops"`
	Price     int    `json:"price"`
	Class     string `json:"class"`
}

type Hotel struct {
	Name     string `json:"name"`
	Location string `json:"location"`
	Icon     string `json:"icon"`
	Stars    string `json:"stars"`
	Price    int    `json:"price"`
	Bg       string `json:"bg"`
}

// Fallback data, used only if the database is unreachable or empty -
// keeps the service answering requests instead of hard-failing if
// Postgres has a transient issue.
var mockFlights = []Flight{
	{1, "British Airways", "✈️", "08:00", "20:00", "12h 00m", "Direct", 499, "Economy"},
	{2, "Emirates", "🛫", "11:30", "23:45", "12h 15m", "1 stop", 389, "Economy"},
	{3, "Lufthansa", "🛩️", "14:00", "06:30+1", "16h 30m", "1 stop via FRA", 320, "Economy"},
	{4, "Singapore Airlines", "✈️", "22:00", "18:30+1", "20h 30m", "1 stop", 580, "Business"},
}

var mockHotels = []Hotel{
	{"The Savoy", "London, UK", "🏨", "★★★★★", 320, "#dbeafe"},
	{"Hotel de Crillon", "Paris, France", "🏩", "★★★★★", 480, "#fce7f3"},
	{"Park Hyatt Tokyo", "Tokyo, Japan", "🗼", "★★★★★", 550, "#dcfce7"},
	{"Four Seasons Bali", "Bali, Indonesia", "🌺", "★★★★★", 290, "#fef3c7"},
	{"Burj Al Arab", "Dubai, UAE", "⛵", "★★★★★", 1200, "#ede9fe"},
	{"Marina Bay Sands", "Singapore", "🌃", "★★★★★", 380, "#ecfeff"},
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("writeJSON: failed to encode response: %v", err)
	}
}

// fetchFlights queries the real flights table. Falls back to mock
// data if dbPool is nil (DB never connected) or the query fails.
func fetchFlights(ctx context.Context) []Flight {
	if dbPool == nil {
		return mockFlights
	}

	rows, err := dbPool.Query(ctx, `
		SELECT flight_number, origin, destination, departure_time, arrival_time, price
		FROM flights
		ORDER BY departure_time
		LIMIT 50
	`)
	if err != nil {
		log.Printf("fetchFlights: query failed, falling back to mock data: %v", err)
		return mockFlights
	}
	defer rows.Close()

	var flights []Flight
	id := 1
	for rows.Next() {
		var flightNumber, origin, destination string
		var departureTime, arrivalTime time.Time
		var price float64

		if err := rows.Scan(&flightNumber, &origin, &destination, &departureTime, &arrivalTime, &price); err != nil {
			log.Printf("fetchFlights: row scan failed: %v", err)
			continue
		}

		flights = append(flights, Flight{
			ID:        id,
			Airline:   flightNumber,
			Icon:      "✈️",
			Departure: departureTime.Format("15:04"),
			Arrival:   arrivalTime.Format("15:04"),
			Duration:  arrivalTime.Sub(departureTime).String(),
			Stops:     "Direct",
			Price:     int(price),
			Class:     "Economy",
		})
		id++
	}

	if len(flights) == 0 {
		// table exists but has no rows yet - fall back rather than show nothing
		return mockFlights
	}
	return flights
}

// fetchHotels queries the real hotels table. Falls back to mock
// data if dbPool is nil or the query fails.
func fetchHotels(ctx context.Context) []Hotel {
	if dbPool == nil {
		return mockHotels
	}

	rows, err := dbPool.Query(ctx, `
		SELECT name, location, price_per_night
		FROM hotels
		ORDER BY name
		LIMIT 50
	`)
	if err != nil {
		log.Printf("fetchHotels: query failed, falling back to mock data: %v", err)
		return mockHotels
	}
	defer rows.Close()

	var hotels []Hotel
	for rows.Next() {
		var name, location string
		var pricePerNight float64

		if err := rows.Scan(&name, &location, &pricePerNight); err != nil {
			log.Printf("fetchHotels: row scan failed: %v", err)
			continue
		}

		hotels = append(hotels, Hotel{
			Name:     name,
			Location: location,
			Icon:     "🏨",
			Stars:    "★★★★★",
			Price:    int(pricePerNight),
			Bg:       "#dbeafe",
		})
	}

	if len(hotels) == 0 {
		return mockHotels
	}
	return hotels
}

func searchFlightsHandler(w http.ResponseWriter, r *http.Request) {
	// from/to/date query params accepted but not filtered yet
	flights := fetchFlights(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{"flights": flights})
}

func searchHotelsHandler(w http.ResponseWriter, r *http.Request) {
	hotels := fetchHotels(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{"hotels": hotels})
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "search-service"})
}

func readyHandler(w http.ResponseWriter, r *http.Request) {
	// ready means the DB connection (if configured) is actually up -
	// distinct from health, which just means the process is running
	if dbPool != nil {
		if err := dbPool.Ping(r.Context()); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not-ready", "service": "search-service", "reason": "db unreachable"})
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready", "service": "search-service"})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	ctx := context.Background()

	// Connect to Postgres if DATABASE_URL is set. If it's not set, or
	// the connection fails, the service still starts and serves mock
	// data - this keeps local/dev runs working without requiring a
	// real database for every code change.
	if os.Getenv("DATABASE_URL") != "" {
		if err := connectDB(ctx); err != nil {
			log.Printf("warning: database connection failed, falling back to mock data: %v", err)
		} else if err := initDB(ctx); err != nil {
			log.Printf("warning: database schema setup failed: %v", err)
		}
	} else {
		log.Println("DATABASE_URL not set - running with mock data only")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/ready", readyHandler)
	mux.HandleFunc("/api/search/flights", searchFlightsHandler)
	mux.HandleFunc("/api/search/hotels", searchHotelsHandler)
	log.Printf("search-service running on port %s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}