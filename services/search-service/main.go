package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
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

// in-memory mock data - replace with real DB/provider integration later
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

func searchFlightsHandler(w http.ResponseWriter, r *http.Request) {
	// from/to/date query params accepted but not filtered yet - mock data returned as-is
	writeJSON(w, http.StatusOK, map[string]any{"flights": mockFlights})
}

func searchHotelsHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"hotels": mockHotels})
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "search-service"})
}

func readyHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready", "service": "search-service"})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
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