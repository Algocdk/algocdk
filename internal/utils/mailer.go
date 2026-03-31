package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"os"
)

func SendResetEmail(to, resetLink string) {
	msg := fmt.Sprintf(
		"Subject: Password Reset\n\nClick the link to reset your password:\n%s\n\nThis link expires in 15 minutes.",
		resetLink,
	)
	htmlMsg := fmt.Sprintf("<p>Click the link to reset your password:</p><p><a href='%s'>%s</a></p><p>This link expires in 15 minutes.</p>", resetLink, resetLink)
	sendEmail(to, "Password Reset", msg, htmlMsg, "RESET EMAIL")
}

func SendVerificationEmail(to, verificationLink string) {
	msg := fmt.Sprintf(
		"Subject: Verify Your Email Address\n\nWelcome to Algocdk!\n\nPlease click the link below to verify your email address:\n%s\n\nIf you didn't create an account, please ignore this email.",
		verificationLink,
	)
	htmlMsg := fmt.Sprintf("<p>Welcome to Algocdk!</p><p>Please click the link below to verify your email address:</p><p><a href='%s'>%s</a></p>", verificationLink, verificationLink)
	sendEmail(to, "Verify Your Email Address", msg, htmlMsg, "VERIFICATION EMAIL")
}

func sendEmail(to, subject, plainMsg, htmlMsg, emailType string) {
	mode := os.Getenv("EMAIL_MODE")
	from := os.Getenv("EMAIL_FROM")

	switch mode {
	case "console":
		log.Printf("===== %s =====", emailType)
		log.Println("To:", to)
		log.Println("Message:", plainMsg)
		log.Println("=======================")

	case "resend":
		sendViaResend(to, subject, htmlMsg, emailType)

	case "smtp":
		host := os.Getenv("EMAIL_HOST")
		port := os.Getenv("EMAIL_PORT")
		username := os.Getenv("EMAIL_USERNAME")
		password := os.Getenv("EMAIL_PASSWORD")
		log.Printf("SMTP ATTEMPT (%s): host=%s port=%s user=%s from=%s to=%s", emailType, host, port, username, from, to)
		auth := smtp.PlainAuth("", username, password, host)
		err := smtp.SendMail(host+":"+port, auth, from, []string{to}, []byte(plainMsg))
		if err != nil {
			log.Printf("SMTP ERROR (%s): %v", emailType, err)
		} else {
			log.Printf("SMTP SUCCESS (%s): sent to %s", emailType, to)
		}

	default:
		log.Printf("EMAIL_MODE=%q — %s not sent. Set EMAIL_MODE=resend or smtp.", mode, emailType)
	}
}

func sendViaResend(to, subject, html, emailType string) {
	apiKey := os.Getenv("RESEND_API_KEY")
	from := os.Getenv("EMAIL_FROM")
	if from == "" {
		from = "onboarding@resend.dev"
	}

	payload := map[string]interface{}{
		"from":    from,
		"to":      []string{to},
		"subject": subject,
		"html":    html,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewBuffer(body))
	if err != nil {
		log.Printf("RESEND ERROR (%s): failed to create request: %v", emailType, err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("RESEND ERROR (%s): %v", emailType, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Printf("RESEND SUCCESS (%s): sent to %s", emailType, to)
	} else {
		log.Printf("RESEND ERROR (%s): status %d", emailType, resp.StatusCode)
	}
}
