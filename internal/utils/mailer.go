package utils

import (
	"fmt"
	"log"
	"net/smtp"
	"os"
)

// SendResetEmail sends a password reset link to a user.
// It supports 3 modes: "console", "smtp", or "mailhog".
func SendResetEmail(to, resetLink string) {
	mode := os.Getenv("EMAIL_MODE") // "console", "smtp", or "mailhog"
	from := os.Getenv("EMAIL_FROM") // e.g., no-reply@myapp.com

	msg := fmt.Sprintf(
		"Subject: Password Reset\n\nClick the link to reset your password:\n%s\n\nThis link expires in 15 minutes.",
		resetLink,
	)

	sendEmail(mode, from, to, msg, "RESET EMAIL")
}

// SendVerificationEmail sends an email verification link to a user.
func SendVerificationEmail(to, verificationLink string) {
	mode := os.Getenv("EMAIL_MODE")
	from := os.Getenv("EMAIL_FROM")

	msg := fmt.Sprintf(
		"Subject: Verify Your Email Address\n\nWelcome to Algocdk!\n\nPlease click the link below to verify your email address:\n%s\n\nIf you didn't create an account, please ignore this email.",
		verificationLink,
	)

	sendEmail(mode, from, to, msg, "VERIFICATION EMAIL")
}

// sendEmail is a helper function to send emails based on the configured mode
func sendEmail(mode, from, to, msg, emailType string) {
	switch mode {
	case "console":
		// Just log the email to console
		log.Printf("===== %s =====", emailType)
		log.Println("To:", to)
		log.Println("From:", from)
		log.Println("Message:\n", msg)
		log.Println("=======================")

	case "mailhog":
		// Use local MailHog SMTP server
		host := os.Getenv("EMAIL_HOST") // localhost
		port := os.Getenv("EMAIL_PORT") // usually "1025"
		auth := smtp.PlainAuth("", "", "", host)
		err := smtp.SendMail(host+":"+port, auth, from, []string{to}, []byte(msg))
		if err != nil {
			log.Printf("MAILHOG ERROR (%s): %v", emailType, err)
		} else {
			log.Printf("MailHog: %s sent to %s", emailType, to)
		}

	case "smtp":
		host := os.Getenv("EMAIL_HOST")
		port := os.Getenv("EMAIL_PORT")
		username := os.Getenv("EMAIL_USERNAME")
		password := os.Getenv("EMAIL_PASSWORD")

		log.Printf("SMTP ATTEMPT (%s): host=%s port=%s user=%s from=%s to=%s", emailType, host, port, username, from, to)

		auth := smtp.PlainAuth("", username, password, host)
		err := smtp.SendMail(host+":"+port, auth, from, []string{to}, []byte(msg))
		if err != nil {
			log.Printf("SMTP ERROR (%s): %v", emailType, err)
		} else {
			log.Printf("SMTP SUCCESS (%s): sent to %s", emailType, to)
		}

	default:
		log.Printf("EMAIL_MODE=%q — %s not sent. Set EMAIL_MODE=smtp to send real emails.", mode, emailType)
	}
}
