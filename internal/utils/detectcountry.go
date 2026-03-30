package utils

import (
	"fmt"
	"io"
	"net/http"
	"strings"
)

func DetectCountry(ip string) (string, error) {
	// skip loopback/private IPs
	if ip == "::1" || ip == "127.0.0.1" || strings.HasPrefix(ip, "192.168.") || strings.HasPrefix(ip, "10.") {
		return "Unknown", nil
	}

	resp, err := http.Get(fmt.Sprintf("https://ipapi.co/%s/country_name/", ip))
	if err != nil {
		return "Unknown", nil
	}
	defer resp.Body.Close()

	// rate limited or error status
	if resp.StatusCode != http.StatusOK {
		return "Unknown", nil
	}

	body, _ := io.ReadAll(resp.Body)
	country := strings.TrimSpace(string(body))

	// ipapi returns error JSON on rate limit — detect and discard
	if country == "" || strings.HasPrefix(country, "{") || strings.Contains(country, "RateLimited") || strings.Contains(country, "error") {
		return "Unknown", nil
	}

	return country, nil
}
